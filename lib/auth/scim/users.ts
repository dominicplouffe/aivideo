import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { revokeAllForMember } from "../sessions";
import { roleFor } from "../identity/provisioning";
import type { ScimPrincipal } from "./tokens";

/**
 * SCIM users, mapped onto members.
 *
 * The whole value of directory sync is the *de*provisioning half. Creating
 * accounts is convenient; removing them on the day somebody leaves is the
 * thing a security review asks about, and it is the thing that goes wrong
 * when it is a person's job to remember.
 *
 * So deactivation here does two things, not one: it marks the member row,
 * and it ends every live session that member holds. A directory that says
 * "this person has left" and leaves their open tab working has not
 * offboarded anybody.
 *
 * Members are never hard-deleted. A DELETE deactivates, because the audit
 * trail, the recordings they made and the renders they approved all point at
 * a member row, and removing it would either cascade away evidence or leave
 * dangling references. The directory's word for "gone" is `active: false`
 * anyway; `DELETE` is the rarer path.
 */

export const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

type Member = typeof s.members.$inferSelect;

export interface ScimUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name: { givenName?: string; familyName?: string; formatted: string };
  emails: { value: string; primary: boolean; type: string }[];
  active: boolean;
  /** Not part of core SCIM; carried so an admin can see what we decided. */
  roles: { value: string; primary: boolean }[];
  meta: { resourceType: "User"; created: string; lastModified: string; location: string };
}

export function toScimUser(member: Member, baseUrl: string): ScimUser {
  const [givenName, ...family] = (member.name ?? "").split(" ");
  return {
    schemas: [USER_SCHEMA],
    id: member.id,
    externalId: member.externalId ?? undefined,
    userName: member.email,
    name: {
      givenName: givenName || undefined,
      familyName: family.join(" ") || undefined,
      formatted: member.name,
    },
    emails: [{ value: member.email, primary: true, type: "work" }],
    active: member.deactivatedAt === null,
    roles: [{ value: member.role, primary: true }],
    meta: {
      resourceType: "User",
      created: member.createdAt.toISOString(),
      lastModified: (member.lastActiveAt ?? member.createdAt).toISOString(),
      location: `${baseUrl}/Users/${member.id}`,
    },
  };
}

export class ScimError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly scimType?: string,
  ) {
    super(message);
    this.name = "ScimError";
  }
}

/* --------------------------------------------------------------- reading */

/**
 * The one filter every directory sends: `userName eq "someone@example.com"`.
 *
 * Parsed rather than interpreted. SCIM's filter grammar is large, almost
 * none of it is used by real directories, and a half-implemented expression
 * evaluator over a database is a way to get a query wrong in a direction
 * nobody notices. Anything beyond the two supported forms is refused with
 * the status the specification has for exactly that.
 */
export function parseFilter(filter: string | null): { field: "email" | "externalId"; value: string } | null {
  if (!filter) return null;
  const match = /^\s*(userName|externalId)\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
  if (!match) {
    throw new ScimError(400, `Unsupported filter: ${filter}`, "invalidFilter");
  }
  const field = match[1].toLowerCase() === "username" ? "email" : "externalId";
  return { field, value: field === "email" ? match[2].trim().toLowerCase() : match[2] };
}

export async function listUsers(
  principal: ScimPrincipal,
  options: { filter?: string | null; startIndex?: number; count?: number },
): Promise<{ total: number; startIndex: number; members: Member[] }> {
  const parsed = parseFilter(options.filter ?? null);
  const startIndex = Math.max(1, options.startIndex ?? 1);
  const count = Math.min(200, Math.max(0, options.count ?? 100));

  // Scoped to the token's workspace before anything else is considered. A
  // SCIM request carries no tenant, and this is why.
  const where = parsed
    ? and(
        eq(s.members.workspaceId, principal.workspaceId),
        parsed.field === "email"
          ? eq(s.members.email, parsed.value)
          : eq(s.members.externalId, parsed.value),
      )
    : eq(s.members.workspaceId, principal.workspaceId);

  const db = getDb();
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(s.members)
    .where(where);

  const rows = count === 0
    ? []
    : await db
        .select()
        .from(s.members)
        .where(where)
        .orderBy(asc(s.members.createdAt))
        .limit(count)
        .offset(startIndex - 1);

  return { total, startIndex, members: rows };
}

export async function getUser(principal: ScimPrincipal, id: string): Promise<Member> {
  // Ids are UUIDs; a directory that sends anything else is asking about a
  // resource that cannot exist, and letting it reach the query would mean
  // a database error instead of a 404.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ScimError(404, "No such user.");
  }

  const [member] = await getDb()
    .select()
    .from(s.members)
    .where(and(eq(s.members.id, id), eq(s.members.workspaceId, principal.workspaceId)))
    .limit(1);

  // The same answer for "does not exist" and "belongs to another workspace".
  // A different one would let a directory enumerate another tenant's members
  // by id.
  if (!member) throw new ScimError(404, "No such user.");
  return member;
}

/* --------------------------------------------------------------- writing */

export interface ScimUserInput {
  userName?: unknown;
  externalId?: unknown;
  name?: { givenName?: unknown; familyName?: unknown; formatted?: unknown };
  emails?: { value?: unknown; primary?: unknown }[];
  active?: unknown;
  groups?: { display?: unknown; value?: unknown }[];
}

function emailFrom(input: ScimUserInput): string {
  const primary = input.emails?.find((e) => e.primary)?.value ?? input.emails?.[0]?.value;
  const candidate = typeof input.userName === "string" && input.userName.includes("@")
    ? input.userName
    : typeof primary === "string"
      ? primary
      : "";
  const email = candidate.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new ScimError(400, "userName must be an email address.", "invalidValue");
  }
  return email;
}

function nameFrom(input: ScimUserInput, email: string): string {
  const formatted = typeof input.name?.formatted === "string" ? input.name.formatted : "";
  if (formatted.trim()) return formatted.trim();
  const given = typeof input.name?.givenName === "string" ? input.name.givenName : "";
  const family = typeof input.name?.familyName === "string" ? input.name.familyName : "";
  const joined = `${given} ${family}`.trim();
  return joined || email.split("@")[0];
}

function groupsFrom(input: ScimUserInput): string[] {
  return (input.groups ?? [])
    .map((group) => (typeof group.display === "string" ? group.display : ""))
    .filter(Boolean);
}

export async function createUser(
  principal: ScimPrincipal,
  input: ScimUserInput,
): Promise<{ member: Member; created: boolean }> {
  const email = emailFrom(input);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(s.members)
    .where(and(eq(s.members.workspaceId, principal.workspaceId), eq(s.members.email, email)))
    .limit(1);

  const role = roleFor(principal.connection, groupsFrom(input));

  if (existing) {
    // A directory that re-sends a create for somebody who already exists is
    // a directory that was restarted, not an attacker. Reactivating and
    // returning 200 is kinder than a 409 it will retry forever.
    const [updated] = await db
      .update(s.members)
      .set({
        name: nameFrom(input, email),
        externalId: typeof input.externalId === "string" ? input.externalId : existing.externalId,
        deactivatedAt: input.active === false ? (existing.deactivatedAt ?? new Date()) : null,
        role: existing.role === "owner" ? "owner" : role,
      })
      .where(eq(s.members.id, existing.id))
      .returning();
    await touch(principal, updated, "member.directory_updated");
    return { member: updated, created: false };
  }

  const [member] = await db
    .insert(s.members)
    .values({
      workspaceId: principal.workspaceId,
      email,
      name: nameFrom(input, email),
      role,
      externalId: typeof input.externalId === "string" ? input.externalId : null,
      deactivatedAt: input.active === false ? new Date() : null,
    })
    .returning();

  await touch(principal, member, "member.provisioned");
  return { member, created: true };
}

export async function replaceUser(
  principal: ScimPrincipal,
  id: string,
  input: ScimUserInput,
): Promise<Member> {
  const existing = await getUser(principal, id);
  const email = emailFrom(input);
  const active = input.active !== false;

  const [updated] = await getDb()
    .update(s.members)
    .set({
      email,
      name: nameFrom(input, email),
      externalId: typeof input.externalId === "string" ? input.externalId : existing.externalId,
      role: existing.role === "owner" ? "owner" : roleFor(principal.connection, groupsFrom(input)),
      deactivatedAt: active ? null : (existing.deactivatedAt ?? new Date()),
    })
    .where(eq(s.members.id, existing.id))
    .returning();

  if (!active) await offboard(principal, updated);
  else await touch(principal, updated, "member.directory_updated");
  return updated;
}

export interface PatchOperation {
  op?: unknown;
  path?: unknown;
  value?: unknown;
}

/**
 * The only PATCH that matters: `active`.
 *
 * Every directory expresses "this person has left" as a PATCH setting
 * `active` to false, in one of three shapes depending on the vendor — a path
 * of `active`, a bare object value, or a replace of the whole resource. All
 * three are handled; anything else is applied where it is understood and
 * ignored where it is not, which is what the specification asks for and what
 * keeps an unknown attribute from failing an offboarding.
 */
export async function patchUser(
  principal: ScimPrincipal,
  id: string,
  operations: PatchOperation[],
): Promise<Member> {
  const existing = await getUser(principal, id);
  let active: boolean | null = null;
  const changes: Partial<typeof s.members.$inferInsert> = {};

  for (const operation of operations) {
    const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
    if (op !== "replace" && op !== "add") continue;

    const path = typeof operation.path === "string" ? operation.path.toLowerCase() : "";
    const value = operation.value;

    if (path === "active") {
      active = coerceActive(value);
      continue;
    }
    if (path === "username" && typeof value === "string" && value.includes("@")) {
      changes.email = value.trim().toLowerCase();
      continue;
    }
    if (path === "name.formatted" && typeof value === "string" && value.trim()) {
      changes.name = value.trim();
      continue;
    }
    if (!path && value && typeof value === "object") {
      const body = value as Record<string, unknown>;
      if ("active" in body) active = coerceActive(body.active);
      if (typeof body.userName === "string" && body.userName.includes("@")) {
        changes.email = body.userName.trim().toLowerCase();
      }
      const name = body.name as { formatted?: unknown } | undefined;
      if (typeof name?.formatted === "string" && name.formatted.trim()) {
        changes.name = name.formatted.trim();
      }
    }
  }

  if (active !== null) changes.deactivatedAt = active ? null : (existing.deactivatedAt ?? new Date());

  if (Object.keys(changes).length === 0) return existing;

  const [updated] = await getDb()
    .update(s.members)
    .set(changes)
    .where(eq(s.members.id, existing.id))
    .returning();

  if (active === false) await offboard(principal, updated);
  else await touch(principal, updated, "member.directory_updated");
  return updated;
}

/** SCIM's DELETE. Deactivates; it never removes the row. */
export async function deleteUser(principal: ScimPrincipal, id: string): Promise<void> {
  const existing = await getUser(principal, id);
  if (existing.deactivatedAt) return;

  const [updated] = await getDb()
    .update(s.members)
    .set({ deactivatedAt: new Date() })
    .where(eq(s.members.id, existing.id))
    .returning();

  await offboard(principal, updated);
}

function coerceActive(value: unknown): boolean {
  // Entra sends the string "False". Reading that as truthy is how an
  // offboarding silently does nothing.
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() !== "false";
  return Boolean(value);
}

/**
 * Offboarding: the row, and every session behind it.
 *
 * The second half is the one that is easy to leave out and the one that
 * matters. A deactivated member whose browser tab still works has not been
 * offboarded — they have been marked.
 */
async function offboard(principal: ScimPrincipal, member: Member): Promise<void> {
  const ended = await revokeAllForMember(member.id, "deactivated by directory");
  await recordQuietly({
    workspaceId: principal.workspaceId,
    actor: { memberId: null, email: member.email },
    action: "member.deactivated",
    resourceType: "member",
    resourceId: member.id,
    metadata: { via: "scim", connectionId: principal.connection.connectionId, sessionsEnded: ended },
  });
}

async function touch(principal: ScimPrincipal, member: Member, action: string): Promise<void> {
  await recordQuietly({
    workspaceId: principal.workspaceId,
    actor: { memberId: null, email: member.email },
    action,
    resourceType: "member",
    resourceId: member.id,
    metadata: { via: "scim", connectionId: principal.connection.connectionId, role: member.role },
  });
}

/** Records that a directory spoke to us, for the settings screen. */
export async function markSynced(principal: ScimPrincipal): Promise<void> {
  await getDb()
    .update(s.ssoConnections)
    .set({ scimLastSyncAt: new Date() })
    .where(eq(s.ssoConnections.id, principal.connection.id));
}
