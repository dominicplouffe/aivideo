import { randomUUID } from "node:crypto";
import { closeDb, isDatabaseConfigured } from "@/lib/db/client";

// The same files `next dev` and the migration script read, so `npm run
// worker` in a checkout works with no exporting first. Variables already in
// the environment win: a deployment that sets them for real is not
// overridden by a stray local file.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent is fine — the variables may come from the real environment.
  }
}
import { processWebhookOne } from "@/lib/webhooks/worker";
import { streamAll } from "@/lib/audit/siem";
import { processOne } from "../worker";

/**
 * The worker process.
 *
 * A loop, a poll interval and a shutdown signal — nothing else. The loop
 * lives here rather than in the library because the thing that needs to
 * interrupt it is the process, and a library function has no business
 * deciding when to stop.
 *
 * It drains renders first and webhooks second. A customer waiting on a video
 * cares more about it than the receiver of its announcement does, and a
 * webhook queued by a render should not be delivered before the render it
 * describes has finished being recorded.
 *
 * Audit streaming runs on its own clock rather than in that order. It is not
 * queue work — the cursor on each destination *is* the queue — and it does
 * not need to be timely to the second. Tying it to the poll loop would mean
 * a busy render worker either starves the stream or hammers a customer's
 * collector once per job.
 *
 *   DATABASE_URL=... npm run worker
 */

const POLL_MS = Number(process.env.RENDER_WORKER_POLL_MS ?? 2000);
const AUDIT_STREAM_MS = Number(process.env.AUDIT_STREAM_INTERVAL_MS ?? 30_000);
let nextStreamAt = 0;
// `||`, not `??`: `.env.example` ships the variable set to nothing, and an
// empty name is not a name.
const workerId = process.env.RENDER_WORKER_ID || `render-${randomUUID().slice(0, 8)}`;

let running = true;

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("DATABASE_URL is required to run the render worker.");
    process.exitCode = 1;
    return;
  }

  console.log(`[${workerId}] render worker started`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      // Finish the job in hand. Killing an encode mid-write leaves a
      // truncated file that looks like a successful render.
      console.log(`[${workerId}] ${signal} received; finishing the current job`);
      running = false;
    });
  }

  while (running) {
    try {
      // First in the loop, not last. Every other branch here ends in
      // `continue`, so a worker with a full render queue would never reach
      // a stream step placed after them — and the stream would stop for
      // exactly as long as the workspace was busy.
      if (Date.now() >= nextStreamAt) {
        nextStreamAt = Date.now() + AUDIT_STREAM_MS;
        for (const streamed of await streamAll()) {
          if (streamed.delivered > 0) {
            console.log(
              `[${workerId}] audit ${streamed.fromSeq + 1}-${streamed.toSeq} streamed to ${streamed.destinationId}`,
            );
          } else if (!streamed.ok) {
            console.error(`[${workerId}] audit stream to ${streamed.destinationId} failed — ${streamed.error}`);
          }
        }
      }

      const outcome = await processOne({
        workerId,
        onProgress: (jobId, fraction) => {
          if (Math.round(fraction * 100) % 25 === 0) {
            console.log(`[${workerId}] ${jobId} ${Math.round(fraction * 100)}%`);
          }
        },
      });

      if (outcome) {
        console.log(
          outcome.status === "completed"
            ? `[${workerId}] ${outcome.jobId} rendered — ${outcome.durationSec?.toFixed(2)}s, ${outcome.bytes} bytes`
            : `[${workerId}] ${outcome.jobId} render failed — ${outcome.error}`,
        );
        continue;
      }

      const delivery = await processWebhookOne({ workerId });
      if (delivery) {
        console.log(
          delivery.status === "completed"
            ? `[${workerId}] ${delivery.jobId} delivered — HTTP ${delivery.httpStatus}`
            : `[${workerId}] ${delivery.jobId} delivery failed — ${delivery.error}`,
        );
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } catch (error) {
      // A failure here is the queue itself, not a job. Back off rather than
      // spinning against a database that is down.
      console.error(`[${workerId}] worker loop error:`, error);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS * 5));
    }
  }

  await closeDb();
  console.log(`[${workerId}] stopped`);
}

main();
