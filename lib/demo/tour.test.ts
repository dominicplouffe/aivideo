import assert from "node:assert/strict";
import test from "node:test";
import type { CaptureEvent } from "@/lib/capture/types";
import type { Snapshot } from "@/lib/capture/snapshot";
import { SNAPSHOT_SANDBOX, buildTour, stepTitle, tooltipAlign, tooltipSide } from "./tour";

/**
 * The tour is the recording read a second way, so these tests are mostly
 * about pairing: which click produced which screen, and what to do when the
 * answer is "none of them".
 */

function snapshot(html: string, targetSelector?: string): Snapshot {
  return {
    html,
    url: "https://app.test/projects",
    title: "Projects",
    viewport: { width: 1000, height: 700, scrollX: 0, scrollY: 0 },
    targetSelector,
    bytes: html.length,
    skipped: [],
  };
}

const CLICK: CaptureEvent = {
  at: 2,
  kind: "click",
  selector: "#save",
  role: "button",
  accessibleName: "Save changes",
  bounds: { x: 0.4, y: 0.6, w: 0.1, h: 0.05 },
};

test("a step is phrased as an invitation, not a transcript", () => {
  assert.equal(stepTitle(CLICK), "Click Save changes");
  assert.equal(stepTitle({ at: 1, kind: "click", selector: "#x" }), "Click here");
  assert.equal(
    stepTitle({ at: 1, kind: "input", accessibleName: "Work email", redacted: true }),
    "Type in Work email",
  );
  assert.equal(stepTitle({ at: 1, kind: "key", value: "Ctrl+s" }), "Press Ctrl+s");
  assert.equal(
    stepTitle({ at: 1, kind: "route", value: "https://app.test/projects/onboarding" }),
    "Go to /projects/onboarding",
  );
});

test("a paragraph of body text is truncated rather than used as a title", () => {
  const long = "a".repeat(200);
  const title = stepTitle({ at: 1, kind: "click", accessibleName: long });
  assert.equal(title.length <= 66, true, title.length.toString());
  assert.equal(title.endsWith("…"), true);
});

test("a snapshot is paired with the click that produced it", () => {
  const tour = buildTour({
    snapshots: [{ snapshot: snapshot("<html>a</html>", "#save"), at: 2.1 }],
    events: [CLICK],
  });

  assert.equal(tour.steps.length, 1);
  assert.equal(tour.steps[0].title, "Click Save changes");
  assert.deepEqual(tour.steps[0].hotspot, CLICK.bounds);
  assert.equal(tour.steps[0].kind, "hotspot");
});

test("the same button clicked twice produces two distinct steps", () => {
  const events: CaptureEvent[] = [
    { ...CLICK, at: 2 },
    { ...CLICK, at: 9 },
  ];
  const tour = buildTour({
    snapshots: [
      { snapshot: snapshot("<html>first</html>", "#save"), at: 2.1 },
      { snapshot: snapshot("<html>second</html>", "#save"), at: 9.1 },
    ],
    events,
  });

  // Selectors are identical, so time has to be the tiebreaker — and each
  // event may only be consumed once.
  assert.equal(tour.steps.length, 2);
  assert.deepEqual(tour.steps.map((s) => s.at), [2.1, 9.1]);
});

test("a mid-tour snapshot with nothing to click is reported, not turned into a step", () => {
  const tour = buildTour({
    snapshots: [
      { snapshot: snapshot("<html>orphan</html>", "#nothing"), at: 40 },
      { snapshot: snapshot("<html>real</html>", "#save"), at: 2.1 },
    ],
    events: [CLICK],
  });

  // Only the *last* unmatched snapshot is the closing screen. Silently
  // dropping the others would leave a gap nobody can account for later.
  assert.equal(tour.steps.length, 1);
  assert.deepEqual(tour.unused, [{ at: 40, reason: "no-matching-event" }]);
});

test("a click far from any snapshot does not get paired to it", () => {
  const tour = buildTour({
    snapshots: [{ snapshot: snapshot("<html>a</html>", "#save"), at: 30 }],
    events: [CLICK],
  });
  assert.equal(tour.steps.length, 0);
});

test("the same screen with a different target is two steps, not a duplicate", () => {
  const typed: CaptureEvent = {
    at: 3.2,
    kind: "input",
    selector: "#name",
    accessibleName: "Project name",
    redacted: true,
  };
  const tour = buildTour({
    snapshots: [
      { snapshot: snapshot("<html>form</html>", "#name"), at: 3.3 },
      { snapshot: snapshot("<html>form</html>", "#save"), at: 4.1 },
    ],
    events: [typed, { ...CLICK, at: 4.0 }],
  });

  // "Fill in the name, now press Create" is how most forms are shown.
  assert.deepEqual(tour.steps.map((s) => s.title), ["Type in Project name", "Click Save changes"]);
  assert.deepEqual(tour.unused, []);
});

test("a trailing screen with nothing to click becomes the closing step", () => {
  const tour = buildTour({
    snapshots: [
      { snapshot: snapshot("<html>before</html>", "#save"), at: 2.1 },
      { snapshot: snapshot("<html>after</html>"), at: 3.5 },
    ],
    events: [CLICK],
  });

  // Without this the viewer clicks the last hotspot and the demo ends
  // before showing the outcome — the point of the whole thing.
  assert.equal(tour.steps.length, 2);
  assert.equal(tour.steps[1].kind, "result");
  assert.equal(tour.steps[1].hotspot, undefined);
  assert.deepEqual(tour.unused, []);
});

test("an identical screen and target twice running is dropped as a dead step", () => {
  const tour = buildTour({
    snapshots: [
      { snapshot: snapshot("<html>same</html>", "#save"), at: 2.1 },
      { snapshot: snapshot("<html>same</html>", "#save"), at: 3.4 },
    ],
    events: [CLICK, { ...CLICK, at: 3.3 }],
  });

  // The viewer would press "next" and see no change, which reads as broken.
  assert.equal(tour.steps.length, 1);
  assert.deepEqual(tour.unused, [{ at: 3.4, reason: "duplicate-screen" }]);
});

test("narration is attached to the step it covers", () => {
  const tour = buildTour({
    snapshots: [{ snapshot: snapshot("<html>a</html>", "#save"), at: 2.1 }],
    events: [CLICK],
    captions: [
      { from: 0, until: 1, text: "First we open the project." },
      { from: 1.5, until: 3, text: "Then we save the changes." },
    ],
  });
  assert.equal(tour.steps[0].caption, "Then we save the changes.");
});

test("a lone screenshot with nothing to click is not a tour", () => {
  const tour = buildTour({
    snapshots: [{ snapshot: snapshot("<html>a</html>"), at: 1 }],
    events: [],
  });
  assert.equal(tour.steps.length, 0);
});

test("scroll and mutation noise never becomes a step", () => {
  const tour = buildTour({
    snapshots: [{ snapshot: snapshot("<html>a</html>"), at: 2 }],
    events: [
      { at: 1.9, kind: "scroll", value: "0,400" },
      { at: 2.0, kind: "mutation", value: "17" },
    ],
  });
  assert.equal(tour.steps.length, 0);
});

// --- presentation ----------------------------------------------------------

test("a tooltip goes where there is room, never over the target", () => {
  // A control near the top has room below it.
  assert.equal(tooltipSide({ x: 0.4, y: 0.05, w: 0.1, h: 0.05 }), "bottom");
  // One near the bottom does not.
  assert.equal(tooltipSide({ x: 0.4, y: 0.9, w: 0.1, h: 0.05 }), "top");
  // A full-width banner still has a whole line free below it.
  assert.equal(tooltipSide({ x: 0.02, y: 0.45, w: 0.9, h: 0.1 }), "bottom");
  // A sidebar spanning the viewport has room on one side and nowhere else.
  assert.equal(tooltipSide({ x: 0.05, y: 0.05, w: 0.2, h: 0.9 }), "right");
});

test("a tooltip near an edge aligns to it instead of hanging off the screen", () => {
  // A primary action in the top-right corner is the single most common
  // thing a demo points at.
  assert.equal(tooltipAlign({ x: 0.88, y: 0.03, w: 0.09, h: 0.04 }), "end");
  assert.equal(tooltipAlign({ x: 0.02, y: 0.4, w: 0.1, h: 0.04 }), "start");
  assert.equal(tooltipAlign({ x: 0.45, y: 0.4, w: 0.1, h: 0.04 }), "center");
});

test("the sandbox never allows scripts alongside same-origin", () => {
  const tokens = SNAPSHOT_SANDBOX.split(/\s+/);
  // Together these two are not a sandbox: the framed document can reach out
  // and remove its own sandbox attribute.
  assert.equal(tokens.includes("allow-scripts") && tokens.includes("allow-same-origin"), false);
  // Snapshots contain no scripts by construction, so neither is needed.
  assert.equal(tokens.includes("allow-scripts"), false);
  assert.equal(tokens.includes("allow-same-origin"), false);
  assert.equal(tokens.includes("allow-top-navigation"), false);
});
