import type { DetectedRegion, Rect } from "./types";

/**
 * Turning per-frame hits into regions on a timeline.
 *
 * This file is where frame-level masking is either safe or theatre, and the
 * reason is sampling. Text is located on frames taken a few times a second,
 * not on every frame, so a naive implementation produces a mask that exists
 * only at the sampled instants — and the frames in between show the data.
 *
 * Three rules follow, and each one exists because of a way this fails:
 *
 *  1. **A hit covers the whole sample interval**, half a period either side,
 *     because the text was on screen between the frame that saw it and the
 *     frames that were not inspected.
 *  2. **Short gaps are bridged.** OCR misses a frame when a cursor crosses
 *     the text or an animation blurs it. A mask that drops out for 400ms is
 *     a mask that can be paused on, and a viewer with a scrubber is not in a
 *     hurry.
 *  3. **Overlapping boxes merge.** A mosaic of adjacent blurs leaks at the
 *     seams, and it looks like a bug.
 */

export interface Hit {
  atSec: number;
  rect: Rect;
  style: DetectedRegion["style"];
  reason: string;
  category: string;
}

export interface MergeOptions {
  /** Seconds between sampled frames. */
  samplePeriodSec: number;
  /** Gaps up to this long are bridged rather than ending a region. */
  bridgeSec?: number;
  /** Fraction of the frame added to every side of a box. */
  padding?: number;
  /** Two boxes merge when they overlap by at least this much of the smaller. */
  mergeOverlap?: number;
  /** The clip's duration, so nothing extends past it. */
  durationSec: number;
}

function pad(rect: Rect, amount: number): Rect {
  const [x, y, w, h] = rect;
  return [
    Math.max(0, x - amount),
    Math.max(0, y - amount),
    Math.min(1 - Math.max(0, x - amount), w + amount * 2),
    Math.min(1 - Math.max(0, y - amount), h + amount * 2),
  ];
}

export function area(rect: Rect): number {
  return Math.max(0, rect[2]) * Math.max(0, rect[3]);
}

export function intersection(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return x * y;
}

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
}

/** Whether two boxes are the same thing seen twice. */
function sameBox(a: Rect, b: Rect, threshold: number): boolean {
  const overlap = intersection(a, b);
  if (overlap === 0) return false;
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 && overlap / smaller >= threshold;
}

/**
 * Merges hits into regions.
 *
 * Grouped by what they are (style and category) before geometry, so a
 * redaction never merges into a blur and quietly becomes the weaker of the
 * two.
 */
export function toRegions(hits: Hit[], options: MergeOptions): DetectedRegion[] {
  const half = options.samplePeriodSec / 2;
  const bridge = options.bridgeSec ?? options.samplePeriodSec * 2;
  const padding = options.padding ?? 0.006;
  const threshold = options.mergeOverlap ?? 0.35;

  const byKind = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = `${hit.style}\u0000${hit.category}`;
    const list = byKind.get(key);
    if (list) list.push(hit);
    else byKind.set(key, [hit]);
  }

  const regions: DetectedRegion[] = [];

  for (const [, group] of byKind) {
    const ordered = group.slice().sort((a, b) => a.atSec - b.atSec);
    // One open region per place on screen. A region stays open while the
    // same box keeps being seen, and closes when the gap exceeds `bridge`.
    const open: (DetectedRegion & { lastSeen: number })[] = [];

    for (const hit of ordered) {
      const rect = pad(hit.rect, padding);
      const existing = open.find(
        (region) => sameBox(region.rect, rect, threshold) && hit.atSec - region.lastSeen <= bridge,
      );

      if (existing) {
        // Grown rather than replaced: text that moves a little — a table
        // reflowing, a tooltip nudging a row — must stay covered across the
        // whole span, not only where it started.
        existing.rect = union(existing.rect, rect);
        existing.until = Math.min(options.durationSec, hit.atSec + half);
        existing.lastSeen = hit.atSec;
        continue;
      }

      open.push({
        at: Math.max(0, hit.atSec - half),
        until: Math.min(options.durationSec, hit.atSec + half),
        rect,
        style: hit.style,
        reason: hit.reason,
        category: hit.category,
        lastSeen: hit.atSec,
      });
    }

    for (const region of open) {
      const { lastSeen: _lastSeen, ...rest } = region;
      regions.push(rest);
    }
  }

  return regions.sort((a, b) => a.at - b.at || a.rect[0] - b.rect[0]);
}
