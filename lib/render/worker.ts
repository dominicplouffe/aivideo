import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { claim, complete, fail, heartbeat, type Job } from "@/lib/jobs/queue";
import { getStorage } from "@/lib/storage";
import { ProviderError } from "@/lib/providers/errors";
import { recordQuietly } from "@/lib/audit/log";
import { checkBeforeWork, markNoticeSent, meter } from "@/lib/billing/metering";
import { emitEvent, type WebhookEventType } from "@/lib/webhooks/outbound";
import { buildEdl, validateEdl, type Edl, totalDurationSec } from "./edl";
import { compile, probe, runFfmpeg, toSrt } from "./ffmpeg";
import { narrate, type NarrationReport } from "./narration";
import { codeVersion } from "@/lib/version";

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
  /**
   * Adds the project's chosen voice to an EDL, or returns null when the
   * project keeps the voice on its recording. Injectable for tests.
   */
  narrate?: (job: Job, edl: Edl) => Promise<{ edl: Edl; report: NarrationReport } | null>;
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

/**
 * The file extension a URL implies.
 *
 * FFmpeg picks a demuxer partly from the filename, and a WebM written to
 * `source.mp4` is a container mismatch it reports as a decode error twenty
 * lines deep. Query strings are stripped first: `?sig=…` is not an extension.
 */
function extensionOf(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  return path.extname(withoutQuery);
}

/** Downloads an EDL's source and audio into the scratch directory. */
async function stage(edl: Edl, dir: string): Promise<{ sourcePath: string; audioPaths: string[]; logoPath: string | undefined }> {
  const sourcePath = path.join(dir, "source" + (extensionOf(edl.source.url) || ".mp4"));
  await writeFile(sourcePath, await fetchBytes(edl.source.url));

  const audioPaths: string[] = [];
  for (const [i, track] of edl.audio.entries()) {
    // Named for what it is, for the same reason as the source above.
    const target = path.join(dir, `audio-${i}${extensionOf(track.url) || ".bin"}`);
    await writeFile(target, await fetchBytes(track.url));
    audioPaths.push(target);
  }

  // The brand's logo, when the kit has one. Fetched the same way as the
  // take: it lives in the workspace's storage, behind the same credentials.
  let logoPath: string | undefined;
  if (edl.brand.logo) {
    logoPath = path.join(dir, "logo" + (extensionOf(edl.brand.logo.url) || ".png"));
    await writeFile(logoPath, await fetchBytes(edl.brand.logo.url));
  }

  return { sourcePath, audioPaths, logoPath };
}

/** Reads a `file://`, `http(s)://` or storage-signed URL into memory. */
async function fetchBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));

  // `storage://<workspaceId>/<path>` — the scheme for media that has no
  // public URL and should not be given one. A recording lives behind a
  // session cookie, and the worker already holds the storage credentials;
  // making it round-trip through HTTP would mean publishing every customer's
  // screen for the duration of a render.
  if (url.startsWith("storage://")) {
    const rest = url.slice("storage://".length);
    const slash = rest.indexOf("/");
    if (slash < 1 || slash === rest.length - 1) {
      throw new ProviderError(`Malformed storage URL: ${url}`, {
        provider: "render-worker",
        retryable: false,
      });
    }
    return getStorage().get({
      workspaceId: rest.slice(0, slash),
      path: rest.slice(slash + 1),
    });
  }

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
): Promise<{ outputPath: string; sourcePath: string; dir: string; durationSec: number; bytes: number }> {
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
    const { sourcePath, audioPaths, logoPath } = await stage(edl, dir);

    let subtitlePath: string | undefined;
    if (edl.captions.length > 0) {
      subtitlePath = path.join(dir, "captions.srt");
      await writeFile(subtitlePath, toSrt(edl), "utf8");
    }

    // Probed, not assumed: the graph references `[0:a]` when the source has
    // audio, and referencing it on a silent file fails the whole render.
    const source = await probe(sourcePath, options.ffprobeBinary);

    const outputPath = path.join(dir, `render.${edl.output.container}`);
    const plan = compile(edl, {
      sourcePath,
      outputPath,
      audioPaths,
      subtitlePath,
      logoPath,
      sourceHasAudio: source.hasAudio,
    });

    await runFfmpeg(plan.args, {
      binary: options.ffmpegBinary,
      // The cards count: progress is measured against the whole file.
      durationSec: totalDurationSec(edl),
      onProgress: options.onProgress,
    });

    const probed = await probe(outputPath, options.ffprobeBinary);
    const bytes = (await readFile(outputPath)).byteLength;

    return { outputPath, sourcePath, dir, durationSec: probed.durationSec, bytes };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Files the finished video against its project.
 *
 * Best-effort on purpose. The video exists and is already in storage by the
 * time this runs; failing the job here would tell a customer their render
 * failed while holding the file it produced.
 */
async function recordAsset(
  job: Job,
  edl: Edl,
  storageKey: string,
  kind: "video" | "guide",
): Promise<void> {
  try {
    const { isDatabaseConfigured } = await import("@/lib/db/client");
    if (!isDatabaseConfigured()) return;

    // The repository, not `lib/data`. The data access layer is `server-only`
    // and authorizes against a signed-in actor; this process is neither in a
    // React render nor acting for a person, and importing it here throws
    // before it can do anything useful.
    const { getProjectById } = await import("@/lib/db/repositories/projects");
    const project = await getProjectById(job.workspaceId, edl.projectId);
    if (!project) return;

    const { recordRenderedAsset } = await import("@/lib/db/repositories/assets");
    await recordRenderedAsset({
      workspaceId: job.workspaceId,
      projectId: edl.projectId,
      kind,
      locale: edl.locale,
      storageKey,
      // The project's slug, which a person chose and can read. Minted once
      // and never changed, so an embed published today still resolves after
      // tomorrow's re-render.
      publicSlug: project.slug,
    });
  } catch (error) {
    console.error(`[render] could not file the asset for job ${job.id}:`, error);
  }
}

/**
 * Writes the step-by-step guide for a job that asked for one.
 *
 * Two files, because they have two readers. `guide.json` is what the guide
 * editor loads — structured steps with a storage key per screenshot, so the
 * app never has to parse Markdown to render a page. `guide.md` is what a
 * person downloads and pastes into a help centre.
 *
 * Best-effort, like `recordAsset`: a guide that could not be written is a
 * missing document, not a failed video.
 */
async function produceGuide(
  job: Job,
  edl: Edl,
  sourcePath: string,
  ffmpegBinary?: string,
): Promise<{ status: string; key: string; steps: number } | null> {
  const outputs = (job.payload.outputs as string[] | undefined) ?? [];
  if (!outputs.includes("guide")) return null;

  try {
    const { buildGuide } = await import("./guide");
    const built = await buildGuide(edl, {
      title: (job.payload.title as string) || "Walkthrough",
      sourcePath,
      ffmpegBinary,
      // Relative, so the Markdown works wherever the folder is unpacked.
      imageBase: ".",
    });

    const storage = getStorage();
    const prefix = `renders/${job.id}`;

    for (const step of built.steps) {
      if (!step.screenshot) continue;
      await storage.put(
        { workspaceId: job.workspaceId, path: `${prefix}/${step.screenshotName}` },
        step.screenshot,
        "image/png",
      );
    }

    const document = {
      title: (job.payload.title as string) || "Walkthrough",
      locale: edl.locale,
      steps: built.steps.map((step) => ({
        ordinal: step.ordinal,
        title: step.title,
        body: step.body,
        atSec: step.atSec,
        screenshotKey: step.screenshot ? `${job.workspaceId}/${prefix}/${step.screenshotName}` : null,
      })),
    };

    await storage.put(
      { workspaceId: job.workspaceId, path: `${prefix}/guide.json` },
      new TextEncoder().encode(JSON.stringify(document, null, 2)),
      "application/json",
    );
    await storage.put(
      { workspaceId: job.workspaceId, path: `${prefix}/guide.md` },
      new TextEncoder().encode(built.markdown),
      "text/markdown",
    );

    const key = `${job.workspaceId}/${prefix}/guide.json`;
    await recordAsset(job, edl, key, "guide");
    return { status: "ready", key, steps: built.steps.length };
  } catch (error) {
    console.error(`[render] could not build the guide for job ${job.id}:`, error);
    return null;
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
 * Refuses a render that a workspace's hard stop forbids.
 *
 * Checked here, before the encode, because refusing is only useful before
 * the compute is spent. A workspace that has run out and asked to be stopped
 * gets a clear reason rather than a generic failure — the difference between
 * a customer fixing it in a minute and filing a ticket.
 */
async function assertQuota(job: Job): Promise<void> {
  const { isDatabaseConfigured } = await import("@/lib/db/client");
  if (!isDatabaseConfigured()) return;

  const verdict = await checkBeforeWork(job.workspaceId);
  if (verdict.ok) return;

  throw new ProviderError(
    `This workspace has used its ${Math.round(verdict.snapshot.limitSeconds / 60)} included ` +
      `minutes and has a hard stop enabled, so rendering is paused. Add a top-up or turn the ` +
      `hard stop off in billing settings.`,
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
    let edl = await (options.resolveEdl ?? defaultResolveEdl)(job);
    const narrated = await (options.narrate ?? defaultNarrate)(job, edl);
    if (narrated) edl = narrated.edl;
    await assertVoicesUsable(edl);
    await assertQuota(job);

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

    // An asset row, so the finished video outlives the job that made it.
    // Without this, a render existed only inside a queue row — the share
    // page, the embed and the library had no way to find the file, and a
    // purged job took the only pointer to it with it.
    await recordAsset(job, edl, `${key.workspaceId}/${key.path}`, "video");

    // The written walkthrough, from the same EDL and the same frames. It is
    // built after the video rather than beside it because it reads the
    // staged source file, which only exists while the render's scratch
    // directory does.
    const guide = await produceGuide(job, edl, result.sourcePath, options.ffmpegBinary);

    await complete(job.id, options.workerId, {
      video: { status: "ready", url: signed.url, key: `${key.workspaceId}/${key.path}` },
      ...(guide ? { guide } : {}),
      // Which voice spoke, and how each chapter's reading was fitted to its
      // footage. The export dialog reads this to say where a chapter ran long.
      ...(narrated ? { narration: narrated.report } : {}),
      // Which code produced this. The app compares it with its own and warns
      // when a worker started before the latest change did the rendering.
      workerVersion: codeVersion(),
      // Seconds, not minutes: metering in minutes means rounding, and
      // rounding in our favour on every render is a choice, not an accident.
      billedSeconds: result.durationSec,
      bytes: result.bytes,
      renderedAt: new Date().toISOString(),
    });

    // Metered before it is announced, and keyed on the job id. A job whose
    // lease expired is reclaimed and can complete twice; without that key
    // the customer pays twice for one video and hears about it from an
    // invoice rather than from us.
    const metered = await meter({
      workspaceId: job.workspaceId,
      seconds: result.durationSec,
      resourceType: "render",
      resourceId: job.id,
      idempotencyKey: `render:${job.id}`,
      metadata: { projectId: edl.projectId, locale: edl.locale },
    }).catch((error) => {
      // The video exists. Failing the job now would leave the customer with
      // a file they were told they did not get.
      console.error(`[render] could not meter ${job.id}:`, error);
      return null;
    });

    if (metered?.ok && metered.noticeDue) {
      await markNoticeSent(job.workspaceId);
      await announce(job, "usage.warning", {
        usedSeconds: metered.snapshot.usedSeconds,
        allowanceSeconds: metered.snapshot.limitSeconds + metered.snapshot.topupSeconds,
        fractionUsed: Number(metered.snapshot.fractionUsed.toFixed(3)),
        hardStopAtLimit: metered.snapshot.hardStopAtLimit,
      });
    }

    // Recorded quietly: the file exists and is stored, and reporting a
    // finished render as failed because the trail was unavailable would
    // leave the two records disagreeing forever. The failure is still loud
    // in the operator's log.
    await recordQuietly({
      workspaceId: job.workspaceId,
      action: "render.completed",
      resourceType: "render",
      resourceId: job.id,
      metadata: {
        projectId: edl.projectId,
        locale: edl.locale,
        billedSeconds: result.durationSec,
        bytes: result.bytes,
        voices: edl.audio.filter((t) => t.voiceId).map((t) => t.voiceId),
      },
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
    const outcome = await fail(job.id, options.workerId, permanent ? `permanent: ${message}` : message, {
      permanent,
    });
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
 * Narrates the job's project in its chosen voice, when it has one.
 *
 * Reads the project through the repository, like `defaultResolveEdl`. A job
 * that carries only an EDL and no project — the worker's own tests, a
 * re-render from a stored EDL — has no voice choice to honour and keeps the
 * recording's audio.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function defaultNarrate(job: Job, edl: Edl) {
  const payload = job.payload as { projectId?: string };
  // A job whose project id is not one of ours — a test's "prj_1", a
  // pre-computed EDL from elsewhere — has no stored voice choice to read.
  if (!payload.projectId || !UUID.test(payload.projectId)) return null;

  const { isDatabaseConfigured } = await import("@/lib/db/client");
  if (!isDatabaseConfigured()) return null;

  const { getProjectById } = await import("@/lib/db/repositories/projects");
  const project = await getProjectById(job.workspaceId, payload.projectId);
  if (!project?.voiceId) return null;

  const { getVoice } = await import("@/lib/db/repositories/voices");
  const { listGlossary } = await import("@/lib/db/repositories/glossary");
  const { getRecording } = await import("@/lib/db/repositories/recordings");
  const { pronunciationsFor } = await import("@/lib/pipeline/glossary");
  const { getProviders } = await import("@/lib/providers");
  const recording = project.recordingId ? await getRecording(job.workspaceId, project.recordingId) : null;
  return narrate({
    edl,
    project,
    workspaceId: job.workspaceId,
    synthesis: getProviders().synthesis,
    pronunciations: pronunciationsFor(await listGlossary(job.workspaceId)),
    stillness: recording?.stillness ?? null,
    lookupVoice: getVoice,
  });
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

  // See the note in `recordAsset`: the worker reads through the repository,
  // never through the server-only data access layer.
  const { getProjectById } = await import("@/lib/db/repositories/projects");
  const project = await getProjectById(job.workspaceId, payload.projectId);
  if (!project) {
    throw new ProviderError(`Render job references unknown project ${payload.projectId}.`, {
      provider: "render-worker",
      retryable: false,
    });
  }

  const { hydrateEditState } = await import("@/lib/edit-state");
  const state = hydrateEditState(project.editState);

  const { brandForProject } = await import("./brand-for-project");
  const { brand, locked } = await brandForProject(job.workspaceId, project);

  return buildEdl({
    project,
    sourceUrl: payload.sourceUrl,
    removeFillers: state.removeFillers,
    deletedSegments: state.deletedSegments,
    cutWords: state.cutWords,
    wordEdits: state.wordEdits,
    sceneTiming: state.sceneTiming,
    continuous: Boolean(project.voiceId),
    captions: state.captions || locked,
    brand,
    zoomEnabled: state.zoomEnabled,
    resolution: (payload.video?.resolution as "1080p") ?? "1080p",
    fps: (payload.video?.fps as 30 | 60) ?? 30,
  });
}
