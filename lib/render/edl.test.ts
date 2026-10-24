import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEdl, clipOutputSeconds, edlDuration, mapOutputToSource, mapSourceToOutput, narrationCaptions,
  segmentOutputSeconds, validateEdl, withClipsFor, withNarration, type Edl, type EdlClip,
} from "./edl";
import type { Project } from "@/lib/app-data";
import { wordKey } from "@/lib/segments";

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

test("captions show the rewritten words, and a rewrite keeps the clip whole", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    removeFillers: false,
    wordEdits: new Map([[wordKey(0, 1), { span: 2, text: "press here.", spoken: "press hear" }]]),
  });
  // seg_1's three words are still one clip, 0–1.5.
  assert.deepEqual(edl.clips.map((c) => [c.sourceStart, c.sourceEnd]), [[0, 1.5], [5, 6.5]]);
  // The caption reads the text, never the spoken form.
  assert.equal(edl.captions[0]?.text, "So press here.");
});

test("cutting a word by hand splits the clip around it", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    removeFillers: false,
    cutWords: new Set([wordKey(0, 1)]),
  });
  // seg_1 is "So click here." at 0–1.5; cutting "click" leaves the two
  // halves either side of it, and seg_2 is untouched.
  assert.deepEqual(
    edl.clips.map((c) => [c.sourceStart, c.sourceEnd]),
    [[0, 0.5], [1, 1.5], [5, 6.5]],
  );
  assert.equal(edl.durationSec, 2.5);
  assert.ok(!edl.captions.some((cue) => /click/.test(cue.text)));
  assert.deepEqual(validateEdl(edl), []);
});

test("narration lands where its chapter begins, and a removed chapter gets none", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4", removeFillers: true });
  // seg_1 survives from 0.5–1.5 (output 0–1); seg_2 from 5–5.5 and 6–6.5 (output 1–2).
  const narrated = withNarration(edl, [
    { segmentId: "seg_2", url: "storage://ws/b.wav", durationSec: 0.8, voiceId: "v1", tempo: 1.2 },
    { segmentId: "seg_1", url: "storage://ws/a.wav", durationSec: 0.9, voiceId: "v1", tempo: 1 },
    { segmentId: "seg_gone", url: "storage://ws/c.wav", durationSec: 1, voiceId: "v1" },
  ]);
  assert.deepEqual(
    narrated.audio.map((t) => [t.kind, t.at, t.durationSec, t.voiceId, t.tempo]),
    [
      ["narration", 1, 0.8, "v1", 1.2],
      // tempo 1 is the default and is not written.
      ["narration", 0, 0.9, "v1", undefined],
    ],
  );
  assert.equal(segmentOutputSeconds(edl, "seg_2"), 1);
  assert.deepEqual(validateEdl(narrated), []);
  // The original is untouched: adding narration returns a new EDL.
  assert.equal(edl.audio.length, 0);
});

test("a narrated project keeps each chapter's footage whole and cuts only words", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    continuous: true,
    removeFillers: true,
    cutWords: new Set([wordKey(1, 2)]),
  });
  // Both chapters, start to end, whatever the words say: seg_1 0–3, seg_2 5–7.
  assert.deepEqual(edl.clips.map((c) => [c.sourceStart, c.sourceEnd, c.outputStart]), [[0, 3, 0], [5, 7, 3]]);
  assert.equal(edl.durationSec, 5);
  // No word-timed captions: the narration brings its own.
  assert.deepEqual(edl.captions, []);
  assert.deepEqual(validateEdl(edl), []);

  const dropped = buildEdl({ project: project(), sourceUrl: "file://a.mp4", continuous: true, deletedSegments: new Set([0]) });
  assert.deepEqual(dropped.clips.map((c) => [c.sourceStart, c.sourceEnd, c.outputStart]), [[5, 7, 0]]);
});

test("a narrated chapter's clip honours its trims", () => {
  const edl = buildEdl({
    project: project(),
    sourceUrl: "file://a.mp4",
    continuous: true,
    sceneTiming: new Map([[1, { mode: "fit" as const, trimStartSec: 0.5, trimEndSec: 0.5, leadInSec: 0 }]]),
  });
  assert.deepEqual(edl.clips.map((c) => [c.sourceStart, c.sourceEnd]), [[0, 3], [5.5, 6.5]]);
});

test("narration captions spread the chapter's words over the reading", () => {
  const cues = narrationCaptions(["Open", "the", "board.", "Then", "save."], 10, 4);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "Open the board.");
  assert.equal(cues[0].from, 10);
  assert.ok(Math.abs(cues[1].until - 14) < 1e-9);
  // The longer sentence gets the larger share.
  assert.ok(cues[0].until - cues[0].from > cues[1].until - cues[1].from);
  // withNarration carries the cues onto the EDL.
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4", continuous: true });
  const narrated = withNarration(edl, [{ segmentId: "seg_1", url: "u", durationSec: 2, captions: cues }]);
  assert.equal(narrated.captions.length, 2);
});

test("a clip's speed and hold change how long it occupies, and the maps follow", () => {
  const clips: EdlClip[] = [
    { sourceStart: 0, sourceEnd: 4, outputStart: 0, speed: 2 }, // 2s on screen
    { sourceStart: 6, sourceEnd: 8, outputStart: 2, holdSec: 3 }, // 2s + 3s held
  ];
  assert.equal(clipOutputSeconds(clips[0]), 2);
  assert.equal(clipOutputSeconds(clips[1]), 5);
  assert.equal(edlDuration(clips), 7);
  // Source 2s at 2× is output 1s; source 7s is output 3s.
  assert.equal(mapSourceToOutput(clips, 2), 1);
  assert.equal(mapSourceToOutput(clips, 7), 3);
  // Output 1s at 2× is source 2s; output 4.5s is inside the hold, parked on the last frame.
  assert.equal(mapOutputToSource(clips, 1), 2);
  assert.equal(mapOutputToSource(clips, 4.5), 8);
});

test("retimed clips are only valid under narration, within readable bounds", () => {
  const base = buildEdl({ project: project(), sourceUrl: "file://a.mp4", continuous: true });
  const retimed = withClipsFor(base, "seg_1", [
    { sourceStart: 0, sourceEnd: 1.5, label: "seg_1", speed: 1.5 },
    { sourceStart: 1.5, sourceEnd: 3, label: "seg_1", holdSec: 2 },
  ]);
  // Output starts were recomputed: 1 + 3.5 = 4.5s for seg_1, then seg_2 from 4.5.
  assert.deepEqual(retimed.clips.map((c) => c.outputStart), [0, 1, 4.5]);
  assert.equal(retimed.durationSec, 6.5);
  // No narration yet: the recording's own audio could not follow the retime.
  assert.match(validateEdl(retimed).join("\n"), /own audio/);
  const narrated = withNarration(retimed, [{ segmentId: "seg_1", url: "u", durationSec: 4.5, voiceId: "v" }]);
  assert.deepEqual(validateEdl(narrated), []);
  const tooFast = withNarration(withClipsFor(base, "seg_1", [{ sourceStart: 0, sourceEnd: 3, label: "seg_1", speed: 6 }]), [
    { segmentId: "seg_1", url: "u", durationSec: 0.5 },
  ]);
  assert.match(validateEdl(tooFast).join("\n"), /6×/);
});

test("a tempo the mix cannot apply fails validation", () => {
  const edl = buildEdl({ project: project(), sourceUrl: "file://a.mp4" });
  const narrated = withNarration(edl, [{ segmentId: "seg_1", url: "u", durationSec: 1, tempo: 3 }]);
  assert.match(validateEdl(narrated).join("\n"), /tempo/);
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

test("chapters whose vendor timings overlap still make a valid edit", () => {
  // Deepgram ended one segment at 60.23s and began the next at 60.18s on a
  // real take; copying that overlap into the clips made the render refuse.
  const overlapping = project();
  overlapping.segments = [
    { id: "seg_a", title: "A", start: 0, end: 2.05, words: [{ w: "Open", t: 0, d: 1 }, { w: "pricing.", t: 1, d: 1.05 }] },
    { id: "seg_b", title: "B", start: 2, end: 4, words: [{ w: "Then", t: 2, d: 1 }, { w: "sign up.", t: 3, d: 1 }] },
    // Entirely inside the previous chapter's footage: nothing new to play.
    { id: "seg_c", title: "C", start: 3.5, end: 3.9, words: [{ w: "um", t: 3.5, d: 0.4 }] },
  ];
  const edl = buildEdl({ project: overlapping, sourceUrl: "file://a.mp4" });
  assert.deepEqual(validateEdl(edl), []);
  assert.equal(edl.clips[1].sourceStart, 2.05);
  assert.equal(edl.clips.length, 2);
  assert.ok(Math.abs(edl.durationSec - 4) < 1e-6);
});

test("a cut word is removed where it was said, not where the words add up to", () => {
  const timed = project();
  timed.segments = [{
    id: "seg_t", title: "T", start: 0, end: 6,
    words: [
      { w: "Open", t: 0, d: 0.5 },
      { w: "um", t: 2, d: 0.5, cut: true },
      { w: "pricing.", t: 2.6, d: 0.6 },
      { w: "Done.", t: 5, d: 0.5 },
    ],
  }] as unknown as Project["segments"];
  const edl = buildEdl({ project: timed, sourceUrl: "file://a.mp4" });
  assert.deepEqual(validateEdl(edl), []);
  assert.deepEqual(edl.clips.map((c) => [c.sourceStart, c.sourceEnd]), [[0, 0.5], [2.6, 3.2], [5, 5.5]]);
});
