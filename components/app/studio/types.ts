import type { Project, Segment } from "@/lib/app-data";

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
}

export interface EditState {
  removeFillers: boolean;
  deletedSegments: Set<number>;
  studioSound: boolean;
  captions: boolean;
  music: boolean;
  presenter: boolean;
  zoomEnabled: boolean;
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
    seg.words.forEach((w, wordIndex) => {
      if (state.removeFillers && w.cut) return;
      out.push({
        segIndex,
        wordIndex,
        text: w.w,
        start: t,
        end: t + w.d,
        srcStart: w.t,
        cut: Boolean(w.cut),
        em: Boolean(w.em),
      });
      t += w.d;
    });
    t += 0.35; // breath between segments
  });
  return out;
}

export function timelineDuration(tl: EditedWord[]): number {
  return tl.length ? tl[tl.length - 1].end : 0;
}

/**
 * The saved shape of an `EditState`.
 *
 * `deletedSegments` is a `Set` in the component and an array on the wire,
 * because JSON has no sets and a `Set` serializes to `{}` without a word of
 * complaint — which is exactly how a "saved" edit turns out to have saved
 * nothing at all.
 */
export interface StoredEditState {
  removeFillers?: boolean;
  deletedSegments?: number[];
  studioSound?: boolean;
  captions?: boolean;
  music?: boolean;
  presenter?: boolean;
  zoomEnabled?: boolean;
}

export const DEFAULT_EDIT_STATE: EditState = {
  removeFillers: true,
  deletedSegments: new Set<number>(),
  studioSound: true,
  captions: true,
  music: true,
  presenter: false,
  zoomEnabled: true,
};

export function hydrateEditState(stored: unknown): EditState {
  if (!stored || typeof stored !== "object") return DEFAULT_EDIT_STATE;
  const raw = stored as StoredEditState;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

  return {
    removeFillers: flag(raw.removeFillers, DEFAULT_EDIT_STATE.removeFillers),
    deletedSegments: new Set(
      Array.isArray(raw.deletedSegments)
        ? raw.deletedSegments.filter((n): n is number => Number.isInteger(n) && n >= 0)
        : [],
    ),
    studioSound: flag(raw.studioSound, DEFAULT_EDIT_STATE.studioSound),
    captions: flag(raw.captions, DEFAULT_EDIT_STATE.captions),
    music: flag(raw.music, DEFAULT_EDIT_STATE.music),
    presenter: flag(raw.presenter, DEFAULT_EDIT_STATE.presenter),
    zoomEnabled: flag(raw.zoomEnabled, DEFAULT_EDIT_STATE.zoomEnabled),
  };
}

export function serializeEditState(state: EditState): StoredEditState {
  return {
    removeFillers: state.removeFillers,
    deletedSegments: [...state.deletedSegments].sort((a, b) => a - b),
    studioSound: state.studioSound,
    captions: state.captions,
    music: state.music,
    presenter: state.presenter,
    zoomEnabled: state.zoomEnabled,
  };
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
