import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/**
 * Durable job queue on Postgres.
 *
 * Renders, translations and re-renders are long, expensive and must survive a
 * deploy. An in-memory queue loses them on restart, which for a paid render
 * means charging someone for work that evaporated.
 *
 * Three properties matter, and each is enforced here rather than assumed:
 *
 *  - **Exactly one worker per job.** Claiming uses SELECT ... FOR UPDATE SKIP
 *    LOCKED, so concurrent workers never hand the same job to two machines.
 *  - **Crashes are survivable.** A claim takes a lease; if the worker dies the
 *    lease expires and the job returns to the pool instead of hanging.
 *  - **Retries are not infinite.** Attempts back off exponentially and then
 *    dead-letter, so a poison payload cannot spin forever.
 */

export type JobStatus = "queued" | "running" | "completed" | "failed" | "dead";

export interface Job {
  id: string;
  workspaceId: string;
  kind: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: Date;
  createdAt: Date;
}

export interface EnqueueOptions {
  workspaceId: string;
  kind: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  maxAttempts?: number;
  runAfter?: Date;
  webhookUrl?: string;
}

export interface EnqueueResult {
  job: Job;
  /** False when an idempotency key matched an existing job. */
  created: boolean;
}

const LEASE_SECONDS = 60;

/**
 * True when an error is a Postgres unique violation on the given constraint.
 *
 * Drizzle wraps driver errors, so the SQLSTATE lives on the cause chain rather
 * than in the message. Matching on the message text would silently stop
 * working the first time either library reworded it.
 */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (e.code === "23505" && e.constraint_name === constraint) return true;
    current = e.cause;
  }
  return false;
}

function toJob(r: typeof s.jobs.$inferSelect): Job {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    kind: r.kind,
    status: r.status,
    payload: r.payload,
    result: r.result,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    lastError: r.lastError,
    runAfter: r.runAfter,
    createdAt: r.createdAt,
  };
}

/**
 * Adds a job. With an idempotency key, a repeat call returns the original job
 * instead of creating a second one — the property that makes a retried API
 * request safe.
 */
export async function enqueue(opts: EnqueueOptions): Promise<EnqueueResult> {
  const db = getDb();

  if (opts.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(s.jobs)
      .where(
        and(
          eq(s.jobs.workspaceId, opts.workspaceId),
          eq(s.jobs.kind, opts.kind),
          eq(s.jobs.idempotencyKey, opts.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { job: toJob(existing), created: false };
  }

  try {
    const [row] = await db
      .insert(s.jobs)
      .values({
        workspaceId: opts.workspaceId,
        kind: opts.kind,
        payload: opts.payload,
        idempotencyKey: opts.idempotencyKey ?? null,
        priority: opts.priority ?? 0,
        maxAttempts: opts.maxAttempts ?? 5,
        runAfter: opts.runAfter ?? new Date(),
        webhookUrl: opts.webhookUrl ?? null,
      })
      .returning();
    return { job: toJob(row), created: true };
  } catch (error) {
    // Two concurrent requests with the same key race here. The unique index
    // is the arbiter; the loser reads back the winner's row.
    if (opts.idempotencyKey && isUniqueViolation(error, "jobs_idempotency_key")) {
      const [existing] = await db
        .select()
        .from(s.jobs)
        .where(
          and(
            eq(s.jobs.workspaceId, opts.workspaceId),
            eq(s.jobs.kind, opts.kind),
            eq(s.jobs.idempotencyKey, opts.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return { job: toJob(existing), created: false };
    }
    throw error;
  }
}

/**
 * Claims one ready job for this worker.
 *
 * SKIP LOCKED is what makes this safe under concurrency: a row already locked
 * by another transaction is passed over rather than waited on, so N workers
 * polling simultaneously each get a different job and none of them block.
 */
export async function claim(workerId: string, kinds?: string[]): Promise<Job | null> {
  const db = getDb();
  const kindFilter = kinds?.length
    ? sql`AND kind = ANY(${sql.raw(`ARRAY[${kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")}]::text[]`)})`
    : sql``;

  const rows = await db.execute(sql`
    WITH ready AS (
      SELECT id FROM jobs
      WHERE (
              status = 'queued'
              -- A lease that has expired means the worker died mid-job.
              OR (status = 'running' AND lease_expires_at < now())
            )
        AND run_after <= now()
        ${kindFilter}
      ORDER BY priority DESC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs j
       SET status = 'running',
           locked_by = ${workerId},
           lease_expires_at = now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds',
           attempts = j.attempts + 1,
           started_at = COALESCE(j.started_at, now())
      FROM ready
     WHERE j.id = ready.id
    RETURNING j.*;
  `);

  const row = (rows as unknown as (typeof s.jobs.$inferSelect)[])[0];
  return row ? toJob(row) : null;
}

/** Extends the lease on a long-running job so it is not reclaimed mid-flight. */
export async function heartbeat(jobId: string, workerId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`
    UPDATE jobs
       SET lease_expires_at = now() + interval '${sql.raw(String(LEASE_SECONDS))} seconds'
     WHERE id = ${jobId} AND locked_by = ${workerId} AND status = 'running'
    RETURNING id;
  `);
  return (rows as unknown as unknown[]).length > 0;
}

export async function complete(
  jobId: string,
  workerId: string,
  result: Record<string, unknown> = {},
): Promise<void> {
  const db = getDb();
  await db
    .update(s.jobs)
    .set({
      status: "completed",
      result,
      completedAt: new Date(),
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: null,
    })
    .where(and(eq(s.jobs.id, jobId), eq(s.jobs.lockedBy, workerId)));
}

/**
 * Records a failure. Reschedules with exponential backoff while attempts
 * remain, then dead-letters — a poison payload must not retry forever.
 */
export async function fail(
  jobId: string,
  workerId: string,
  error: string,
): Promise<{ status: JobStatus; retryAt: Date | null }> {
  const db = getDb();
  const [job] = await db.select().from(s.jobs).where(eq(s.jobs.id, jobId)).limit(1);
  if (!job) return { status: "dead", retryAt: null };

  const exhausted = job.attempts >= job.maxAttempts;
  if (exhausted) {
    await db
      .update(s.jobs)
      .set({
        status: "dead",
        lastError: error.slice(0, 4000),
        completedAt: new Date(),
        lockedBy: null,
        leaseExpiresAt: null,
      })
      .where(and(eq(s.jobs.id, jobId), eq(s.jobs.lockedBy, workerId)));
    return { status: "dead", retryAt: null };
  }

  // 2^attempts seconds, capped at ten minutes.
  const delaySec = Math.min(2 ** job.attempts, 600);
  const retryAt = new Date(Date.now() + delaySec * 1000);
  await db
    .update(s.jobs)
    .set({
      status: "queued",
      lastError: error.slice(0, 4000),
      runAfter: retryAt,
      lockedBy: null,
      leaseExpiresAt: null,
    })
    .where(and(eq(s.jobs.id, jobId), eq(s.jobs.lockedBy, workerId)));
  return { status: "queued", retryAt };
}

export async function getJob(jobId: string): Promise<Job | null> {
  const [row] = await getDb().select().from(s.jobs).where(eq(s.jobs.id, jobId)).limit(1);
  return row ? toJob(row) : null;
}

export async function stats(workspaceId: string) {
  const rows = await getDb().execute(sql`
    SELECT status, count(*)::int AS n
      FROM jobs WHERE workspace_id = ${workspaceId}
     GROUP BY status;
  `);
  const out: Record<string, number> = { queued: 0, running: 0, completed: 0, failed: 0, dead: 0 };
  for (const r of rows as unknown as { status: string; n: number }[]) out[r.status] = r.n;
  return out;
}

/** Returns jobs whose leases have expired — visible stuck work, for alerting. */
export async function reclaimable(): Promise<Job[]> {
  const rows = await getDb()
    .select()
    .from(s.jobs)
    .where(
      and(
        eq(s.jobs.status, "running"),
        or(isNull(s.jobs.leaseExpiresAt), lte(s.jobs.leaseExpiresAt, new Date())),
      ),
    )
    .orderBy(asc(s.jobs.createdAt));
  return rows.map(toJob);
}
