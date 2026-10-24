import { test } from "node:test";
import assert from "node:assert/strict";
import { quietestNear, snapEdlToQuiet, type Energy } from "./quiet";
import { mergeFillers } from "@/lib/providers/deepgram";
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
