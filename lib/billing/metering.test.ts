import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { PLAN_CATALOGUE, prorate } from "./plans";
import {
  NOTICE_THRESHOLD, checkBeforeWork, markNoticeSent, meter, overageCents,
  reconcile, rollPeriod, topUp, usage,
} from "./metering";

/**
 * Billing is the part of a product where a bug is not a bug, it is a charge
 * on someone's card. These tests are written as the claims the pricing page
 * makes, because that is what they have to hold up.
 */

const RUN = isDatabaseConfigured();
const WS = "88888888-8888-4888-8888-888888888888";
const HOUR = 3600;

before(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test setup");
});

after(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test reset");
  await getDb().insert(s.workspaces).values({
    id: WS,
    slug: "metering-test",
    name: "Metering Test",
    plan: "studio",
    videoSecondsLimit: 10 * HOUR,
    videoSecondsUsed: 0,
  });
});

// --- the catalogue (no database needed) ------------------------------------

describe("the plan catalogue", () => {
  it("states every allowance in seconds", () => {
    // A plan stored as "40 minutes" and consumed in seconds needs a
    // conversion at every boundary, and every conversion is a chance to
    // round — always, in practice, the seller's way.
    for (const plan of Object.values(PLAN_CATALOGUE)) {
      assert.equal(Number.isInteger(plan.videoSecondsPerPeriod), true);
      assert.equal(plan.videoSecondsPerPeriod % 60, 0, `${plan.id} is not a whole number of minutes`);
    }
  });

  it("lets no plan without a card run up a bill", () => {
    // Free has no payment method, so it cannot accrue overage at any rate.
    assert.equal(PLAN_CATALOGUE.free.overageCentsPerSecond, null);
  });

  it("charges a quoted plan nothing by list price", () => {
    // Enterprise moves are handled on the contract, not by this function
    // guessing at a price that does not exist.
    const result = prorate({
      from: "studio", to: "enterprise",
      periodStartsAt: new Date("2026-01-01T00:00:00Z"),
      at: new Date("2026-01-15T00:00:00Z"),
    });
    assert.equal(result.chargeCents, 0);
  });

  it("prorates an upgrade on whole days remaining", () => {
    const result = prorate({
      from: "free", to: "studio",
      periodStartsAt: new Date("2026-01-01T00:00:00Z"),
      at: new Date("2026-01-16T12:00:00Z"),
    });
    // 15 days elapsed, so 14 remain after today. The difference is
    // 9,900 cents over 30 days.
    assert.equal(result.daysRemaining, 14);
    assert.equal(result.chargeCents, Math.trunc((9_900 / 30) * 14));
  });

  it("returns a credit for a downgrade rather than a charge", () => {
    const result = prorate({
      from: "studio", to: "free",
      periodStartsAt: new Date("2026-01-01T00:00:00Z"),
      at: new Date("2026-01-16T00:00:00Z"),
    });
    assert.equal(result.chargeCents < 0, true);
  });

  it("leaves an annual plan to Stripe's own proration", () => {
    const result = prorate({
      from: "studio", to: "byok",
      periodStartsAt: new Date("2026-01-01T00:00:00Z"),
      at: new Date("2026-01-16T00:00:00Z"),
    });
    assert.equal(result.chargeCents, 0);
  });

  it("charges nothing for a change on the last day of a period", () => {
    const result = prorate({
      from: "free", to: "studio",
      periodStartsAt: new Date("2026-01-01T00:00:00Z"),
      at: new Date("2026-01-31T00:00:00Z"),
    });
    assert.equal(result.daysRemaining, 0);
    assert.equal(result.chargeCents, 0);
  });
});

// --- against a real database -----------------------------------------------

describe("metering", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("bills the seconds a render actually took", async () => {
    // Not "two minutes". Seventy-one seconds.
    const result = await meter({
      workspaceId: WS, seconds: 71, resourceType: "render",
      resourceId: "r1", idempotencyKey: "render:r1",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.charged, 71);
    assert.equal(result.snapshot.usedSeconds, 71);
  });

  it("charges a partial second once, and never rounds anything longer", async () => {
    await meter({ workspaceId: WS, seconds: 0.4, resourceType: "render", resourceId: "a", idempotencyKey: "a" });
    await meter({ workspaceId: WS, seconds: 119.2, resourceType: "render", resourceId: "b", idempotencyKey: "b" });

    // 1 + 120, not 60 + 120.
    assert.equal((await usage(WS)).usedSeconds, 121);
  });

  it("does not bill the same render twice when its job is retried", async () => {
    const first = await meter({
      workspaceId: WS, seconds: 300, resourceType: "render",
      resourceId: "r1", idempotencyKey: "render:r1",
    });
    const second = await meter({
      workspaceId: WS, seconds: 300, resourceType: "render",
      resourceId: "r1", idempotencyKey: "render:r1",
    });

    assert.equal(first.ok && first.duplicate, false);
    assert.equal(second.ok && second.duplicate, true);
    // A lease that expires mid-encode is a normal event, not an excuse to
    // charge for one video twice.
    assert.equal((await usage(WS)).usedSeconds, 300);
  });

  it("loses nothing when renders finish at the same moment", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        meter({
          workspaceId: WS, seconds: 60, resourceType: "render",
          resourceId: `r${i}`, idempotencyKey: `render:r${i}`,
        }),
      ),
    );

    // Without the row lock two renders read the same counter, both write
    // the same total, and one render is free.
    assert.equal((await usage(WS)).usedSeconds, 600);
  });

  it("keeps the counter and the ledger in agreement", async () => {
    for (let i = 0; i < 5; i++) {
      await meter({
        workspaceId: WS, seconds: 90, resourceType: "render",
        resourceId: `r${i}`, idempotencyKey: `k${i}`,
      });
    }

    // The invoice and its explanation have to be the same number.
    assert.deepEqual(await reconcile(WS), { counter: 450, ledger: 450, drift: 0 });
  });

  it("reports drift rather than quietly correcting it", async () => {
    await meter({ workspaceId: WS, seconds: 100, resourceType: "render", resourceId: "r", idempotencyKey: "k" });
    // Simulate a bug that advanced the counter without a ledger line.
    await getDb().update(s.workspaces).set({ videoSecondsUsed: 160 }).where(eq(s.workspaces.id, WS));

    const result = await reconcile(WS);
    // Writing the counter to match would hide the bug that caused it.
    assert.deepEqual(result, { counter: 160, ledger: 100, drift: 60 });
  });

  // --- running out ---------------------------------------------------------

  it("keeps working past the limit by default, and accrues overage", async () => {
    await meter({
      workspaceId: WS, seconds: 11 * HOUR, resourceType: "render",
      resourceId: "big", idempotencyKey: "big",
    });

    const snapshot = await usage(WS);
    assert.equal(snapshot.remainingSeconds, -HOUR);
    assert.equal(snapshot.blocked, false);
    // Team is 2 cents a second: an hour over is $72.
    assert.equal(overageCents(snapshot), HOUR * 2);
    assert.equal((await checkBeforeWork(WS)).ok, true);
  });

  it("stops only when the customer asked it to", async () => {
    await getDb().update(s.workspaces).set({ hardStopAtLimit: true }).where(eq(s.workspaces.id, WS));
    await meter({
      workspaceId: WS, seconds: 10 * HOUR, resourceType: "render",
      resourceId: "exact", idempotencyKey: "exact",
    });

    const verdict = await checkBeforeWork(WS);
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.reason, "hard-stop");
  });

  it("meters work that is already finished even when the stop is on", async () => {
    await getDb().update(s.workspaces).set({ hardStopAtLimit: true }).where(eq(s.workspaces.id, WS));
    await meter({ workspaceId: WS, seconds: 10 * HOUR, resourceType: "render", resourceId: "a", idempotencyKey: "a" });

    // The file exists and the compute was spent. Refusing to record it would
    // leave the ledger claiming a video that exists was never made.
    const result = await meter({
      workspaceId: WS, seconds: 60, resourceType: "render", resourceId: "b", idempotencyKey: "b",
    });
    assert.equal(result.ok, true);
    assert.equal((await usage(WS)).usedSeconds, 10 * HOUR + 60);
  });

  // --- the notice ----------------------------------------------------------

  it("warns once when usage crosses the threshold, not on every render after", async () => {
    const belowThreshold = Math.floor(10 * HOUR * NOTICE_THRESHOLD) - 60;
    await meter({ workspaceId: WS, seconds: belowThreshold, resourceType: "render", resourceId: "a", idempotencyKey: "a" });

    const crossing = await meter({ workspaceId: WS, seconds: 120, resourceType: "render", resourceId: "b", idempotencyKey: "b" });
    assert.equal(crossing.ok && crossing.noticeDue, true);
    await markNoticeSent(WS);

    const after = await meter({ workspaceId: WS, seconds: 120, resourceType: "render", resourceId: "c", idempotencyKey: "c" });
    // A warning that arrives on every render is a warning nobody reads.
    assert.equal(after.ok && after.noticeDue, false);
  });

  it("warns again in the next period", async () => {
    await meter({ workspaceId: WS, seconds: 9 * HOUR, resourceType: "render", resourceId: "a", idempotencyKey: "a" });
    await markNoticeSent(WS);
    await rollPeriod(WS);

    const crossing = await meter({ workspaceId: WS, seconds: 9 * HOUR, resourceType: "render", resourceId: "b", idempotencyKey: "b" });
    assert.equal(crossing.ok && crossing.noticeDue, true);
  });

  // --- top-ups and periods -------------------------------------------------

  it("adds purchased time without changing what has been used", async () => {
    await meter({ workspaceId: WS, seconds: 9 * HOUR, resourceType: "render", resourceId: "a", idempotencyKey: "a" });
    const { snapshot } = await topUp({ workspaceId: WS, seconds: 5 * HOUR, idempotencyKey: "invoice-1" });

    // "You have used 9 of 10 hours" must not become "9 of 15 used" the
    // moment someone pays. Usage is usage; the allowance grew.
    assert.equal(snapshot.usedSeconds, 9 * HOUR);
    assert.equal(snapshot.topupSeconds, 5 * HOUR);
    assert.equal(snapshot.remainingSeconds, 6 * HOUR);
  });

  it("does not apply the same purchase twice", async () => {
    await topUp({ workspaceId: WS, seconds: HOUR, idempotencyKey: "invoice-1" });
    const second = await topUp({ workspaceId: WS, seconds: HOUR, idempotencyKey: "invoice-1" });

    assert.equal(second.applied, false);
    assert.equal(second.snapshot.topupSeconds, HOUR);
  });

  it("carries top-ups across the period boundary", async () => {
    await topUp({ workspaceId: WS, seconds: 3 * HOUR, idempotencyKey: "invoice-1" });
    await meter({ workspaceId: WS, seconds: 2 * HOUR, resourceType: "render", resourceId: "a", idempotencyKey: "a" });

    const rolled = await rollPeriod(WS);

    // Bought, not rented. Expiring them means charging for time and then
    // taking it back.
    assert.equal(rolled.usedSeconds, 0);
    assert.equal(rolled.topupSeconds, 3 * HOUR);
    assert.equal(rolled.remainingSeconds, 13 * HOUR);
  });

  it("bills a late render to the period it belongs to", async () => {
    const before = await usage(WS);
    await meter({ workspaceId: WS, seconds: 60, resourceType: "render", resourceId: "a", idempotencyKey: "a" });

    const [event] = await getDb().select().from(s.usageEvents).where(eq(s.usageEvents.workspaceId, WS));
    assert.equal(event.periodStartsAt.getTime(), before.periodStartsAt.getTime());
  });

  it("refuses to meter a negative duration", async () => {
    await assert.rejects(
      () => meter({ workspaceId: WS, seconds: -5, resourceType: "render", resourceId: "a", idempotencyKey: "a" }),
      /Refusing to meter/,
    );
  });

  it("reports a zero allowance as fully used rather than as NaN", async () => {
    await getDb().update(s.workspaces).set({ videoSecondsLimit: 0 }).where(eq(s.workspaces.id, WS));
    // A billing screen rendering "NaN% used" is how a customer loses
    // confidence in every other number on the page.
    assert.equal((await usage(WS)).fractionUsed, 1);
  });
});

describe("a project is charged once a period", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("charges the longest render, not every render", async () => {
    const { meter, usage, aiAllowance, recordAiAction, projectCapacity } = await import("./metering");
    const project = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const first = await meter({ workspaceId: WS, seconds: 100, resourceType: "render", resourceId: "job-1", idempotencyKey: "render:job-1", projectId: project });
    assert.ok(first.ok && first.charged === 100);
    // A re-render after fixing a word, a little shorter: nothing more.
    const second = await meter({ workspaceId: WS, seconds: 95, resourceType: "render", resourceId: "job-2", idempotencyKey: "render:job-2", projectId: project });
    assert.ok(second.ok && second.charged === 0);
    // A longer cut: only the growth.
    const third = await meter({ workspaceId: WS, seconds: 130, resourceType: "render", resourceId: "job-3", idempotencyKey: "render:job-3", projectId: project });
    assert.ok(third.ok && third.charged === 30);
    assert.equal((await usage(WS)).usedSeconds, 130);
    // A different project is its own line.
    const other = await meter({ workspaceId: WS, seconds: 40, resourceType: "render", resourceId: "job-4", idempotencyKey: "render:job-4", projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    assert.ok(other.ok && other.charged === 40);
    assert.equal((await usage(WS)).usedSeconds, 170);

    // AI actions count against the plan's cap, from the ledger.
    const before = await aiAllowance(WS, "suggestion");
    assert.equal(before.used, 0);
    await recordAiAction({ workspaceId: WS, action: "suggestion", resourceId: project, idempotencyKey: "ai:suggestion:1" });
    await recordAiAction({ workspaceId: WS, action: "suggestion", resourceId: project, idempotencyKey: "ai:suggestion:1" });
    await recordAiAction({ workspaceId: WS, action: "riff", resourceId: project, idempotencyKey: "ai:riff:1" });
    const after = await aiAllowance(WS, "suggestion");
    assert.equal(after.used, 1, "the same key twice is one action");
    assert.equal(after.limit, 100, "Studio's cap");
    assert.equal((await aiAllowance(WS, "riff")).used, 1);

    // Ten projects on Studio, no packs.
    const capacity = await projectCapacity(WS);
    assert.equal(capacity.limit, 10);
    assert.equal(capacity.ok, true);
  });

  it("stops a Free workspace at its allowance without a hard-stop setting", async () => {
    const { meter, usage } = await import("./metering");
    await getDb().update(s.workspaces).set({ plan: "free", videoSecondsLimit: 600 }).where(eq(s.workspaces.id, WS));
    assert.equal((await usage(WS)).blocked, false);
    await meter({ workspaceId: WS, seconds: 600, resourceType: "render", resourceId: "job-f", idempotencyKey: "render:job-f", projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    assert.equal((await usage(WS)).blocked, true, "Free has no overage, so it stops");
    await getDb().update(s.workspaces).set({ plan: "studio" }).where(eq(s.workspaces.id, WS));
    assert.equal((await usage(WS)).blocked, false, "Studio bills overage unless asked to stop");
  });
});

// --- the monthly reset on plans Stripe does not invoice monthly ------------

describe("the monthly period on Free and Bring your own keys", () => {
  const DAY = 24 * 3600 * 1000;

  it("finds the monthly anniversary, held to the end of a short month", async () => {
    const { addMonths, lapsedPeriodStart } = await import("./metering");
    assert.equal(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString(), "2026-02-28T10:00:00.000Z");
    const start = new Date("2026-01-10T09:00:00Z");
    assert.equal(lapsedPeriodStart("free", start, new Date("2026-02-10T08:59:59Z")), null, "not a month yet");
    assert.equal(lapsedPeriodStart("free", start, new Date("2026-02-10T09:00:00Z"))?.toISOString(), "2026-02-10T09:00:00.000Z");
    assert.equal(lapsedPeriodStart("byok", start, new Date("2026-05-01T00:00:00Z"))?.toISOString(), "2026-04-10T09:00:00.000Z", "idle months skip to the latest anniversary");
    assert.equal(lapsedPeriodStart("studio", start, new Date("2026-05-01T00:00:00Z")), null, "Studio rolls on its invoice");
  });

  it("lets a Free workspace that used its 10 minutes 31 days ago render again", { skip: RUN ? false : "DATABASE_URL not set" }, async () => {
    const { assertRenderRoom } = await import("@/lib/api/plan-gate");
    const started = new Date(Date.now() - 31 * DAY);
    await getDb().update(s.workspaces)
      .set({ plan: "free", videoSecondsLimit: 600, videoSecondsUsed: 600, periodStartsAt: started, usageNoticeSentAt: new Date() })
      .where(eq(s.workspaces.id, WS));

    const verdict = await checkBeforeWork(WS);
    assert.equal(verdict.ok, true, "the render worker lets it start");
    assert.equal(await assertRenderRoom(WS), null, "the render route lets it start");
    const snapshot = await usage(WS);
    assert.equal(snapshot.usedSeconds, 0);
    assert.equal(snapshot.remainingSeconds, 600);
    assert.equal(snapshot.periodStartsAt.getTime() > started.getTime(), true);
    assert.equal(snapshot.periodStartsAt.getTime() <= Date.now(), true);
    const [row] = await getDb().select().from(s.workspaces).where(eq(s.workspaces.id, WS));
    assert.equal(row.usageNoticeSentAt, null, "next month's 80% notice can fire");
  });

  it("keeps a Free workspace stopped until the month is up", { skip: RUN ? false : "DATABASE_URL not set" }, async () => {
    await getDb().update(s.workspaces)
      .set({ plan: "free", videoSecondsLimit: 600, videoSecondsUsed: 600, periodStartsAt: new Date(Date.now() - 20 * DAY) })
      .where(eq(s.workspaces.id, WS));
    const verdict = await checkBeforeWork(WS);
    assert.equal(verdict.ok, false);
    assert.equal((await usage(WS)).usedSeconds, 600);
  });

  it("resets Bring your own keys every month, not once a year", { skip: RUN ? false : "DATABASE_URL not set" }, async () => {
    const started = new Date("2026-01-15T12:00:00Z");
    await getDb().update(s.workspaces)
      .set({ plan: "byok", videoSecondsLimit: 60_000, videoSecondsUsed: 59_000, periodStartsAt: started })
      .where(eq(s.workspaces.id, WS));
    const snapshot = await usage(WS, new Date("2026-02-20T00:00:00Z"));
    assert.equal(snapshot.usedSeconds, 0);
    assert.equal(snapshot.periodStartsAt.toISOString(), "2026-02-15T12:00:00.000Z");
    // A second read in the same month does not roll it again.
    await meter({ workspaceId: WS, seconds: 90, resourceType: "render", resourceId: "job-b", idempotencyKey: "render:job-b" });
    assert.equal((await usage(WS, new Date("2026-02-21T00:00:00Z"))).usedSeconds, 90);
  });

  it("still rolls Studio only on its paid invoice", { skip: RUN ? false : "DATABASE_URL not set" }, async () => {
    const started = new Date(Date.now() - 40 * DAY);
    await getDb().update(s.workspaces)
      .set({ plan: "studio", videoSecondsLimit: 9_000, videoSecondsUsed: 9_500, periodStartsAt: started })
      .where(eq(s.workspaces.id, WS));
    const before = await usage(WS);
    assert.equal(before.usedSeconds, 9_500, "no lazy reset on Studio");
    assert.equal(before.periodStartsAt.getTime(), started.getTime());
    const rolled = await rollPeriod(WS);
    assert.equal(rolled.usedSeconds, 0, "invoice.paid still rolls it");
  });
});
