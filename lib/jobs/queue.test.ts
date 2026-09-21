import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { enqueue, claim, complete, fail, heartbeat, getJob, stats, reclaimable } from "./queue";

/**
 * These exercise the queue against a real Postgres. The properties under test
 * — mutual exclusion, lease recovery, backoff, idempotency — are all
 * behaviours of the database, so a mocked version would prove nothing.
 */

const RUN = isDatabaseConfigured();
const WS = "33333333-3333-4333-8333-333333333333";

/**
 * This suite's own job kinds.
 *
 * The queue is deliberately global: a worker pool claims across workspaces,
 * which is the whole point of `SKIP LOCKED`. That also means an unfiltered
 * claim here picks up work enqueued by another suite running in parallel
 * against the same database, so these tests claim only what they enqueued.
 */
const RENDER = "queue-test:render";
const TRANSLATE = "queue-test:translate";
const MINE = [RENDER, TRANSLATE];

before(async () => {
  if (!RUN) return;
  const db = getDb();
  await eraseWorkspace(WS, "test setup");
  await db.insert(s.workspaces).values({ id: WS, slug: "queue-test", name: "Queue Test" });
});

after(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  await getDb().delete(s.jobs).where(eq(s.jobs.workspaceId, WS));
});

describe("job queue", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("returns a fully populated job from a claim", async () => {
    // A distinctive kind, claimed by that kind: the queue is deliberately
    // global across workspaces, so an unfiltered claim in a suite running
    // in parallel with the render worker's tests picks up their work.
    const { job: queued } = await enqueue({
      workspaceId: WS,
      kind: RENDER,
      payload: { n: 1 },
      maxAttempts: 7,
    });

    const claimed = await claim("worker-fields", MINE);

    // `claim` runs raw SQL, whose rows keep their database column names. Every
    // multi-word field here was silently undefined until that mapping was made
    // explicit, and a worker cannot store its output without the workspace id.
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.workspaceId, WS);
    assert.equal(claimed?.kind, RENDER);
    assert.equal(claimed?.maxAttempts, 7);
    assert.equal(claimed?.lastError, null);
    assert.equal(claimed?.runAfter instanceof Date, true);
    assert.equal(claimed?.createdAt instanceof Date, true);
  });

  it("claims a queued job exactly once across concurrent workers", async () => {
    await enqueue({ workspaceId: WS, kind: RENDER, payload: { n: 1 } });

    // Ten workers race for one job. Nine must come back empty.
    const claims = await Promise.all(
      Array.from({ length: 10 }, (_, i) => claim(`worker-${i}`, MINE)),
    );
    const won = claims.filter((c) => c !== null);
    assert.equal(won.length, 1, "exactly one worker may hold the job");
  });

  it("dead-letters a permanent failure at once instead of retrying it", async () => {
    const { job } = await enqueue({ workspaceId: WS, kind: "render", payload: {}, maxAttempts: 3 });
    const claimed = await claim("w1", ["render"]);
    assert.equal(claimed?.id, job.id);

    const outcome = await fail(job.id, "w1", "the vendor rejected the request", { permanent: true });
    assert.equal(outcome.status, "dead");
    assert.equal(outcome.retryAt, null);
    // Nothing left for a worker to pick up: the failure was certain.
    assert.equal((await getJob(job.id))?.status, "dead");
    assert.equal(await claim("w2", ["render"]), null);
  });

  it("hands different jobs to different workers rather than blocking", async () => {
    for (let i = 0; i < 5; i++) {
      await enqueue({ workspaceId: WS, kind: RENDER, payload: { n: i } });
    }
    const claims = await Promise.all(
      Array.from({ length: 5 }, (_, i) => claim(`worker-${i}`, MINE)),
    );
    const ids = claims.filter(Boolean).map((c) => c!.id);
    assert.equal(ids.length, 5);
    assert.equal(new Set(ids).size, 5, "no job may be handed out twice");
  });

  it("returns the original job when an idempotency key repeats", async () => {
    const a = await enqueue({
      workspaceId: WS, kind: RENDER, payload: { n: 1 }, idempotencyKey: "abc",
    });
    const b = await enqueue({
      workspaceId: WS, kind: RENDER, payload: { n: 999 }, idempotencyKey: "abc",
    });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(a.job.id, b.job.id);
    assert.deepEqual(b.job.payload, { n: 1 }, "the original payload wins");
  });

  it("survives a race on the same idempotency key", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        enqueue({ workspaceId: WS, kind: RENDER, payload: {}, idempotencyKey: "race" }),
      ),
    );
    const ids = new Set(results.map((r) => r.job.id));
    assert.equal(ids.size, 1, "a concurrent race must still yield one job");
    assert.equal(results.filter((r) => r.created).length, 1, "only one caller created it");
  });

  it("reclaims a job whose worker died", async () => {
    const { job } = await enqueue({ workspaceId: WS, kind: RENDER, payload: {} });
    const first = await claim("worker-doomed", MINE);
    assert.equal(first?.id, job.id);

    // Nobody else can take it while the lease holds.
    assert.equal(await claim("worker-other", MINE), null);

    // Simulate the worker dying: expire its lease without completing.
    await getDb().execute(
      sql`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = ${job.id}`,
    );

    const second = await claim("worker-rescuer", MINE);
    assert.equal(second?.id, job.id, "an expired lease must return the job to the pool");
    assert.equal(second?.attempts, 2, "the reclaim counts as another attempt");
  });

  it("extends a lease on heartbeat and refuses one from the wrong worker", async () => {
    await enqueue({ workspaceId: WS, kind: RENDER, payload: {} });
    const job = await claim("worker-a", MINE);
    assert.ok(job);
    assert.equal(await heartbeat(job!.id, "worker-a"), true);
    assert.equal(await heartbeat(job!.id, "worker-b"), false, "only the holder may heartbeat");
  });

  it("backs off exponentially then dead-letters", async () => {
    const { job } = await enqueue({
      workspaceId: WS, kind: RENDER, payload: {}, maxAttempts: 3,
    });

    const delays: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claimed = await claim("worker-a", MINE);
      assert.ok(claimed, `attempt ${attempt} should be claimable`);
      const outcome = await fail(claimed!.id, "worker-a", `boom ${attempt}`);
      if (outcome.retryAt) {
        delays.push(Math.round((outcome.retryAt.getTime() - Date.now()) / 1000));
        // Make the retry immediately claimable so the test does not sleep.
        await getDb().execute(sql`UPDATE jobs SET run_after = now() WHERE id = ${job.id}`);
      }
    }

    assert.deepEqual(delays, [2, 4], "delays double: 2^1 then 2^2 seconds");

    const final = await getJob(job.id);
    assert.equal(final?.status, "dead", "a job past maxAttempts must dead-letter");
    assert.match(final?.lastError ?? "", /boom 3/);
  });

  it("does not claim a job scheduled for the future", async () => {
    await enqueue({
      workspaceId: WS, kind: RENDER, payload: {},
      runAfter: new Date(Date.now() + 60_000),
    });
    assert.equal(await claim("worker-a", MINE), null);
  });

  it("orders by priority, then oldest first", async () => {
    await enqueue({ workspaceId: WS, kind: RENDER, payload: { tag: "old-low" }, priority: 0 });
    await enqueue({ workspaceId: WS, kind: RENDER, payload: { tag: "high" }, priority: 10 });

    const first = await claim("worker-a", MINE);
    assert.deepEqual(first?.payload, { tag: "high" }, "priority wins over age");
  });

  it("filters by kind when a worker only handles some", async () => {
    await enqueue({ workspaceId: WS, kind: TRANSLATE, payload: {} });
    assert.equal(await claim("worker-render", [RENDER]), null);
    const got = await claim("worker-translate", [TRANSLATE]);
    assert.equal(got?.kind, TRANSLATE);
  });

  it("reports status counts and stuck work", async () => {
    await enqueue({ workspaceId: WS, kind: RENDER, payload: {} });
    const claimed = await claim("worker-a", MINE);
    await complete(claimed!.id, "worker-a", { ok: true });

    const counts = await stats(WS);
    assert.equal(counts.completed, 1);

    await enqueue({ workspaceId: WS, kind: RENDER, payload: {} });
    const stuck = await claim("worker-b", MINE);
    await getDb().execute(
      sql`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = ${stuck!.id}`,
    );
    const orphans = await reclaimable();
    assert.ok(orphans.some((j) => j.id === stuck!.id), "expired leases are visible for alerting");
  });
});
