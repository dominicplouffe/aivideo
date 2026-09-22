import assert from "node:assert/strict";
import test from "node:test";
import { anchorsFromWords, retimeChapter } from "./retime";
import { parseFreezeLog } from "@/lib/pipeline/stillness";

/**
 * The retimer's promise: between two anchors the footage occupies exactly
 * the narration's time, and the picture bends where bending is cheapest.
 */

const plays = (clips: { sourceStart: number; sourceEnd: number; speed?: number; holdSec?: number }[]) =>
  clips.reduce((n, c) => n + (c.sourceEnd - c.sourceStart) / (c.speed ?? 1) + (c.holdSec ?? 0), 0);

test("footage that already fits is left alone", () => {
  const { clips, summary } = retimeChapter({ sourceStart: 10, sourceEnd: 20, narrationSec: 10.1 });
  assert.equal(clips.length, 1);
  assert.ok(Math.abs(plays(clips) - 10.1) < 1e-6);
  // A one-percent speed change, which nobody sees, is not reported as bending.
  assert.deepEqual(summary, { heldSec: 0, hurriedSec: 0, slowedSec: 0, trimmedSec: 0 });
});

test("a longer reading is absorbed by holding still footage, spread by length", () => {
  const { clips, summary } = retimeChapter({
    sourceStart: 0,
    sourceEnd: 10,
    narrationSec: 16,
    still: [[2, 4], [7, 11]], // 2s and 3s still inside the chapter
  });
  assert.ok(Math.abs(plays(clips) - 16) < 1e-6);
  assert.ok(Math.abs(summary.heldSec - 6) < 1e-6);
  // Held 2/5 and 3/5 of the six seconds, at the end of each still stretch.
  // The motion before each still piece merged into it: same speed, and a
  // hold at the end of a still stretch is the same picture either way.
  const held = clips.filter((c) => c.holdSec);
  assert.deepEqual(held.map((c) => [c.sourceStart, c.sourceEnd, c.holdSec]), [[0, 4, 2.4], [4, 10, 3.6]]);
  // Nothing was sped up or trimmed.
  assert.equal(summary.hurriedSec, 0);
  assert.equal(summary.trimmedSec, 0);
});

test("with nothing still, a longer reading slows the motion a little and holds the last frame", () => {
  const { clips, summary } = retimeChapter({ sourceStart: 0, sourceEnd: 6, narrationSec: 12 });
  assert.ok(Math.abs(plays(clips) - 12) < 1e-6);
  // Slowed to the floor (0.75×) makes 8s; the remaining 4s is a held frame.
  assert.equal(clips.length, 1);
  assert.equal(clips[0].speed, 0.75);
  assert.equal(clips[0].holdSec, 4);
  assert.equal(summary.slowedSec, 6);
});

test("a shorter reading hurries still footage first, then motion, then trims", () => {
  // 20s of footage, 8s of still in the middle; the reading is 12s.
  const gentle = retimeChapter({ sourceStart: 0, sourceEnd: 20, narrationSec: 12, still: [[6, 14]] });
  assert.ok(Math.abs(plays(gentle.clips) - 12) < 1e-6);
  const stillClip = gentle.clips.find((c) => c.sourceStart === 6 && c.sourceEnd === 14)!;
  // Still footage went to its ceiling (4×, recovering 6s); the motion took the
  // remaining 2s gently (about 1.2×). Nothing was trimmed.
  assert.ok(Math.abs(stillClip.speed! - 4) < 1e-6, `still at ${stillClip.speed}`);
  const motion = gentle.clips.filter((c) => c.sourceStart !== 6);
  assert.ok(motion.every((c) => (c.speed ?? 1) > 1 && (c.speed ?? 1) <= 1.5));
  assert.equal(gentle.summary.trimmedSec, 0);
  assert.ok(Math.abs(gentle.summary.hurriedSec - 20) < 1e-6);

  // 20s of footage, all motion, a 6s reading: motion goes to 1.5× (13.3s), the rest is trimmed.
  const harsh = retimeChapter({ sourceStart: 0, sourceEnd: 20, narrationSec: 6 });
  assert.ok(Math.abs(plays(harsh.clips) - 6) < 1e-6);
  assert.ok(harsh.summary.trimmedSec > 0);
  assert.ok(harsh.clips.every((c) => (c.speed ?? 1) <= 1.5 + 1e-9));
});

test("hold plays as recorded then parks; a shorter reading ends the footage where it ends", () => {
  const longer = retimeChapter({ sourceStart: 0, sourceEnd: 6, narrationSec: 10, mode: "hold" });
  assert.deepEqual(longer.clips, [{ sourceStart: 0, sourceEnd: 6, holdSec: 4 }]);
  assert.equal(longer.summary.heldSec, 4);
  const shorter = retimeChapter({ sourceStart: 0, sourceEnd: 6, narrationSec: 4, mode: "hold" });
  assert.deepEqual(shorter.clips, [{ sourceStart: 0, sourceEnd: 4 }]);
  assert.equal(shorter.summary.trimmedSec, 2);
});

test("stretch runs the footage at one speed to the reading's end, within what still reads", () => {
  const { clips } = retimeChapter({ sourceStart: 0, sourceEnd: 6, narrationSec: 12, mode: "stretch" });
  assert.deepEqual(clips, [{ sourceStart: 0, sourceEnd: 6, speed: 0.5 }]);
  // Past 4× the rest is trimmed; below 0.25× the rest is held.
  const fast = retimeChapter({ sourceStart: 0, sourceEnd: 20, narrationSec: 2, mode: "stretch" });
  assert.equal(fast.clips[0].speed, 4);
  assert.ok(Math.abs(plays(fast.clips) - 2) < 1e-6);
  const slow = retimeChapter({ sourceStart: 0, sourceEnd: 1, narrationSec: 10, mode: "stretch" });
  assert.equal(slow.clips[0].speed, 0.25);
  assert.ok(Math.abs(plays(slow.clips) - 10) < 1e-6);
});

test("anchors split the chapter so each sentence lands on its own footage", () => {
  // Two sentences: footage 0–4 and 4–10; narration 0–2 and 2–8.
  const { clips } = retimeChapter({
    sourceStart: 0,
    sourceEnd: 10,
    narrationSec: 8,
    anchors: [{ source: 4, output: 2 }],
  });
  // First interval is hurried to 2s; second holds/slows to 6s.
  const first = clips.filter((c) => c.sourceEnd <= 4);
  const second = clips.filter((c) => c.sourceStart >= 4);
  assert.ok(Math.abs(plays(first) - 2) < 1e-6);
  assert.ok(Math.abs(plays(second) - 6) < 1e-6);
});

test("anchors come from sentence ends, thinned so intervals stay long enough to read", () => {
  const words = [
    { source: 0.5, output: 0.4, sentenceEnd: false },
    { source: 1.0, output: 0.9, sentenceEnd: true },
    { source: 1.2, output: 1.1, sentenceEnd: false }, // too close to the start
    { source: 1.6, output: 1.5, sentenceEnd: true },
    { source: 4.0, output: 3.5, sentenceEnd: false }, // after a sentence end, far enough
    { source: 6.0, output: 5.5, sentenceEnd: true },
    { source: 6.4, output: 5.9, sentenceEnd: false }, // too close to the end
  ];
  assert.deepEqual(anchorsFromWords(words, { sourceStart: 0, sourceEnd: 7, narrationSec: 7 }), [{ source: 4, output: 3.5 }]);
});

test("the freeze log becomes still spans", () => {
  const log = [
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 3.2",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 2.1",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 5.3",
    "frame=  100 fps=0.0 q=-0.0 size=N/A time=00:00:06.00",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 8",
  ].join("\n");
  // An unfinished freeze at the end of the log is not a span.
  assert.deepEqual(parseFreezeLog(log), [[3.2, 5.3]]);
});
