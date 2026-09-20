import { and, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { planFor, type Plan } from "./plans";

/**
 * Metering.
 *
 * Four decisions, each of which a customer would notice if it went the other
 * way:
 *
 *  1. **Seconds, never minutes.** A 71-second render is 71 seconds. Billing
 *     in minutes means rounding, and rounding up on every render is a price
 *     increase nobody agreed to.
 *  2. **Every charge is idempotent.** A render job whose lease expires is
 *     reclaimed and may complete twice. Without a unique key on the ledger,
 *     the customer pays twice for one video — and finds out from an invoice,
 *     not from us.
 *  3. **The counter is a cache; the ledger is the truth.** "Why does my
 *     invoice say that?" has to be answerable with a list of renders, not
 *     with a number that was incremented somewhere.
 *  4. **Running out does not cut you off unless you asked it to.** The
 *     default is to keep working and bill the overage. A workspace that
 *     stops mid-launch because of a setting nobody chose is a worse outcome
 *     than a line on an invoice — so the hard stop exists, and the customer
 *     turns it on.
 */

export interface UsageSnapshot {
  workspaceId: string;
  plan: Plan;
  periodStartsAt: Date;
  /** Included allowance for the period. */
  limitSeconds: number;
  /** Bought outright, carried across periods. */
  topupSeconds: number;
  usedSeconds: number;
  /** Included + top-up, minus used. Negative once into overage. */
  remainingSeconds: number;
  fractionUsed: number;
  hardStopAtLimit: boolean;
  /** True when the next render would be refused. */
  blocked: boolean;
}

export async function usage(workspaceId: string): Promise<UsageSnapshot> {
  const [row] = await getDb()
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId))
    .limit(1);

  if (!row) throw new Error(`Unknown workspace ${workspaceId}`);
  return snapshotOf(row);
}

function snapshotOf(row: typeof s.workspaces.$inferSelect): UsageSnapshot {
  const allowance = row.videoSecondsLimit + row.topupSeconds;
  const remaining = allowance - row.videoSecondsUsed;

  return {
    workspaceId: row.id,
    plan: row.plan as Plan,
    periodStartsAt: row.periodStartsAt,
    limitSeconds: row.videoSecondsLimit,
    topupSeconds: row.topupSeconds,
    usedSeconds: row.videoSecondsUsed,
    remainingSeconds: remaining,
    // A zero allowance is fully used, not undefined. Reporting NaN to a
    // progress bar is how a billing screen renders "NaN% used".
    fractionUsed: allowance > 0 ? row.videoSecondsUsed / allowance : 1,
    hardStopAtLimit: row.hardStopAtLimit,
    blocked: row.hardStopAtLimit && remaining <= 0,
  };
}

export type MeterOutcome =
  | { ok: true; charged: number; duplicate: boolean; snapshot: UsageSnapshot; noticeDue: boolean }
  | { ok: false; reason: "hard-stop"; snapshot: UsageSnapshot };

export interface MeterInput {
  workspaceId: string;
  seconds: number;
  /** What was produced. The ledger line a customer reads. */
  resourceType: string;
  resourceId: string;
  /**
   * Stable across retries of the same work. A render's job id, not a
   * timestamp: the whole point is that the second attempt recognises the
   * first.
   */
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/** The share of the allowance at which a customer is told they are running out. */
export const NOTICE_THRESHOLD = 0.8;

/**
 * Records usage and advances the counter, once.
 *
 * The transaction locks the workspace row before reading it. Two renders
 * finishing at the same moment otherwise both read 1,000 seconds used, both
 * write 1,060, and one render is free.
 *
 * Note what this does *not* do: it never refuses work that has already been
 * done. The hard stop is enforced by `checkBeforeWork`, before a render
 * starts. Refusing to meter a finished video would mean the file exists, the
 * compute was spent, and the ledger says it never happened.
 */
export async function meter(input: MeterInput): Promise<MeterOutcome> {
  if (!Number.isFinite(input.seconds) || input.seconds < 0) {
    throw new Error(`Refusing to meter ${input.seconds} seconds.`);
  }
  // Rounded up to the second only at the point of charging, and only
  // because the ledger stores integers. Sub-second renders still cost a
  // second; nothing longer is rounded at all.
  const seconds = Math.ceil(input.seconds);

  const db = getDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(s.workspaces)
      .where(eq(s.workspaces.id, input.workspaceId))
      .for("update")
      .limit(1);

    if (!row) throw new Error(`Unknown workspace ${input.workspaceId}`);

    const inserted = await tx
      .insert(s.usageEvents)
      .values({
        workspaceId: input.workspaceId,
        kind: "render",
        seconds,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        periodStartsAt: row.periodStartsAt,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? null,
      })
      .onConflictDoNothing({ target: [s.usageEvents.workspaceId, s.usageEvents.idempotencyKey] })
      .returning({ id: s.usageEvents.id });

    if (inserted.length === 0) {
      // Already billed. Returning ok rather than throwing is deliberate: the
      // caller's job succeeded, and the correct response to "this was
      // already counted" is to carry on.
      return {
        ok: true as const,
        charged: 0,
        duplicate: true,
        snapshot: snapshotOf(row),
        noticeDue: false,
      };
    }

    const wasBelowThreshold =
      row.videoSecondsUsed < (row.videoSecondsLimit + row.topupSeconds) * NOTICE_THRESHOLD;

    const [updated] = await tx
      .update(s.workspaces)
      .set({ videoSecondsUsed: sql`${s.workspaces.videoSecondsUsed} + ${seconds}` })
      .where(eq(s.workspaces.id, input.workspaceId))
      .returning();

    const snapshot = snapshotOf(updated);
    // Due exactly once per period: on the render that crosses the line, not
    // on every render after it.
    const noticeDue =
      wasBelowThreshold &&
      snapshot.fractionUsed >= NOTICE_THRESHOLD &&
      updated.usageNoticeSentAt === null;

    return { ok: true as const, charged: seconds, duplicate: false, snapshot, noticeDue };
  });
}

/**
 * Whether work may start.
 *
 * Called before a render, which is the only moment refusing helps anyone.
 * Returns the reason so the caller can say "your workspace has a hard stop
 * enabled and is out of minutes" rather than a generic failure — the
 * difference between a customer fixing it in a minute and filing a ticket.
 */
export async function checkBeforeWork(
  workspaceId: string,
): Promise<{ ok: true; snapshot: UsageSnapshot } | { ok: false; reason: "hard-stop"; snapshot: UsageSnapshot }> {
  const snapshot = await usage(workspaceId);
  if (snapshot.blocked) return { ok: false, reason: "hard-stop", snapshot };
  return { ok: true, snapshot };
}

/** Marks the 80% notice as sent, so it is not sent again this period. */
export async function markNoticeSent(workspaceId: string): Promise<void> {
  await getDb()
    .update(s.workspaces)
    .set({ usageNoticeSentAt: new Date() })
    .where(eq(s.workspaces.id, workspaceId));
}

/**
 * Adds purchased seconds.
 *
 * Top-ups are added to a separate column rather than subtracted from usage.
 * Netting them off the counter would make "you have used 9 of 10 hours"
 * wrong the moment someone buys more, and a usage figure that moves when you
 * pay is a support ticket every time.
 */
export async function topUp(input: {
  workspaceId: string;
  seconds: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ applied: boolean; snapshot: UsageSnapshot }> {
  if (input.seconds <= 0) throw new Error("A top-up must add time.");

  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(s.workspaces)
      .where(eq(s.workspaces.id, input.workspaceId))
      .for("update")
      .limit(1);
    if (!row) throw new Error(`Unknown workspace ${input.workspaceId}`);

    const inserted = await tx
      .insert(s.usageEvents)
      .values({
        workspaceId: input.workspaceId,
        kind: "topup",
        // Negative: a top-up is time added, and the ledger's sign convention
        // is "seconds consumed". A purchase consumes minus an hour.
        seconds: -input.seconds,
        periodStartsAt: row.periodStartsAt,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? null,
      })
      .onConflictDoNothing({ target: [s.usageEvents.workspaceId, s.usageEvents.idempotencyKey] })
      .returning({ id: s.usageEvents.id });

    if (inserted.length === 0) return { applied: false, snapshot: snapshotOf(row) };

    const [updated] = await tx
      .update(s.workspaces)
      .set({ topupSeconds: sql`${s.workspaces.topupSeconds} + ${input.seconds}` })
      .where(eq(s.workspaces.id, input.workspaceId))
      .returning();

    return { applied: true, snapshot: snapshotOf(updated) };
  });
}

/**
 * Starts a new billing period.
 *
 * Included seconds reset. Top-ups do not: they were paid for outright, and
 * expiring them means charging for time and then taking it back. The notice
 * flag clears, so next period's warning can fire.
 */
export async function rollPeriod(workspaceId: string, at = new Date()): Promise<UsageSnapshot> {
  const [row] = await getDb()
    .update(s.workspaces)
    .set({ videoSecondsUsed: 0, periodStartsAt: at, usageNoticeSentAt: null })
    .where(eq(s.workspaces.id, workspaceId))
    .returning();

  if (!row) throw new Error(`Unknown workspace ${workspaceId}`);

  await recordQuietly({
    workspaceId,
    action: "billing.period.rolled",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: { periodStartsAt: at.toISOString(), carriedTopupSeconds: row.topupSeconds },
  });

  return snapshotOf(row);
}

/**
 * Recomputes the counter from the ledger and reports any drift.
 *
 * The counter exists for speed; the ledger is what a customer is shown. If
 * they ever disagree, the invoice and the explanation disagree, and the
 * explanation is the one that is right — so this reports the difference
 * rather than quietly correcting it. Silently writing the counter to match
 * would hide the bug that caused the drift.
 */
export async function reconcile(workspaceId: string): Promise<{
  counter: number;
  ledger: number;
  drift: number;
}> {
  const db = getDb();

  const [row] = await db
    .select({ used: s.workspaces.videoSecondsUsed, period: s.workspaces.periodStartsAt })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId))
    .limit(1);
  if (!row) throw new Error(`Unknown workspace ${workspaceId}`);

  const [totals] = await db
    .select({ total: sum(s.usageEvents.seconds) })
    .from(s.usageEvents)
    .where(
      and(
        eq(s.usageEvents.workspaceId, workspaceId),
        eq(s.usageEvents.periodStartsAt, row.period),
        eq(s.usageEvents.kind, "render"),
      ),
    );

  const ledger = Number(totals?.total ?? 0);
  return { counter: row.used, ledger, drift: row.used - ledger };
}

/** The overage a period has accrued, in cents. Zero on plans without one. */
export function overageCents(snapshot: UsageSnapshot): number {
  const rate = planFor(snapshot.plan).overageCentsPerSecond;
  if (rate === null) return 0;
  const over = Math.max(0, -snapshot.remainingSeconds);
  return over * rate;
}
