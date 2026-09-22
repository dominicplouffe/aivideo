import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Edl } from "./edl";
import {
  anchorExpression, buildAudioFilters, buildCutFilters, buildMaskFilters,
  buildSourceAudioFilters, compile, diagnose,
  parseProgress, probe, runFfmpeg, srtTimestamp, toSrt, zoomExpression,
} from "./ffmpeg";
import { renderEdl } from "./worker";

/**
 * A filter graph is a program. These tests read it as one.
 *
 * The end-to-end test at the bottom renders a synthetic recording through the
 * real FFmpeg and probes the result, which is the only way to know the graph
 * is valid rather than merely plausible. It is skipped where FFmpeg is not
 * installed rather than failing, because a missing binary is an environment
 * fact, not a defect in this code.
 */

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
    captions: [],
    audio: [],
    brand: { colors: [], font: "Inter", captionStyle: "", introSec: 0, outroSec: 0 },
    durationSec: 7,
    ...overrides,
  };
}

// --- the cut ---------------------------------------------------------------

test("each surviving clip is trimmed and rebased before the concat", () => {
  const { filters, out } = buildCutFilters(edl());
  assert.equal(out, "vcat");
  // Constant frame rate first: a screen capture writes frames only when the
  // picture changes, and a trim of that stream would stop at its last frame.
  assert.equal(filters[0], "[0:v]fps=30,split=2[v0][v1]");
  // setpts=PTS-STARTPTS is what makes the join continuous. Without it the
  // video freezes for the length of everything that was cut.
  assert.equal(filters[1], "[v0]trim=start=0:end=4,setpts=PTS-STARTPTS[c0]");
  assert.equal(filters[2], "[v1]trim=start=6:end=9,setpts=PTS-STARTPTS[c1]");
  assert.equal(filters[3], "[c0][c1]concat=n=2:v=1:a=0[vcat]");
});

test("a sped-up clip has its timestamps scaled, and a held clip clones its last frame", () => {
  const { filters } = buildCutFilters(
    edl({
      clips: [
        { sourceStart: 0, sourceEnd: 4, outputStart: 0, speed: 2 },
        { sourceStart: 6, sourceEnd: 8, outputStart: 2, holdSec: 1.5 },
      ],
    }),
  );
  assert.equal(filters[1], "[v0]trim=start=0:end=4,setpts=(PTS-STARTPTS)/2[c0]");
  assert.equal(filters[2], "[v1]trim=start=6:end=8,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.5[c1]");
});

test("a single-clip edit skips the concat entirely", () => {
  const { filters, out } = buildCutFilters(
    edl({ clips: [{ sourceStart: 1, sourceEnd: 3, outputStart: 0 }], durationSec: 2 }),
  );
  assert.equal(out, "c0");
  assert.deepEqual(filters, ["[0:v]fps=30[v0]", "[v0]trim=start=1:end=3,setpts=PTS-STARTPTS[c0]"]);
});

// --- zoom ------------------------------------------------------------------

test("a zoom ramps in, holds, and releases", () => {
  const expression = zoomExpression([
    { at: 4, holdSec: 3, scale: 1.8, anchor: { x: 0.5, y: 0.5 }, easing: "push" },
  ]);
  assert.match(expression, /between\(it,4,4\.35\)/);
  assert.match(expression, /between\(it,4\.35,6\.65\)/);
  assert.match(expression, /between\(it,6\.65,7\)/);
  // Everything outside a keyframe sits at 1 — the unzoomed frame.
  assert.match(expression, /,1\)\)\)$/);
});

test("zoom keyframes nest so the earliest is evaluated first", () => {
  const expression = zoomExpression([
    { at: 0, holdSec: 2, scale: 1.4, anchor: { x: 0.5, y: 0.5 }, easing: "push" },
    { at: 5, holdSec: 2, scale: 2, anchor: { x: 0.5, y: 0.5 }, easing: "push" },
  ]);
  assert.equal(expression.indexOf("between(it,0,"), expression.search(/between\(it,0,/));
  assert.equal(expression.indexOf("between(it,0,") < expression.indexOf("between(it,5,"), true);
});

test("the anchor is clamped so a zoom near an edge never shows black", () => {
  const expression = anchorExpression(
    [{ at: 0, holdSec: 2, scale: 2, anchor: { x: 0.95, y: 0.5 }, easing: "push" }],
    "x",
  );
  assert.match(expression, /max\(0,min\(iw-iw\/zoom,/);
  // With no keyframe active, the window is centred.
  assert.match(expression, /,\(iw-iw\/zoom\)\/2\)$/);
});

// --- masking ---------------------------------------------------------------

test("a redaction is a single filled box, not a copy of the frame", () => {
  const { filters, out } = buildMaskFilters(
    [{ from: 1, until: 2, rect: [0.5, 0.5, 0.25, 0.1], style: "redact" }],
    "vin",
    1280,
    720,
  );
  assert.equal(filters.length, 1);
  assert.equal(out, "mk0");
  assert.match(filters[0], /drawbox=x=640:y=360:w=320:h=72/);
  assert.match(filters[0], /enable='between\(t,1,2\)'/);
});

test("a blur radius stays inside what the chroma planes allow", () => {
  // A 1280x720 frame with a 3%-tall band: 22px high, so the chroma plane is
  // 11px and any radius above 5 is rejected by the filter outright.
  const { filters } = buildMaskFilters(
    [{ from: 0, until: 1, rect: [0.1, 0.1, 0.3, 0.03], style: "blur" }],
    "vin",
    1280,
    720,
  );
  const blur = filters.find((f) => f.includes("boxblur"))!;
  const radius = Number(/boxblur=(\d+):/.exec(blur)![1]);
  const height = Number(/crop=\d+:(\d+):/.exec(blur)![1]);
  assert.equal(radius <= Math.floor(height / 4), true);
  assert.equal(radius >= 1, true);
});

test("mask geometry is rounded to even pixels", () => {
  const { filters } = buildMaskFilters(
    [{ from: 0, until: 1, rect: [0.333, 0.111, 0.137, 0.091], style: "pixelate" }],
    "vin",
    1280,
    720,
  );
  const crop = /crop=(\d+):(\d+):(\d+):(\d+)/.exec(filters.find((f) => f.includes("crop"))!)!;
  for (const value of crop.slice(1)) {
    assert.equal(Number(value) % 2, 0, `${value} is not even`);
  }
});

// --- audio -----------------------------------------------------------------

test("no audio at all produces no audio graph", () => {
  const { filters, out } = buildAudioFilters(edl());
  assert.deepEqual(filters, []);
  assert.equal(out, null);
});

test("narration is delayed to its place on the timeline", () => {
  const { filters } = buildAudioFilters(
    edl({ audio: [{ kind: "narration", url: "n", at: 1.25, durationSec: 2, gainDb: 0 }] }),
  );
  assert.equal(filters[0], "[1:a]adelay=1250:all=1,volume=0dB[a0]");
});

test("a fitted narration is stretched before it is delayed", () => {
  const { filters } = buildAudioFilters(
    edl({ audio: [{ kind: "narration", url: "n", at: 2, durationSec: 2, gainDb: 0, tempo: 1.15 }] }),
  );
  // The stretch applies to the clip; the delay places the shortened clip.
  assert.equal(filters[0], "[1:a]atempo=1.15,adelay=2000:all=1,volume=0dB[a0]");
});

test("music is ducked against the narration rather than sitting under it", () => {
  const { filters, out } = buildAudioFilters(
    edl({
      audio: [
        { kind: "narration", url: "n", at: 0, durationSec: 3, gainDb: 0 },
        { kind: "music", url: "m", at: 0, durationSec: 7, gainDb: -26, ducksBy: 8 },
      ],
    }),
  );
  assert.equal(out, "aout");
  assert.equal(filters.some((f) => f.includes("sidechaincompress")), true);
  // The pad is bounded: an unbounded apad writes silence until the disk fills.
  assert.equal(filters.some((f) => f.includes("apad=whole_dur=7")), true);
});

// --- captions --------------------------------------------------------------

test("srt timestamps are zero-padded to the millisecond", () => {
  assert.equal(srtTimestamp(0), "00:00:00,000");
  assert.equal(srtTimestamp(3661.5), "01:01:01,500");
  assert.equal(srtTimestamp(-1), "00:00:00,000");
});

test("captions become a numbered srt file", () => {
  const srt = toSrt(edl({ captions: [{ from: 0, until: 1.5, text: "Open the Brand Kit." }] }));
  assert.equal(srt.startsWith("1\n00:00:00,000 --> 00:00:01,500\nOpen the Brand Kit."), true);
});

// --- the whole invocation --------------------------------------------------

test("the output is encoded for players that actually exist", () => {
  const { args } = compile(edl(), { sourcePath: "/in.mp4", outputPath: "/out.mp4" });
  // yuv420p and faststart are not preferences. Without them the file either
  // will not play or will not start until it has fully downloaded.
  assert.equal(args.includes("yuv420p"), true);
  assert.equal(args.includes("+faststart"), true);
  assert.equal(args.includes("-an"), true);
});

test("a filter path with a colon in it is escaped", () => {
  const { args } = compile(edl({ captions: [{ from: 0, until: 1, text: "hi" }] }), {
    sourcePath: "/in.mp4",
    outputPath: "/out.mp4",
    subtitlePath: "C:/tmp/captions.srt",
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /subtitles='C\\:\/tmp\/captions\.srt'/);
});

// --- diagnostics -----------------------------------------------------------

test("the error that gets reported is the error, not the encoder's statistics", () => {
  const stderr = [
    "[boxblur @ 0x1] Invalid chroma_param radius value 20, must be >= 0 and <= 18",
    "[libx264 @ 0x2] frame I:1 Avg QP:20.00",
    "[libx264 @ 0x2] kb/s:44.15",
    "[aac @ 0x3] Qavg: 64600.418",
  ].join("\n");
  assert.match(diagnose(stderr), /Invalid chroma_param/);
  assert.equal(diagnose(stderr).includes("Qavg"), false);
});

test("progress is read from ffmpeg's time reports", () => {
  assert.equal(parseProgress("frame=  90 fps=30 time=00:00:03.00 bitrate=N/A", 10), 0.3);
  assert.equal(parseProgress("frame=  90 fps=30 time=00:01:00.00", 10), 1);
  assert.equal(parseProgress("Press [q] to stop", 10), null);
  assert.equal(parseProgress("time=00:00:03.00", 0), null);
});

// --- end to end ------------------------------------------------------------

test("renders a real video: the cut, a zoom, two masks and burned-in captions", { skip: !hasFfmpeg() && "ffmpeg is not installed" }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "demoriff-e2e-"));
  try {
    const sourcePath = path.join(dir, "source.mp4");
    await runFfmpeg([
      "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=20",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath,
    ]);

    const plan = edl({
      source: { url: `file://${sourcePath}`, durationSec: 20 },
      output: { width: 640, height: 360, fps: 30, container: "mp4", videoCodec: "h264", audioCodec: "aac", crf: 30 },
      clips: [
        { sourceStart: 0, sourceEnd: 4, outputStart: 0, label: "s1" },
        { sourceStart: 6, sourceEnd: 9, outputStart: 4, label: "s2" },
        { sourceStart: 14, sourceEnd: 17, outputStart: 7, label: "s3" },
      ],
      zooms: [{ at: 4, holdSec: 3, scale: 1.8, anchor: { x: 0.7, y: 0.4 }, easing: "push" }],
      masks: [
        { from: 0, until: 4, rect: [0.1, 0.1, 0.25, 0.1], style: "blur" },
        { from: 7, until: 10, rect: [0.5, 0.7, 0.3, 0.12], style: "redact" },
      ],
      captions: [{ from: 0, until: 2.5, text: "Open the Brand Kit." }],
      durationSec: 10,
    });

    const result = await renderEdl(plan, { scratchRoot: dir });
    const probed = await probe(result.outputPath);

    // The rendered duration is the sum of the surviving clips, to the frame.
    assert.equal(Math.abs(probed.durationSec - 10) < 0.05, true, `got ${probed.durationSec}s`);
    assert.equal(probed.width, 640);
    assert.equal(probed.height, 360);
    assert.equal(result.bytes > 0, true);

    await rm(result.dir, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a video with narration is as long as its edit, not its narration", { skip: !hasFfmpeg() && "ffmpeg is not installed" }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "demoriff-audio-"));
  try {
    const sourcePath = path.join(dir, "source.mp4");
    const narrationPath = path.join(dir, "narration.m4a");
    await runFfmpeg([
      "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=10",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath,
    ]);
    // Narration deliberately shorter than the edit: the naive `-shortest`
    // arrangement truncates the video to match it.
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac", narrationPath]);

    const plan = edl({
      source: { url: `file://${sourcePath}`, durationSec: 10 },
      output: { width: 320, height: 180, fps: 30, container: "mp4", videoCodec: "h264", audioCodec: "aac", crf: 34 },
      clips: [{ sourceStart: 0, sourceEnd: 5, outputStart: 0, label: "s1" }],
      audio: [{ kind: "narration", url: `file://${narrationPath}`, at: 0.5, durationSec: 2, gainDb: 0 }],
      durationSec: 5,
    });

    const result = await renderEdl(plan, { scratchRoot: dir });
    const probed = await probe(result.outputPath);

    assert.equal(Math.abs(probed.durationSec - 5) < 0.1, true, `got ${probed.durationSec}s`);
    assert.equal(probed.hasAudio, true);

    await rm(result.dir, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an invalid edl is refused before a worker spends a minute on it", async () => {
  await assert.rejects(
    () => renderEdl(edl({ clips: [], durationSec: 0 })),
    (error: unknown) => error instanceof Error && /invalid EDL/.test(error.message),
  );
});

test("the source's own audio is cut to match the video", () => {
  const { filters, out } = buildSourceAudioFilters(
    edl({
      clips: [
        { sourceStart: 0, sourceEnd: 2, outputStart: 0 },
        { sourceStart: 5, sourceEnd: 7, outputStart: 2 },
      ],
      durationSec: 4,
    }),
  );

  assert.equal(filters.length, 3, "one atrim per clip, plus the concat");
  assert.match(filters[0], /\[0:a\]atrim=start=0:end=2,asetpts=PTS-STARTPTS\[sa0\]/);
  assert.match(filters[1], /\[0:a\]atrim=start=5:end=7,asetpts=PTS-STARTPTS\[sa1\]/);
  // Without asetpts the stream keeps its original timestamps and drifts out
  // of sync by the length of everything removed — three seconds, here.
  assert.match(filters[2], /concat=n=2:v=0:a=1\[sacat\]/);
  assert.equal(out, "sacat");
});

test("a recording with audio and no narration is not rendered silent", () => {
  // The bug this guards: the audio graph was built for synthesized
  // narration, so an ordinary screen recording came out with no sound.
  const one = edl({ clips: [{ sourceStart: 0, sourceEnd: 4, outputStart: 0 }], durationSec: 4 });
  const plan = compile(one, {
    sourcePath: "/tmp/in.webm",
    outputPath: "/tmp/out.mp4",
    sourceHasAudio: true,
  });

  assert.ok(!plan.args.includes("-an"), "audio is not disabled");
  assert.ok(plan.args.includes("-c:a"), "an audio codec is chosen");
  const graph = plan.args[plan.args.indexOf("-filter_complex") + 1];
  assert.match(graph, /\[0:a\]atrim/);
});

test("a silent source is still rendered, without audio", () => {
  const one = edl({ clips: [{ sourceStart: 0, sourceEnd: 4, outputStart: 0 }], durationSec: 4 });
  const plan = compile(one, {
    sourcePath: "/tmp/in.webm",
    outputPath: "/tmp/out.mp4",
    sourceHasAudio: false,
  });

  assert.ok(plan.args.includes("-an"), "no audio stream is mapped");
  const graph = plan.args[plan.args.indexOf("-filter_complex") + 1];
  assert.ok(!graph.includes("[0:a]"), "the graph never references a stream that is not there");
});
