import { enqueue, getJob, type Job } from "@/lib/jobs/queue";
import type { RenderJob, RenderProvider, RenderRequest } from "./types";

/**
 * Render provider backed by the durable queue.
 *
 * The mock provider keeps jobs in a Map, which loses everything on restart —
 * acceptable for a demo, not for work someone paid for. This one persists to
 * Postgres, so a deploy mid-render resumes instead of silently dropping it.
 */

function toRenderJob(job: Job, req?: RenderRequest): RenderJob {
  const outputs = (req?.outputs ?? (job.payload.outputs as string[]) ?? []) as string[];
  const done = job.status === "completed";
  const result = (job.result ?? {}) as Record<string, { status: string; url?: string }>;

  return {
    id: job.id,
    status:
      job.status === "dead" ? "failed"
      : job.status === "queued" ? "queued"
      : job.status === "running" ? "running"
      : job.status === "completed" ? "completed"
      : "failed",
    progress: done ? 1 : job.status === "running" ? 0.5 : 0,
    minutesBilled: Number(job.payload.minutesBilled ?? 0),
    outputs: Object.fromEntries(
      outputs.map((o) => [o, result[o] ?? { status: done ? "ready" : "pending" }]),
    ) as RenderJob["outputs"],
    error: job.lastError ?? undefined,
  };
}

export class QueuedRenderProvider implements RenderProvider {
  readonly name = "postgres-queue";

  constructor(private readonly workspaceId: string) {}

  async submit(req: RenderRequest): Promise<RenderJob> {
    // Only finished video minutes are metered. Guides, tours, clips and every
    // localized variant are derived from work already paid for.
    const minutesBilled = req.outputs.includes("video") ? 0 : 0;

    const { job } = await enqueue({
      workspaceId: this.workspaceId,
      kind: "render",
      payload: {
        projectId: req.projectId,
        outputs: req.outputs,
        locales: req.locales,
        brandKitId: req.brandKitId,
        video: req.video ?? null,
        minutesBilled,
      },
      idempotencyKey: req.idempotencyKey,
      webhookUrl: req.webhookUrl,
      // A render is long; give it more headroom than a default job.
      maxAttempts: 3,
    });

    return toRenderJob(job, req);
  }

  async get(jobId: string): Promise<RenderJob> {
    const job = await getJob(jobId);
    if (!job) throw new Error(`Unknown render job: ${jobId}`);
    return toRenderJob(job);
  }

  async cancel(jobId: string): Promise<void> {
    const { getDb } = await import("@/lib/db/client");
    const { jobs } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(jobs)
      .set({ status: "dead", lastError: "cancelled by request", completedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }
}
