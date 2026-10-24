import { test } from "node:test";
import assert from "node:assert/strict";
import { quietestNear, snapEdlToQuiet, type Energy } from "./quiet";
import { mergeFillers, trimOverlongWords } from "@/lib/providers/deepgram";
import { applyGlossary, withBuiltInTerms } from "@/lib/pipeline/glossary";
import type { Edl } from "./edl";

function energy(seconds: number, quiet: number[]): Energy {
  const power = new Float64Array(Math.round(seconds / 0.01)).fill(1);
  for (const q of quiet) { const h = Math.round(q / 0.01); power[h - 1] = 0; power[h] = 0; }
  return { hopSec: 0.01, power };
}

test("a cut edge moves to the quietest 20 ms within 150 ms", () => {
  const e = energy(5, [1.1]);
  assert.ok(Math.abs(quietestNear(e, 1.0, 0.85, 1.15) - 1.1) < 0.011);
  // Nothing quiet in range: stays nearest where it was asked.
  assert.ok(Math.abs(quietestNear(energy(5, []), 1.0, 0.85, 1.15) - 1.0) < 0.011);
});

test("snapping re-times clips and captions and leaves joined edges alone", () => {
  const edl = {
    source: { url: "x", durationSec: 5 }, audio: [], zooms: [], masks: [],
    clips: [
      { sourceStart: 0, sourceEnd: 1, outputStart: 0, label: "a" },
      { sourceStart: 1, sourceEnd: 2, outputStart: 1, label: "b" },
      { sourceStart: 3, sourceEnd: 4, outputStart: 2, label: "b" },
    ],
    captions: [{ from: 2.5, until: 2.9, text: "hi" }], durationSec: 3,
  } as unknown as Edl;
  const out = snapEdlToQuiet(edl, energy(5, [2.1, 2.9]));
  assert.equal(out.clips[0].sourceEnd, 1);
  assert.equal(out.clips[1].sourceStart, 1);
  assert.ok(Math.abs(out.clips[1].sourceEnd - 2.1) < 0.011);
  assert.ok(Math.abs(out.clips[2].sourceStart - 2.9) < 0.011);
  assert.ok(Math.abs(out.clips[2].outputStart - 2.1) < 0.011);
  assert.ok(Math.abs(out.durationSec - 3.2) < 0.03);
  assert.ok(out.captions[0].from > 2.5);
});

test("fillers a second pass heard go back in and shorten the word that swallowed them", () => {
  const words = [
    { word: "And", start: 26.1, end: 28.26, confidence: 0.9 },
    { word: "a", start: 28.3, end: 28.4, confidence: 0.9 },
  ];
  const out = mergeFillers(words, [{ word: "um", start: 27.14, end: 27.64, confidence: 0.8 }]);
  assert.deepEqual(out.map((w) => w.word), ["And", "um", "a"]);
  assert.equal(out[0].end, 27.14);
  // Already present: not added twice.
  assert.equal(mergeFillers(out, [{ word: "um", start: 27.2, end: 27.6, confidence: 0.8 }]).length, 3);
});

test("every workspace spells DemoRiff right", () => {
  const heard = [
    { word: "demo", start: 0, end: 0.3, confidence: 1 },
    { word: "riff.", start: 0.3, end: 0.6, confidence: 1 },
  ];
  const { words } = applyGlossary(heard, withBuiltInTerms([]));
  assert.equal(words.length, 1);
  assert.equal(words[0].word, "DemoRiff.");
  assert.equal(withBuiltInTerms([{ text: "Demo Riff", heard: "demo riff", spoken: null }])[0].text, "Demo Riff");
});

test("a word that swallowed a filler keeps its start, and a heard 'a' that was 'uh' becomes the filler", () => {
  // Live take 2, 24 Oct: nova-3 "or" 54.11-55.30 over "or, um"; nova-2 um 54.43-54.93.
  const words = [
    { word: "Microsoft", start: 53.39, end: 54.11, confidence: 0.9 },
    { word: "or", start: 54.11, end: 55.3, confidence: 0.9 },
    { word: "with", start: 52.19, end: 52.34, confidence: 0.9 },
    { word: "a", start: 52.34, end: 52.59, confidence: 0.9 },
  ].sort((a, b) => a.start - b.start);
  const out = mergeFillers(words, [
    { word: "um", start: 54.43, end: 54.93, confidence: 0.8 },
    { word: "uh", start: 52.34, end: 52.66, confidence: 0.8 },
  ]);
  assert.deepEqual(out.map((w) => w.word), ["with", "uh", "Microsoft", "or", "um"]);
  const or = out.find((w) => w.word === "or")!;
  assert.equal(or.start, 54.11);
  assert.equal(or.end, 54.43); // where nova-2 ends its own "or", not the filler's tail
});

test("a word that runs into a filler ends where the filler starts, so the filler is cut whole", () => {
  // Live take 2, 24 Oct: nova-3 "just" 60.18-60.74 and "type" 60.82-61.14; nova-2 "just" 60.10-60.42, uh 60.42-60.90.
  // Run 4 kept "just" to 60.74, so most of the "uh" stayed and the cut clipped "type".
  const out = mergeFillers(
    [
      { word: "just", start: 60.18, end: 60.74, confidence: 0.9 },
      { word: "type", start: 60.82, end: 61.14, confidence: 0.9 },
    ],
    [{ word: "uh", start: 60.42, end: 60.9, confidence: 0.8 }],
  );
  assert.deepEqual(out.map((w) => [w.word, w.start, w.end]), [["just", 60.18, 60.42], ["uh", 60.42, 60.9], ["type", 60.9, 61.14]]);
});

test("an over-long word loses its tail to a cut filler", () => {
  const out = trimOverlongWords([
    { word: "and", start: 26.02, end: 28.18, confidence: 0.9 },
    { word: "guide", start: 28.41, end: 29.13, confidence: 0.9 },
  ]);
  assert.deepEqual(out.map((w) => w.word), ["and", "um", "guide"]);
  assert.ok(Math.abs(out[0].end - 26.56) < 1e-9);
  assert.equal(out[1].end, 28.18);
});
