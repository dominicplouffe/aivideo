import { ProviderError } from "./errors";
import type { RawOption, SuggestGoal } from "@/lib/edit/suggest";

/**
 * Asks Claude what to cut.
 *
 * The model sees each chapter's spoken text and length and answers with
 * chapters to drop and phrases to cut, quoted exactly. It never sees or
 * sets a duration for the result; the caller measures that from the
 * transcript. See `lib/edit/suggest.ts` for how a proposal becomes an edit.
 */

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type MessageParams = import("@anthropic-ai/sdk/resources/messages").MessageCreateParamsNonStreaming;
type MessageResult = import("@anthropic-ai/sdk/resources/messages").Message;

export interface CutsChapter {
  ordinal: number;
  title: string;
  durationSec: number;
  text: string;
}

export interface CutsRequest {
  projectTitle: string;
  durationSec: number;
  chapters: CutsChapter[];
  goal: SuggestGoal;
}

export interface CutsProposal {
  options: RawOption[];
  /** One line for the person: what the model could and could not do. */
  note: string;
}

const SYSTEM = `You are a video editor tightening the script of a recorded product demo. The script is split into chapters; each is given with its ordinal, title, spoken length and the words as spoken.

You propose cuts of two kinds:
- Dropping whole chapters that do not advance the demo: repeated points, tangents, setup nobody needs to see.
- Cutting phrases inside a chapter: hedges ("I think", "basically", "kind of"), false starts, repeated words, asides, and sentences that restate what was just shown. A phrase is a run of consecutive words quoted EXACTLY as they appear in that chapter's text, including their spelling and any punctuation attached to them. Never paraphrase, never invent words, never quote across two chapters.

Rules:
- Never cut something a later sentence depends on to make sense.
- Keep the first chapter's opening line and the last chapter's closing line unless the goal cannot be met otherwise.
- Prefer many small phrase cuts over dropping a chapter that carries a point.
- Each option's summary is one plain sentence a person can read in a glance, saying what kind of thing goes.

Goal "tighten": give exactly three options, from lightest to firmest, labelled "Light", "Medium" and "Firm": roughly a tenth, a quarter and two fifths of the words removed. Every option must remove something.
Goal "target": give exactly one option, labelled "To target", that brings the video to the target length or under while keeping the point. If that cannot be done without gutting the demo, give the closest sensible cut and set meets_target to false, and say so in the note.

Answer in the JSON shape you are given. The note is one sentence for the person; if everything went well, say what you kept. Never state a resulting length or a number of seconds anywhere: the length is measured from the recording after your cuts, and a number from you would only disagree with it.`;

const SCHEMA = {
  type: "object",
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          summary: { type: "string" },
          chapters: { type: "array", items: { type: "integer" }, description: "Chapter ordinals to drop entirely." },
          phrases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                chapter: { type: "integer" },
                text: { type: "string", description: "The exact consecutive words to cut, as they appear in that chapter." },
              },
              required: ["chapter", "text"],
              additionalProperties: false,
            },
          },
          meets_target: { type: "boolean" },
        },
        required: ["label", "summary", "chapters", "phrases", "meets_target"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["options", "note"],
  additionalProperties: false,
} as const;

function describe(request: CutsRequest): string {
  const mm = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const goal =
    request.goal.kind === "tighten"
      ? "Goal: tighten."
      : `Goal: target. Bring the video to ${mm(request.goal.targetSec)} (${Math.round(request.goal.targetSec)} seconds) or under.`;
  const chapters = request.chapters
    .map((c) => `[${c.ordinal}] ${c.title} (${mm(c.durationSec)} of video)\n${c.text || "(no speech)"}`)
    .join("\n\n");
  return `Project: ${request.projectTitle}\nLength now: ${mm(request.durationSec)} (${Math.round(request.durationSec)} seconds). A chapter's length is the footage it plays, which can be longer than its words; dropping a chapter removes all of it, cutting a phrase removes only the words.\n${goal}\n\nChapters:\n\n${chapters}`;
}

export interface CutsProviderConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  /** For tests: stands in for the SDK call. */
  messagesCreate?: (params: MessageParams) => Promise<MessageResult>;
}

export async function proposeCuts(request: CutsRequest, config: CutsProviderConfig): Promise<CutsProposal> {
  let create = config.messagesCreate;
  if (!create) {
    const sdk = (await import("@anthropic-ai/sdk")) as AnthropicModule;
    const client = new sdk.default({ apiKey: config.apiKey, maxRetries: 2, timeout: config.timeoutMs ?? 120_000 });
    create = (params: MessageParams) => client.messages.create(params);
  }

  const response = await create({
    model: config.model ?? "claude-opus-5",
    max_tokens: 6000,
    system: SYSTEM,
    messages: [{ role: "user", content: describe(request) }],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
  });
  if (response.stop_reason === "refusal") {
    throw new ProviderError("The model declined to suggest cuts for this script.", { provider: "anthropic-cuts", retryable: false });
  }
  const text = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  let parsed: { options?: unknown; note?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new ProviderError("The suggestions did not parse.", { provider: "anthropic-cuts", retryable: true });
  }
  const options: RawOption[] = Array.isArray(parsed.options)
    ? (parsed.options as Record<string, unknown>[]).map((o) => ({
        label: typeof o.label === "string" ? o.label : "Option",
        summary: typeof o.summary === "string" ? o.summary : "",
        chapters: Array.isArray(o.chapters) ? o.chapters.filter((n): n is number => Number.isInteger(n)) : [],
        phrases: Array.isArray(o.phrases)
          ? (o.phrases as Record<string, unknown>[])
              .filter((p) => Number.isInteger(p.chapter) && typeof p.text === "string")
              .map((p) => ({ chapter: p.chapter as number, text: p.text as string }))
          : [],
        meets_target: typeof o.meets_target === "boolean" ? o.meets_target : undefined,
      }))
    : [];
  return { options, note: typeof parsed.note === "string" ? parsed.note.trim() : "" };
}
