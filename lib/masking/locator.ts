import { ProviderError } from "@/lib/providers/errors";
import type { Frame, TextBox, TextLocator } from "./types";

/**
 * Finding text in a frame.
 *
 * Two adapters and a fixture. The vision model is the one that works on the
 * cases capture-time masking cannot reach — text inside a canvas, a name
 * rendered into a chart, a scanned document in a preview pane — because it
 * reads an image rather than a DOM.
 *
 * Neither adapter decides what is sensitive. They return text and where it
 * is; `detectors.ts` decides. Keeping those apart is what lets the
 * sensitivity rules be tested exhaustively without an OCR engine, and lets
 * the engine be swapped without reopening them.
 */

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type MessageParams = import("@anthropic-ai/sdk/resources/messages").MessageCreateParamsNonStreaming;
type MessageResult = import("@anthropic-ai/sdk/resources/messages").Message;

const SYSTEM = [
  "You read text out of screenshots of software.",
  "",
  "Return every run of readable text with the box it occupies, as fractions",
  "of the image: x and y are the top-left corner, w and h the size, all",
  "between 0 and 1.",
  "",
  "Rules:",
  "- One entry per visual line. Do not merge lines or split words.",
  "- Include text that is small, low contrast, or partly obscured. Mark it",
  "  with a lower confidence rather than leaving it out — something you are",
  "  unsure about is exactly what matters here.",
  "- Transcribe what is on screen, including anything that looks like an",
  "  email address, a card number or a credential. Do not redact, summarise",
  "  or paraphrase; the caller hides these, and it cannot hide what it was",
  "  not told about.",
  "- Do not describe images, icons or layout. Text only.",
].join("\n");

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    boxes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["text", "x", "y", "w", "h", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["boxes"],
  additionalProperties: false,
};

export interface VisionLocatorConfig {
  apiKey: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Test seam, as in the other Anthropic adapters. */
  messagesCreate?: (params: MessageParams) => Promise<MessageResult>;
}

export class VisionLocator implements TextLocator {
  readonly name = "anthropic-vision";

  constructor(private readonly config: VisionLocatorConfig) {}

  async locate(frame: Frame): Promise<TextBox[]> {
    const create = this.config.messagesCreate ?? (await this.client());

    const response = await create({
      model: this.config.model ?? "claude-opus-5",
      max_tokens: 8192,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: frame.png.toString("base64") },
            },
          ],
        },
      ],
      thinking: { type: "adaptive" },
      output_config: {
        // Reading a frame is a perception task, not a reasoning one, and
        // this runs once per sampled frame of every recording.
        effort: this.config.effort ?? "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      // Not swallowed. A frame that could not be read is a frame whose
      // contents are unknown, and the caller decides what to do about that
      // — quietly returning no boxes would read as "nothing to hide".
      throw new ProviderError("The locator refused to read a frame.", {
        provider: this.name,
        retryable: false,
      });
    }

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: { boxes?: { text?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; confidence?: unknown }[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new ProviderError("The locator returned something that was not a box list.", {
        provider: this.name,
        retryable: true,
      });
    }

    return (parsed.boxes ?? [])
      .map((box) => shapeBox(box))
      .filter((box): box is TextBox => box !== null);
  }

  private async client(): Promise<(params: MessageParams) => Promise<MessageResult>> {
    const sdk = (await import("@anthropic-ai/sdk")) as AnthropicModule;
    const client = new sdk.default({ apiKey: this.config.apiKey });
    return (params: MessageParams) => client.messages.create(params);
  }
}

/**
 * Clamps a returned box into the frame.
 *
 * A model occasionally returns a box that runs off the edge, or a zero-width
 * one. Clamping rather than dropping, because a box in roughly the right
 * place still hides the thing, and dropping it does not.
 */
export function shapeBox(box: {
  text?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown; confidence?: unknown;
}): TextBox | null {
  const text = typeof box.text === "string" ? box.text : "";
  if (!text.trim()) return null;

  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  const x = Math.min(1, Math.max(0, num(box.x, 0)));
  const y = Math.min(1, Math.max(0, num(box.y, 0)));
  const w = Math.min(1 - x, Math.max(0.001, num(box.w, 0)));
  const h = Math.min(1 - y, Math.max(0.001, num(box.h, 0)));

  return {
    text,
    rect: [x, y, w, h],
    confidence: Math.min(1, Math.max(0, num(box.confidence, 0.5))),
  };
}

/** A locator backed by fixed boxes. For tests and for a dry run. */
export class FixtureLocator implements TextLocator {
  readonly name = "fixture";

  constructor(private readonly byFrame: (frame: Frame) => TextBox[]) {}

  async locate(frame: Frame): Promise<TextBox[]> {
    return this.byFrame(frame);
  }
}
