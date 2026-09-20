import type { CaptureEvent } from "@/lib/capture/types";
import type { Snapshot } from "@/lib/capture/snapshot";

/**
 * The interactive tour model.
 *
 * A tour is the recording read a second way. The same click that told the
 * renderer to zoom tells the tour where to put a hotspot, and the same
 * accessible name that titled a step in the guide titles it here. Nothing is
 * authored twice, which is the whole argument for capturing interactions
 * rather than just pixels.
 */

export interface TourHotspot {
  /** Normalised 0..1 against the snapshot's viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TourStepKind = "hotspot" | "type" | "key" | "navigate" | "result";

export interface TourStep {
  id: string;
  kind: TourStepKind;
  /** What the viewer is asked to do, in the words of the UI itself. */
  title: string;
  /** The screen for this step, ready to render. */
  snapshot: Snapshot;
  hotspot?: TourHotspot;
  /** Seconds into the recording, so the tour and the video stay in step. */
  at: number;
  /** Narration for this step, when the transcript covers it. */
  caption?: string;
}

/**
 * Where a tooltip sits horizontally relative to its hotspot.
 *
 * A tooltip centred on a control in the corner of the screen hangs off the
 * edge. Near an edge it aligns to that edge instead, which is what every
 * well-behaved popover does and what nobody notices until it is missing.
 */
export type TooltipAlign = "start" | "center" | "end";

export interface Tour {
  steps: TourStep[];
  /** Snapshots that produced no step, and why. Never silently discarded. */
  unused: { at: number; reason: "no-matching-event" | "duplicate-screen" }[];
}

/**
 * How a snapshot is rendered, and the one combination that must never appear.
 *
 * `allow-scripts` together with `allow-same-origin` is not a sandbox at all:
 * the framed document can reach out and remove its own sandbox attribute.
 * Snapshots contain no scripts by construction, so neither token is needed,
 * and the safest policy is also the correct one. `allow-popups` is absent for
 * the same reason a snapshot has no scripts — nothing in it should navigate.
 */
export const SNAPSHOT_SANDBOX = "allow-forms";

/** Tolerance when pairing a snapshot with the click that caused it. */
const PAIR_WINDOW_SEC = 1.2;

function label(event: CaptureEvent): string | undefined {
  const name = event.accessibleName?.trim();
  if (!name) return undefined;
  // A whole paragraph of body text is not a step title.
  return name.length > 60 ? `${name.slice(0, 59)}…` : name;
}

/**
 * Turns an event into an instruction a viewer can follow.
 *
 * Phrased as the thing to do, not as a description of what someone else did:
 * a tour is a thing the prospect is clicking through, and "Click Save
 * changes" reads as an invitation where "The user clicked Save" reads as a
 * transcript.
 */
export function stepTitle(event: CaptureEvent): string {
  const name = label(event);

  switch (event.kind) {
    case "click":
      return name ? `Click ${name}` : "Click here";
    case "input":
      return name ? `Type in ${name}` : "Type here";
    case "key":
      return event.value ? `Press ${event.value}` : "Press a key";
    case "route": {
      try {
        return `Go to ${new URL(event.value ?? "").pathname}`;
      } catch {
        return "Go to the next screen";
      }
    }
    default:
      return name ?? "Next";
  }
}

function kindOf(event: CaptureEvent): TourStepKind {
  if (event.kind === "input") return "type";
  if (event.kind === "key") return "key";
  if (event.kind === "route") return "navigate";
  return "hotspot";
}

/**
 * Finds the interaction a snapshot was taken for.
 *
 * Snapshots carry the selector of the element that triggered them, so the
 * match is usually exact. Time is the tiebreaker rather than the primary
 * key, because the same button clicked twice in a demo is the common case
 * and its selector is identical both times.
 */
function pair(snapshot: Snapshot, at: number, events: CaptureEvent[], used: Set<number>): number {
  let best = -1;
  let bestDistance = Infinity;

  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const event = events[i];
    if (snapshot.targetSelector && event.selector !== snapshot.targetSelector) continue;

    const distance = Math.abs(event.at - at);
    if (distance < bestDistance && distance <= PAIR_WINDOW_SEC) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

export interface BuildTourInput {
  /** Snapshots in capture order, each with the time it was taken. */
  snapshots: { snapshot: Snapshot; at: number }[];
  events: CaptureEvent[];
  /** Narration, to caption each step. Optional: a tour reads without it. */
  captions?: { from: number; until: number; text: string }[];
}

export function buildTour(input: BuildTourInput): Tour {
  const actionable = input.events.filter(
    (event) => event.kind === "click" || event.kind === "input" || event.kind === "key" || event.kind === "route",
  );

  const steps: TourStep[] = [];
  const unused: Tour["unused"] = [];
  const used = new Set<number>();
  let previousHtml: string | null = null;
  let previousSelector: string | undefined;

  for (const entry of input.snapshots) {
    const index = pair(entry.snapshot, entry.at, actionable, used);
    const isLast = entry === input.snapshots[input.snapshots.length - 1];

    if (index === -1) {
      // The last screen is the one thing a tour cannot do without. The
      // viewer clicks the final hotspot and then sees the outcome — the
      // created project, the sent invoice, the point of the whole demo. Any
      // *other* unmatched snapshot is a screenshot, not a step.
      // ...but only once there is something to be the outcome *of*. A
      // single screen with nothing to click is a screenshot, and a tour of
      // one screenshot is not a tour.
      if (isLast && steps.length > 0 && entry.snapshot.html !== previousHtml) {
        steps.push({
          id: `step_${steps.length + 1}`,
          kind: "result",
          title: "And that is the result",
          snapshot: entry.snapshot,
          at: entry.at,
          caption: input.captions?.find((cue) => cue.from <= entry.at && cue.until >= entry.at)?.text,
        });
      } else {
        unused.push({ at: entry.at, reason: "no-matching-event" });
      }
      continue;
    }

    const event = actionable[index];

    // The same screen *and* the same target twice running is a double-click
    // that survived deduplication, or a click that did nothing: the viewer
    // would press "next" and see no change, which reads as broken.
    //
    // The same screen with a *different* target is not that at all — "fill
    // in the name, now press Create" is two steps on one page, and it is
    // how most forms are demonstrated.
    if (entry.snapshot.html === previousHtml && event.selector === previousSelector) {
      unused.push({ at: entry.at, reason: "duplicate-screen" });
      used.add(index);
      continue;
    }
    previousHtml = entry.snapshot.html;
    previousSelector = event.selector;
    used.add(index);
    steps.push({
      id: `step_${steps.length + 1}`,
      kind: kindOf(event),
      title: stepTitle(event),
      snapshot: entry.snapshot,
      hotspot: event.bounds ? { ...event.bounds } : undefined,
      at: entry.at,
      caption: input.captions?.find((cue) => cue.from <= entry.at && cue.until >= entry.at)?.text,
    });
  }

  return { steps, unused };
}

/**
 * Where a tooltip should sit so it does not cover what it points at.
 *
 * Returns the side of the hotspot with the most room. A tooltip centred over
 * the button the viewer is being asked to click is the single most common
 * way a product tour becomes annoying.
 */
export function tooltipSide(hotspot: TourHotspot): "top" | "bottom" | "left" | "right" {
  const room = {
    top: hotspot.y,
    bottom: 1 - (hotspot.y + hotspot.h),
    left: hotspot.x,
    right: 1 - (hotspot.x + hotspot.w),
  };
  // Below and above first: a tooltip beside a control competes with the rest
  // of the row, while one above or below it usually has a whole line free.
  const order: (keyof typeof room)[] = ["bottom", "top", "right", "left"];
  return order.reduce((best, side) => (room[side] > room[best] + 0.02 ? side : best), order[0]);
}

/**
 * Horizontal alignment for a tooltip that sits above or below its hotspot.
 *
 * Centring is right until the hotspot is near an edge, at which point half
 * the tooltip hangs off the screen — and the controls a demo points at are
 * very often in a corner, because that is where products put their primary
 * action.
 */
export function tooltipAlign(hotspot: TourHotspot): TooltipAlign {
  const centre = hotspot.x + hotspot.w / 2;
  if (centre < 0.25) return "start";
  if (centre > 0.75) return "end";
  return "center";
}
