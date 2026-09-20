import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { detectorsIn, luhn, narrow } from "./detectors";
import { sampleFrames, splitPngs } from "./frames";
import { FixtureLocator, shapeBox } from "./locator";
import { area, intersection, toRegions, union, type Hit } from "./regions";
import { frameMasking } from "./service";
import { buildMaskFilters } from "@/lib/render/ffmpeg";
import type { Frame, Rect, TextBox } from "./types";

/**
 * Frame-level masking is the second line of defence, and it is the one that
 * can fail quietly. The tests here are about the two ways that happens:
 * finding the text and then not covering it for long enough, and failing to
 * read a frame and carrying on as though it were clean.
 */

const box = (text: string, rect: Rect = [0.1, 0.2, 0.4, 0.04]): TextBox => ({
  text,
  rect,
  confidence: 0.9,
});

/* ------------------------------------------------------------- detectors */

describe("what counts as sensitive", () => {
  it("finds the shapes that are unambiguously somebody's data", () => {
    const found = (text: string) =>
      detectorsIn(text, ["email", "card", "iban", "ssn", "secret", "ip"]).map((h) => h.detector);

    assert.deepEqual(found("Contact sam.taylor@meridian.com for details"), ["email"]);
    assert.deepEqual(found("4111 1111 1111 1111"), ["card"]);
    assert.deepEqual(found("SSN 123-45-6789"), ["ssn"]);
    assert.deepEqual(found("sk_live_abcdefghijklmnop0123"), ["secret"]);
    // An IBAN also looks like a card to the card pattern, and that is the
    // right way round to be wrong: the rectangle ends up over the IBAN
    // either way.
    assert.ok(found("GB29 NWBK 6016 1331 9268 19").includes("iban"));
  });

  it("still masks a card number OCR read imperfectly", () => {
    // OCR reads O for 0 and l for 1. A detector that only matched clean
    // digits would miss exactly the frames where the text was hard to read —
    // and hard to read is not the same as unreadable, especially with a
    // scrubber.
    const hits = detectorsIn("4lll 1111 1111 111O", ["card"]);
    assert.equal(hits.length, 1);
  });

  it("uses Luhn to raise confidence and never to reject", () => {
    assert.equal(luhn("4111111111111111"), true);
    assert.equal(luhn("4111111111111112"), false);

    const valid = detectorsIn("4111 1111 1111 1111", ["card"])[0];
    const invalid = detectorsIn("4111 1111 1111 1112", ["card"])[0];

    assert.ok(valid.confidence > invalid.confidence);
    // The failing one is still a hit. A demo card is usually fake, and a
    // rule that only masks valid cards leaves a real one through the moment
    // OCR misreads a digit.
    assert.ok(invalid);
  });

  it("does not carry a regex's lastIndex between texts", () => {
    // A shared /g/ regex skips matches in every text after the first, which
    // would mean the second email on a page is never masked.
    const first = detectorsIn("sam@meridian.com", ["email"]);
    const second = detectorsIn("dana@meridian.com", ["email"]);
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
  });

  it("narrows a line to the part that matched, generously", () => {
    const line = box("Billed to sam@meridian.com on 4 March", [0, 0.5, 0.8, 0.04]);
    const hit = detectorsIn(line.text, ["email"])[0];
    const narrowed = narrow(line, hit.start, hit.end);

    // Blurring the whole line to hide an address destroys the demo for no
    // security gain, so the mask is narrowed — but it overshoots both ends,
    // because a proportional estimate over a proportional font that stops
    // one character short is not a mask.
    assert.ok(narrowed.rect[2] < line.rect[2]);
    assert.ok(narrowed.rect[0] < line.rect[0] + line.rect[2] * (hit.start / line.text.length));
    const narrowedEnd = narrowed.rect[0] + narrowed.rect[2];
    assert.ok(narrowedEnd > line.rect[0] + line.rect[2] * (hit.end / line.text.length));
  });
});

/* --------------------------------------------------------------- regions */

describe("turning hits into regions", () => {
  const rect: Rect = [0.1, 0.2, 0.3, 0.05];
  const hit = (atSec: number, over: Partial<Hit> = {}): Hit => ({
    atSec,
    rect,
    style: "blur",
    reason: "detector:email",
    category: "email",
    ...over,
  });

  it("covers the whole sample interval, not just the instant", () => {
    const [region] = toRegions([hit(1)], { samplePeriodSec: 0.5, durationSec: 10 });
    // The text was on screen between the frame that saw it and the frames
    // that were never inspected.
    assert.equal(region.at, 0.75);
    assert.equal(region.until, 1.25);
  });

  it("bridges a frame the locator missed", () => {
    // A cursor crossing the text, an animation blurring it. A mask that
    // drops out for 500ms is a mask that can be paused on.
    const regions = toRegions([hit(1), hit(2)], { samplePeriodSec: 0.5, durationSec: 10 });
    assert.equal(regions.length, 1);
    assert.equal(regions[0].at, 0.75);
    assert.equal(regions[0].until, 2.25);
  });

  it("closes a region when the gap is longer than the bridge", () => {
    const regions = toRegions([hit(1), hit(8)], {
      samplePeriodSec: 0.5,
      bridgeSec: 1,
      durationSec: 10,
    });
    assert.equal(regions.length, 2);
  });

  it("grows to cover text that moved while it was on screen", () => {
    const regions = toRegions(
      // A nudge, not a jump: a row shifting by most of its own height is a
      // different row, and merging those would smear one mask across two.
      [hit(1), hit(1.5, { rect: [0.12, 0.21, 0.3, 0.05] })],
      { samplePeriodSec: 0.5, durationSec: 10 },
    );
    assert.equal(regions.length, 1);
    // A table reflowing or a tooltip nudging a row must stay covered across
    // the whole span, not only where it started.
    assert.ok(regions[0].rect[2] > rect[2]);
    assert.ok(intersection(regions[0].rect, [0.12, 0.21, 0.3, 0.05]) > 0);
  });

  it("pads every box, because a blur at the glyph edge leaves it readable", () => {
    const [region] = toRegions([hit(1)], { samplePeriodSec: 0.5, durationSec: 10, padding: 0.01 });
    assert.ok(region.rect[0] < rect[0]);
    assert.ok(region.rect[2] > rect[2]);
  });

  it("never merges a redaction into a blur", () => {
    const regions = toRegions(
      [hit(1), hit(1, { style: "redact", category: "card" })],
      { samplePeriodSec: 0.5, durationSec: 10 },
    );
    // Merging would quietly downgrade one of them, and the weaker treatment
    // would win half the time.
    assert.equal(regions.length, 2);
    assert.deepEqual(regions.map((r) => r.style).sort(), ["blur", "redact"]);
  });

  it("never extends past the clip", () => {
    const [region] = toRegions([hit(9.9)], { samplePeriodSec: 1, durationSec: 10 });
    assert.equal(region.until, 10);
  });

  it("computes overlap the way the merge relies on", () => {
    assert.equal(area([0, 0, 0.5, 0.5]), 0.25);
    assert.equal(intersection([0, 0, 0.5, 0.5], [0.25, 0.25, 0.5, 0.5]), 0.0625);
    assert.equal(intersection([0, 0, 0.1, 0.1], [0.5, 0.5, 0.1, 0.1]), 0);
    const merged = union([0, 0, 0.2, 0.2], [0.4, 0.4, 0.2, 0.2]);
    // Compared with a tolerance: these are float fractions of a frame, and
    // 0.6000000000000001 is the same rectangle.
    assert.deepEqual(merged.map((n) => Number(n.toFixed(6))), [0, 0, 0.6, 0.6]);
  });
});

/* ------------------------------------------------------------- the boxes */

describe("boxes coming back from a locator", () => {
  it("clamps a box that runs off the frame rather than dropping it", () => {
    // A box in roughly the right place still hides the thing; dropping it
    // does not.
    const shaped = shapeBox({ text: "x", x: 0.9, y: 0.9, w: 0.5, h: 0.5, confidence: 0.4 });
    assert.deepEqual(
      shaped?.rect.map((n) => Number(n.toFixed(6))),
      [0.9, 0.9, 0.1, 0.1],
    );
  });

  it("drops a box with no text, and survives missing numbers", () => {
    assert.equal(shapeBox({ text: "   ", x: 0, y: 0, w: 1, h: 1 }), null);
    const shaped = shapeBox({ text: "ok" });
    assert.equal(shaped?.confidence, 0.5);
    assert.ok(shaped && shaped.rect[2] > 0);
  });
});

/* --------------------------------------------------------- the failure policy */

describe("a frame that cannot be read", () => {
  const rules = [{ type: "detector" as const, detectors: ["email"], style: "blur" as const }];

  function service(
    locate: (frame: Frame) => TextBox[] | never,
    onFrameFailure?: "fail" | "extend",
  ) {
    return frameMasking({
      locator: new FixtureLocator(locate),
      onFrameFailure,
      fps: 2,
    });
  }

  it("fails the render by default rather than leaving it unmasked", async () => {
    // A render that skipped three frames is unmasked for a second and a
    // half, and nothing about it looks wrong.
    const provider = service(() => {
      throw new Error("vendor unavailable");
    });

    await assert.rejects(
      () => provider.detect({ mediaUrl: FIXTURE_VIDEO, rules }),
      /could not be inspected/,
    );
  });

  it("carries the previous frame's regions forward when asked to", async () => {
    let calls = 0;
    const provider = service((frame) => {
      calls += 1;
      if (frame.atSec > 0.4 && frame.atSec < 1.1) throw new Error("hiccup");
      return [box("sam@meridian.com")];
    }, "extend");

    const { regions } = await provider.detect({ mediaUrl: FIXTURE_VIDEO, rules });
    assert.ok(calls > 2);
    assert.ok(regions.length >= 1);
    // The stale mask covers the gap: 1/fps of guessed cover beats 1/fps of
    // none.
    assert.ok(regions.some((region) => region.at < 0.5 && region.until > 1.1));
  });

  it("refuses a pattern that does not compile", async () => {
    const provider = service(() => [box("anything")]);
    await assert.rejects(
      () =>
        provider.detect({
          mediaUrl: FIXTURE_VIDEO,
          rules: [{ type: "pattern", regex: "([unclosed", style: "blur" }],
        }),
      /not a valid expression/,
    );
  });

  it("still refuses a selector rule that arrived without bounds", async () => {
    const provider = service(() => []);
    await assert.rejects(
      () =>
        provider.detect({
          mediaUrl: FIXTURE_VIDEO,
          rules: [{ type: "selector", selector: "#email", style: "blur" }],
        }),
      /without resolved bounds/,
    );
  });
});

/* ----------------------------------------------------- frames, for real */

let workDir = "";
let FIXTURE_VIDEO = "";

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "demoriff-mask-"));
  FIXTURE_VIDEO = path.join(workDir, "source.mp4");

  // Four seconds of a moving pattern. Real frames, so the sampler is tested
  // against ffmpeg's actual output rather than against a stub of it.
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=4",
      "-pix_fmt", "yuv420p", "-y", FIXTURE_VIDEO,
    ]);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
});

after(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

describe("sampling frames", () => {
  it("reads whole PNGs out of one ffmpeg pipe", async () => {
    const frames = await sampleFrames(FIXTURE_VIDEO, { fps: 2, maxEdge: 320 });

    // Four seconds at two frames a second.
    assert.equal(frames.length, 8);
    assert.deepEqual(frames.map((f) => f.atSec), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);

    for (const frame of frames) {
      // Each one is a complete PNG: signature at the front, IEND at the end.
      assert.deepEqual(frame.png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      assert.ok(frame.png.includes(Buffer.from("IEND")));
      assert.ok(frame.png.byteLength > 500);
    }
  });

  it("never writes an unmasked frame to disk", async () => {
    const { readdir } = await import("node:fs/promises");
    const before = await readdir(workDir);
    await sampleFrames(FIXTURE_VIDEO, { fps: 4, maxEdge: 320 });
    // The whole subsystem exists to stop clear pixels existing in a file;
    // spilling them to a scratch directory on the way would be absurd.
    assert.deepEqual(await readdir(workDir), before);
  });

  it("splits a concatenated stream without running them together", () => {
    const one = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("....IDAT....IEND"),
      Buffer.from([0, 0, 0, 0]),
    ]);
    assert.equal(splitPngs(Buffer.concat([one, one, one])).length, 3);
    assert.equal(splitPngs(Buffer.from("not a png")).length, 0);
  });
});

describe("the whole service", () => {
  it("masks an address it found, over the span it was visible", async () => {
    const provider = frameMasking({
      fps: 2,
      maxEdge: 320,
      locator: new FixtureLocator((frame) =>
        // On screen for the first two seconds, gone afterwards.
        frame.atSec < 2 ? [box("Billed to sam@meridian.com", [0.2, 0.4, 0.5, 0.05])] : [],
      ),
    });

    const { regions } = await provider.detect({
      mediaUrl: FIXTURE_VIDEO,
      rules: [{ type: "detector", detectors: ["email"], style: "blur" }],
    });

    assert.equal(regions.length, 1);
    assert.equal(regions[0].style, "blur");
    assert.ok(regions[0].at <= 0);
    // Covered past the last frame that saw it, not up to it.
    assert.ok(regions[0].until >= 1.75);
    assert.ok(regions[0].until < 2.5);
  });

  it("applies a region rule and a detector rule in one pass", async () => {
    const provider = frameMasking({
      fps: 2,
      maxEdge: 320,
      locator: new FixtureLocator(() => [box("sk_live_abcdefghijklmnop0123")]),
    });

    const { regions } = await provider.detect({
      mediaUrl: FIXTURE_VIDEO,
      rules: [
        { type: "region", rect: [0, 0, 0.2, 0.1], style: "redact" },
        { type: "detector", detectors: ["secret"], style: "redact" },
      ],
    });

    // A policy mixing rule kinds is one call, not two providers the caller
    // has to merge.
    assert.ok(regions.some((r) => r.reason === "region"));
    assert.ok(regions.some((r) => r.reason === "detector:secret"));
  });

  it("does not read a single frame when no rule needs one", async () => {
    let called = 0;
    const provider = frameMasking({
      fps: 2,
      locator: new FixtureLocator(() => {
        called += 1;
        return [];
      }),
    });

    await provider.detect({
      mediaUrl: FIXTURE_VIDEO,
      rules: [{ type: "region", rect: [0, 0, 1, 0.1], style: "blur" }],
    });

    // Geometry needs no inference, and sampling a whole recording to
    // discover that would be minutes of work for nothing.
    assert.equal(called, 0);
  });
});

/* ------------------------------------------------ the mask, in the pixels */

describe("the mask reaches the frame", { timeout: 60_000 }, () => {
  /**
   * Every other test here is about the decision. This one is about whether
   * the decision survives the trip through the EDL and ffmpeg's filter graph
   * and actually lands on the pixels — which is the only claim a customer
   * cares about, and the one that a bug in the region geometry, the
   * normalisation, or the `enable=between(...)` expression would break
   * without failing anything above.
   *
   * Measured rather than eyeballed: the sum of absolute differences between
   * neighbouring pixels inside the box. A blur removes high-frequency detail,
   * so that number collapses where the mask is and does not move where it
   * is not.
   */
  const BOX = { x: 128, y: 144, w: 256, h: 36 };
  const WIDTH = 640;
  const HEIGHT = 360;

  async function ffmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(stderr.slice(0, 400))),
      );
    });
  }

  /** Detail inside the box, as mean absolute neighbour difference. */
  async function detail(file: string, atSec: number): Promise<number> {
    const raw = path.join(workDir, `probe-${path.basename(file)}-${atSec}.gray`);
    await ffmpeg([
      "-ss", String(atSec), "-i", file, "-frames:v", "1",
      "-vf", `crop=${BOX.w}:${BOX.h}:${BOX.x}:${BOX.y},format=gray`,
      "-f", "rawvideo", "-y", raw,
    ]);
    const { readFile } = await import("node:fs/promises");
    const pixels = await readFile(raw);
    let sum = 0;
    for (let i = 1; i < pixels.length; i++) sum += Math.abs(pixels[i] - pixels[i - 1]);
    return sum / pixels.length;
  }

  it("blurs where the text was, and leaves the rest of the clip alone", async () => {
    const source = path.join(workDir, "sensitive.mp4");
    const masked = path.join(workDir, "masked.mp4");

    // A noisy bright block standing in for a line of text, on screen for the
    // first two seconds of four. Noise, because a flat block blurs to itself
    // and would make the measurement meaningless.
    await ffmpeg([
      "-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}:d=4:r=25`,
      "-vf",
      `drawbox=x=${BOX.x}:y=${BOX.y}:w=${BOX.w}:h=${BOX.h}:color=white@1:t=fill:` +
        `enable='between(t,0,2)',noise=alls=40:allf=t`,
      "-pix_fmt", "yuv420p", "-y", source,
    ]);

    const provider = frameMasking({
      fps: 4,
      maxEdge: WIDTH,
      locator: new FixtureLocator((frame) =>
        frame.atSec < 2
          ? // The whole line is the address, so the narrowing in
            // `detectors.ts` leaves the box where it is and the measurement
            // below is over exactly the pixels the mask was aimed at.
            [box("sam@meridian.com", [BOX.x / WIDTH, BOX.y / HEIGHT, BOX.w / WIDTH, BOX.h / HEIGHT])]
          : [],
      ),
    });

    const { regions } = await provider.detect({
      mediaUrl: source,
      rules: [{ type: "detector", detectors: ["email"], style: "blur" }],
    });
    assert.equal(regions.length, 1);

    const { filters, out } = buildMaskFilters(
      regions.map((region) => ({
        from: region.at,
        until: Math.min(region.until, 4),
        rect: region.rect,
        style: region.style,
      })),
      "0:v",
      WIDTH,
      HEIGHT,
    );

    await ffmpeg([
      "-i", source,
      "-filter_complex", filters.join(";"),
      "-map", `[${out}]`,
      "-pix_fmt", "yuv420p", "-y", masked,
    ]);

    const whileVisible = await detail(masked, 1);
    const sourceWhileVisible = await detail(source, 1);
    // Almost all of the detail is gone: this is the claim the whole
    // subsystem makes, measured rather than assumed.
    assert.ok(
      whileVisible < sourceWhileVisible * 0.2,
      `expected the box to be blurred at 1s, detail went ${sourceWhileVisible.toFixed(2)} → ${whileVisible.toFixed(2)}`,
    );

    const afterwards = await detail(masked, 3);
    const sourceAfterwards = await detail(source, 3);
    // And the rest of the video is untouched. A mask that runs the whole
    // clip is safe and useless — nobody ships a demo that is blurred
    // throughout.
    assert.ok(
      afterwards > sourceAfterwards * 0.8,
      `expected no blur at 3s, detail went ${sourceAfterwards.toFixed(2)} → ${afterwards.toFixed(2)}`,
    );
  });
});
