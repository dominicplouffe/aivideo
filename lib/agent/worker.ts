import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claim, complete, fail, heartbeat } from "@/lib/jobs/queue";
import { driveRun } from "./driver";
import { finalizeRun } from "./finalize";
import { getRun, failRun } from "./run";

/**
 * Running approved agent runs from the queue.
 *
 * Lives in the worker process, beside rendering: a run needs a browser, a
 * few minutes and ffprobe, none of which belong in a request handler. The
 * job carries only the run id; everything it acts on is read from the run
 * row, which is where the approval and the hash live.
 *
 * One attempt. A run that failed half way has already written its trail
 * and its failure to the run; repeating it unattended would record the
 * flow twice and approve nothing new.
 */

const HEARTBEAT_MS = 15_000;

export interface AgentWorkerOptions {
  workerId: string;
  /** A Chromium to use instead of Playwright's bundled one. */
  executablePath?: string;
}

export interface AgentOutcome {
  jobId: string;
  runId: string;
  status: "completed" | "failed";
  projectId?: string | null;
  error?: string;
}

function chromiumPath(configured?: string): string | undefined {
  const candidates = [configured, process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium/chrome-linux/chrome"].filter(
    (c): c is string => Boolean(c),
  );
  return candidates.find((c) => existsSync(c));
}

export async function processAgentOne(options: AgentWorkerOptions): Promise<AgentOutcome | null> {
  const job = await claim(options.workerId, ["agent"]);
  if (!job) return null;

  const runId = String((job.payload as { runId?: unknown }).runId ?? "");
  const beat = setInterval(() => void heartbeat(job.id, options.workerId), HEARTBEAT_MS);
  beat.unref?.();

  let dir: string | null = null;
  try {
    const run = await getRun(job.workspaceId, runId);
    if (!run) throw new Error(`Agent job names unknown run ${runId}.`);
    if (run.status === "recording") {
      // Reclaimed after the worker holding it stopped mid-recording. The
      // footage from that attempt is gone, and recording the flow again
      // unattended would put a second, half-finished attempt in the trail
      // under the same approval. Said on the run, in words a person can use.
      const message =
        "The recording was interrupted part way (the recorder restarted) and nothing was saved. Request the run again to record it.";
      await failRun(run, message);
      await fail(job.id, options.workerId, message, { permanent: true });
      return { jobId: job.id, runId, status: "failed", error: message };
    }
    if (run.status !== "approved") {
      // Cancelled after approval, or already recorded by another worker.
      await complete(job.id, options.workerId, { skipped: true, status: run.status });
      return { jobId: job.id, runId, status: "completed" };
    }

    const { chromium } = await import("playwright");
    dir = await mkdtemp(path.join(tmpdir(), "demoriff-agent-"));
    const browser = await chromium.launch({ headless: true, executablePath: chromiumPath(options.executablePath), args: ["--no-sandbox"] });
    try {
      const result = await driveRun(run, {
        browser,
        recordVideo: { dir },
        finalize: (produced) => finalizeRun({ run: produced.run, videoPath: produced.videoPath, steps: produced.steps }),
      });
      if (result.status === "failed") {
        await fail(job.id, options.workerId, result.error ?? "The run failed.", { permanent: true });
        return { jobId: job.id, runId, status: "failed", error: result.error };
      }
      await complete(job.id, options.workerId, {
        status: result.status,
        completedSteps: result.completedSteps,
        refusals: result.refusals,
        projectId: result.projectId ?? null,
      });
      return { jobId: job.id, runId, status: "completed", projectId: result.projectId ?? null };
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The run is told too, when it is still in a state that can be told.
    const run = await getRun(job.workspaceId, runId).catch(() => null);
    if (run && (run.status === "approved" || run.status === "recording")) {
      await failRun(run, message).catch(() => {});
    }
    await fail(job.id, options.workerId, message, { permanent: true });
    return { jobId: job.id, runId, status: "failed", error: message };
  } finally {
    clearInterval(beat);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
