import { claim, complete, fail } from "@/lib/jobs/queue";
import { deliverWebhookJob, type DeliveryOptions } from "./outbound";

/**
 * The webhook delivery worker.
 *
 * Deliberately the same shape as the render worker — claim one, do it,
 * record it — so a process can poll both kinds in one loop. There is no
 * heartbeat here: a delivery is bounded by a ten-second timeout, which is
 * comfortably inside the queue's lease.
 */

export interface WebhookWorkerOptions extends DeliveryOptions {
  workerId: string;
}

export interface WebhookOutcome {
  jobId: string;
  status: "completed" | "failed";
  httpStatus?: number | null;
  error?: string;
}

export async function processWebhookOne(
  options: WebhookWorkerOptions,
): Promise<WebhookOutcome | null> {
  const job = await claim(options.workerId, ["webhook"]);
  if (!job) return null;

  try {
    const { workerId: _workerId, ...delivery } = options;
    const outcome = await deliverWebhookJob(job, delivery);
    await complete(job.id, options.workerId, {
      httpStatus: outcome.status,
      deliveredAt: new Date().toISOString(),
    });
    return { jobId: job.id, status: "completed", httpStatus: outcome.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail(job.id, options.workerId, message);
    return { jobId: job.id, status: "failed", error: message };
  }
}
