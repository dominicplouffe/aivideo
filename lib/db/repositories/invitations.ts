import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { record, recordQuietly } from "@/lib/audit/log";
import { authorize, type Actor } from "@/lib/auth/authorize";
import { invitableRoles, type Role } from "@/lib/auth/roles";
import { hashToken } from "@/lib/auth/sessions";
import { usesSingleSignOn } from "@/lib/auth/sso";
import { normalizePlan, planFor } from "@/lib/billing/plans";
import { MemberChangeError } from "./members";

/**
 * Invitations into a workspace.
 *
 * An invitation reserves a seat from the moment it is sent, so a workspace
 * cannot invite past its plan and then find the seats were never there. It
 * is accepted by somebody signing in with the address it was sent to — the
 * identity provider's verification is the proof — and never by the link
 * alone.
 */

export const INVITATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface InvitationRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: Role;
  invitedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
}

function toRecord(row: typeof s.invitations.$inferSelect, now = new Date()): InvitationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role as Role,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    expired: row.expiresAt <= now,
  };
}

const open = and(isNull(s.invitations.acceptedAt), isNull(s.invitations.revokedAt));

function mint(now: Date): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY_MS) };
}

/* ------------------------------------------------------------------ seats */

export interface Seats {
  /** Null is unlimited. */
  limit: number | null;
  members: number;
  /** Open invitations, expired ones included until somebody revokes them. */
  invited: number;
}

export async function seats(workspaceId: string): Promise<Seats> {
  const db = getDb();
  const [workspace] = await db
    .select({ plan: s.workspaces.plan, seatsTotal: s.workspaces.seatsTotal })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new MemberChangeError("No such workspace.", "not-found");

  const [[members], [invited]] = await Promise.all([
    db.select({ n: count() }).from(s.members).where(and(eq(s.members.workspaceId, workspaceId), isNull(s.members.deactivatedAt))),
    db.select({ n: count() }).from(s.invitations).where(and(eq(s.invitations.workspaceId, workspaceId), open)),
  ]);

  return {
    // A plan without a seat count is unlimited however the column reads.
    limit: planFor(normalizePlan(workspace.plan)).seats === null ? null : workspace.seatsTotal,
    members: Number(members?.n ?? 0),
    invited: Number(invited?.n ?? 0),
  };
}

/* ----------------------------------------------------------------- invite */

export async function createInvitation(input: {
  actor: Actor;
  email: string;
  role: Role;
  ip?: string | null;
  now?: Date;
}): Promise<{ invitation: InvitationRecord; token: string }> {
  authorize(input.actor, "member.invite", { workspaceId: input.actor.workspaceId });
  const workspaceId = input.actor.workspaceId;
  const email = input.email.trim().toLowerCase();
  const now = input.now ?? new Date();

  if (!EMAIL.test(email)) throw new MemberChangeError("Enter a valid email address.", "invalid-email");
  if (!invitableRoles(input.actor.role).includes(input.role)) {
    throw new MemberChangeError("You cannot invite somebody at a role above your own.", "cannot-grant-above-own-role");
  }
  // Their identity provider adds people, and an invitation would be a way
  // in that it never approved.
  if (await usesSingleSignOn(workspaceId)) {
    throw new MemberChangeError(
      "This workspace adds people through single sign-on. Assign them in your identity provider instead.",
      "single-sign-on",
    );
  }

  const db = getDb();
  const [member] = await db
    .select({ id: s.members.id })
    .from(s.members)
    .where(and(eq(s.members.workspaceId, workspaceId), eq(s.members.email, email), isNull(s.members.deactivatedAt)))
    .limit(1);
  if (member) throw new MemberChangeError(`${email} is already a member of this workspace.`, "already-member");

  const [pending] = await db
    .select({ id: s.invitations.id })
    .from(s.invitations)
    .where(and(eq(s.invitations.workspaceId, workspaceId), eq(s.invitations.email, email), open))
    .limit(1);
  if (pending) throw new MemberChangeError(`${email} has already been invited. Resend that invitation instead.`, "already-invited");

  const room = await seats(workspaceId);
  if (room.limit !== null && room.members + room.invited >= room.limit) {
    throw new MemberChangeError(
      `This workspace has ${room.limit} seat${room.limit === 1 ? "" : "s"}, and ${room.members + room.invited} ${room.members + room.invited === 1 ? "is" : "are"} taken or invited. Move to a plan with more seats, or revoke an invitation.`,
      "no-seats",
    );
  }

  const { token, tokenHash, expiresAt } = mint(now);
  const [row] = await db
    .insert(s.invitations)
    .values({ workspaceId, email, role: input.role, invitedBy: input.actor.memberId, tokenHash, expiresAt, createdAt: now })
    .returning();

  await record({
    workspaceId,
    actor: input.actor,
    action: "member.invited",
    resourceType: "invitation",
    resourceId: row.id,
    ip: input.ip ?? null,
    metadata: { email, role: input.role },
  });

  return { invitation: toRecord(row, now), token };
}

/** Open invitations, newest first, including expired ones awaiting a resend. */
export async function listInvitations(workspaceId: string, now = new Date()): Promise<InvitationRecord[]> {
  const rows = await getDb()
    .select()
    .from(s.invitations)
    .where(and(eq(s.invitations.workspaceId, workspaceId), open))
    .orderBy(desc(s.invitations.createdAt));
  return rows.map((row) => toRecord(row, now));
}

async function openInvitation(actor: Actor, id: string) {
  authorize(actor, "member.invite", { workspaceId: actor.workspaceId });
  const [row] = await getDb()
    .select()
    .from(s.invitations)
    .where(and(eq(s.invitations.id, id), eq(s.invitations.workspaceId, actor.workspaceId), open))
    .limit(1);
  if (!row) throw new MemberChangeError("No such invitation in this workspace.", "not-found");
  return row;
}

/** A new link and a new week. The old link stops working. */
export async function renewInvitation(input: {
  actor: Actor;
  id: string;
  ip?: string | null;
  now?: Date;
}): Promise<{ invitation: InvitationRecord; token: string }> {
  const current = await openInvitation(input.actor, input.id);
  const now = input.now ?? new Date();
  const { token, tokenHash, expiresAt } = mint(now);
  const [row] = await getDb()
    .update(s.invitations)
    .set({ tokenHash, expiresAt })
    .where(eq(s.invitations.id, current.id))
    .returning();

  await record({
    workspaceId: input.actor.workspaceId,
    actor: input.actor,
    action: "member.invitation_renewed",
    resourceType: "invitation",
    resourceId: row.id,
    ip: input.ip ?? null,
    metadata: { email: row.email, role: row.role },
  });

  return { invitation: toRecord(row, now), token };
}

export async function revokeInvitation(input: { actor: Actor; id: string; ip?: string | null }): Promise<void> {
  const current = await openInvitation(input.actor, input.id);
  await getDb().update(s.invitations).set({ revokedAt: new Date() }).where(eq(s.invitations.id, current.id));

  await record({
    workspaceId: input.actor.workspaceId,
    actor: input.actor,
    action: "member.invitation_revoked",
    resourceType: "invitation",
    resourceId: current.id,
    ip: input.ip ?? null,
    metadata: { email: current.email, role: current.role },
  });
}

/* ----------------------------------------------------------------- accept */

export type InvitationLookup =
  | {
      ok: true;
      invitation: InvitationRecord;
      workspaceName: string;
      inviterName: string | null;
    }
  | { ok: false; reason: "not-found" | "expired" | "used" };

/** What a link points at, for the page it opens. */
export async function findInvitation(token: string, now = new Date()): Promise<InvitationLookup> {
  if (!token) return { ok: false, reason: "not-found" };
  const [row] = await getDb()
    .select({ invitation: s.invitations, workspaceName: s.workspaces.name, inviterName: s.members.name })
    .from(s.invitations)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.invitations.workspaceId))
    .leftJoin(s.members, eq(s.members.id, s.invitations.invitedBy))
    .where(and(eq(s.invitations.tokenHash, hashToken(token)), isNull(s.workspaces.deletedAt)))
    .limit(1);

  if (!row) return { ok: false, reason: "not-found" };
  if (row.invitation.acceptedAt || row.invitation.revokedAt) return { ok: false, reason: "used" };
  if (row.invitation.expiresAt <= now) return { ok: false, reason: "expired" };
  return {
    ok: true,
    invitation: toRecord(row.invitation, now),
    workspaceName: row.workspaceName,
    inviterName: row.inviterName,
  };
}

type Member = typeof s.members.$inferSelect;

/**
 * Turns an open invitation into a membership.
 *
 * `email` must be an address the caller has verified belongs to the person
 * accepting — a self-serve sign-in's verified address, never something typed.
 * A colleague removed earlier is reactivated at the invited role rather than
 * duplicated, so their history stays theirs.
 */
export async function acceptInvitation(input: {
  invitationId: string;
  email: string;
  name: string;
  externalId?: string | null;
  now?: Date;
}): Promise<{ ok: true; member: Member } | { ok: false; reason: "not-found" | "expired" | "wrong-email" }> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();

  const outcome = await getDb().transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(s.invitations)
      .where(and(eq(s.invitations.id, input.invitationId), open))
      .for("update")
      .limit(1);
    if (!invitation) return { ok: false as const, reason: "not-found" as const };
    if (invitation.expiresAt <= now) return { ok: false as const, reason: "expired" as const };
    if (invitation.email !== email) return { ok: false as const, reason: "wrong-email" as const };

    const [existing] = await tx
      .select()
      .from(s.members)
      .where(and(eq(s.members.workspaceId, invitation.workspaceId), eq(s.members.email, email)))
      .limit(1);

    const [member] = existing
      ? await tx
          .update(s.members)
          .set({
            // An active member keeps their role: an invitation never demotes.
            role: existing.deactivatedAt ? invitation.role : existing.role,
            deactivatedAt: null,
            externalId: existing.externalId || input.externalId || null,
            lastActiveAt: now,
          })
          .where(eq(s.members.id, existing.id))
          .returning()
      : await tx
          .insert(s.members)
          .values({
            workspaceId: invitation.workspaceId,
            email,
            name: input.name || email.split("@")[0],
            role: invitation.role,
            externalId: input.externalId ?? null,
            lastActiveAt: now,
          })
          .returning();

    await tx.update(s.invitations).set({ acceptedAt: now }).where(eq(s.invitations.id, invitation.id));
    return { ok: true as const, member, invitation };
  });

  if (!outcome.ok) return outcome;

  await recordQuietly({
    workspaceId: outcome.member.workspaceId,
    actor: { memberId: outcome.member.id, email: outcome.member.email },
    action: "member.joined",
    resourceType: "member",
    resourceId: outcome.member.id,
    metadata: { invitationId: outcome.invitation.id, role: outcome.member.role, invitedBy: outcome.invitation.invitedBy },
  });

  return { ok: true, member: outcome.member };
}

/**
 * Every open invitation for a verified address, accepted at once.
 *
 * For somebody signing in for the first time: they came because they were
 * invited, and giving them an empty workspace of their own instead is the
 * one outcome nobody wants. Returns the newest membership, or null when
 * there was nothing to accept.
 */
export async function acceptInvitationsFor(profile: {
  email: string;
  name: string;
  externalId?: string | null;
}, now = new Date()): Promise<Member | null> {
  const email = profile.email.trim().toLowerCase();
  const pending = await getDb()
    .select({ id: s.invitations.id })
    .from(s.invitations)
    .where(and(eq(s.invitations.email, email), open, gt(s.invitations.expiresAt, now)))
    .orderBy(desc(s.invitations.createdAt));

  let newest: Member | null = null;
  for (const invitation of pending) {
    const accepted = await acceptInvitation({ invitationId: invitation.id, ...profile, now });
    if (accepted.ok && !newest) newest = accepted.member;
  }
  return newest;
}
