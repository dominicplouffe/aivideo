import { ProviderError, isRetryableStatus } from "./errors";
import type {
  TranscriptionProvider,
  TranscriptionResult,
  TranscriptionSource,
  TranscriptWordResult,
} from "./types";

/**
 * Deepgram-backed transcription.
 *
 * The whole editor rests on this call. DemoRiff edits video by editing text:
 * deleting the word "basically" from the transcript removes those 380
 * milliseconds from the timeline. That only works if every word carries its
 * own start and end — segment-level timings, which most speech APIs return by
 * default, are useless here.
 *
 * Two request parameters are load-bearing and easy to lose in a refactor:
 *
 *  - `filler_words=true`. Deepgram silently discards "um" and "uh" unless
 *    asked. Removing filler words is a headline feature; we cannot remove
 *    what the transcript never admitted was there.
 *  - `diarize=true`. Two-person walkthroughs are common and the editor labels
 *    speakers.
 *
 * Spoken over REST rather than the vendor SDK: the surface used here is one
 * POST, and a dependency that ships its own websocket stack is not worth
 * carrying for it.
 */

export interface DeepgramConfig {
  apiKey: string;
  /** Overridable so a model upgrade is a config change, not a deploy. */
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      detected_language?: string;
      alternatives?: { words?: DeepgramWord[] }[];
    }[];
  };
}

/**
 * `fetch` accepts a `Uint8Array` as a body, but the types disagree depending
 * on which DOM lib is in scope, and a stray `SharedArrayBuffer` in the union
 * is the sort of thing that only fails on somebody else's TypeScript version.
 * One copy into a plain `ArrayBuffer` settles it.
 */
function bodyFrom(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export class DeepgramTranscription implements TranscriptionProvider {
  readonly name = "deepgram-transcription";

  constructor(private readonly config: DeepgramConfig) {
    if (!config.apiKey) {
      throw new Error("DeepgramTranscription requires an API key (DEEPGRAM_API_KEY).");
    }
  }

  async transcribe(input: {
    media: TranscriptionSource;
    languageHint?: string;
  }): Promise<TranscriptionResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const base = this.config.baseUrl ?? "https://api.deepgram.com";

    const query = new URLSearchParams({
      model: this.config.model ?? "nova-3",
      smart_format: "true",
      punctuate: "true",
      paragraphs: "true",
      diarize: "true",
      // See the note above: without this the editor cannot cut fillers.
      filler_words: "true",
    });
    // "multi" lets Deepgram detect the language rather than mistrusting the
    // caller's guess; an explicit hint still wins when we have one.
    query.set("language", input.languageHint ?? "multi");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 300_000);

    // Bytes when we have them, a URL when the media is somewhere Deepgram
    // can reach. Sending bytes is what lets a recording stay private: the
    // alternative is a publicly fetchable URL for every customer's screen.
    const { contentType, body } =
      "bytes" in input.media
        ? { contentType: input.media.contentType, body: bodyFrom(input.media.bytes) }
        : { contentType: "application/json", body: JSON.stringify({ url: input.media.url }) };

    let response: Response;
    try {
      response = await fetchImpl(`${base}/v1/listen?${query}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
          "Content-Type": contentType,
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      // An aborted or dropped connection on a long recording is worth
      // retrying; the upload it refers to is still in storage.
      throw new ProviderError(`Deepgram was unreachable: ${String(error)}`, {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ProviderError(
        `Deepgram returned ${response.status}: ${body.slice(0, 400)}`,
        {
          provider: this.name,
          retryable: isRetryableStatus(response.status),
          status: response.status,
        },
      );
    }

    const payload = (await response.json()) as DeepgramResponse;
    const channel = payload.results?.channels?.[0];
    const words = channel?.alternatives?.[0]?.words;

    if (!words || words.length === 0) {
      // Silent footage is a legitimate outcome, not a failure — a screen
      // recording with no narration still gets zooms, captions and a guide.
      return {
        language: channel?.detected_language ?? input.languageHint ?? "en",
        durationSec: payload.metadata?.duration ?? 0,
        words: [],
      };
    }

    const mapped: TranscriptWordResult[] = words.map((w) => ({
      // Punctuation is what the direction engine reads to find where a
      // sentence ends, so keep the punctuated form when Deepgram provides it.
      word: w.punctuated_word ?? w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      speaker: typeof w.speaker === "number" ? `speaker-${w.speaker}` : undefined,
    }));

    return {
      language: channel?.detected_language ?? input.languageHint ?? "en",
      // Trust the container's duration over the last word's end timestamp:
      // trailing silence is part of the shot.
      durationSec: payload.metadata?.duration ?? mapped[mapped.length - 1].end,
      words: mapped,
    };
  }
}

export function createDeepgramTranscription(config: DeepgramConfig): TranscriptionProvider {
  return new DeepgramTranscription(config);
}
