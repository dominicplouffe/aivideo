import { ProviderError } from "./errors";

/**
 * The editing assistant behind the Studio's Riff panel.
 *
 * It is given the transcript and the current edit decisions, and it answers
 * in two parts: something to read, and — when the request was an instruction
 * rather than a question — a concrete change to the edit state.
 *
 * The proposal is never applied for you. That is the whole design:
 *
 *  - A model that edits your video directly is a model you have to check
 *    afterwards, on a timeline, by watching it. A proposal you approve is
 *    one you check before it costs you anything.
 *  - Every change it can make is already reversible through the same
 *    controls a person uses, so nothing here is a privileged path into the
 *    document.
 *
 * What it must never do is claim work it did not do. The panel this replaced
 * answered "Cut to 60 seconds" with "Trimmed 31% of words, cut 4 dead-air
 * regions totalling 38 seconds, and keyframed 7 zooms" — from a four-entry
 * array, having changed nothing at all.
 */

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type MessageParams = import("@anthropic-ai/sdk/resources/messages").MessageCreateParamsNonStreaming;
type MessageResult = import("@anthropic-ai/sdk/resources/messages").Message;

export interface AssistantChapter {
  ordinal: number;
  title: string;
  /** Seconds this chapter contributes to the finished cut. */
  durationSec: number;
  text: string;
  deleted: boolean;
}

export interface AssistantRequest {
  projectTitle: string;
  /** The finished runtime as currently edited. */
  durationSec: number;
  sourceDurationSec: number;
  removeFillers: boolean;
  chapters: AssistantChapter[];
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
}

/** A change the person can accept, or not. */
export interface EditProposal {
  removeFillers?: boolean;
  /** Chapter ordinals to drop from the cut. Replaces the current set. */
  deletedSegments?: number[];
  captions?: boolean;
  music?: boolean;
  zoomEnabled?: boolean;
}

export interface AssistantReply {
  /** Prose for the panel. Never a claim that an edit has been made. */
  text: string;
  /** Absent when the message was a question rather than an instruction. */
  proposal?: EditProposal;
  /** One line describing the proposal, for the accept button. */
  proposalSummary?: string;
}

export interface AssistantProvider {
  readonly name: string;
  respond(request: AssistantRequest): Promise<AssistantReply>;
}

const REPLY_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description:
        "What to show the person. Describe what the change would do, in the " +
        "conditional. Never state that an edit has been applied.",
    },
    proposal_summary: {
      type: "string",
      description: "One short line naming the change, for a confirm button.",
    },
    proposal: {
      type: "object",
      properties: {
        remove_fillers: { type: "boolean" },
        deleted_segments: {
          type: "array",
          // No `minimum`: structured outputs accept only a subset of JSON
          // Schema, and numeric bounds are outside it — the API refused the
          // whole request with a 400. Bounds are checked where the proposal
          // is read instead.
          items: { type: "integer" },
          description: "Chapter ordinals to drop, zero-based. Replaces the current set entirely.",
        },
        captions: { type: "boolean" },
        music: { type: "boolean" },
        zoom_enabled: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  required: ["text"],
  additionalProperties: false,
};

const SYSTEM = [
  "You are Riff, the editing assistant inside a screen-recording editor.",
  "",
  "The person is editing a product demo by editing its transcript: removing",
  "words removes that footage. You are given every chapter, the words spoken",
  "in it, and how long it currently contributes to the cut.",
  "",
  "Answer in two parts.",
  "",
  "1. `text` — what to say. Be specific and use the numbers you were given.",
  "   Never claim an edit has happened. You do not apply anything; the person",
  "   does. Write in the conditional: \"dropping chapters 2 and 5 would bring",
  "   this to 58 seconds\", not \"I trimmed it to 58 seconds\".",
  "",
  "2. `proposal` — only when the message is an instruction to change the cut.",
  "   Omit it entirely for a question. `deleted_segments` replaces the whole",
  "   set, so include chapters that are already dropped if they should stay",
  "   dropped.",
  "",
  "Rules:",
  "- Never invent a measurement. If you do not have a number, do not give one.",
  "- You have no analytics, no viewing data and no knowledge of this person's",
  "  other videos. Say so plainly if asked rather than guessing.",
  "- Cutting a chapter loses what it explains. Name what would be lost.",
  "- If an instruction cannot be met with the controls you have — reordering",
  "  chapters, rewriting narration, changing a voice — say which part you",
  "  cannot do instead of proposing something adjacent.",
].join("\n");

export interface AnthropicAssistantConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
  /** Test seam, as in the translation adapter. */
  messagesCreate?: (params: MessageParams) => Promise<MessageResult>;
}

/** Trimmed so a forty-minute transcript does not become a forty-thousand-token prompt. */
function describe(request: AssistantRequest): string {
  const lines = [
    `Project: ${request.projectTitle}`,
    `Source recording: ${request.sourceDurationSec.toFixed(1)}s`,
    `Current cut: ${request.durationSec.toFixed(1)}s`,
    `Filler removal: ${request.removeFillers ? "on" : "off"}`,
    "",
    "Chapters:",
  ];

  for (const chapter of request.chapters) {
    lines.push(
      `[${chapter.ordinal}] ${chapter.title} — ${chapter.durationSec.toFixed(1)}s` +
        (chapter.deleted ? " (currently dropped)" : ""),
      // Enough to judge what a chapter is about without shipping the whole
      // transcript twice over.
      `    ${chapter.text.slice(0, 600)}`,
    );
  }

  return lines.join("\n");
}

function normalise(raw: unknown, chapterCount: number): EditProposal | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Record<string, unknown>;
  const out: EditProposal = {};

  if (typeof input.remove_fillers === "boolean") out.removeFillers = input.remove_fillers;
  if (typeof input.captions === "boolean") out.captions = input.captions;
  if (typeof input.music === "boolean") out.music = input.music;
  if (typeof input.zoom_enabled === "boolean") out.zoomEnabled = input.zoom_enabled;

  if (Array.isArray(input.deleted_segments)) {
    // Bounded to chapters that exist. A hallucinated ordinal would otherwise
    // sit in the saved edit state forever, deleting a chapter that appears
    // later when somebody re-transcribes.
    const ordinals = input.deleted_segments
      .filter((n): n is number => Number.isInteger(n) && n >= 0 && n < chapterCount)
      .sort((a, b) => a - b);
    out.deletedSegments = [...new Set(ordinals)];
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export class AnthropicAssistant implements AssistantProvider {
  readonly name = "anthropic-assistant";
  private clientPromise: Promise<AnthropicModule> | null = null;
  private client: InstanceType<AnthropicModule["default"]> | null = null;

  constructor(private readonly config: AnthropicAssistantConfig) {
    if (!config.apiKey) {
      throw new Error("AnthropicAssistant requires an API key (ANTHROPIC_API_KEY).");
    }
  }

  private async sdk() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const sdk = (await import("@anthropic-ai/sdk")) as AnthropicModule;
        this.client = new sdk.default({
          apiKey: this.config.apiKey,
          maxRetries: this.config.maxRetries ?? 2,
          timeout: this.config.timeoutMs ?? 60_000,
        });
        return sdk;
      })().catch((error) => {
        this.clientPromise = null;
        throw new Error(
          "The Riff assistant requires @anthropic-ai/sdk. Cause: " + String(error),
        );
      });
    }
    return this.clientPromise;
  }

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    await this.sdk();
    const create =
      this.config.messagesCreate ??
      ((params: MessageParams) => this.client!.messages.create(params));

    // The last few turns only. A chat panel beside a video is not a place
    // anybody scrolls back thirty messages, and the whole history is sent on
    // every request.
    const history = request.history.slice(-8).map((turn) => ({
      role: turn.role,
      content: turn.text,
    }));

    const response = await create({
      model: this.config.model ?? "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        ...history,
        { role: "user", content: `${describe(request)}\n\n---\n\n${request.message}` },
      ],
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: REPLY_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      throw new ProviderError("Riff declined to answer that.", {
        provider: this.name,
        retryable: false,
      });
    }

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: { text?: unknown; proposal?: unknown; proposal_summary?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new ProviderError("Riff's reply did not parse.", {
        provider: this.name,
        retryable: true,
      });
    }

    if (typeof parsed.text !== "string" || parsed.text.trim() === "") {
      throw new ProviderError("Riff's reply was empty.", {
        provider: this.name,
        retryable: true,
      });
    }

    const proposal = normalise(parsed.proposal, request.chapters.length);
    return {
      text: parsed.text.trim(),
      proposal,
      proposalSummary:
        proposal && typeof parsed.proposal_summary === "string"
          ? parsed.proposal_summary.trim()
          : undefined,
    };
  }
}

/**
 * The assistant with no model behind it.
 *
 * It does arithmetic on the chapters it was given and refuses everything
 * else. That makes it useless for conversation and entirely honest, which is
 * the right trade for a deployment with no API key — the alternative is the
 * canned-reply panel this replaced.
 */
export const offlineAssistant: AssistantProvider = {
  name: "offline-assistant",
  async respond(request) {
    const kept = request.chapters.filter((c) => !c.deleted);
    const longest = [...kept].sort((a, b) => b.durationSec - a.durationSec)[0];

    const facts = [
      `This cut runs ${request.durationSec.toFixed(0)}s from a ` +
        `${request.sourceDurationSec.toFixed(0)}s take, across ${kept.length} ` +
        `chapter${kept.length === 1 ? "" : "s"}.`,
      longest
        ? `The longest is “${longest.title}” at ${longest.durationSec.toFixed(0)}s.`
        : "",
      "",
      "I cannot answer that without a language model. Set ANTHROPIC_API_KEY " +
        "and restart, and I can propose edits from what was said.",
    ].filter(Boolean);

    return { text: facts.join(" ").replace(" \n ", "\n\n") };
  },
};

export function createAnthropicAssistant(config: AnthropicAssistantConfig): AssistantProvider {
  return new AnthropicAssistant(config);
}
