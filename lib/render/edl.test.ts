import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEdl, edlDuration, mapOutputToSource, mapSourceToOutput, validateEdl, type Edl, type EdlClip,
} from "./edl";
import type { Project } from "@/lib/app-data";

/**
 * The EDL is where the editor's intent becomes arithmetic. Every test here
 * guards the same property from a different angle: after a cut, output time
 * and source time are different numbers, and confusing them is the bug that
 * makes every zoom in the second half of a video land in the wrong place.
 */

const CLIPS: EdlClip[] = [
  { sourceStart: 0, sourceEnd: 4, outputStart: 0 },
  { sourceStart: 6, sourceEnd: 9, outputStart: 4 },
  { sourceStart: 14, sourceEnd: 17, outputStart: 7 },
];

test("finished duration is the sum of what survived", () => {
  assert.equal(edlDuration(CLIPS), 10);
});

test("source time maps onto the cut timeline", () => {
  assert.equal(mapSourceToOutput(CLIPS, 0), 0);
  assert.equal(mapSourceToOutput(CLIPS, 3), 3);
  // 6s of source is the start of the second clip: 2 seconds were removed.
  assert.equal(mapSourceToOutput(CLIPS, 6), 4);
  assert.equal(mapSourceToOutput(CLIPS, 8), 6);
  assert.equal(mapSourceToOutput(CLIPS, 15), 8);
});

test("a moment inside a removed range collapses onto the join", () => {
  // 5s was cut. A marker there belongs where the cut happened, which is the
  // start of the next surviving clip — not 5s into a video that no longer
  // contains that second.
  assert.equal(mapSourceToOutput(CLIPS, 5), 4);
  assert.equal(mapSourceToOutput(CLIPS, 11), 7);
});

test("a moment after everything kept has no output time", () => {
  assert.equal(mapSourceToOutput(CLIPS, 18), null);
});

test("output time maps back to the source for scrubbing", () => {
  assert.equal(mapOutputToSource(CLIPS, 0), 0);
  // Output 4s is a join. It belongs to the clip about to play, so it reads
  // back as source 6s — not as source 4s, which the cut removed.
  assert.equal(mapOutputToSource(CLIPS, 4), 6);
  assert.equal(mapOutputToSource(CLIPS, 6), 8);
  assert.equal(mapOutputToSource(CLIPS, 8), 15);
  assert.equal(mapOutputToSource(CLIPS, 10), 17);
  assert.equal(mapOutputToSource(CLIPS, 99), null);
});

test("the round trip is stable for points that survived", () => {
  for (const source of [0, 1.5, 3.9, 6, 7.25, 14, 16.5]) {
    const output = mapSourceToOutput(CLIPS, source);
    assert.notEqual(output, null);
    assert.equal(mapOutputToSource(CLIPS, output!), source);
  }
});

// --- building from a project ----------------------------------------------

function project(): Project {
  return {
    id: "prj_1",
    slug: "onboarding",
    title: "Onboarding",
    description: "",
    status: "ready",
    durationSec: 0,
    sourceDurationSec: 12,
    updatedAt: "",
    createdAt: "",
    owner: "a",
    brandKit: "kit",
    voice: "v",
    locales: ["en-US"],
    outputs: ["video"],
    views: 0,
    completion: 0,
    ctaClicks: 0,
    collection: "c",
    segments: [
      {
        id: "seg_1",
        title: "Intro",
        start: 0,
        end: 3,
        words: [
          { w: "So", d: 0.5, cut: true },
          { w: "click", d: 0.5 },
          { w: "here.", d: 0.5 },
        ],
        zoom: { scale: 1.6, x: 0.6, y: 0.5 },
      },
      {
        id: "seg_2",
        title: "Save",
        start: 5,
        end: 7,
        words: [
          { w: "Then", d: 0.5 },
          { w: "um", d: 0.5, cut: true },
          { w: "save.", d: 0.5 },
        ],
      },
    ],
  } as Project;
}

test("removing a filler word genuinely shortens the video", () => {
  const withFillers = buildEdl({ project: project(), sourceUrl: "file://a.mp4", removeFillers: false });
  const without = buildEdl({ project: project(), sourceUrl: "file://a.mp4", removeFillers: true });

  assert.equal(withFillers.durationSec, 3);
  // Two fillers at 0.5s each. The video is a second shorter, not merely
  // marked as having them hidden.
  assert.equal(without.durationSec, 2);
});

test("a chapter with no speech renders as recorded rather than vanishing", () => {
  const silent = project();
  silent.segments = [{ id: "seg_silent", title: "Untitled chapter", start: 0, end: 12, words: [] }];
  const edl = buildEdl({ project: silent, sourceUrl: "file://a.mp4" });

  assert.deepEqual(
    edl.clips.map((c) => [c.sourceStart, c.sourceEnd, c.outputStart]),
    [[0, 12, 0]],
  );
  assert.equal(edl.durationSec, 12);
  // Nothing was said, so there is nothing to caption.
  assert.equal(edl.captions.length, 0);
  assert.deepEqual(validateEdl(edl), []);
});

test("adjacent survivors merge into one clip rather than one clip per word", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4", removeFillers: true });
  // seg_1 loses its leading "So", leaving one run; seg_2 loses a middle word,
  // which splits it in two. Three clips, not four words.
  assert.equal(edl.clips.length, 3);
  assert.deepEqual(
    edl.clips.map((c) => [c.sourceStart, c.sourceEnd]),
    [[0.5, 1.5], [5, 5.5], [6, 6.5]],
  );
});

test("output starts are contiguous — the timeline has no holes", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4" });
  let expected = 0;
  for (const clip of edl.clips) {
    assert.equal(clip.outputStart, expected);
    expected += clip.sourceEnd - clip.sourceStart;
  }
  assert.deepEqual(validateEdl(edl), []);
});

test("a deleted segment takes its zoom with it", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    deletedSegments: new Set([0]),
  });
  assert.equal(edl.zooms.length, 0);
  assert.equal(edl.clips.every((c) => c.label === "seg_2"), true);
});

test("a zoom sits on the finished timeline, not the source", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4" });
  const zoom = edl.zooms[0];
  // seg_1's framing starts at output 0 and holds for what survived of it.
  assert.equal(zoom.at, 0);
  assert.equal(zoom.scale, 1.6);
  assert.equal(zoom.holdSec, 1);
});

test("masks are remapped onto the cut timeline", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    masks: [{ at: 5, until: 5.5, rect: [0.1, 0.1, 0.2, 0.1], style: "blur" }],
  });
  // Source 5s is the start of seg_2, which lands at output 1s once seg_1's
  // filler is gone.
  assert.equal(edl.masks[0].from, 1);
  assert.equal(edl.masks[0].until, 1.5);
});

test("an unbounded mask is clamped to the finished duration", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    masks: [{ at: 0, until: Number.POSITIVE_INFINITY, rect: [0, 0, 1, 0.1], style: "redact" }],
  });
  assert.equal(edl.masks[0].until, edl.durationSec);
});

test("captions break on sentence ends and land in output time", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4" });
  assert.deepEqual(edl.captions.map((c) => c.text), ["click here.", "Then save."]);
  assert.equal(edl.captions[0].from, 0);
  assert.equal(edl.captions[1].from, 1);
});

test("narration is anchored to its segment's place on the timeline", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    narration: [{ segIndex: 1, url: "file://n.wav", durationSec: 0.9 }],
  });
  assert.equal(edl.audio[0].at, 1);
});

// --- validation ------------------------------------------------------------

function edlWith(overrides: Partial<Edl>): Edl {
  const base = buildEdl({ project: project(), sourceUrl: "file://a.mp4" });
  return { ...base, ...overrides };
}

test("validation catches a timeline with a hole in it", () => {
  const problems = validateEdl(
    edlWith({
      clips: [
        { sourceStart: 0, sourceEnd: 2, outputStart: 0 },
        { sourceStart: 4, sourceEnd: 6, outputStart: 3 },
      ],
      durationSec: 4,
    }),
  );
  assert.equal(problems.some((p) => /hole/.test(p)), true);
});

test("validation catches overlapping clips that would double-bill", () => {
  const problems = validateEdl(
    edlWith({
      clips: [
        { sourceStart: 0, sourceEnd: 4, outputStart: 0 },
        { sourceStart: 3, sourceEnd: 6, outputStart: 4 },
      ],
      durationSec: 7,
    }),
  );
  assert.equal(problems.some((p) => /overlaps/.test(p)), true);
});

test("validation catches a mask outside the frame and a zoom that shrinks it", () => {
  const problems = validateEdl(
    edlWith({
      masks: [{ from: 0, until: 1, rect: [0.9, 0, 0.4, 0.2], style: "blur" }],
      zooms: [{ at: 0, holdSec: 1, scale: 0.8, anchor: { x: 0.5, y: 0.5 }, easing: "push" }],
    }),
  );
  assert.equal(problems.some((p) => /outside the frame/.test(p)), true);
  assert.equal(problems.some((p) => /shrink/.test(p)), true);
});

test("validation refuses an edit that removes everything", () => {
  const problems = validateEdl(edlWith({ clips: [], durationSec: 0 }));
  assert.equal(problems.some((p) => /nothing|no video/i.test(p)), true);
});
