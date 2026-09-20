import { randomUUID } from "node:crypto";
import { closeDb, isDatabaseConfigured } from "@/lib/db/client";
import { processOne } from "../worker";

/**
 * The render worker process.
 *
 * A loop, a poll interval and a shutdown signal — nothing else. The loop
 * lives here rather than in the library because the thing that needs to
 * interrupt it is the process, and a library function has no business
 * deciding when to stop.
 *
 *   DATABASE_URL=... npm run worker
 */

const POLL_MS = Number(process.env.RENDER_WORKER_POLL_MS ?? 2000);
const workerId = process.env.RENDER_WORKER_ID ?? `render-${randomUUID().slice(0, 8)}`;

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
      const outcome = await processOne({
        workerId,
        onProgress: (jobId, fraction) => {
          if (Math.round(fraction * 100) % 25 === 0) {
            console.log(`[${workerId}] ${jobId} ${Math.round(fraction * 100)}%`);
          }
        },
      });

      if (!outcome) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        continue;
      }

      console.log(
        outcome.status === "completed"
          ? `[${workerId}] ${outcome.jobId} completed — ${outcome.durationSec?.toFixed(2)}s, ${outcome.bytes} bytes`
          : `[${workerId}] ${outcome.jobId} failed — ${outcome.error}`,
      );
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
