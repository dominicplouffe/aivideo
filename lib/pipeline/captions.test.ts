import assert from "node:assert/strict";
import test from "node:test";
import { chaptersFromCaptions, createChangeDetector, spansFromReadings, wordsFromChapters } from "./captions";
import { sniffMediaType } from "@/lib/storage/media-type";

function frame(fill: number, size = 1000): Uint8Array {
  return new Uint8Array(size).fill(fill);
}

test("only frames where the picture moved are kept, against the last one kept", () => {
  const detect = createChangeDetector({ fps: 2, share: 0.01, holdSec: 100 });
  const base = frame(10);
  const nudged = Uint8Array.from(base);
  nudged.fill(200, 0, 5); // 0.5% changed: a progress bar creeping along
  const captioned = Uint8Array.from(base);
  captioned.fill(200, 0, 50); // 5% changed: a new caption

  assert.equal(detect(base), 0, "the first frame is always read");
  assert.equal(detect(nudged), null);
  assert.equal(detect(nudged), null);
  assert.equal(detect(captioned), 1.5);
  assert.equal(detect(captioned), null);
});

test("a held picture is still read now and then", () => {
  const detect = createChangeDetector({ fps: 2, holdSec: 1 });
  const kept = [0, 1, 2, 3, 4].map(() => detect(frame(10)));
  assert.deepEqual(kept, [0, null, 1, null, 2]);
});

test("readings become captions that hold until the next one", () => {
  const spans = spansFromReadings(
    [
      { atSec: 0, text: "Welcome to Qore." },
      { atSec: 2, text: "Welcome  to Qore." },
      { atSec: 4, text: null },
      { atSec: 5, text: "This is Q." },
      { atSec: 9, text: "" },
      { atSec: 11, text: "Next: your data." },
    ],
    14,
  );
  assert.deepEqual(spans, [
    { text: "Welcome to Qore.", startSec: 0, endSec: 5 },
    { text: "This is Q.", startSec: 5, endSec: 9 },
    { text: "Next: your data.", startSec: 11, endSec: 14 },
  ]);
});

test("no caption anywhere is no captions", () => {
  assert.deepEqual(spansFromReadings([{ atSec: 0, text: "" }, { atSec: 3, text: null }], 10), []);
});

test("caption chapters cover the whole video, so no footage is cut as dead air", () => {
  const drafts = chaptersFromCaptions(
    [
      { text: "Welcome to Qore.", startSec: 0.5, endSec: 5 },
      { text: "This is Q.", startSec: 5, endSec: 9 },
      { text: "Next: your data.", startSec: 11, endSec: 14 },
    ],
    16,
  );
  assert.equal(drafts[0].startSec, 0, "the first chapter starts with the video");
  assert.equal(drafts.at(-1)!.endSec, 16, "the last runs to its end");
  for (const draft of drafts) {
    let t = draft.startSec;
    for (const word of draft.words) {
      assert.ok(Math.abs(word.t - t) < 0.002, `word "${word.w}" follows the one before it`);
      t = word.t + word.d;
    }
    assert.ok(Math.abs(t - draft.endSec) < 0.01, "words fill their chapter");
  }
  assert.equal(drafts[0].title, "Welcome to Qore");
});

test("captions shown a phrase at a time are gathered into sentences", () => {
  const drafts = chaptersFromCaptions(
    [
      { text: "Pick a report", startSec: 0, endSec: 1.5 },
      { text: "and press run.", startSec: 1.5, endSec: 3 },
      { text: "Then share it", startSec: 3, endSec: 4.5 },
      { text: "with your team.", startSec: 4.5, endSec: 7 },
    ],
    7,
  );
  assert.deepEqual(drafts.map((d) => [d.startSec, d.endSec]), [[0, 3], [3, 7]]);
});

test("caption words are stored in the shape a transcriber returns", () => {
  const words = wordsFromChapters(chaptersFromCaptions([{ text: "Hello there.", startSec: 0, endSec: 4 }], 4));
  assert.deepEqual(words, [
    { word: "Hello", start: 0, end: 2, confidence: 1 },
    { word: "there.", start: 2, end: 4, confidence: 1 },
  ]);
});

test("a take's container is told from its first bytes", () => {
  const bytes = (...parts: (string | number[])[]) =>
    Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
  assert.equal(sniffMediaType(bytes([0x1a, 0x45, 0xdf, 0xa3], [0, 0, 0, 0, 0, 0, 0, 0])), "video/webm");
  assert.equal(sniffMediaType(bytes([0, 0, 0, 0x20], "ftyp", "isom")), "video/mp4");
  assert.equal(sniffMediaType(bytes([0, 0, 0, 0x14], "ftyp", "qt  ")), "video/quicktime");
  assert.equal(sniffMediaType(bytes("not a video!")), null);
});
