import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { record } from "@/lib/audit/log";
import type { Actor } from "@/lib/auth/authorize";
import { authorize } from "@/lib/auth/authorize";
import { canChangeRole, type Role } from "@/lib/auth/roles";
import { revokeAllForMember } from "@/lib/auth/sessions";

/**
 * Membership changes.
 *
 * Every function here does three things together, and the point of the
 * module is that they cannot be done apart: check the actor may do it,
 * make the change, and **end the affected person's live sessions**.
 *
 * That last step is the one that gets forgotten, and it is the one that
 * matters. Removing somebody from a workspace while their browser keeps a
 * valid session for the next twelve hours is not removing them; demoting an
 * admin who still holds an admin session until it expires is not demoting
 * them. Sessions are rows precisely so this can be immediate.
 */

export class MemberChangeError extends Error {
  readonly status = 409;
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = "MemberChangeError";
  }
}

export interface MemberRecord {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: Role;
  deactivatedAt: Date | null;
}

function toMember(row: typeof s.members.$inferSelect): MemberRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    name: row.name,
    role: row.role as Role,
    deactivatedAt: row.deactivatedAt,
  };
}

export async function getMember(memberId: string): Promise<MemberRecord | null> {
  const [row] = await getDb().select().from(s.members).where(eq(s.members.id, memberId)).limit(1);
  return row ? toMember(row) : null;
}

/**
 * Changes somebody's role.
 *
 * The new role takes effect on the next request, not on the next session
 * expiry, because the old sessions are ended here. A demotion that leaves
 * the person holding their previous permissions for hours is a demotion in
 * name only — and the same is true of a promotion that does not appear to
 * work until they sign out and in again.
 */
export async function changeRole(input: {
  actor: Actor;
  memberId: string;
  nextRole: Role;
  ip?: string | null;
}): Promise<MemberRecord> {
  authorize(input.actor, "member.role.change", { workspaceId: input.actor.workspaceId });

  const target = await getMember(input.memberId);
  if (!target || target.workspaceId !== input.actor.workspaceId) {
    throw new MemberChangeError("No such member in this workspace.", "not-found");
  }

  const verdict = canChangeRole({
    actorRole: input.actor.role,
    actorId: input.actor.memberId,
    targetRole: target.role,
    targetId: target.id,
    nextRole: input.nextRole,
  });
  if (!verdict.ok) {
    throw new MemberChangeError(refusalMessage(verdict.reason), verdict.reason);
  }

  if (target.role === "owner" && input.nextRole !== "owner") {
    await assertAnotherOwnerRemains(target.workspaceId, target.id);
  }

  const [updated] = await getDb()
    .update(s.members)
    .set({ role: input.nextRole })
    .where(eq(s.members.id, target.id))
    .returning();

  const sessionsEnded = await revokeAllForMember(target.id, `role changed to ${input.nextRole}`);

  await record({
    workspaceId: input.actor.workspaceId,
    actor: input.actor,
    action: "member.role.changed",
    resourceType: "member",
    resourceId: target.id,
    ip: input.ip ?? null,
    metadata: { email: target.email, from: target.role, to: input.nextRole, sessionsEnded },
  });

  return toMember(updated);
}

/**
 * Deactivates a member.
 *
 * Deactivation rather than deletion: the audit trail references this row,
 * and a departed colleague's name disappearing from every entry they ever
 * wrote is not a feature. The account stops working; the history stays
 * readable.
 */
export async function deactivate(input: {
  actor: Actor;
  memberId: string;
  ip?: string | null;
}): Promise<{ member: MemberRecord; sessionsEnded: number }> {
  authorize(input.actor, "member.remove", { workspaceId: input.actor.workspaceId });

  const target = await getMember(input.memberId);
  if (!target || target.workspaceId !== input.actor.workspaceId) {
    throw new MemberChangeError("No such member in this workspace.", "not-found");
  }
  if (target.id === input.actor.memberId) {
    throw new MemberChangeError(
      "You cannot deactivate your own account.",
      "cannot-deactivate-self",
    );
  }
  if (target.role === "owner" && input.actor.role !== "owner") {
    throw new MemberChangeError("Only an owner may deactivate an owner.", "owner-only");
  }
  if (target.role === "owner") {
    await assertAnotherOwnerRemains(target.workspaceId, target.id);
  }

  const [updated] = await getDb()
    .update(s.members)
    .set({ deactivatedAt: new Date() })
    .where(eq(s.members.id, target.id))
    .returning();

  // The whole reason sessions are rows. Offboarding that leaves somebody
  // signed in for twelve hours is not offboarding.
  const sessionsEnded = await revokeAllForMember(target.id, "account deactivated");

  await record({
    workspaceId: input.actor.workspaceId,
    actor: input.actor,
    action: "member.deactivated",
    resourceType: "member",
    resourceId: target.id,
    ip: input.ip ?? null,
    metadata: { email: target.email, role: target.role, sessionsEnded },
  });

  return { member: toMember(updated), sessionsEnded };
}

/**
 * Refuses to leave a workspace with no owner.
 *
 * A workspace whose last owner demotes or deactivates themselves has nobody
 * who can change billing, revoke a voice, or delete it — a state that can
 * only be fixed by support, which means it must not be reachable by a
 * button.
 */
async function assertAnotherOwnerRemains(workspaceId: string, excludingMemberId: string) {
  const owners = await getDb()
    .select({ id: s.members.id })
    .from(s.members)
    .where(
      and(
        eq(s.members.workspaceId, workspaceId),
        eq(s.members.role, "owner"),
        isNull(s.members.deactivatedAt),
      ),
    );

  const remaining = owners.filter((owner) => owner.id !== excludingMemberId);
  if (remaining.length === 0) {
    throw new MemberChangeError(
      "A workspace must keep at least one active owner. Appoint another owner first.",
      "last-owner",
    );
  }
}

function refusalMessage(reason: string): string {
  switch (reason) {
    case "cannot-change-own-role":
      return "You cannot change your own role.";
    case "cannot-grant-above-own-role":
      return "You cannot grant a role above your own.";
    case "only-an-owner-may-change-an-owner":
      return "Only an owner may appoint or demote an owner.";
    default:
      return "You do not have permission to change roles.";
  }
}

export interface Membership {
  memberId: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
  current: boolean;
}

/**
 * The workspaces this person can switch between: every live membership
 * under the same address.
 *
 * Only from a self-serve workspace, and only into one. An address asserted
 * by a customer's identity provider proves nothing about memberships
 * elsewhere, and a workspace that signs people in through its own provider
 * must be entered through it.
 */
export async function membershipsFor(actor: Actor): Promise<Membership[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: s.members.id,
      workspaceId: s.workspaces.id,
      workspaceName: s.workspaces.name,
      role: s.members.role,
      sso: sql<boolean>`exists (select 1 from ${s.ssoConnections} where ${s.ssoConnections.workspaceId} = ${s.workspaces.id})`,
    })
    .from(s.members)
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.members.workspaceId))
    .where(and(eq(s.members.email, actor.email), isNull(s.members.deactivatedAt), isNull(s.workspaces.deletedAt)))
    .orderBy(s.workspaces.name);

  const here = rows.find((row) => row.workspaceId === actor.workspaceId);
  const reachable = here && !here.sso ? rows.filter((row) => !row.sso) : rows.filter((row) => row.workspaceId === actor.workspaceId);
  return reachable.map((row) => ({
    memberId: row.memberId,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    role: row.role as Role,
    current: row.workspaceId === actor.workspaceId,
  }));
}
