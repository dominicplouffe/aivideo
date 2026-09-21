import type { TranscriptionResult } from "@/lib/providers/types";
import { silentSpanSec } from "@/lib/segment-span";

/**
 * Turns a word-level transcript into the chapters the Studio edits.
 *
 * The editor's premise is that cutting text cuts video, so every word has to
 * survive this step carrying its own start and duration. Nothing here
 * *removes* a word — fillers are marked, not dropped — because the person
 * editing has to be able to put "basically" back, and a word deleted at
 * import is a word they can never see again.
 */

export interface SegmentDraft {
  ordinal: number;
  title: string;
  startSec: number;
  endSec: number;
  action?: string | null;
  words: { w: string; t: number; d: number; cut?: boolean; em?: boolean }[];
}

/**
 * Words a viewer does not need and a speaker did not mean.
 *
 * Kept deliberately short. "Like" and "right" are on it because they are the
 * two most common verbal tics in a product walkthrough, but both are also
 * ordinary words — "click the button that looks like this" — so the check
 * below only marks them when they stand alone between two pauses, and the
 * editor can always untick one.
 */
const FILLERS = new Set(["um", "uh", "erm", "er", "ah", "hmm", "mm", "uhh", "umm"]);
const SOFT_FILLERS = new Set(["like", "right", "basically", "actually", "literally", "honestly"]);

/** Stripped for comparison only; the stored word keeps its punctuation. */
function bare(word: string): string {
  return word.toLowerCase().replace(/[^a-z']/g, "");
}

function endsSentence(word: string): boolean {
  return /[.!?]["')\]]?$/.test(word.trim());
}

/**
 * A title for a chapter, taken from what was said in it.
 *
 * Generated titles are a place where it is tempting to be clever and call a
 * model. This stays mechanical on purpose: it runs on every import, it costs
 * nothing, and a person renaming a chapter is one click — whereas waiting
 * four seconds for a title nobody asked for is four seconds every time.
 */
function titleFor(words: SegmentDraft["words"], ordinal: number): string {
  const spoken = words
    .filter((word) => !word.cut)
    .map((word) => word.w)
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

  if (!spoken) return `Chapter ${ordinal + 1}`;

  // Six words is about what fits in the timeline's chapter strip before it
  // truncates, and a title that truncates tells you less than a shorter one.
  const head = spoken.split(/\s+/).slice(0, 6).join(" ").replace(/[,.;:]+$/, "");
  const cased = head.charAt(0).toUpperCase() + head.slice(1);
  return cased.length > 60 ? `${cased.slice(0, 57)}…` : cased;
}

export interface SegmentOptions {
  /** A gap this long ends a chapter when a sentence has just closed. */
  pauseSec?: number;
  /** No chapter runs longer than this, sentence or not. */
  maxSec?: number;
  /** Below this, a trailing chapter is folded into the one before it. */
  minSec?: number;
}

export function segmentTranscript(
  transcript: TranscriptionResult,
  options: SegmentOptions = {},
): SegmentDraft[] {
  const pauseSec = options.pauseSec ?? 0.55;
  const maxSec = options.maxSec ?? 24;
  const minSec = options.minSec ?? 2.5;

  const words = transcript.words;

  // Silent footage is a legitimate recording — a screen capture with no
  // narration still gets chapters, zooms and captions. One chapter spanning
  // the whole take is the honest representation of it.
  if (words.length === 0) {
    return [
      {
        ordinal: 0,
        title: "Untitled chapter",
        startSec: 0,
        endSec: Math.max(transcript.durationSec, 0),
        words: [],
      },
    ];
  }

  const marked = words.map((word, i) => {
    const text = bare(word.word);
    const gapBefore = i === 0 ? Infinity : word.start - words[i - 1].end;
    const gapAfter = i === words.length - 1 ? Infinity : words[i + 1].start - word.end;
    // A soft filler is only a filler when it is stranded — surrounded by
    // hesitation on both sides. Inside a sentence it is doing a job.
    const stranded = gapBefore > 0.18 && gapAfter > 0.18;
    return {
      w: word.word,
      t: word.start,
      d: Math.max(word.end - word.start, 0),
      cut: FILLERS.has(text) || (SOFT_FILLERS.has(text) && stranded) ? true : undefined,
    };
  });

  const drafts: SegmentDraft[] = [];
  let current: SegmentDraft["words"] = [];
  let startedAt = marked[0].t;

  const flush = (endSec: number) => {
    if (current.length === 0) return;
    drafts.push({
      ordinal: drafts.length,
      title: "",
      startSec: startedAt,
      endSec,
      words: current,
    });
    current = [];
  };

  for (let i = 0; i < marked.length; i++) {
    const word = marked[i];
    if (current.length === 0) startedAt = word.t;
    current.push(word);

    const end = word.t + word.d;
    const next = marked[i + 1];
    if (!next) break;

    const gap = next.t - end;
    const longEnough = end - startedAt >= minSec;
    const tooLong = next.t - startedAt >= maxSec;

    if ((longEnough && gap >= pauseSec && endsSentence(word.w)) || tooLong) {
      flush(end);
    }
  }
  flush(marked[marked.length - 1].t + marked[marked.length - 1].d);

  // A two-word tail reading "Thanks." is not a chapter; it is the end of the
  // previous one. Fold it back rather than leaving a stub in the timeline.
  if (drafts.length > 1) {
    const last = drafts[drafts.length - 1];
    if (last.endSec - last.startSec < minSec) {
      const previous = drafts[drafts.length - 2];
      previous.words = [...previous.words, ...last.words];
      previous.endSec = last.endSec;
      drafts.pop();
    }
  }

  return drafts.map((draft, ordinal) => ({
    ...draft,
    ordinal,
    title: titleFor(draft.words, ordinal),
  }));
}

/** Runtime left after the fillers are cut — what the finished video will run. */
export function editedDuration(drafts: SegmentDraft[]): number {
  return drafts.reduce((total, draft) => {
    if (draft.words.length === 0) {
      // Silent footage plays as recorded; see `silentSpanSec`.
      const span = silentSpanSec({ start: draft.startSec, end: draft.endSec });
      return span > 0 ? total + span + 0.35 : total;
    }
    const spoken = draft.words.filter((w) => !w.cut).reduce((n, w) => n + w.d, 0);
    return total + spoken + 0.35;
  }, 0);
}
