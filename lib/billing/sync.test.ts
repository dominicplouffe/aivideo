import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { planFor } from "./plans";
import type { Subscription } from "./stripe";
import { applySubscription, claimEvent, linkCustomer, pruneBillingEvents, rollPeriod } from "./sync";

/**
 * This is the only path that writes a workspace's plan, so the tests are
 * about the three ways a billing sync costs somebody money: applying the
 * same event twice, resetting usage that was already incurred, and taking
 * back something that was bought outright.
 */

const RUN = isDatabaseConfigured();
const WS = "88888888-8888-4888-8888-888888888881";
const CUSTOMER = "cus_meridian";

const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  id: "sub_1",
  customerId: CUSTOMER,
  plan: "team",
  status: "active",
  currentPeriodStart: new Date("2026-09-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
  cancelAtPeriodEnd: false,
  ...over,
});

describe("applying what Stripe said", { skip: !RUN }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    await getDb().insert(s.workspaces).values({
      id: WS,
      slug: "billing-sync-test",
      name: "Billing Sync Test",
      plan: "free",
      stripeCustomerId: CUSTOMER,
      videoSecondsUsed: 420,
      topupSeconds: 1800,
    });
  });

  async function reload() {
    const [row] = await getDb().select().from(s.workspaces).where(eq(s.workspaces.id, WS));
    return row;
  }

  it("moves the workspace onto the plan that was bought", async () => {
    const outcome = await applySubscription(subscription());
    assert.equal(outcome.ok, true);

    const after = await reload();
    assert.equal(after.plan, "team");
    assert.equal(after.subscriptionStatus, "active");
    assert.equal(after.stripeSubscriptionId, "sub_1");
    assert.equal(after.videoSecondsLimit, planFor("team").videoSecondsPerPeriod);
  });

  it("does not reset usage already incurred, or take back a top-up", async () => {
    await applySubscription(subscription());
    const after = await reload();

    // Someone upgrading mid-period has used what they used; zeroing it
    // hands them the month back and makes the invoice disagree with the
    // ledger.
    assert.equal(after.videoSecondsUsed, 420);
    // Top-up seconds were paid for outright and carry across periods. A
    // plan change is not a reason to take them back.
    assert.equal(after.topupSeconds, 1800);
  });

  it("drops to free on cancellation rather than to nothing", async () => {
    await applySubscription(subscription());
    await applySubscription(subscription({ status: "canceled" }), { cancelled: true });

    const after = await reload();
    // Somebody who stops paying keeps their recordings and their history.
    // They lose the allowance, not the work.
    assert.equal(after.plan, "free");
    assert.equal(after.stripeSubscriptionId, null);
    assert.equal(after.videoSecondsUsed, 420);
    assert.equal(after.topupSeconds, 1800);
  });

  it("keeps access while a payment is being retried", async () => {
    await applySubscription(subscription({ status: "past_due" }));
    const after = await reload();
    // Locking somebody out of their own demos over an expired card costs
    // more goodwill than the invoice is worth.
    assert.equal(after.plan, "team");
    assert.equal(after.subscriptionStatus, "past_due");
  });

  it("drops to free on a status that does not grant access", async () => {
    await applySubscription(subscription({ status: "unpaid" }));
    assert.equal((await reload()).plan, "free");
  });

  it("does nothing for a customer it has never seen", async () => {
    const outcome = await applySubscription(subscription({ customerId: "cus_stranger" }));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, "unknown-customer");
    assert.equal((await reload()).plan, "free");
  });

  it("records a plan change in the audit log, and only a change", async () => {
    await applySubscription(subscription());
    await applySubscription(subscription());

    const entries = await getDb()
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.action, "billing.plan_changed"));

    // The second call changed nothing, so it wrote nothing. An audit log
    // full of no-ops is an audit log nobody reads.
    assert.equal(entries.length, 1);
    assert.equal(entries[0].metadata?.to, "team");
  });

  /* ----------------------------------------------------------- retries */

  it("handles a delivery once, however many times it arrives", async () => {
    // Fresh ids per run. Event ids are global and the rows outlive the
    // workspace they referenced, which is the whole point — a fixed id
    // would pass on the first run and fail on every one after it.
    const first = `evt_${randomUUID()}`;
    const second = `evt_${randomUUID()}`;

    assert.equal(await claimEvent(first, "invoice.paid", WS), true);
    // Stripe retries for three days, including deliveries we handled
    // perfectly well but answered slowly.
    assert.equal(await claimEvent(first, "invoice.paid", WS), false);
    assert.equal(await claimEvent(second, "invoice.paid", WS), true);
  });

  it("forgets deliveries far older than Stripe will ever retry", async () => {
    const ancient = `evt_${randomUUID()}`;
    await claimEvent(ancient, "invoice.paid", WS);
    await getDb()
      .update(s.billingEvents)
      .set({ handledAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) })
      .where(eq(s.billingEvents.id, ancient));

    assert.ok((await pruneBillingEvents(30)) >= 1);

    // And the table is not a permanent ledger of every webhook ever sent:
    // Stripe retries for three days, so a month is already generous.
    const [row] = await getDb()
      .select()
      .from(s.billingEvents)
      .where(eq(s.billingEvents.id, ancient));
    assert.equal(row, undefined);
  });

  it("rolls the period on payment, and lets the notice fire again", async () => {
    await getDb()
      .update(s.workspaces)
      .set({ usageNoticeSentAt: new Date() })
      .where(eq(s.workspaces.id, WS));

    await rollPeriod(WS, new Date("2026-10-01T00:00:00Z"));

    const after = await reload();
    assert.equal(after.videoSecondsUsed, 0);
    assert.equal(after.periodStartsAt.toISOString(), "2026-10-01T00:00:00.000Z");
    // Leaving it set means the warning arrives once, ever, which is the
    // same as not having one.
    assert.equal(after.usageNoticeSentAt, null);
    // And the top-up still survives a period roll.
    assert.equal(after.topupSeconds, 1800);
  });

  /* --------------------------------------------------------- the link */

  it("links a customer once and never re-points it", async () => {
    await getDb()
      .update(s.workspaces)
      .set({ stripeCustomerId: null })
      .where(eq(s.workspaces.id, WS));

    await linkCustomer(WS, "cus_first");
    assert.equal((await reload()).stripeCustomerId, "cus_first");

    // A workspace whose customer id changes is either a mistake or somebody
    // attaching their own Stripe account to a tenant they do not own.
    await linkCustomer(WS, "cus_attacker");
    assert.equal((await reload()).stripeCustomerId, "cus_first");
  });
});
