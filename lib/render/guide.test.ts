import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { buildGuide, grabFrame } from "./guide";
import type { Edl } from "./edl";
import { plainBrand } from "./edl";

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function edl(overrides: Partial<Edl> = {}): Edl {
  return {
    version: 1,
    projectId: "prj_1",
    locale: "en-US",
    source: { url: "file://source.mp4", durationSec: 20 },
    output: { width: 1280, height: 720, fps: 30, container: "mp4", videoCodec: "h264", audioCodec: "aac", crf: 23 },
    clips: [
      { sourceStart: 0, sourceEnd: 4, outputStart: 0, label: "s1" },
      { sourceStart: 6, sourceEnd: 9, outputStart: 4, label: "s2" },
    ],
    zooms: [],
    masks: [],
    captions: [
      { from: 0, until: 2, text: "Open the shipments board." },
      { from: 2, until: 4, text: "Every row is one delivery." },
      { from: 4, until: 7, text: "Click new shipment to start." },
    ],
    audio: [],
    brand: plainBrand(),
    durationSec: 7,
    ...overrides,
  };
}

test("one step per chapter, not one per surviving run of words", async () => {
  const { steps } = await buildGuide(
    edl({
      clips: [
        // Two clips from the same chapter: a filler was cut out of the middle.
        { sourceStart: 0, sourceEnd: 2, outputStart: 0, label: "s1" },
        { sourceStart: 2.6, sourceEnd: 4, outputStart: 2, label: "s1" },
        { sourceStart: 6, sourceEnd: 9, outputStart: 3.4, label: "s2" },
      ],
    }),
    { title: "Shipments", sourcePath: "/nonexistent.mp4" },
  );

  assert.equal(steps.length, 2, "two chapters, three clips");
  assert.equal(steps[0].ordinal, 0);
  assert.equal(steps[1].ordinal, 1);
});

test("each step's prose is what was said during it", async () => {
  const { steps } = await buildGuide(edl(), { title: "Shipments", sourcePath: "/nonexistent.mp4" });
  assert.match(steps[0].body, /Open the shipments board\./);
  assert.match(steps[0].body, /Every row is one delivery\./);
  assert.match(steps[1].body, /Click new shipment/);
  assert.ok(!steps[1].body.includes("Open the shipments"), "captions do not leak across steps");
});

test("a step is titled from its own first sentence", async () => {
  const { steps } = await buildGuide(edl(), { title: "Shipments", sourcePath: "/nonexistent.mp4" });
  // No trailing stop: a heading is a label, not a sentence.
  assert.equal(steps[0].title, "Open the shipments board");
});

test("a missing source costs the pictures, never the document", async () => {
  const { steps, markdown } = await buildGuide(edl(), {
    title: "Shipments",
    sourcePath: "/nonexistent.mp4",
  });
  assert.ok(steps.every((s) => s.screenshot === null));
  assert.match(markdown, /^# Shipments/);
  // No image link for a screenshot that does not exist — a broken image is
  // worse than none, because it reads as a bug in the product it documents.
  assert.ok(!markdown.includes("!["));
});

test("Markdown escapes what would otherwise be syntax", async () => {
  const { markdown } = await buildGuide(
    edl({ captions: [{ from: 0, until: 2, text: "Use the _internal_ flag [beta]." }] }),
    { title: "Flags", sourcePath: "/nonexistent.mp4" },
  );
  assert.ok(markdown.includes("\\_internal\\_"), markdown);
  assert.ok(markdown.includes("\\[beta\\]"), markdown);
});

test("frames come out of the recording at the step's timestamp", { skip: !hasFfmpeg() }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "guide-test-"));
  try {
    const source = path.join(dir, "source.mp4");
    execFileSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=12",
      "-pix_fmt", "yuv420p", source,
    ], { stdio: "ignore" });

    const png = await grabFrame(source, 3, { maxEdge: 320 });
    assert.ok(png, "a frame came back");
    // PNG signature, so this is an image rather than an ffmpeg error page.
    assert.deepEqual([...png!.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

    const { steps, markdown } = await buildGuide(
      edl({ source: { url: `file://${source}`, durationSec: 12 } }),
      { title: "Sample", sourcePath: source, imageBase: "." },
    );
    assert.ok(steps.every((s) => s.screenshot !== null), "every step got a picture");
    assert.match(markdown, /!\[.*\]\(\.\/step-01\.png\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("steps do not share text, and a titler names them by action", async () => {
  const { buildEdl } = await import("./edl");
  const project = {
    id: "p", locales: ["en-US"], sourceDurationSec: 6, voiceId: null,
    segments: [
      { id: "a", title: "A", start: 0, end: 2, words: [{ w: "Let", t: 0, d: 0.4 }, { w: "me", t: 0.4, d: 0.4 }, { w: "show", t: 0.8, d: 0.4 }, { w: "pricing.", t: 1.2, d: 0.8 }] },
      { id: "b", title: "B", start: 2, end: 4, words: [{ w: "Then", t: 2, d: 0.5 }, { w: "sign", t: 2.5, d: 0.5 }, { w: "up.", t: 3, d: 1 }] },
    ],
  } as unknown as import("@/lib/app-data").Project;
  const edl = buildEdl({ project, sourceUrl: "file://x.mp4" });
  const opts = { title: "T", sourcePath: "/nonexistent.mp4", ffmpegBinary: "/bin/false" };
  const plain = await buildGuide(edl, opts);
  assert.equal(plain.steps.length, 2);
  assert.equal(plain.steps[0].body, "Let me show pricing.");
  assert.equal(plain.steps[1].body, "Then sign up.");
  const titled = await buildGuide(edl, { ...opts, titleSteps: async () => ["Open the pricing page", "Sign up"] });
  assert.match(titled.markdown, /## 1\. Open the pricing page/);
  const failing = await buildGuide(edl, { ...opts, titleSteps: async () => { throw new Error("down"); } });
  assert.equal(failing.steps[0].title, "Let me show pricing");
});
