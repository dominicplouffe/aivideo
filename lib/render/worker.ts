import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { claim, complete, fail, heartbeat, type Job } from "@/lib/jobs/queue";
import { getStorage } from "@/lib/storage";
import { ProviderError } from "@/lib/providers/errors";
import { emitEvent, type WebhookEventType } from "@/lib/webhooks/outbound";
import { buildEdl, validateEdl, type Edl } from "./edl";
import { compile, probe, runFfmpeg, toSrt } from "./ffmpeg";

/**
 * The render worker.
 *
 * Claims a render job, resolves the EDL, runs FFmpeg, stores the result and
 * reports what it actually produced. Four things here exist because of how
 * this fails in production rather than in a diagram:
 *
 *  1. **The heartbeat keeps running while FFmpeg does.** A four-minute render
 *     outlives the queue's 60-second lease. Without a heartbeat the job is
 *     reclaimed mid-encode and rendered twice, and the customer is billed
 *     twice for one video.
 *  2. **The scratch directory is always removed.** A 4K intermediate is
 *     gigabytes; a worker that leaks one per job fills its disk in an
 *     afternoon and then fails every job for a reason that looks unrelated.
 *  3. **Billing is recorded at completion, from the probed output.** Not from
 *     the request, which is a prediction, and not from the EDL, which is an
 *     intention. The customer is charged for the seconds that exist.
 *  4. **A failed render is reported with FFmpeg's own diagnosis**, so a
 *     dead-lettered job can be read rather than reproduced.
 */

const HEARTBEAT_MS = 20_000;

export interface RenderWorkerOptions {
  workerId: string;
  /** Resolves a job's payload into an EDL. Injectable for tests. */
  resolveEdl?: (job: Job) => Promise<Edl>;
  /** Where intermediates live. Defaults to the system temp directory. */
  scratchRoot?: string;
  ffmpegBinary?: string;
  ffprobeBinary?: string;
  onProgress?: (jobId: string, fraction: number) => void;
}

export interface RenderOutcome {
  jobId: string;
  status: "completed" | "failed";
  durationSec?: number;
  bytes?: number;
  storageKey?: string;
  error?: string;
}

/** Downloads an EDL's source and audio into the scratch directory. */
async function stage(edl: Edl, dir: string): Promise<{ sourcePath: string; audioPaths: string[] }> {
  const sourcePath = path.join(dir, "source" + (path.extname(new URL(edl.source.url, "file:///").pathname) || ".mp4"));
  await writeFile(sourcePath, await fetchBytes(edl.source.url));

  const audioPaths: string[] = [];
  for (const [i, track] of edl.audio.entries()) {
    const target = path.join(dir, `audio-${i}.bin`);
    await writeFile(target, await fetchBytes(track.url));
    audioPaths.push(target);
  }

  return { sourcePath, audioPaths };
}

/** Reads a `file://`, `http(s)://` or storage-signed URL into memory. */
async function fetchBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));
  const response = await fetch(url);
  if (!response.ok) {
    throw new ProviderError(`Could not fetch render input ${url}: ${response.status}.`, {
      provider: "render-worker",
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
    });
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Renders one EDL to a file and reports what came out.
 *
 * Separated from the queue mechanics so it can be tested against a real
 * FFmpeg without a database.
 */
export async function renderEdl(
  edl: Edl,
  options: {
    scratchRoot?: string;
    ffmpegBinary?: string;
    ffprobeBinary?: string;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<{ outputPath: string; dir: string; durationSec: number; bytes: number }> {
  const problems = validateEdl(edl);
  if (problems.length > 0) {
    // A bad EDL is a bug in the editor, not a transient failure. Retrying it
    // three times produces the same error three times more slowly.
    throw new ProviderError(`Refusing to render an invalid EDL: ${problems.join(" ")}`, {
      provider: "render-worker",
      retryable: false,
    });
  }

  const dir = await mkdtemp(path.join(options.scratchRoot ?? tmpdir(), "demoriff-render-"));
  try {
    const { sourcePath, audioPaths } = await stage(edl, dir);

    let subtitlePath: string | undefined;
    if (edl.captions.length > 0) {
      subtitlePath = path.join(dir, "captions.srt");
      await writeFile(subtitlePath, toSrt(edl), "utf8");
    }

    const outputPath = path.join(dir, `render.${edl.output.container}`);
    const plan = compile(edl, { sourcePath, outputPath, audioPaths, subtitlePath });

    await runFfmpeg(plan.args, {
      binary: options.ffmpegBinary,
      durationSec: edl.durationSec,
      onProgress: options.onProgress,
    });

    const probed = await probe(outputPath, options.ffprobeBinary);
    const bytes = (await readFile(outputPath)).byteLength;

    return { outputPath, dir, durationSec: probed.durationSec, bytes };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Refuses a render whose narration was spoken by a withdrawn voice.
 *
 * Consent is not a checkbox at creation time. Someone who recorded a voice
 * clone for their employer and then left can withdraw it, and the promise
 * that makes that meaningful is that no video is produced with their voice
 * afterwards — including a re-render of a project approved months ago. The
 * check belongs here, at the last moment before the bytes exist, because
 * every earlier gate can be passed by a job that was queued before the
 * revocation.
 *
 * A voice this database has never seen is allowed through: unknown is not
 * the same as revoked, and treating it as such would fail every render in a
 * deployment whose voices are not yet imported.
 */
async function assertVoicesUsable(edl: Edl): Promise<void> {
  const voiceIds = edl.audio
    .filter((track) => track.kind === "narration" && track.voiceId)
    .map((track) => track.voiceId!);
  if (voiceIds.length === 0) return;

  const { isDatabaseConfigured } = await import("@/lib/db/client");
  if (!isDatabaseConfigured()) return;

  const { findRevoked } = await import("@/lib/db/repositories/voices");
  const revoked = await findRevoked(voiceIds);
  if (revoked.length === 0) return;

  throw new ProviderError(
    `Refusing to render: consent was withdrawn for ${revoked
      .map((voice) => `${voice.name} (${voice.id})`)
      .join(", ")}. Re-record the narration with a voice that is still permitted.`,
    { provider: "render-worker", retryable: false },
  );
}

/**
 * Claims and processes one job. Returns null when the queue is empty.
 *
 * One job per call, by design: a worker loop belongs to the process that owns
 * the shutdown signal, not to a library function that cannot be interrupted.
 */
export async function processOne(options: RenderWorkerOptions): Promise<RenderOutcome | null> {
  const job = await claim(options.workerId, ["render"]);
  if (!job) return null;

  const beat = setInterval(() => {
    void heartbeat(job.id, options.workerId);
  }, HEARTBEAT_MS);
  // Keep the heartbeat from holding the process open at shutdown.
  beat.unref?.();

  let dir: string | null = null;
  try {
    const edl = await (options.resolveEdl ?? defaultResolveEdl)(job);
    await assertVoicesUsable(edl);

    const result = await renderEdl(edl, {
      scratchRoot: options.scratchRoot,
      ffmpegBinary: options.ffmpegBinary,
      ffprobeBinary: options.ffprobeBinary,
      onProgress: (fraction) => options.onProgress?.(job.id, fraction),
    });
    dir = result.dir;

    const key = {
      workspaceId: job.workspaceId,
      path: `renders/${job.id}/render.${edl.output.container}`,
    };
    await getStorage().put(key, new Uint8Array(await readFile(result.outputPath)), "video/mp4");
    const signed = await getStorage().signedReadUrl(key);

    await complete(job.id, options.workerId, {
      video: { status: "ready", url: signed.url, key: `${key.workspaceId}/${key.path}` },
      // Seconds, not minutes: metering in minutes means rounding, and
      // rounding in our favour on every render is a choice, not an accident.
      billedSeconds: result.durationSec,
      bytes: result.bytes,
      renderedAt: new Date().toISOString(),
    });

    await announce(job, "render.completed", {
      renderId: job.id,
      projectId: edl.projectId,
      locale: edl.locale,
      durationSec: result.durationSec,
      bytes: result.bytes,
      url: signed.url,
    });

    return {
      jobId: job.id,
      status: "completed",
      durationSec: result.durationSec,
      bytes: result.bytes,
      storageKey: `${key.workspaceId}/${key.path}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A ProviderError that says "do not retry" is honoured by exhausting the
    // attempts immediately rather than letting backoff repeat a certain
    // failure for the next twenty minutes.
    const permanent = error instanceof ProviderError && !error.retryable;
    const outcome = await fail(job.id, options.workerId, permanent ? `permanent: ${message}` : message);
    // Announce a failure only once the queue has stopped retrying it. A
    // customer does not want three "render failed" alerts for one render
    // that eventually succeeded on the third attempt.
    if (outcome.status === "dead") {
      await announce(job, "render.failed", {
        renderId: job.id,
        projectId: (job.payload as { projectId?: string }).projectId ?? null,
        error: message,
        attempts: job.attempts,
      });
    }
    return { jobId: job.id, status: "failed", error: message };
  } finally {
    clearInterval(beat);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Queues the outcome announcement, when the submitter asked for one.
 *
 * A failure to *queue* a webhook must never fail the render that succeeded.
 * The video exists and is stored; a missing notification is a smaller
 * problem than a job marked failed after its work was done.
 */
async function announce(
  job: Job,
  type: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  if (!job.webhookUrl) return;
  try {
    await emitEvent({
      workspaceId: job.workspaceId,
      type,
      url: job.webhookUrl,
      data,
      // One announcement per job per outcome, however often this runs.
      idempotencyKey: `${type}:${job.id}`,
    });
  } catch (error) {
    console.error(`[render] could not queue ${type} for ${job.id}:`, error);
  }
}

/**
 * Builds an EDL from a job payload using the project's stored edit.
 *
 * Kept separate from `processOne` so a deployment can render from a
 * pre-computed EDL instead — a re-render after a copy change should not have
 * to re-derive the whole edit.
 */
async function defaultResolveEdl(job: Job): Promise<Edl> {
  const payload = job.payload as {
    projectId?: string;
    edl?: Edl;
    sourceUrl?: string;
    video?: { resolution?: string; fps?: number } | null;
  };

  if (payload.edl) return payload.edl;
  if (!payload.projectId || !payload.sourceUrl) {
    throw new ProviderError(
      "Render job carries neither an EDL nor a project and source to build one from.",
      { provider: "render-worker", retryable: false },
    );
  }

  const { getProject } = await import("@/lib/data");
  const project = await getProject(payload.projectId);
  if (!project) {
    throw new ProviderError(`Render job references unknown project ${payload.projectId}.`, {
      provider: "render-worker",
      retryable: false,
    });
  }

  return buildEdl({
    project,
    sourceUrl: payload.sourceUrl,
    resolution: (payload.video?.resolution as "1080p") ?? "1080p",
    fps: (payload.video?.fps as 30 | 60) ?? 30,
  });
}
