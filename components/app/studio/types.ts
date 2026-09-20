import type { Project, Segment } from "@/lib/app-data";

export interface EditedWord {
  segIndex: number;
  wordIndex: number;
  text: string;
  start: number;
  end: number;
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
