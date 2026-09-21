import type { Project, Segment } from "@/lib/app-data";
import { silentSpanSec, wordKey } from "@/lib/segments";
import { resolveWords, type WordEdit } from "@/lib/edit-state";
import type { MaskedRegion } from "@/lib/providers/types";

/**
 * The edit decision list.
 *
 * This is the contract between the editor and the renderer, and the only
 * thing a render worker needs in order to produce a finished video. It is
 * plain data: serialisable, diffable, and reproducible — the same EDL renders
 * to the same bytes, which is what makes a re-render after a copy change
 * cheap and a render farm's cache worth having.
 *
 * One idea does all the load-bearing work here:
 *
 *   **The cut is expressed in source time. Everything else is expressed in
 *   output time.**
 *
 * `clips` says which ranges of the recording survive. Zooms, masks and
 * captions are positioned on the finished timeline, *after* those ranges have
 * been removed. The alternative — carrying source timestamps all the way to
 * the renderer — is the classic way this goes wrong: delete one "um" near the
 * start and every zoom for the rest of the video drifts by 340 milliseconds.
 * The mapping is done once, here, by code that can be tested in isolation,
 * rather than in a filter graph where the symptom is a seasick video and the
 * cause is invisible.
 */

export const EDL_VERSION = 1 as const;

/** A surviving range of the source recording. */
export interface EdlClip {
  sourceStart: number;
  sourceEnd: number;
  /** Where this range begins on the finished timeline. */
  outputStart: number;
  /** Why this range exists, for debugging a bad cut. */
  label?: string;
}

/** A camera move, positioned on the finished timeline. */
export interface EdlZoom {
  at: number;
  holdSec: number;
  scale: number;
  /** Normalised 0..1 within the frame. */
  anchor: { x: number; y: number };
  easing: "push" | "cut" | "hold";
}

/** A region to obscure, positioned on the finished timeline. */
export interface EdlMask {
  from: number;
  until: number;
  /** Normalised [x, y, w, h] within the frame. */
  rect: [number, number, number, number];
  style: "blur" | "pixelate" | "redact";
}

export interface EdlCaption {
  from: number;
  until: number;
  text: string;
}

export interface EdlAudio {
  kind: "narration" | "music";
  url: string;
  /** Where the clip starts on the finished timeline. */
  at: number;
  durationSec: number;
  gainDb: number;
  /**
   * Playback speed applied in the mix, 1 being as synthesized. Narration
   * that runs longer than the footage it describes is fitted first by the
   * vendor's own pacing and then, within a narrow range, by this — so a
   * chapter's voice ends before the next chapter's begins.
   */
  tempo?: number;
  /** Narration ducks music by this much while it plays. */
  ducksBy?: number;
  /**
   * Which voice spoke this. Recorded so a render can be refused when the
   * speaker has since withdrawn consent — a check that is impossible if the
   * EDL only remembers a URL to some audio.
   */
  voiceId?: string;
}

export interface EdlOutput {
  width: number;
  height: number;
  fps: 30 | 60;
  container: "mp4" | "webm";
  videoCodec: "h264" | "vp9";
  audioCodec: "aac" | "opus";
  /** Constant Rate Factor. Lower is better quality and a larger file. */
  crf: number;
}

export interface Edl {
  version: typeof EDL_VERSION;
  projectId: string;
  locale: string;
  source: { url: string; durationSec: number };
  output: EdlOutput;
  clips: EdlClip[];
  zooms: EdlZoom[];
  masks: EdlMask[];
  captions: EdlCaption[];
  audio: EdlAudio[];
  brand: {
    colors: string[];
    font: string;
    captionStyle: string;
    introSec: number;
    outroSec: number;
  };
  /** Finished duration. Derived from `clips`, never stored independently. */
  durationSec: number;
}

const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
};

export function resolutionOf(name: string): { width: number; height: number } {
  const size = RESOLUTIONS[name];
  if (!size) throw new Error(`Unknown resolution: ${name}`);
  return size;
}

/** Finished duration: the sum of what survived. */
export function edlDuration(clips: EdlClip[]): number {
  return clips.reduce((total, clip) => total + (clip.sourceEnd - clip.sourceStart), 0);
}

/**
 * Maps a point in the source recording onto the finished timeline.
 *
 * A point inside a removed range has no honest output time. It collapses to
 * the start of the next surviving clip, which is where a viewer would see
 * that moment — the cut happened, the content is gone, the marker lands on
 * the join. Returns null only when the point falls after everything kept.
 */
export function mapSourceToOutput(clips: EdlClip[], sourceTime: number): number | null {
  for (const clip of clips) {
    if (sourceTime < clip.sourceStart) return clip.outputStart;
    if (sourceTime <= clip.sourceEnd) {
      return clip.outputStart + (sourceTime - clip.sourceStart);
    }
  }
  return null;
}

/**
 * The inverse, for scrubbing back from the finished video to the source.
 *
 * A join is ambiguous: the instant where one clip ends is also where the next
 * begins, and the two have entirely different source times. The boundary
 * belongs to the clip that is about to play, which is what a viewer sees and
 * what keeps this function the exact inverse of `mapSourceToOutput`.
 */
export function mapOutputToSource(clips: EdlClip[], outputTime: number): number | null {
  for (const clip of clips) {
    const length = clip.sourceEnd - clip.sourceStart;
    if (outputTime < clip.outputStart + length) {
      return clip.sourceStart + Math.max(0, outputTime - clip.outputStart);
    }
  }
  // The very last frame has no "next clip" to belong to.
  const last = clips[clips.length - 1];
  if (last && Math.abs(outputTime - (last.outputStart + (last.sourceEnd - last.sourceStart))) < 1e-6) {
    return last.sourceEnd;
  }
  return null;
}

/** Word-level source ranges, derived from the segment's start and word durations. */
interface SourceWord {
  text: string;
  start: number;
  end: number;
  cut: boolean;
  segIndex: number;
  wordIndex: number;
}

function sourceWords(segments: Segment[], wordEdits: Map<string, WordEdit>): SourceWord[] {
  const out: SourceWord[] = [];
  segments.forEach((seg, segIndex) => {
    if (seg.words.length === 0) {
      // Silent footage plays as recorded; see `silentSpanSec`. One range,
      // no text: it becomes a clip and never a caption.
      if (silentSpanSec(seg) > 0) {
        out.push({ text: "", start: seg.start, end: seg.end, cut: false, segIndex, wordIndex: 0 });
      }
      return;
    }
    let t = seg.start;
    for (const word of resolveWords(seg, segIndex, { wordEdits })) {
      out.push({ text: word.text, start: t, end: t + word.d, cut: word.cut, segIndex, wordIndex: word.wordIndex });
      t += word.d;
    }
  });
  return out;
}

export interface BuildEdlInput {
  project: Project;
  sourceUrl: string;
  locale?: string;
  removeFillers?: boolean;
  deletedSegments?: Set<number>;
  /** Words cut by hand, keyed with `wordKey`. */
  cutWords?: Set<string>;
  /** Words rewritten by hand; captions show the rewrite. */
  wordEdits?: Map<string, WordEdit>;
  captions?: boolean;
  zoomEnabled?: boolean;
  /** Regions from the masking provider, in source time. */
  /**
   * Regions from the masking provider, in source time.
   *
   * Geometry and treatment only. The provider also reports *why* each region
   * exists, which belongs in the recording's manifest rather than in an edit
   * decision list — the encoder has no use for it and carrying it here would
   * make every caller invent a reason.
   */
  masks?: Pick<MaskedRegion, "at" | "until" | "rect" | "style">[];
  /** Synthesized narration, one clip per surviving segment. */
  narration?: { segIndex: number; url: string; durationSec: number; voiceId?: string }[];
  musicUrl?: string;
  brand?: { colors: string[]; font: string; captionStyle: string };
  resolution?: keyof typeof RESOLUTIONS;
  fps?: 30 | 60;
}

/**
 * Turns a project plus an edit into an EDL.
 *
 * Adjacent surviving words are merged into one clip rather than emitted
 * individually: a hundred word-sized trims and a four-clip concat produce the
 * same video, but only one of them finishes this decade.
 */
export function buildEdl(input: BuildEdlInput): Edl {
  const {
    project,
    sourceUrl,
    locale = project.locales[0] ?? "en-US",
    removeFillers = true,
    deletedSegments = new Set<number>(),
    cutWords = new Set<string>(),
    wordEdits = new Map<string, WordEdit>(),
    captions = true,
    zoomEnabled = true,
    resolution = "1080p",
    fps = 30,
  } = input;

  const words = sourceWords(project.segments, wordEdits);
  const kept = words.filter(
    (w) =>
      !deletedSegments.has(w.segIndex) &&
      !(removeFillers && w.cut) &&
      !cutWords.has(wordKey(w.segIndex, w.wordIndex)),
  );

  // Merge adjacent survivors. A gap opens a new clip; so does a segment
  // boundary, so captions and narration can be anchored per segment.
  const clips: EdlClip[] = [];
  let outputStart = 0;
  for (const word of kept) {
    const last = clips[clips.length - 1];
    const contiguous =
      last !== undefined &&
      Math.abs(last.sourceEnd - word.start) < 1e-6 &&
      last.label === project.segments[word.segIndex].id;

    if (contiguous) {
      last.sourceEnd = word.end;
    } else {
      if (last) outputStart += last.sourceEnd - last.sourceStart;
      clips.push({
        sourceStart: word.start,
        sourceEnd: word.end,
        outputStart,
        label: project.segments[word.segIndex].id,
      });
    }
  }

  const durationSec = edlDuration(clips);

  // Zooms. A segment's framing applies across whatever survived of it.
  const zooms: EdlZoom[] = [];
  if (zoomEnabled) {
    project.segments.forEach((seg, segIndex) => {
      if (!seg.zoom || deletedSegments.has(segIndex)) return;
      const segmentClips = clips.filter((c) => c.label === seg.id);
      if (segmentClips.length === 0) return;
      const at = segmentClips[0].outputStart;
      const hold = segmentClips.reduce((t, c) => t + (c.sourceEnd - c.sourceStart), 0);
      zooms.push({
        at,
        holdSec: hold,
        scale: seg.zoom.scale,
        anchor: { x: seg.zoom.x, y: seg.zoom.y },
        easing: "push",
      });
    });
  }

  // Masks arrive in source time and are mapped onto the cut timeline. A mask
  // whose subject was cut out entirely disappears with it, which is correct:
  // there is nothing left on screen to hide.
  const masks: EdlMask[] = [];
  for (const region of input.masks ?? []) {
    const from = mapSourceToOutput(clips, region.at);
    if (from === null) continue;
    const until =
      region.until === Number.POSITIVE_INFINITY
        ? durationSec
        : (mapSourceToOutput(clips, region.until) ?? durationSec);
    if (until <= from) continue;
    masks.push({
      from,
      until,
      rect: region.rect,
      // No cast: the provider contract names the same three styles the
      // encoder understands, so a fourth one cannot reach here unnoticed.
      style: region.style ?? "blur",
    });
  }

  // Captions, grouped into readable cues on the finished timeline.
  const cues: EdlCaption[] = [];
  if (captions) {
    let current: { words: string[]; from: number; until: number } | null = null;
    const flush = () => {
      if (current && current.words.length > 0) {
        cues.push({ from: current.from, until: current.until, text: current.words.join(" ") });
      }
      current = null;
    };
    for (const word of kept) {
      if (!word.text) continue; // a silent span has nothing to caption
      const at = mapSourceToOutput(clips, word.start);
      if (at === null) continue;
      const endsAt = at + (word.end - word.start);
      if (!current) current = { words: [], from: at, until: endsAt };
      current.words.push(word.text);
      current.until = endsAt;
      // Seven words is about a line and a half at caption size; a sentence
      // end is a better break than a word count, so it wins.
      if (/[.!?]$/.test(word.text) || current.words.length >= 7) flush();
    }
    flush();
  }

  const audio: EdlAudio[] = narrationTracks(
    clips,
    (input.narration ?? []).map((clip) => ({
      segmentId: project.segments[clip.segIndex]?.id ?? "",
      url: clip.url,
      durationSec: clip.durationSec,
      voiceId: clip.voiceId ?? project.voiceId ?? undefined,
    })),
  );
  if (input.musicUrl) {
    audio.push({
      kind: "music",
      url: input.musicUrl,
      at: 0,
      durationSec,
      // Music sits well under speech; narration ducks it further while it plays.
      gainDb: -26,
      ducksBy: 8,
    });
  }

  const size = resolutionOf(resolution);

  return {
    version: EDL_VERSION,
    projectId: project.id,
    locale,
    source: { url: sourceUrl, durationSec: project.sourceDurationSec },
    output: {
      width: size.width,
      height: size.height,
      fps,
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      // 18 is visually lossless for screen content, which is mostly flat
      // colour and text where compression artefacts are obvious.
      crf: 18,
    },
    clips,
    zooms,
    masks,
    captions: cues,
    audio,
    brand: {
      colors: input.brand?.colors ?? ["#6E56F8", "#22D3EE", "#0B0D14", "#F5F7FF"],
      font: input.brand?.font ?? "Inter",
      captionStyle: input.brand?.captionStyle ?? "Lower third, 80% opacity",
      introSec: 0,
      outroSec: 0,
    },
    durationSec,
  };
}

/** A synthesized reading of one chapter, ready to be placed on the timeline. */
export interface NarrationClip {
  segmentId: string;
  url: string;
  durationSec: number;
  voiceId?: string;
  tempo?: number;
}

/**
 * Narration lands where its chapter begins on the finished timeline.
 *
 * One home for that rule, used both when an EDL is first built and when a
 * worker adds narration to an EDL it was handed. A chapter the edit removed
 * has no surviving clip and gets no narration: there is nothing on screen
 * for the voice to describe.
 */
export function narrationTracks(clips: EdlClip[], narration: NarrationClip[]): EdlAudio[] {
  const audio: EdlAudio[] = [];
  for (const clip of narration) {
    const first = clips.find((c) => c.label === clip.segmentId);
    if (!first) continue;
    audio.push({
      kind: "narration",
      url: clip.url,
      at: first.outputStart,
      durationSec: clip.durationSec,
      gainDb: 0,
      ...(clip.voiceId ? { voiceId: clip.voiceId } : {}),
      ...(clip.tempo && clip.tempo !== 1 ? { tempo: clip.tempo } : {}),
    });
  }
  return audio;
}

/** The same EDL with narration added, ahead of any music so the mix ducks it. */
export function withNarration(edl: Edl, narration: NarrationClip[]): Edl {
  const music = edl.audio.filter((track) => track.kind === "music");
  const existing = edl.audio.filter((track) => track.kind === "narration");
  return { ...edl, audio: [...existing, ...narrationTracks(edl.clips, narration), ...music] };
}

/** How long a chapter's surviving footage runs on the finished timeline. */
export function segmentOutputSeconds(edl: Edl, segmentId: string): number {
  return edl.clips
    .filter((clip) => clip.label === segmentId)
    .reduce((total, clip) => total + (clip.sourceEnd - clip.sourceStart), 0);
}

/**
 * Checks an EDL before a worker spends GPU minutes on it.
 *
 * Every one of these has a matching way to waste an hour: overlapping clips
 * double-count billed duration, a zoom past the end never appears, a mask
 * outside the frame silently hides nothing.
 */
export function validateEdl(edl: Edl): string[] {
  const problems: string[] = [];

  if (edl.version !== EDL_VERSION) {
    problems.push(`Unsupported EDL version ${edl.version}.`);
  }
  if (edl.clips.length === 0) {
    problems.push("The edit removes everything; there is no video to render.");
  }

  let previousEnd = -Infinity;
  let expectedOutputStart = 0;
  edl.clips.forEach((clip, i) => {
    if (clip.sourceEnd <= clip.sourceStart) {
      problems.push(`Clip ${i} has no duration.`);
    }
    if (clip.sourceStart < previousEnd) {
      problems.push(`Clip ${i} overlaps the previous clip.`);
    }
    if (Math.abs(clip.outputStart - expectedOutputStart) > 1e-6) {
      problems.push(
        `Clip ${i} starts at ${clip.outputStart}s on the output timeline but the ` +
          `clips before it end at ${expectedOutputStart}s — the timeline has a hole.`,
      );
    }
    previousEnd = clip.sourceEnd;
    expectedOutputStart += clip.sourceEnd - clip.sourceStart;
  });

  if (Math.abs(edl.durationSec - edlDuration(edl.clips)) > 1e-6) {
    problems.push("Stated duration does not match the clips.");
  }

  for (const zoom of edl.zooms) {
    if (zoom.scale < 1) problems.push(`Zoom scale ${zoom.scale} would shrink the frame.`);
    if (zoom.at > edl.durationSec) problems.push(`Zoom at ${zoom.at}s is past the end.`);
    if (zoom.anchor.x < 0 || zoom.anchor.x > 1 || zoom.anchor.y < 0 || zoom.anchor.y > 1) {
      problems.push("Zoom anchor must be normalised to 0..1.");
    }
  }

  for (const track of edl.audio) {
    if (track.tempo !== undefined && (track.tempo < 0.5 || track.tempo > 2)) {
      problems.push(`An audio track's tempo of ${track.tempo} is outside what the mix can apply.`);
    }
  }

  for (const mask of edl.masks) {
    const [x, y, w, h] = mask.rect;
    if (w <= 0 || h <= 0) problems.push("A mask has no area and would hide nothing.");
    if (x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) {
      problems.push("A mask falls outside the frame.");
    }
  }

  return problems;
}
