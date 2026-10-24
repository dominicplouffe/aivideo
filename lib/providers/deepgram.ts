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
  /** Second, filler-only pass on nova-2 (default on). */
  fillerPass?: boolean;
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
    keyterms?: string[];
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
    // An explicit hint wins. Without one, ask Deepgram to detect the
    // language rather than sending "multi": in multilingual mode Deepgram
    // ignores filler_words, and on a real take it returned zero "um"s where
    // detect_language returned nine (24 Oct 2026).
    if (input.languageHint) query.set("language", input.languageHint);
    else query.set("detect_language", "true");
    // Keyterm prompting: one parameter per term, plain words only. The
    // vendor lifts recognition of a primed term to around ninety percent,
    // which is the difference between "Qore" and a correction on every take.
    for (const term of input.keyterms ?? []) query.append("keyterm", term);

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

    const language = channel?.detected_language ?? input.languageHint ?? "en";
    // nova-3 folds many "um"s into the word beside it (an "and" lasting
    // 2.16 s), where no edit can cut them. nova-2 still hears them as words,
    // so one filler-only pass on nova-2 puts them back. Best effort: if it
    // fails the take keeps the nova-3 words as they were.
    if (this.config.fillerPass !== false && (this.config.model ?? "nova-3") !== "nova-2" && language.startsWith("en")) {
      try {
        const fillerQuery = new URLSearchParams({ model: "nova-2", filler_words: "true", language });
        const again = await fetchImpl(`${base}/v1/listen?${fillerQuery}`, {
          method: "POST",
          headers: { Authorization: `Token ${this.config.apiKey}`, "Content-Type": contentType },
          body,
        });
        if (again.ok) {
          const extra = ((await again.json()) as DeepgramResponse).results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
          const fillers = extra
            .filter((w) => FILLER_WORDS.has(w.word.toLowerCase()))
            .map((w) => ({ word: w.word.toLowerCase(), start: w.start, end: w.end, confidence: w.confidence }));
          const merged = trimOverlongWords(mergeFillers(mapped, fillers));
          mapped.splice(0, mapped.length, ...merged);
        }
      } catch {
        // keep the nova-3 words
      }
    }

    return {
      language,
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

const FILLER_WORDS = new Set(["um", "uh", "umm", "uhm", "er", "erm", "ah", "hmm", "mm"]);

const letters = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");
/** How long a word may plausibly last before it has swallowed something. */
const keepSec = (w: string) => 0.3 + 0.08 * letters(w).length;

/**
 * Puts fillers heard by a second pass back into a transcript that lost them.
 * A filler already present (overlapping one in `words`) is skipped. A word
 * that swallowed the filler keeps its start (vendors time word starts well
 * and stretch the ends over what follows) and ends where the filler starts,
 * but never shorter than a plausible length for the word. A word wholly
 * inside a filler is left alone and the filler dropped, unless the word is
 * "a"/"ah"/"uh", which nova-3 writes for a spoken "uh": then the filler
 * replaces it.
 */
export function mergeFillers(
  words: TranscriptWordResult[],
  fillers: TranscriptWordResult[],
): TranscriptWordResult[] {
  let out = words.map((w) => ({ ...w }));
  const isFiller = (w: TranscriptWordResult) => FILLER_WORDS.has(letters(w.word));
  for (const f of fillers) {
    if (f.end - f.start <= 0) continue;
    const overlaps = out.filter((w) => w.start < f.end && f.start < w.end);
    if (overlaps.some(isFiller)) continue;
    let ok = true;
    const replaced: TranscriptWordResult[] = [];
    for (const w of overlaps) {
      const before = f.start - w.start;
      const after = w.end - f.end;
      if (before <= 0.05 && after <= 0.05) {
        if (["a", "ah", "uh"].includes(letters(w.word))) { replaced.push(w); continue; }
        ok = false;
        break;
      }
      if (before >= 0.1) w.end = Math.min(w.end, Math.max(f.start, w.start + keepSec(w.word)));
      else w.start = f.end;
    }
    if (!ok) continue;
    out = out.filter((w) => !replaced.includes(w));
    out.push({ ...f });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * A word that lasts far longer than its letters allow has swallowed a filler
 * the transcriber folded into it (nova-3 has timed "and" at 2.16 s over
 * "and, um,"). Keep a plausible length and mark the tail as a filler so the
 * edit cuts it.
 */
export function trimOverlongWords(words: TranscriptWordResult[]): TranscriptWordResult[] {
  const out: TranscriptWordResult[] = [];
  for (const w of words) {
    const n = letters(w.word).length;
    if (n === 0 || FILLER_WORDS.has(letters(w.word)) || w.end - w.start <= 0.7 + 0.08 * n) {
      out.push({ ...w });
      continue;
    }
    const cutAt = w.start + keepSec(w.word);
    out.push({ ...w, end: cutAt });
    out.push({ word: "um", start: cutAt, end: w.end, confidence: 0 });
  }
  return out;
}
