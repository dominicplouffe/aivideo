import type { StillSpan } from "@/lib/pipeline/stillness";

/**
 * Fits a chapter's footage to its narration, anchor by anchor.
 *
 * Both the recording and the narration have a clock with the same words on
 * it: the transcriber timed the words as spoken, the synthesizer times them
 * as read. Where a word sits on both is an anchor, and between two anchors
 * the footage has to occupy exactly the narration's time. Three moves do
 * it, the ones an editor makes by hand: hold a frame, change speed, trim.
 *
 * Which move depends on what the footage is doing. A still stretch — a UI
 * waiting for the next click — can be held or hurried without anything
 * looking wrong, so it is used first and used hard. A stretch with motion
 * stays near the speed it was recorded at. Trimming footage is the last
 * resort, and it trims still footage before moving footage.
 *
 * The result is a list of clips with a speed and a hold each, which the EDL
 * carries and ffmpeg applies, and a summary of what was done so the person
 * can see where the picture was bent to fit.
 */

export interface Anchor {
  /** A moment in the source recording, absolute seconds. */
  source: number;
  /** The same moment in the narration, seconds from the chapter's narration start. */
  output: number;
}

export interface RetimeInput {
  sourceStart: number;
  sourceEnd: number;
  /** How long the narration for this chapter runs. */
  narrationSec: number;
  /** Interior anchors, in source order. The chapter's ends are implicit. */
  anchors?: Anchor[];
  /** Where the picture stands still, absolute source seconds. */
  still?: StillSpan[];
}

export interface RetimedClip {
  sourceStart: number;
  sourceEnd: number;
  speed?: number;
  holdSec?: number;
}

export interface RetimeSummary {
  /** Seconds of held frames added. */
  heldSec: number;
  /** Source seconds that play faster than recorded. */
  hurriedSec: number;
  /** Source seconds that play slower than recorded. */
  slowedSec: number;
  /** Source seconds removed because nothing else could absorb them. */
  trimmedSec: number;
}

/** Still footage may run this much faster and still read as the same screen. */
const STILL_MAX_SPEED = 4;
/** Moving footage keeps within this of its recorded speed. */
const MOTION_MAX_SPEED = 1.5;
const MOTION_MIN_SPEED = 0.75;
/** Within this fraction, the difference is taken up by an imperceptible speed change. */
const TOLERANCE = 0.03;
/** Anchors closer than this, on either clock, are merged: too many tiny intervals make the picture stutter. */
export const MIN_ANCHOR_GAP_SEC = 1.5;

interface Piece {
  start: number;
  end: number;
  still: boolean;
  speed: number;
  holdSec: number;
  /** Seconds of source removed from the end of this piece. */
  trimmed: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
/** Speeds keep more digits: a rounded speed over a long clip drifts the anchor. */
const roundSpeed = (value: number) => Math.round(value * 1e6) / 1e6;

/** Splits [start, end] into still and moving pieces. */
function pieces(start: number, end: number, still: StillSpan[]): Piece[] {
  const out: Piece[] = [];
  let cursor = start;
  const spans = still
    .map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as StillSpan)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  for (const [a, b] of spans) {
    if (a > cursor) out.push({ start: cursor, end: a, still: false, speed: 1, holdSec: 0, trimmed: 0 });
    out.push({ start: Math.max(a, cursor), end: b, still: true, speed: 1, holdSec: 0, trimmed: 0 });
    cursor = Math.max(cursor, b);
  }
  if (end > cursor) out.push({ start: cursor, end, still: false, speed: 1, holdSec: 0, trimmed: 0 });
  return out;
}

const length = (p: Piece) => p.end - p.start - p.trimmed;
const plays = (p: Piece) => length(p) / p.speed + p.holdSec;

/**
 * Fits one anchor interval: `need` seconds of narration over `have` seconds
 * of footage. Mutates the pieces' speed, hold and trim in place.
 */
function fitInterval(ps: Piece[], need: number): void {
  const have = ps.reduce((n, p) => n + length(p), 0);
  if (have <= 0 || need <= 0) return;

  if (Math.abs(need - have) <= TOLERANCE * Math.max(have, 0.5)) {
    // Close enough that one speed across the interval takes up the slack
    // and nobody sees it.
    for (const p of ps) p.speed = have / need;
    return;
  }

  if (need > have) {
    // Extend. Hold on still footage, spread by length; without any, slow the
    // motion a little and hold the last frame for the rest.
    let extra = need - have;
    const stills = ps.filter((p) => p.still);
    if (stills.length > 0) {
      const total = stills.reduce((n, p) => n + length(p), 0);
      for (const p of stills) p.holdSec = (extra * length(p)) / total;
      return;
    }
    const slowest = have / MOTION_MIN_SPEED; // how long the motion can be made to last
    const slowedTo = Math.min(need, slowest);
    for (const p of ps) p.speed = have / slowedTo;
    extra = need - slowedTo;
    if (extra > 0) ps[ps.length - 1].holdSec = extra;
    return;
  }

  // Compress. Still footage first, up to its ceiling; then motion, gently;
  // then drop still footage outright; then trim moving footage from the end.
  let deficit = have - need;
  const take = (group: Piece[], maxSpeed: number) => {
    const capacity = group.reduce((n, p) => n + (length(p) - length(p) / maxSpeed), 0);
    if (capacity <= 0 || deficit <= 0) return;
    const share = Math.min(1, deficit / capacity);
    for (const p of group) {
      const reduction = (length(p) - length(p) / maxSpeed) * share;
      p.speed = length(p) / (length(p) - reduction);
    }
    deficit -= Math.min(deficit, capacity);
  };
  take(ps.filter((p) => p.still), STILL_MAX_SPEED);
  take(ps.filter((p) => !p.still), MOTION_MAX_SPEED);
  if (deficit > 0) {
    // Remove still footage, latest first: what remains of it after the
    // speed-up is what its removal recovers.
    for (const p of [...ps].reverse()) {
      if (deficit <= 0) break;
      if (!p.still) continue;
      const remaining = plays(p);
      const cut = Math.min(remaining, deficit);
      // Trim the source so the piece plays `remaining - cut` at its speed.
      p.trimmed += cut * p.speed;
      deficit -= cut;
    }
  }
  if (deficit > 0) {
    for (const p of [...ps].reverse()) {
      if (deficit <= 0) break;
      const remaining = plays(p);
      const cut = Math.min(remaining, deficit);
      p.trimmed += cut * p.speed;
      deficit -= cut;
    }
  }
}

export function retimeChapter(input: RetimeInput): { clips: RetimedClip[]; summary: RetimeSummary } {
  const still = input.still ?? [];
  const anchors: Anchor[] = [
    { source: input.sourceStart, output: 0 },
    ...(input.anchors ?? []).filter(
      (a) => a.source > input.sourceStart && a.source < input.sourceEnd && a.output > 0 && a.output < input.narrationSec,
    ),
    { source: input.sourceEnd, output: input.narrationSec },
  ];

  const all: Piece[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const ps = pieces(a.source, b.source, still);
    fitInterval(ps, b.output - a.output);
    all.push(...ps);
  }

  const summary: RetimeSummary = { heldSec: 0, hurriedSec: 0, slowedSec: 0, trimmedSec: 0 };
  const clips: RetimedClip[] = [];
  for (const p of all) {
    const len = length(p);
    summary.heldSec += p.holdSec;
    summary.trimmedSec += p.trimmed;
    if (len <= 1e-6) continue;
    if (p.speed > 1 + TOLERANCE) summary.hurriedSec += len;
    if (p.speed < 1 - TOLERANCE) summary.slowedSec += len;
    const clip: RetimedClip = { sourceStart: p.start, sourceEnd: p.start + len };
    if (Math.abs(p.speed - 1) > 1e-6) clip.speed = roundSpeed(p.speed);
    if (p.holdSec > 1e-6) clip.holdSec = roundSpeed(p.holdSec);
    const last = clips[clips.length - 1];
    // Merge with the previous clip when nothing distinguishes them.
    if (last && !last.holdSec && (last.speed ?? 1) === (clip.speed ?? 1) && Math.abs(last.sourceEnd - clip.sourceStart) < 1e-6) {
      last.sourceEnd = clip.sourceEnd;
      if (clip.holdSec) last.holdSec = clip.holdSec;
    } else {
      clips.push(clip);
    }
  }
  for (const key of ["heldSec", "hurriedSec", "slowedSec", "trimmedSec"] as const) summary[key] = round(summary[key]);
  return { clips, summary };
}

/**
 * Anchors from words timed on both clocks, thinned so no two are closer
 * than `MIN_ANCHOR_GAP_SEC` on either clock. Sentence ends are preferred as
 * anchors: a cut of pace between sentences is where a viewer expects one.
 */
export function anchorsFromWords(
  words: { source: number; output: number; sentenceEnd: boolean }[],
  bounds: { sourceStart: number; sourceEnd: number; narrationSec: number },
): Anchor[] {
  const out: Anchor[] = [];
  let lastSource = bounds.sourceStart;
  let lastOutput = 0;
  words.forEach((w, i) => {
    // An anchor sits at the start of the word after a sentence end.
    const previous = words[i - 1];
    if (!previous?.sentenceEnd) return;
    if (w.source - lastSource < MIN_ANCHOR_GAP_SEC || w.output - lastOutput < MIN_ANCHOR_GAP_SEC) return;
    if (bounds.sourceEnd - w.source < MIN_ANCHOR_GAP_SEC || bounds.narrationSec - w.output < MIN_ANCHOR_GAP_SEC) return;
    out.push({ source: w.source, output: w.output });
    lastSource = w.source;
    lastOutput = w.output;
  });
  return out;
}
