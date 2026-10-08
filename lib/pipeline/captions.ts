import { spawn } from "node:child_process";
import { ProviderError } from "@/lib/providers/errors";
import type { TranscriptWordResult } from "@/lib/providers/types";
import { grabFrame } from "@/lib/render/guide";
import { endsSentence, titleFor, type SegmentDraft } from "./segment";

/**
 * Reading a video's burned-in captions as its script.
 *
 * Some footage arrives with nothing to hear — a product tour exported
 * without a voice track, a social cut meant to play muted — and says what it
 * has to say in captions drawn into the picture. Transcription finds no
 * words in it, which leaves a project with nothing to edit and nothing for
 * a voice to read. The captions are the script, so they are read off the
 * frames instead.
 *
 * Only frames where the picture changed are read: a caption cannot change
 * without changing the picture, and most of a video is the same frame held.
 * The change test runs on small grey thumbnails in this process; only the
 * frames it keeps are grabbed at reading size and sent to the model.
 */

/** A caption as it appeared: its text and when it was on screen. */
export interface CaptionSpan {
  text: string;
  startSec: number;
  endSec: number;
}

/** What a frame said. `null` is a frame that could not be read, not one without a caption. */
export interface CaptionReading {
  atSec: number;
  text: string | null;
}

type BetaParams = import("@anthropic-ai/sdk/resources/beta/messages").MessageCreateParamsNonStreaming;
type BetaResult = import("@anthropic-ai/sdk/resources/beta/messages").BetaMessage;

export interface CaptionReaderConfig {
  apiKey: string;
  model?: string;
  binary?: string;
  /** Test seam, as in the other Anthropic adapters. */
  messagesCreate?: (params: BetaParams) => Promise<BetaResult>;
}

/** Twice a second: a caption shown for less than half a second cannot be read by a viewer either. */
const SAMPLE_FPS = 2;
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;
/** Grey levels a pixel must move by to count as changed; below it is compression noise. */
const PIXEL_DELTA = 24;
/**
 * Share of the thumbnail that must change for a frame to be read.
 *
 * Measured on a captioned product tour: a new caption changes 0.5–1% of the
 * thumbnail, a cut changes 40% or more, and a progress bar creeping along the
 * bottom edge stays under 0.05%.
 */
const CHANGED_SHARE = 0.003;
/** A frame is read at least this often regardless, for a caption change too small to cross the threshold. */
const MAX_HOLD_SEC = 4;
/** About a dollar of reading at most, however long or busy the video. */
const MAX_FRAMES = 240;
/** Frames read first to decide whether the video has captions at all. */
const PROBE_FRAMES = 8;
const BATCH_SIZE = 20;
const CONCURRENCY = 3;
/** Longest edge of a frame sent to the model. Caption text is legible well below this. */
const READ_EDGE = 960;

/**
 * Decides, frame by frame, whether the picture moved enough to be worth reading.
 *
 * Compares against the last frame it kept rather than the one before, so a
 * slow pan that never changes much between neighbours still gets read once
 * it has drifted far enough.
 */
export function createChangeDetector(options: { fps?: number; share?: number; holdSec?: number } = {}) {
  const fps = options.fps ?? SAMPLE_FPS;
  const share = options.share ?? CHANGED_SHARE;
  const holdSec = options.holdSec ?? MAX_HOLD_SEC;
  let last: Uint8Array | null = null;
  let lastAt = -Infinity;
  let index = 0;

  return (frame: Uint8Array): number | null => {
    const atSec = index++ / fps;
    let keep = last === null || last.length !== frame.length || atSec - lastAt >= holdSec;
    if (!keep && last) {
      const needed = frame.length * share;
      let changed = 0;
      for (let p = 0; p < frame.length; p++) {
        if (Math.abs(frame[p] - last[p]) > PIXEL_DELTA && ++changed > needed) {
          keep = true;
          break;
        }
      }
    }
    if (!keep) return null;
    // Copied: the caller's buffer is a view into a stream chunk it reuses.
    last = Uint8Array.from(frame);
    lastAt = atSec;
    return atSec;
  };
}

/** The moments worth reading, in seconds. */
async function changedMoments(sourcePath: string, binary = "ffmpeg"): Promise<number[]> {
  const frameBytes = THUMB_WIDTH * THUMB_HEIGHT;
  const detect = createChangeDetector();
  const moments: number[] = [];
  let pending = Buffer.alloc(0);
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, [
      "-hide_banner",
      "-loglevel", "error",
      "-i", sourcePath,
      "-vf", `fps=${SAMPLE_FPS},scale=${THUMB_WIDTH}:${THUMB_HEIGHT},format=gray`,
      "-f", "rawvideo",
      "-",
    ]);
    // Consumed as it arrives: ten minutes of thumbnails is 70 MB, and only
    // the last kept one is ever needed.
    child.stdout.on("data", (chunk: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let offset = 0;
      while (pending.length - offset >= frameBytes) {
        const at = detect(pending.subarray(offset, offset + frameBytes));
        if (at !== null) moments.push(at);
        offset += frameBytes;
      }
      pending = pending.subarray(offset);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });

  if (moments.length <= MAX_FRAMES) return moments;
  console.warn(`[captions] ${moments.length} changed frames; reading ${MAX_FRAMES} spread across the video.`);
  return Array.from({ length: MAX_FRAMES }, (_, i) => moments[Math.floor((i * moments.length) / MAX_FRAMES)]);
}

const SYSTEM = [
  "You read burned-in captions out of video frames.",
  "",
  "A caption is the subtitle text that narrates the video: usually one or two",
  "lines of sentence text, centred near the bottom of the frame, often on a",
  "dark or translucent band, changing as the video goes on.",
  "",
  "Not captions: titles, headings, slide text, bullet points, labels, buttons,",
  "menus, logos, watermarks, breadcrumbs, or any text belonging to the",
  "software or document the video shows.",
  "",
  "For every frame, return the caption exactly as written: a two-line caption",
  "joined with a single space, punctuation and capitalisation kept, nothing",
  "corrected, translated or summarised. Return an empty string for a frame",
  "with no caption, and for one whose caption is fading and not fully legible.",
].join("\n");

const SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    frames: {
      type: "array",
      items: {
        type: "object",
        properties: {
          frame: { type: "integer" },
          caption: { type: "string" },
        },
        required: ["frame", "caption"],
        additionalProperties: false,
      },
    },
  },
  required: ["frames"],
  additionalProperties: false,
};

async function clientFor(config: CaptionReaderConfig): Promise<(params: BetaParams) => Promise<BetaResult>> {
  if (config.messagesCreate) return config.messagesCreate;
  const sdk = await import("@anthropic-ai/sdk");
  const client = new sdk.default({ apiKey: config.apiKey });
  return (params: BetaParams) => client.beta.messages.create(params);
}

/** Reads one batch of moments. A frame that could not be grabbed reads as `null`. */
async function readBatch(
  sourcePath: string,
  moments: number[],
  config: CaptionReaderConfig,
  create: (params: BetaParams) => Promise<BetaResult>,
): Promise<CaptionReading[]> {
  const frames = await Promise.all(
    moments.map((atSec) => grabFrame(sourcePath, atSec, { binary: config.binary, maxEdge: READ_EDGE })),
  );
  const content: Extract<BetaParams["messages"][number]["content"], unknown[]> = [];
  frames.forEach((png, i) => {
    if (!png) return;
    content.push({ type: "text", text: `Frame ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") } });
  });
  if (content.length === 0) return moments.map((atSec) => ({ atSec, text: null }));

  const response = await create({
    model: config.model ?? "claude-opus-5-5",
    max_tokens: 8192,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    // A refused batch is retried on whichever model the API picks for the
    // refusal, inside the same call, rather than failing the import.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      // Reading text off a frame is perception, not reasoning.
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new ProviderError("The caption reader refused to read the video's frames.", {
      provider: "anthropic-captions",
      retryable: false,
    });
  }

  const text = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  let parsed: { frames?: { frame?: unknown; caption?: unknown }[] };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new ProviderError("The caption reader returned something that was not a frame list.", {
      provider: "anthropic-captions",
      retryable: true,
    });
  }

  const byFrame = new Map<number, string>();
  for (const entry of parsed.frames ?? []) {
    if (typeof entry.frame === "number" && typeof entry.caption === "string") byFrame.set(entry.frame, entry.caption);
  }
  return moments.map((atSec, i) => ({
    atSec,
    text: frames[i] ? (byFrame.get(i + 1) ?? null) : null,
  }));
}

async function readAll(
  sourcePath: string,
  moments: number[],
  config: CaptionReaderConfig,
  create: (params: BetaParams) => Promise<BetaResult>,
): Promise<CaptionReading[]> {
  const batches: number[][] = [];
  for (let i = 0; i < moments.length; i += BATCH_SIZE) batches.push(moments.slice(i, i + BATCH_SIZE));
  const results: CaptionReading[][] = new Array(batches.length);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const index = next++;
      results[index] = await readBatch(sourcePath, batches[index], config, create);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return results.flat();
}

/**
 * The captions burned into a video, with when each was on screen.
 *
 * Empty when the video has none. A handful of frames spread across it are
 * read first, and the rest only when one of those shows a caption, so a
 * silent screen recording costs one small call rather than a full read.
 */
export async function readCaptions(
  sourcePath: string,
  durationSec: number,
  config: CaptionReaderConfig,
): Promise<CaptionSpan[]> {
  const moments = await changedMoments(sourcePath, config.binary);
  if (moments.length === 0) return [];
  const create = await clientFor(config);

  const probeCount = Math.min(PROBE_FRAMES, moments.length);
  const probeMoments = Array.from({ length: probeCount }, (_, i) => moments[Math.floor((i * moments.length) / probeCount)]);
  const probed = await readBatch(sourcePath, probeMoments, config, create);
  if (!probed.some((reading) => reading.text?.trim())) return [];

  const probedAt = new Set(probeMoments);
  const rest = await readAll(sourcePath, moments.filter((m) => !probedAt.has(m)), config, create);
  const readings = [...probed, ...rest].sort((a, b) => a.atSec - b.atSec);
  return spansFromReadings(readings, durationSec);
}

/** Compared loosely: the same caption read twice can differ in a stray space or a curly quote. */
function sameCaption(a: string, b: string): boolean {
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return key(a) === key(b);
}

/**
 * Turns frame-by-frame readings into captions with start and end times.
 *
 * Each reading holds until the next one. An unreadable frame changes
 * nothing; an empty one ends the caption on screen.
 */
export function spansFromReadings(readings: CaptionReading[], durationSec: number): CaptionSpan[] {
  const spans: CaptionSpan[] = [];
  let open: CaptionSpan | null = null;

  for (const reading of readings) {
    if (reading.text === null) continue;
    const text = reading.text.replace(/\s+/g, " ").trim();
    if (open && text && sameCaption(open.text, text)) continue;
    if (open) {
      open.endSec = reading.atSec;
      spans.push(open);
      open = null;
    }
    if (text) open = { text, startSec: reading.atSec, endSec: reading.atSec };
  }
  if (open) {
    open.endSec = Math.max(open.startSec, durationSec);
    spans.push(open);
  }
  return spans;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Chapters from captions, covering the whole video.
 *
 * The Studio plays the footage under words and drops the gaps between them
 * as dead air, which suits speech and would gut a captioned video. So each
 * caption's words are laid end to end across the time it owns — from when
 * it appears until the next one does, the first from the start of the video
 * and the last to its end — and every frame stays in the edit.
 *
 * Captions are gathered into chapters at sentence ends, the way speech is,
 * so a video captioned a phrase at a time does not become a chapter per
 * phrase.
 */
export function chaptersFromCaptions(
  spans: CaptionSpan[],
  durationSec: number,
  options: { minSec?: number; maxSec?: number } = {},
): SegmentDraft[] {
  const minSec = options.minSec ?? 2.5;
  const maxSec = options.maxSec ?? 24;
  const end = Math.max(durationSec, spans.at(-1)?.endSec ?? 0);

  const tiles = spans.map((span, i) => {
    const startSec = i === 0 ? 0 : span.startSec;
    const endSec = i === spans.length - 1 ? end : spans[i + 1].startSec;
    const tokens = span.text.split(/\s+/).filter(Boolean);
    const slot = (endSec - startSec) / Math.max(1, tokens.length);
    return {
      startSec,
      endSec,
      words: tokens.map((w, k) => ({ w, t: round(startSec + k * slot), d: round(slot) })),
    };
  });

  const drafts: SegmentDraft[] = [];
  let current: typeof tiles = [];
  const flush = () => {
    if (current.length === 0) return;
    drafts.push({
      ordinal: drafts.length,
      title: "",
      startSec: round(current[0].startSec),
      endSec: round(current.at(-1)!.endSec),
      words: current.flatMap((tile) => tile.words),
    });
    current = [];
  };

  tiles.forEach((tile, i) => {
    current.push(tile);
    const length = tile.endSec - current[0].startSec;
    const next = tiles[i + 1];
    const lastWord = tile.words.at(-1)?.w ?? "";
    if ((length >= minSec && endsSentence(lastWord)) || (next && next.endSec - current[0].startSec > maxSec)) flush();
  });
  flush();

  // A short last chapter is the end of the one before it, as with speech.
  if (drafts.length > 1) {
    const last = drafts[drafts.length - 1];
    if (last.endSec - last.startSec < minSec) {
      const previous = drafts[drafts.length - 2];
      previous.words = [...previous.words, ...last.words];
      previous.endSec = last.endSec;
      drafts.pop();
    }
  }

  return drafts.map((draft, ordinal) => ({ ...draft, ordinal, title: titleFor(draft.words, ordinal) }));
}

/** The chapters' words in the shape a transcriber returns, for storing on the recording. */
export function wordsFromChapters(drafts: SegmentDraft[]): TranscriptWordResult[] {
  return drafts.flatMap((draft) =>
    draft.words.map((w) => ({ word: w.w, start: w.t, end: round(w.t + w.d), confidence: 1 })),
  );
}
