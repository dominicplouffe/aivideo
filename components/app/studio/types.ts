import type { Project, Segment } from "@/lib/app-data";
import { silentSpanSec } from "@/lib/segments";
import { isWordRemoved, resolveWords, type EditState } from "@/lib/edit-state";

// The edit model lives in lib so the server can share it; the editor
// re-exports it so its components keep one import path.
export {
  DEFAULT_EDIT_STATE,
  hydrateEditState,
  isWordRemoved,
  normalizeToken,
  occurrencesOf,
  resolveWords,
  serializeEditState,
  withTrailingPunctuation,
} from "@/lib/edit-state";
export type { EditState, ResolvedWord, StoredEditState, WordEdit } from "@/lib/edit-state";

export interface EditedWord {
  segIndex: number;
  wordIndex: number;
  text: string;
  start: number;
  end: number;
  /**
   * Where this word sits in the *source* recording.
   *
   * `start` is the edited timeline, which is shorter — that is the point of
   * the editor. The canvas has to play the original file, so it needs both:
   * one to know where the playhead is, one to know which frame to show.
   */
  srcStart: number;
  cut: boolean;
  em: boolean;
  /**
   * A span standing in for a chapter that has no words, so the playhead
   * crosses it and the canvas shows its frames. Not a word: it carries no
   * text, is never counted as one, and cannot be cut as a filler.
   */
  silent: boolean;
}

/**
 * Flattens the project into a single edited timeline. Words the current edit
 * removes are excluded, so `end` of the last entry is the finished duration —
 * exactly the number the customer is billed on.
 */
export function buildTimeline(project: Project, state: EditState): EditedWord[] {
  const out: EditedWord[] = [];
  let t = 0;
  project.segments.forEach((seg: Segment, segIndex) => {
    if (state.deletedSegments.has(segIndex)) return;
    if (seg.words.length === 0) {
      // Silent footage plays as recorded; see `silentSpanSec`.
      const span = silentSpanSec(seg);
      if (span > 0) {
        out.push({
          segIndex,
          wordIndex: 0,
          text: "",
          start: t,
          end: t + span,
          srcStart: seg.start,
          cut: false,
          em: false,
          silent: true,
        });
        t += span + 0.35;
      }
      return;
    }
    for (const w of resolveWords(seg, segIndex, state)) {
      if (isWordRemoved(state, segIndex, w.wordIndex, w)) continue;
      out.push({
        segIndex,
        wordIndex: w.wordIndex,
        text: w.text,
        start: t,
        end: t + w.d,
        srcStart: w.t,
        cut: w.cut,
        em: w.em,
        silent: false,
      });
      t += w.d;
    }
    t += 0.35; // breath between segments
  });
  return out;
}

export function timelineDuration(tl: EditedWord[]): number {
  return tl.length ? tl[tl.length - 1].end : 0;
}

/** Where in the source file the edited playhead is currently pointing. */
export function sourceTimeAt(tl: EditedWord[], time: number): number | null {
  const word = wordAt(tl, time);
  if (!word) return null;
  // Offset within the word, so scrubbing inside a long word still moves.
  return word.srcStart + Math.max(0, Math.min(time - word.start, word.end - word.start));
}

export function wordAt(tl: EditedWord[], time: number): EditedWord | null {
  if (!tl.length) return null;
  let lo = 0;
  let hi = tl.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = tl[mid];
    if (time < w.start) hi = mid - 1;
    else if (time >= w.end) lo = mid + 1;
    else return w;
  }
  return tl[Math.min(lo, tl.length - 1)] ?? null;
}
