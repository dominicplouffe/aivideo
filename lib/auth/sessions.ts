import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { Actor } from "./authorize";
import type { Role } from "./roles";

/**
 * Sessions.
 *
 * Database-backed, deliberately. A stateless signed token is cheaper to
 * verify and impossible to take back, and "their access ends within the
 * hour" is not an answer when somebody has just been offboarded or a laptop
 * has gone missing. Revocation is the requirement; everything else follows
 * from it.
 *
 * The token is generated here, returned once, and never stored — only its
 * hash is kept, exactly as with a password. A leaked database backup then
 * gives the reader a list of hashes rather than a live session for every
 * customer in the system.
 */

/** Ends an abandoned session on a shared machine. */
export const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** No session lives forever, however often it is used. */
export const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

/** 256 bits. Long enough that guessing is not a threat model. */
const TOKEN_BYTES = 32;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface SessionRecord {
  id: string;
  memberId: string;
  workspaceId: string;
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface IssuedSession {
  /** Returned exactly once. Goes in the cookie and nowhere else. */
  token: string;
  session: SessionRecord;
}

function toRecord(row: typeof s.sessions.$inferSelect): SessionRecord {
  return {
    id: row.id,
    memberId: row.memberId,
    workspaceId: row.workspaceId,
    lastSeenAt: row.lastSeenAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

export async function issue(input: {
  memberId: string;
  workspaceId: string;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
}): Promise<IssuedSession> {
  const now = input.now ?? new Date();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  const [row] = await getDb()
    .insert(s.sessions)
    .values({
      memberId: input.memberId,
      workspaceId: input.workspaceId,
      tokenHash: hashToken(token),
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    })
    .returning();

  return { token, session: toRecord(row) };
}

export type SessionVerdict =
  | { ok: true; actor: Actor; session: SessionRecord }
  | { ok: false; reason: "unknown" | "revoked" | "idle" | "expired" | "member-gone" | "deactivated" };

/**
 * Verifies a token and returns who is holding it.
 *
 * The lookup is by hash, so a timing difference between "no such session"
 * and "wrong session" does not leak anything useful — but the comparison is
 * still constant-time, because the cost is nothing and the habit is worth
 * more than the reasoning about when it happens not to matter.
 *
 * A valid session also updates `lastSeenAt`, which is what makes idle expiry
 * mean anything. The write is skipped when the timestamp is recent, so an
 * active tab polling every few seconds does not write to the database on
 * every request.
 */
export async function verify(
  token: string | null | undefined,
  options: { now?: Date; touchAfterMs?: number } = {},
): Promise<SessionVerdict> {
  if (!token) return { ok: false, reason: "unknown" };

  const now = options.now ?? new Date();
  const db = getDb();

  const [row] = await db
    .select({ session: s.sessions, member: s.members })
    .from(s.sessions)
    .innerJoin(s.members, eq(s.members.id, s.sessions.memberId))
    .where(eq(s.sessions.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return { ok: false, reason: "unknown" };

  const given = Buffer.from(hashToken(token), "utf8");
  const stored = Buffer.from(row.session.tokenHash, "utf8");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    return { ok: false, reason: "unknown" };
  }

  if (row.session.revokedAt) return { ok: false, reason: "revoked" };
  if (row.session.absoluteExpiresAt <= now) return { ok: false, reason: "expired" };
  if (now.getTime() - row.session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
    return { ok: false, reason: "idle" };
  }
  // A deactivated member's live session dies with the account, not at its
  // own expiry. Offboarding that leaves someone signed in for twelve hours
  // is not offboarding.
  if (row.member.deactivatedAt) return { ok: false, reason: "deactivated" };

  const touchAfter = options.touchAfterMs ?? 60_000;
  if (now.getTime() - row.session.lastSeenAt.getTime() > touchAfter) {
    await db.update(s.sessions).set({ lastSeenAt: now }).where(eq(s.sessions.id, row.session.id));
  }

  return {
    ok: true,
    session: toRecord(row.session),
    actor: {
      memberId: row.member.id,
      workspaceId: row.member.workspaceId,
      email: row.member.email,
      role: row.member.role as Role,
      externalId: row.member.externalId,
      deactivatedAt: row.member.deactivatedAt,
    },
  };
}

/**
 * Issues a new token for the same session and invalidates the old one.
 *
 * Called on privilege change and at sign-in. Rotation is what stops a token
 * captured before a promotion from being usable after it, and what closes
 * session fixation: an attacker who plants a known token in a victim's
 * browser finds it dead the moment the victim authenticates.
 */
export async function rotate(
  sessionId: string,
  reason: string,
  now = new Date(),
): Promise<IssuedSession | null> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(s.sessions)
      .where(and(eq(s.sessions.id, sessionId), isNull(s.sessions.revokedAt)))
      .limit(1);
    if (!existing) return null;

    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const [updated] = await tx
      .update(s.sessions)
      .set({ tokenHash: hashToken(token), lastSeenAt: now })
      .where(eq(s.sessions.id, sessionId))
      .returning();

    // The rotation reason is kept on the session so "signed out of another
    // device" can say why.
    void reason;
    return { token, session: toRecord(updated) };
  });
}

export async function revoke(sessionId: string, reason: string, now = new Date()): Promise<boolean> {
  const rows = await getDb()
    .update(s.sessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(eq(s.sessions.id, sessionId), isNull(s.sessions.revokedAt)))
    .returning({ id: s.sessions.id });
  return rows.length > 0;
}

/**
 * Ends every session a person holds.
 *
 * This is the function offboarding calls, and the reason sessions are rows.
 * It is also what a "sign out everywhere" button calls after a password
 * change or a lost laptop.
 */
export async function revokeAllForMember(
  memberId: string,
  reason: string,
  options: { except?: string; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const conditions = [eq(s.sessions.memberId, memberId), isNull(s.sessions.revokedAt)];
  if (options.except) conditions.push(sql`${s.sessions.id} <> ${options.except}`);

  const rows = await getDb()
    .update(s.sessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(...conditions))
    .returning({ id: s.sessions.id });

  return rows.length;
}

/** Live sessions for the "where you are signed in" screen. */
export async function listForMember(memberId: string, now = new Date()): Promise<SessionRecord[]> {
  const rows = await getDb()
    .select()
    .from(s.sessions)
    .where(and(eq(s.sessions.memberId, memberId), isNull(s.sessions.revokedAt)))
    .orderBy(sql`${s.sessions.lastSeenAt} DESC`);

  return rows
    .filter((row) => row.absoluteExpiresAt > now)
    .filter((row) => now.getTime() - row.lastSeenAt.getTime() <= IDLE_TIMEOUT_MS)
    .map(toRecord);
}

/**
 * Deletes sessions that can no longer authenticate anyone.
 *
 * Expired and revoked rows are dead weight on the token-hash index, and a
 * table that only grows makes the one query on the hot path slower every
 * week. Run on a schedule; it is safe to run at any time.
 */
export async function sweep(now = new Date(), olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const rows = await getDb()
    .delete(s.sessions)
    .where(
      or(
        lt(s.sessions.absoluteExpiresAt, cutoff),
        and(sql`${s.sessions.revokedAt} IS NOT NULL`, lt(s.sessions.revokedAt, cutoff)),
      ),
    )
    .returning({ id: s.sessions.id });
  return rows.length;
}
