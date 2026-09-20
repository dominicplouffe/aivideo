import { ProviderError } from "./errors";
import type { TranslationProvider } from "./types";

/**
 * Anthropic-backed translation.
 *
 * Translating a demo narration is not the same job as translating prose.
 * Three constraints come from the product, not from the vendor:
 *
 *  1. **Product nouns must survive verbatim.** If the UI still says
 *     "Brand Kit" in the recording, the Spanish voiceover saying
 *     "Kit de Marca" makes the video wrong, not localised. The glossary is
 *     enforced after the call, not merely requested in the prompt.
 *  2. **Length is a hard constraint, not a preference.** The translated line
 *     is spoken over footage whose timing is already cut. A line 60% longer
 *     than the source either overruns the shot or gets sped up until it
 *     sounds robotic.
 *  3. **The output must parse every time.** Structured outputs remove the
 *     "respond with only JSON" failure mode, where an apologetic preamble
 *     becomes part of the voiceover.
 *
 * The SDK is imported dynamically so it can stay an optional dependency and
 * a mock-mode deployment never loads it.
 */

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type AnthropicClient = InstanceType<AnthropicModule["default"]>;
/** The non-streaming halves of the `messages.create` overload pair. */
type MessageParams = import("@anthropic-ai/sdk/resources/messages").MessageCreateParamsNonStreaming;
type MessageResult = import("@anthropic-ai/sdk/resources/messages").Message;

export interface AnthropicConfig {
  apiKey: string;
  /** Overridable so a deployment can trade cost for quality without a deploy. */
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxRetries?: number;
  timeoutMs?: number;
  /**
   * Test seam. Replaces the client call while leaving request construction,
   * validation and error mapping on the path under test.
   */
  messagesCreate?: (params: MessageParams) => Promise<MessageResult>;
}

const TRANSLATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "The translated narration, and nothing else.",
    },
  },
  required: ["text"],
  additionalProperties: false,
};

const SYSTEM = [
  "You localise narration for software product demos.",
  "",
  "The text you receive is spoken aloud over screen footage that has already",
  "been cut to the original timing. Your translation is read by a synthetic",
  "voice into that same gap.",
  "",
  "Rules:",
  "- Match the spoken length of the source as closely as the target language",
  "  allows. Prefer the shorter of two accurate phrasings. Never pad.",
  "- Reproduce every protected term exactly as given, including case. These",
  "  are on-screen labels and product names; a viewer reads them in the UI",
  "  while hearing you say them.",
  "- Keep the register of the source: direct, second person, present tense.",
  "- Translate meaning, not words. An idiom becomes the target language's",
  "  idiom, not a literal gloss.",
  "- Output the narration only. No notes, no alternatives, no quotation marks",
  "  that were not in the source.",
].join("\n");

/**
 * Length overrun that is worth a second attempt.
 *
 * Normal expansion between European languages runs to roughly a third; past
 * that the line usually contains an explanation the source did not have.
 * Character counts only compare like with like, so the check is skipped when
 * the two locales do not share a script — see `comparableScripts`.
 */
const LENGTH_TOLERANCE = 1.4;

/** Locales whose character count is not comparable to a Latin-script source. */
const NON_LATIN = /^(zh|ja|ko|ar|he|hi|th|ru|uk|el|bn|ta|fa)\b/i;

function comparableScripts(from: string, to: string): boolean {
  return !NON_LATIN.test(from) && !NON_LATIN.test(to);
}

/** Protected terms the model dropped or altered, in the order they were given. */
function missingTerms(text: string, glossary: string[]): string[] {
  return glossary.filter((term) => term.trim() !== "" && !text.includes(term));
}

export class AnthropicTranslation implements TranslationProvider {
  readonly name = "anthropic-translation";
  private clientPromise: Promise<{ sdk: AnthropicModule; client: AnthropicClient }> | null = null;

  constructor(private readonly config: AnthropicConfig) {
    if (!config.apiKey) {
      throw new Error("AnthropicTranslation requires an API key (ANTHROPIC_API_KEY).");
    }
  }

  private async sdk() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const sdk = (await import("@anthropic-ai/sdk")) as AnthropicModule;
        const client = new sdk.default({
          apiKey: this.config.apiKey,
          // The SDK's own retry handles 429 and 5xx with backoff, so the
          // adapter does not re-implement it.
          maxRetries: this.config.maxRetries ?? 3,
          timeout: this.config.timeoutMs ?? 60_000,
        });
        return { sdk, client };
      })().catch((error) => {
        this.clientPromise = null;
        throw new Error(
          "Anthropic translation requires @anthropic-ai/sdk. Install it or set " +
            `DEMORIFF_PROVIDERS=mock. Cause: ${String(error)}`,
        );
      });
    }
    return this.clientPromise;
  }

  async translate(input: {
    text: string;
    from: string;
    to: string;
    glossary?: string[];
  }): Promise<{ text: string }> {
    const glossary = input.glossary ?? [];
    const source = input.text.trim();
    if (source === "") return { text: "" };

    const first = await this.request(input, glossary, null);

    const problems: string[] = [];
    const dropped = missingTerms(first, glossary);
    if (dropped.length > 0) {
      problems.push(
        `These protected terms were changed or dropped and must appear exactly as ` +
          `written: ${dropped.join(", ")}.`,
      );
    }
    if (
      comparableScripts(input.from, input.to) &&
      first.length > source.length * LENGTH_TOLERANCE
    ) {
      problems.push(
        `The translation is ${Math.round((first.length / source.length - 1) * 100)}% ` +
          `longer than the source, which will not fit the shot. Say the same thing ` +
          `in at most ${Math.round(source.length * 1.15)} characters.`,
      );
    }

    if (problems.length === 0) return { text: first };

    // One corrective pass. A third would cost more than it reliably buys.
    const second = await this.request(input, glossary, problems.join(" "));
    const stillDropped = missingTerms(second, glossary);
    if (stillDropped.length > 0) {
      throw new ProviderError(
        `Translation to ${input.to} dropped protected terms after a retry: ` +
          `${stillDropped.join(", ")}. Refusing to ship a localisation that renames ` +
          `the product.`,
        { provider: this.name, retryable: false },
      );
    }
    // A line that is still long is shippable — the renderer can tighten pacing.
    // A renamed product is not. Only the latter fails the job.
    return { text: second };
  }

  private async request(
    input: { text: string; from: string; to: string },
    glossary: string[],
    correction: string | null,
  ): Promise<string> {
    const { sdk, client } = await this.sdk();
    const create = this.config.messagesCreate ?? ((params: MessageParams) => client.messages.create(params));

    const parts = [
      `Source locale: ${input.from}`,
      `Target locale: ${input.to}`,
      glossary.length > 0
        ? `Protected terms (reproduce exactly): ${glossary.join(", ")}`
        : "Protected terms: none",
      "",
      "Narration:",
      input.text,
    ];
    if (correction) parts.push("", `Your previous attempt was rejected. ${correction}`);

    try {
      const response = await create({
        model: this.config.model ?? "claude-opus-5",
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: parts.join("\n") }],
        thinking: { type: "adaptive" },
        output_config: {
          // A caption span is a small, well-specified job; effort buys little
          // here and is charged on every span of every locale.
          effort: this.config.effort ?? "low",
          format: { type: "json_schema", schema: TRANSLATION_SCHEMA },
        },
      });

      if (response.stop_reason === "refusal") {
        throw new ProviderError(
          `Anthropic refused to translate the narration into ${input.to}.`,
          { provider: this.name, retryable: false },
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw new ProviderError(
          "Translation was truncated at max_tokens. Split the narration into " +
            "smaller spans before translating.",
          { provider: this.name, retryable: false },
        );
      }

      const text = response.content
        .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("");

      const parsed = JSON.parse(text) as { text?: unknown };
      if (typeof parsed.text !== "string") {
        throw new ProviderError("Translation response did not contain text.", {
          provider: this.name,
          retryable: true,
        });
      }
      return parsed.text.trim();
    } catch (error) {
      throw this.wrap(error, sdk);
    }
  }

  /**
   * Maps SDK failures onto the queue's retry decision using the typed error
   * classes rather than message matching, which changes between releases.
   */
  private wrap(error: unknown, sdk: AnthropicModule): unknown {
    if (error instanceof ProviderError) return error;

    const Anthropic = sdk.default;
    if (error instanceof Anthropic.RateLimitError) {
      return new ProviderError("Anthropic rate limit reached.", {
        provider: this.name,
        retryable: true,
        status: error.status,
        cause: error,
      });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return new ProviderError(
        "Anthropic rejected the credentials. Check ANTHROPIC_API_KEY.",
        { provider: this.name, retryable: false, status: error.status, cause: error },
      );
    }
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
      return new ProviderError(`Anthropic rejected the request: ${error.message}`, {
        provider: this.name,
        retryable: false,
        status: error.status,
        cause: error,
      });
    }
    if (error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
      return new ProviderError(`Anthropic was unreachable: ${error.message}`, {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    }
    if (error instanceof Anthropic.APIError) {
      return new ProviderError(`Anthropic error ${error.status}: ${error.message}`, {
        provider: this.name,
        retryable: typeof error.status === "number" && error.status >= 500,
        status: error.status,
        cause: error,
      });
    }
    if (error instanceof SyntaxError) {
      // Structured outputs should make this unreachable; if the schema ever
      // stops being honoured, retrying is the right response.
      return new ProviderError("Anthropic returned unparseable output.", {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    }
    return error;
  }
}

export function createAnthropicTranslation(config: AnthropicConfig): TranslationProvider {
  return new AnthropicTranslation(config);
}
