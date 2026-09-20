import { and, asc, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/authorize";
import { GENESIS, hashEntry, type ChainableEntry } from "./chain";

/**
 * The audit log.
 *
 * Three properties, in the order they matter:
 *
 *  1. **It is append-only in the database.** A trigger refuses UPDATE and
 *     DELETE for everyone. Application discipline is not a control; every
 *     codebase eventually grows a path that "just fixes up" a row.
 *  2. **It is chained.** Each entry is numbered within its workspace and
 *     hashed over its contents plus the previous hash, so an alteration
 *     made with enough privilege to drop the trigger still leaves evidence.
 *  3. **Writing it never fails the thing it records.** A render that
 *     succeeded is not reported as failed because its audit entry could not
 *     be written — but the failure is loud, because a silently missing
 *     trail is the worst of both worlds.
 */

export interface AuditInput {
  workspaceId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  /**
   * Who acted.
   *
   * `memberId` is nullable because the log has to be able to record an
   * identity that is not a member — a single sign-on assertion refused
   * before any row was written is exactly the kind of thing a workspace
   * administrator needs to see, and it has an email address but no member.
   */
  actor?: { memberId: string | null; email: string | null } | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEntry extends ChainableEntry {
  id: string;
  hash: string;
}

/**
 * Appends one entry.
 *
 * The transaction takes a workspace-scoped advisory lock before reading the
 * tail. Without it two concurrent writers both read sequence 7, both write
 * sequence 8, and one loses to the unique index — or worse, both succeed
 * with different predecessors and the chain forks. The lock is held for the
 * transaction only, and is per workspace, so unrelated tenants never wait
 * on each other.
 */
export async function record(input: AuditInput): Promise<AuditEntry> {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`audit:${input.workspaceId}`}))`,
    );

    const [tail] = await tx
      .select({ seq: s.auditEvents.seq, hash: s.auditEvents.hash })
      .from(s.auditEvents)
      .where(and(eq(s.auditEvents.workspaceId, input.workspaceId), isNotNull(s.auditEvents.seq)))
      .orderBy(desc(s.auditEvents.seq))
      .limit(1);

    const seq = (tail?.seq ?? 0) + 1;
    const prevHash = tail?.hash ?? GENESIS;
    // Generated here rather than by the database default: the timestamp is
    // part of the hash, and `now()` would not be visible to hash against
    // until after the insert.
    const createdAt = new Date();

    const chainable: ChainableEntry = {
      workspaceId: input.workspaceId,
      seq,
      prevHash,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      actorId: input.actor?.memberId ?? null,
      actorEmail: input.actor?.email ?? null,
      ip: input.ip ?? null,
      createdAt,
      metadata: input.metadata ?? null,
    };

    const hash = hashEntry(chainable);

    const [row] = await tx
      .insert(s.auditEvents)
      .values({
        workspaceId: chainable.workspaceId,
        actorId: chainable.actorId,
        actorEmail: chainable.actorEmail,
        action: chainable.action,
        resourceType: chainable.resourceType,
        resourceId: chainable.resourceId,
        ip: chainable.ip,
        metadata: chainable.metadata,
        createdAt,
        seq,
        prevHash,
        hash,
      })
      .returning({ id: s.auditEvents.id });

    return { ...chainable, id: row.id, hash };
  });
}

/**
 * Appends without letting a failure propagate.
 *
 * For paths where the audited action has already happened and cannot be
 * undone — a render that produced a file, a voice that was revoked at the
 * vendor. Losing the entry is bad; reporting a completed action as failed
 * because the log was unavailable is worse, and leaves the two records
 * disagreeing forever.
 */
export async function recordQuietly(input: AuditInput): Promise<AuditEntry | null> {
  try {
    return await record(input);
  } catch (error) {
    console.error(
      `[audit] could not record ${input.action} on ${input.resourceType} ` +
        `for workspace ${input.workspaceId}:`,
      error,
    );
    return null;
  }
}

export type ChainVerdict =
  | { ok: true; entries: number; head: string | null }
  | {
      ok: false;
      entries: number;
      /** The first entry that does not fit the chain. */
      brokenAt: { id: string; seq: number };
      problem: "hash-mismatch" | "broken-link" | "sequence-gap";
    };

/**
 * Recomputes the chain and reports the first entry that does not fit.
 *
 * Reports the *first* divergence rather than a count, because that is the
 * one useful fact: everything before it is intact, everything after it is
 * unprovable, and the boundary is where to look.
 *
 * Entries written before the chain existed have no sequence number and are
 * skipped. Their integrity cannot be proven and inventing a hash for them
 * would be a claim nobody can stand behind.
 */
export async function verifyChain(workspaceId: string): Promise<ChainVerdict> {
  const rows = await getDb()
    .select()
    .from(s.auditEvents)
    .where(and(eq(s.auditEvents.workspaceId, workspaceId), isNotNull(s.auditEvents.seq)))
    .orderBy(asc(s.auditEvents.seq));

  let previousHash = GENESIS;
  let expectedSeq = 1;

  for (const row of rows) {
    const seq = row.seq!;

    if (seq !== expectedSeq) {
      // A gap means an entry was removed — which the trigger forbids, so
      // seeing one means the trigger was not in force when it happened.
      return { ok: false, entries: rows.length, brokenAt: { id: row.id, seq }, problem: "sequence-gap" };
    }
    if (row.prevHash !== previousHash) {
      return { ok: false, entries: rows.length, brokenAt: { id: row.id, seq }, problem: "broken-link" };
    }

    const recomputed = hashEntry({
      workspaceId: row.workspaceId,
      seq,
      prevHash: row.prevHash!,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      ip: row.ip,
      createdAt: row.createdAt,
      metadata: row.metadata,
    });

    if (recomputed !== row.hash) {
      return { ok: false, entries: rows.length, brokenAt: { id: row.id, seq }, problem: "hash-mismatch" };
    }

    previousHash = row.hash!;
    expectedSeq += 1;
  }

  return { ok: true, entries: rows.length, head: rows.length > 0 ? previousHash : null };
}

/**
 * Erases a workspace's audit trail.
 *
 * The one operation the append-only trigger permits, and only inside a
 * transaction that has explicitly declared it. That declaration is the
 * point: a routine cascade from deleting a workspace has declared nothing
 * and still fails loudly, so "deleting the workspace erased the evidence of
 * who deleted it" cannot happen by accident.
 *
 * It is a lawful-erasure path, not a cleanup utility. The caller has to name
 * a reason, and the erasure is reported to the operator's log — the one
 * place left that the deletion cannot reach.
 */
export async function purgeForErasure(
  workspaceId: string,
  reason: string,
): Promise<{ deleted: number }> {
  if (!reason.trim()) {
    throw new Error("Erasing an audit trail requires a stated reason.");
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const verdict = await verifyChain(workspaceId);
    // Recorded before the rows are gone: whether the trail was intact at the
    // moment it was destroyed is the one fact a later investigation cannot
    // recover any other way.
    await tx.execute(sql`SELECT set_config('demoriff.audit_purge', 'on', true)`);

    const rows = await tx
      .delete(s.auditEvents)
      .where(eq(s.auditEvents.workspaceId, workspaceId))
      .returning({ id: s.auditEvents.id });

    console.warn(
      `[audit] erased ${rows.length} entries for workspace ${workspaceId}. ` +
        `Reason: ${reason}. Chain was ${verdict.ok ? "intact" : "already broken"} ` +
        `at erasure${verdict.ok && verdict.head ? `, head ${verdict.head}` : ""}.`,
    );

    return { deleted: rows.length };
  });
}

/** Reads a workspace's trail, newest first. For the settings screen and export. */
export async function list(
  workspaceId: string,
  options: { limit?: number; afterSeq?: number } = {},
) {
  const conditions = [eq(s.auditEvents.workspaceId, workspaceId)];
  if (options.afterSeq !== undefined) conditions.push(gt(s.auditEvents.seq, options.afterSeq));

  return getDb()
    .select()
    .from(s.auditEvents)
    .where(and(...conditions))
    .orderBy(desc(s.auditEvents.createdAt))
    .limit(Math.min(1000, options.limit ?? 100));
}
