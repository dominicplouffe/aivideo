import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { includedSeconds, planFor } from "./plans";
import { grantsAccess, type Subscription } from "./stripe";

/**
 * Applying what Stripe told us.
 *
 * The one rule: **this is the only path that writes a workspace's plan**, and
 * it runs only from a verified webhook. A plan set from a client request is
 * a plan anybody can set, and "upgrade by POSTing your own subscription" is
 * the oldest billing bug there is.
 *
 * What changes and what does not is worth being precise about, because the
 * wrong answer costs a customer money:
 *
 *  - The **plan**, **seats** and **included seconds** follow the
 *    subscription. That is what they bought.
 *  - **Usage already recorded does not reset.** Someone upgrading mid-period
 *    has used what they used; zeroing it would hand them the month back and
 *    make the invoice disagree with the ledger.
 *  - **Top-up seconds are never touched.** They were paid for outright and
 *    carry across periods — that is the promise, and a plan change is not a
 *    reason to take them back.
 */

export type SyncOutcome =
  | { ok: true; workspaceId: string; plan: string; status: string; changed: boolean }
  | { ok: false; reason: "unknown-customer" | "already-handled" };

/**
 * Records that an event was handled, or reports that it already was.
 *
 * Stripe retries for three days, including deliveries we handled perfectly
 * well but answered slowly. One retried `invoice.paid` granting a second
 * period, or one retried `subscription.deleted` cancelling a workspace that
 * had resubscribed, is exactly the kind of bug that surfaces as an angry
 * support ticket rather than as an exception.
 */
export async function claimEvent(
  eventId: string,
  type: string,
  workspaceId: string | null,
): Promise<boolean> {
  const inserted = await getDb()
    .insert(s.billingEvents)
    .values({ id: eventId, type, workspaceId })
    .onConflictDoNothing({ target: s.billingEvents.id })
    .returning({ id: s.billingEvents.id });

  return inserted.length > 0;
}

/**
 * Forgets deliveries far older than Stripe will ever retry.
 *
 * Without this the table is a permanent ledger of every webhook ever sent,
 * which is a row per invoice per customer per month for the life of the
 * product. Stripe gives up after three days, so anything past a month is
 * being kept for no reason — and the one thing it must never do is prune
 * inside that window, which is why the floor is days rather than hours.
 */
export async function pruneBillingEvents(olderThanDays = 30): Promise<number> {
  const days = Math.max(7, Math.floor(olderThanDays));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const removed = await getDb()
    .delete(s.billingEvents)
    .where(lt(s.billingEvents.handledAt, cutoff))
    .returning({ id: s.billingEvents.id });

  return removed.length;
}

export async function workspaceForCustomer(customerId: string) {
  if (!customerId) return null;
  const [workspace] = await getDb()
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.stripeCustomerId, customerId))
    .limit(1);
  return workspace ?? null;
}

/** Writes a subscription onto the workspace it belongs to. */
export async function applySubscription(
  subscription: Subscription,
  options: { cancelled?: boolean } = {},
): Promise<SyncOutcome> {
  const workspace = await workspaceForCustomer(subscription.customerId);
  if (!workspace) {
    // Not an error to retry. A customer we have never seen is a workspace
    // that was deleted, or a Stripe account pointed at the wrong deployment;
    // retrying either for three days changes nothing.
    return { ok: false, reason: "unknown-customer" };
  }

  // A cancellation drops to free rather than to nothing. Somebody who stops
  // paying keeps their recordings and their history; they lose the
  // allowance, not the work.
  const plan = options.cancelled || !grantsAccess(subscription.status)
    ? "free"
    : subscription.plan;
  const definition = planFor(plan);
  const packs = plan === "studio" ? subscription.packs : 0;

  const changed =
    workspace.plan !== plan ||
    workspace.projectPacks !== packs ||
    workspace.subscriptionStatus !== subscription.status ||
    workspace.stripeSubscriptionId !== subscription.id;

  await getDb()
    .update(s.workspaces)
    .set({
      plan,
      projectPacks: packs,
      seatsTotal: definition.seats ?? workspace.seatsTotal,
      videoSecondsLimit: includedSeconds(plan, packs),
      // A plan with a minimum term may first be cancelled when its first
      // paid period ends: for the annual plan, a year from purchase.
      planTermEndsAt: options.cancelled
        ? null
        : definition.minimumMonths > 0
          ? (workspace.planTermEndsAt ?? subscription.currentPeriodEnd)
          : null,
      stripeSubscriptionId: options.cancelled ? null : subscription.id,
      subscriptionStatus: options.cancelled ? "canceled" : subscription.status,
      subscriptionEndsAt: options.cancelled ? null : subscription.currentPeriodEnd,
      // Deliberately absent: videoSecondsUsed and topupSeconds. Usage
      // already recorded is a fact about the period, and top-ups were bought
      // outright.
    })
    .where(eq(s.workspaces.id, workspace.id));

  if (changed) {
    await recordQuietly({
      workspaceId: workspace.id,
      actor: null,
      action: "billing.plan_changed",
      resourceType: "workspace",
      resourceId: workspace.id,
      metadata: {
        from: workspace.plan,
        to: plan,
        packs,
        status: subscription.status,
        via: "stripe-webhook",
      },
    });
  }

  return {
    ok: true,
    workspaceId: workspace.id,
    plan,
    status: options.cancelled ? "canceled" : subscription.status,
    changed,
  };
}

/**
 * Rolls a workspace's usage period.
 *
 * Called on `invoice.paid`, because that is the moment the customer has paid
 * for a fresh allowance — not on a timer of our own, which would drift out
 * of step with Stripe's billing anchor and give somebody either a free week
 * or a short month, every month, forever.
 */
export async function rollPeriod(workspaceId: string, startsAt: Date): Promise<void> {
  await getDb()
    .update(s.workspaces)
    .set({
      videoSecondsUsed: 0,
      periodStartsAt: startsAt,
      // Cleared so the 80% notice can fire again in the new period. Leaving
      // it set means the warning arrives once, ever, which is the same as
      // not having one.
      usageNoticeSentAt: null,
    })
    .where(eq(s.workspaces.id, workspaceId));

  await recordQuietly({
    workspaceId,
    actor: null,
    action: "billing.period_rolled",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: { startsAt: startsAt.toISOString() },
  });
}

/** Links a workspace to its Stripe customer, once, at checkout. */
export async function linkCustomer(workspaceId: string, customerId: string): Promise<void> {
  await getDb()
    .update(s.workspaces)
    .set({ stripeCustomerId: customerId })
    .where(
      // Only when it is unset. A workspace whose customer id changes is
      // either a mistake or somebody attaching their own Stripe account to
      // a tenant they do not own.
      sql`${s.workspaces.id} = ${workspaceId} AND ${s.workspaces.stripeCustomerId} IS NULL`,
    );
}
