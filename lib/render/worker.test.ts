import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { claim, enqueue, getJob } from "@/lib/jobs/queue";
import { LocalStorage, setStorage } from "@/lib/storage";
import { getProviders, setProviders } from "@/lib/providers";
import { processOne } from "./worker";
import { probe, runFfmpeg } from "./ffmpeg";
import type { Edl } from "./edl";
import { plainBrand } from "./edl";

/**
 * The worker's job is to turn a queued row into a stored video and a truthful
 * record of what it produced. That involves a real queue, a real encoder and
 * real bytes on disk, so this test uses all three: anything less would be
 * testing the parts that were never in doubt.
 */

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const RUN = isDatabaseConfigured() && hasFfmpeg();
const WS = "44444444-4444-4444-8444-444444444444";

let dir: string;

before(async () => {
  if (!RUN) return;
  dir = await mkdtemp(path.join(tmpdir(), "demoriff-worker-"));
  setStorage(new LocalStorage(path.join(dir, "storage"), "test-secret"));
  const db = getDb();
  await eraseWorkspace(WS, "test setup");
  await db.insert(s.workspaces).values({ id: WS, slug: "worker-test", name: "Worker Test" });
});

after(async () => {
  if (!RUN) return;
  setStorage(null);
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!RUN) return;
  await getDb().delete(s.jobs).where(eq(s.jobs.workspaceId, WS));
});

async function sourceVideo(): Promise<string> {
  const target = path.join(dir, "source.mp4");
  await runFfmpeg([
    "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=12",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", target,
  ]);
  return target;
}

function edlFor(sourcePath: string): Edl {
  return {
    version: 1,
    projectId: "prj_1",
    locale: "en-US",
    source: { url: `file://${sourcePath}`, durationSec: 12 },
    output: { width: 320, height: 180, fps: 30, container: "mp4", videoCodec: "h264", audioCodec: "aac", crf: 34 },
    clips: [
      { sourceStart: 0, sourceEnd: 3, outputStart: 0, label: "s1" },
      { sourceStart: 6, sourceEnd: 9, outputStart: 3, label: "s2" },
    ],
    zooms: [],
    masks: [],
    captions: [],
    audio: [],
    brand: plainBrand(),
    durationSec: 6,
  };
}

describe("render worker", { skip: RUN ? false : "DATABASE_URL and ffmpeg are both required" }, () => {
  it("renders a queued job, stores the video and records what it produced", async () => {
    const sourcePath = await sourceVideo();
    const { job } = await enqueue({
      workspaceId: WS,
      kind: "render",
      payload: { projectId: "prj_1", edl: edlFor(sourcePath), outputs: ["video"] },
    });

    const outcome = await processOne({ workerId: "w1", scratchRoot: dir });

    assert.equal(outcome?.status, "completed", outcome?.error);
    assert.equal(outcome?.jobId, job.id);
    assert.equal(Math.abs((outcome?.durationSec ?? 0) - 6) < 0.1, true);

    const stored = await getJob(job.id);
    assert.equal(stored?.status, "completed");
    const result = stored?.result as { video?: { status: string }; billedSeconds?: number };
    assert.equal(result.video?.status, "ready");
    // Billed from the probed output, in seconds. Not from the request, which
    // is a prediction, and not rounded up to a minute.
    assert.equal(Math.abs((result.billedSeconds ?? 0) - 6) < 0.1, true);

    // The last step it reported, for the export dialog: real figures, not a 50% placeholder.
    assert.deepEqual(stored?.progress, { stage: "finishing", fraction: 0.97 });

    // The video is actually in storage and is not empty.
    const bytes = await new LocalStorage(path.join(dir, "storage"), "test-secret").get({
      workspaceId: WS,
      path: `renders/${job.id}/render.mp4`,
    });
    assert.equal(bytes.byteLength > 1000, true);
  });

  it("refuses to render with a voice whose consent was withdrawn", async () => {
    const db = getDb();
    await db.delete(s.members).where(eq(s.members.workspaceId, WS));
    const [member] = await db.insert(s.members).values({
      workspaceId: WS, name: "Renata", email: "r@example.com", role: "creator",
    }).returning();
    const [voice] = await db.insert(s.voices).values({
      workspaceId: WS,
      providerVoiceId: "el_clone_revoked",
      name: "Renata",
      kind: "clone",
      consentSubjectId: member.id,
      consentRecordedAt: new Date("2026-03-04T00:00:00Z"),
      // Already withdrawn when the job is claimed — the ordering that matters,
      // because the job was queued while consent still stood.
      revokedAt: new Date("2026-06-01T00:00:00Z"),
    }).returning();

    const sourcePath = await sourceVideo();
    const edl = edlFor(sourcePath);
    const { job } = await enqueue({
      workspaceId: WS,
      kind: "render",
      payload: {
        edl: {
          ...edl,
          audio: [
            { kind: "narration", url: `file://${sourcePath}`, at: 0, durationSec: 1, gainDb: 0, voiceId: voice.id },
          ],
        },
      },
    });

    const outcome = await processOne({ workerId: "w1", scratchRoot: dir });

    assert.equal(outcome?.status, "failed");
    assert.match(outcome?.error ?? "", /consent was withdrawn/);
    const stored = await getJob(job.id);
    // Permanent: no number of retries restores someone's permission.
    assert.match(stored?.lastError ?? "", /permanent:/);

    await db.delete(s.voices).where(eq(s.voices.workspaceId, WS));
    await db.delete(s.members).where(eq(s.members.workspaceId, WS));
  });

  it("narrates a project in its chosen voice and replaces the recording's audio", async () => {
    const db = getDb();
    const [voice] = await db.insert(s.voices).values({
      workspaceId: WS, providerVoiceId: "el_test_studio", name: "Test Studio", kind: "studio",
    }).returning();
    const [project] = await db.insert(s.projects).values({
      workspaceId: WS, slug: "narrated", title: "Narrated", status: "ready", voiceId: voice.id, sourceDurationSec: 12,
    }).returning();
    await db.insert(s.segments).values([
      { projectId: project.id, ordinal: 0, title: "One", startSec: 0, endSec: 3,
        words: [{ w: "Hello", t: 0, d: 1.5 }, { w: "there.", t: 1.5, d: 1.5 }] },
      { projectId: project.id, ordinal: 1, title: "Two", startSec: 6, endSec: 9,
        words: [{ w: "Then", t: 6, d: 1.5 }, { w: "save.", t: 7.5, d: 1.5 }] },
    ]);

    // A synthesizer that hands back one second of tone per request, so the
    // render has real audio to mix without a vendor in the loop.
    const clip = path.join(dir, "narration.wav");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ar", "44100", "-ac", "1", clip]);
    const spoken: string[] = [];
    setProviders({
      ...getProviders(),
      synthesis: {
        name: "stub-synthesis",
        async synthesize(req) {
          spoken.push(req.text);
          return { audioUrl: `file://${clip}`, storageUrl: `file://${clip}`, durationSec: 1, sampleRate: 44100 };
        },
        async listVoices() { return []; },
        async cloneVoice() { throw new Error("not used"); },
      },
    });

    try {
      const sourcePath = await sourceVideo();
      const { job } = await enqueue({
        workspaceId: WS,
        kind: "render",
        payload: { projectId: project.id, sourceUrl: `file://${sourcePath}`, outputs: ["video"] },
      });
      const outcome = await processOne({ workerId: "w1", scratchRoot: dir });
      assert.equal(outcome?.status, "completed", outcome?.error);

      // One reading per chapter, from its words.
      assert.deepEqual(spoken, ["Hello there.", "Then save."]);

      const stored = await getJob(job.id);
      const result = stored?.result as { narration?: { voice: { name: string }; chapters: unknown[] } };
      assert.equal(result.narration?.voice.name, "Test Studio");
      assert.equal(result.narration?.chapters.length, 2);

      // The source had no audio at all; the finished file speaks.
      const bytes = await new LocalStorage(path.join(dir, "storage"), "test-secret").get({
        workspaceId: WS, path: `renders/${job.id}/render.mp4`,
      });
      const rendered = path.join(dir, "narrated.mp4");
      await import("node:fs/promises").then((fs) => fs.writeFile(rendered, bytes));
      assert.equal((await probe(rendered)).hasAudio, true);
    } finally {
      setProviders(null);
      await db.delete(s.projects).where(eq(s.projects.workspaceId, WS));
      await db.delete(s.voices).where(eq(s.voices.workspaceId, WS));
    }
  });

  it("announces a completed render when the submitter asked for one", async () => {
    const sourcePath = await sourceVideo();
    const { job } = await enqueue({
      workspaceId: WS,
      kind: "render",
      payload: { edl: edlFor(sourcePath) },
      webhookUrl: "https://hooks.example/demoriff",
    });

    const outcome = await processOne({ workerId: "w1", scratchRoot: dir });
    assert.equal(outcome?.status, "completed");

    // The announcement is queued, not sent inline: a slow receiver must not
    // hold a render worker hostage.
    const delivery = await claim("w-webhook", ["webhook"]);
    assert.notEqual(delivery, null);
    const payload = delivery!.payload as { url: string; event: { type: string; data: Record<string, unknown> } };
    assert.equal(payload.url, "https://hooks.example/demoriff");
    assert.equal(payload.event.type, "render.completed");
    assert.equal(payload.event.data.renderId, job.id);
    assert.equal(Math.abs(Number(payload.event.data.durationSec) - 6) < 0.1, true);
  });

  it("does not announce anything when no webhook was requested", async () => {
    const sourcePath = await sourceVideo();
    await enqueue({ workspaceId: WS, kind: "render", payload: { edl: edlFor(sourcePath) } });
    await processOne({ workerId: "w1", scratchRoot: dir });
    assert.equal(await claim("w-webhook", ["webhook"]), null);
  });

  it("meters a finished render in seconds, once per project", async () => {
    const sourcePath = await sourceVideo();
    const { usage } = await import("@/lib/billing/metering");
    // Measured as a delta: earlier tests in this file render too, and the
    // workspace's usage is cumulative by design. A project of its own,
    // because a project is charged once a period for its longest render,
    // and the fixture project has been rendered above already.
    const before = (await usage(WS)).usedSeconds;

    const { job } = await enqueue({
      workspaceId: WS, kind: "render", payload: { edl: { ...edlFor(sourcePath), projectId: "prj_metered" } },
    });

    await processOne({ workerId: "w1", scratchRoot: dir });

    const first = await usage(WS);
    const charged = first.usedSeconds - before;
    assert.equal(Math.abs(charged - 6) <= 1, true, `charged ${charged}s for a 6s render`);

    // The same job completing again — a reclaimed lease, a redelivered
    // message — must not bill the customer twice for one video.
    const { meter } = await import("@/lib/billing/metering");
    const repeat = await meter({
      workspaceId: WS, seconds: 6, resourceType: "render",
      resourceId: job.id, idempotencyKey: `render:${job.id}`, projectId: "prj_metered",
    });
    assert.equal(repeat.ok && repeat.duplicate, true);
    assert.equal((await usage(WS)).usedSeconds, first.usedSeconds);

    // The same project rendered again, no longer: a line of zero seconds.
    await enqueue({ workspaceId: WS, kind: "render", payload: { edl: { ...edlFor(sourcePath), projectId: "prj_metered" } } });
    await processOne({ workerId: "w1", scratchRoot: dir });
    assert.equal((await usage(WS)).usedSeconds, first.usedSeconds, "a re-render of the same project is free");
  });

  it("refuses to start a render when the workspace asked to be stopped", async () => {
    const db = getDb();
    await db
      .update(s.workspaces)
      .set({ hardStopAtLimit: true, videoSecondsLimit: 60, videoSecondsUsed: 60 })
      .where(eq(s.workspaces.id, WS));

    const sourcePath = await sourceVideo();
    const { job } = await enqueue({
      workspaceId: WS, kind: "render", payload: { edl: edlFor(sourcePath) },
    });

    const outcome = await processOne({ workerId: "w1", scratchRoot: dir });

    assert.equal(outcome?.status, "failed");
    // Named, not generic: the difference between a customer fixing it in a
    // minute and filing a ticket.
    assert.match(outcome?.error ?? "", /hard stop/);
    const stored = await getJob(job.id);
    // No number of retries produces quota.
    assert.match(stored?.lastError ?? "", /permanent:/);

    await db
      .update(s.workspaces)
      .set({ hardStopAtLimit: false, videoSecondsLimit: 36000, videoSecondsUsed: 0 })
      .where(eq(s.workspaces.id, WS));
  });

  it("returns null rather than spinning when the queue is empty", async () => {
    assert.equal(await processOne({ workerId: "w1", scratchRoot: dir }), null);
  });

  it("dead-letters an impossible render instead of retrying it to the limit", async () => {
    const { job } = await enqueue({
      workspaceId: WS,
      kind: "render",
      // Neither an EDL nor a project to build one from: no number of retries
      // will make this job renderable.
      payload: { outputs: ["video"] },
      maxAttempts: 3,
    });

    const outcome = await processOne({ workerId: "w1", scratchRoot: dir });
    assert.equal(outcome?.status, "failed");

    const stored = await getJob(job.id);
    assert.match(stored?.lastError ?? "", /permanent:/);
  });

  it("leaves no scratch directory behind, on success or on failure", async () => {
    const sourcePath = await sourceVideo();
    const before = await scratchDirs();

    await enqueue({
      workspaceId: WS,
      kind: "render",
      payload: { edl: edlFor(sourcePath) },
    });
    await processOne({ workerId: "w1", scratchRoot: dir });

    await enqueue({
      workspaceId: WS,
      kind: "render",
      payload: { edl: { ...edlFor(sourcePath), source: { url: "file:///nonexistent.mp4", durationSec: 1 } } },
    });
    await processOne({ workerId: "w1", scratchRoot: dir });

    // A 4K intermediate is gigabytes. One leaked per job fills the disk in an
    // afternoon, and then every job fails for a reason that looks unrelated.
    assert.deepEqual(await scratchDirs(), before);
  });
});

async function scratchDirs(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && e.name.startsWith("demoriff-render-")).map((e) => e.name);
}
