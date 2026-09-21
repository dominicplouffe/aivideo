import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { revokeAllForMember } from "../sessions";
import { roleFor } from "../identity/provisioning";
import type { ScimPrincipal } from "./tokens";
import { ScimError, getUser } from "./users";

/**
 * SCIM groups, and the roles they decide.
 *
 * Groups are worth syncing for exactly one reason: a directory that moves
 * somebody from `demo-viewers` to `demo-admins` is deciding what that person
 * may do, and the point is that the decision takes effect here without
 * anybody re-typing it.
 *
 * So every membership change recomputes the member's role from *all* their
 * groups, not just the one that changed. Applying the delta instead is the
 * bug everybody writes: removing somebody from `demo-admins` would drop them
 * to the connection default even though they are still in `support-leads`,
 * which also maps to admin.
 *
 * The mapping itself lives on the connection, shared with the SSO assertion
 * path, so one place answers "what does this group grant".
 */

export const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

type Group = typeof s.scimGroups.$inferSelect;
type Member = typeof s.members.$inferSelect;

export interface ScimGroup {
  schemas: string[];
  id: string;
  displayName: string;
  externalId?: string;
  members: { value: string; display?: string }[];
  meta: { resourceType: "Group"; created: string; location: string };
}

export function toScimGroup(
  group: Group,
  members: { id: string; email: string }[],
  baseUrl: string,
): ScimGroup {
  return {
    schemas: [GROUP_SCHEMA],
    id: group.id,
    displayName: group.displayName,
    externalId: group.externalId ?? undefined,
    members: members.map((member) => ({ value: member.id, display: member.email })),
    meta: {
      resourceType: "Group",
      created: group.createdAt.toISOString(),
      location: `${baseUrl}/Groups/${group.id}`,
    },
  };
}

/* --------------------------------------------------------------- reading */

export function parseGroupFilter(filter: string | null): string | null {
  if (!filter) return null;
  const match = /^\s*displayName\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
  if (!match) throw new ScimError(400, `Unsupported filter: ${filter}`, "invalidFilter");
  return match[1].trim();
}

export async function listGroups(
  principal: ScimPrincipal,
  options: { filter?: string | null } = {},
): Promise<{ group: Group; members: { id: string; email: string }[] }[]> {
  const displayName = parseGroupFilter(options.filter ?? null);

  const where = displayName
    ? and(
        eq(s.scimGroups.connectionId, principal.connection.id),
        eq(s.scimGroups.displayName, displayName),
      )
    : eq(s.scimGroups.connectionId, principal.connection.id);

  const groups = await getDb().select().from(s.scimGroups).where(where).orderBy(asc(s.scimGroups.createdAt));
  return Promise.all(
    groups.map(async (group) => ({ group, members: await membersOf(group.id) })),
  );
}

export async function getGroup(principal: ScimPrincipal, id: string): Promise<Group> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ScimError(404, "No such group.");
  }

  const [group] = await getDb()
    .select()
    .from(s.scimGroups)
    .where(
      and(
        eq(s.scimGroups.id, id),
        // Scoped to the token's connection. A directory asking about another
        // workspace's group gets the same answer as for one that does not
        // exist.
        eq(s.scimGroups.connectionId, principal.connection.id),
      ),
    )
    .limit(1);

  if (!group) throw new ScimError(404, "No such group.");
  return group;
}

export async function membersOf(groupId: string): Promise<{ id: string; email: string }[]> {
  return getDb()
    .select({ id: s.members.id, email: s.members.email })
    .from(s.scimGroupMembers)
    .innerJoin(s.members, eq(s.members.id, s.scimGroupMembers.memberId))
    .where(eq(s.scimGroupMembers.groupId, groupId));
}

/* --------------------------------------------------------------- writing */

export interface ScimGroupInput {
  displayName?: unknown;
  externalId?: unknown;
  members?: { value?: unknown }[];
}

export async function createGroup(
  principal: ScimPrincipal,
  input: ScimGroupInput,
): Promise<Group> {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) {
    throw new ScimError(400, "displayName is required.", "invalidValue");
  }

  const db = getDb();
  const [group] = await db
    .insert(s.scimGroups)
    .values({
      connectionId: principal.connection.id,
      workspaceId: principal.workspaceId,
      displayName,
      externalId: typeof input.externalId === "string" ? input.externalId : null,
    })
    // A directory that was restarted re-sends its groups. Returning the one
    // that exists beats a 409 it retries forever.
    .onConflictDoUpdate({
      target: [s.scimGroups.connectionId, s.scimGroups.displayName],
      set: { externalId: typeof input.externalId === "string" ? input.externalId : null },
    })
    .returning();

  const ids = memberIdsFrom(input.members);
  if (ids.length > 0) await setMembers(principal, group, ids);

  return group;
}

export interface GroupPatch {
  op?: unknown;
  path?: unknown;
  value?: unknown;
}

/**
 * The PATCH every directory sends: add and remove members.
 *
 * Three shapes, because vendors disagree. Okta sends
 * `{op:"add", path:"members", value:[{value:"..."}]}`; Entra sends removals
 * as `path: 'members[value eq "..."]'` with no value at all; both sometimes
 * send a `replace` of the whole member list. All three are handled, and
 * anything else is ignored rather than failing the sync — an unknown
 * attribute must not be able to stop an offboarding.
 */
export async function patchGroup(
  principal: ScimPrincipal,
  id: string,
  operations: GroupPatch[],
): Promise<Group> {
  const group = await getGroup(principal, id);
  const db = getDb();

  for (const operation of operations) {
    const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
    const path = typeof operation.path === "string" ? operation.path : "";

    if (path.toLowerCase().startsWith("displayname") && typeof operation.value === "string") {
      await db
        .update(s.scimGroups)
        .set({ displayName: operation.value.trim() })
        .where(eq(s.scimGroups.id, group.id));
      continue;
    }

    if (!path.toLowerCase().startsWith("members")) continue;

    // Entra encodes the member to remove in the path itself, with no value.
    const inPath = /members\[\s*value\s+eq\s+"([^"]+)"\s*\]/i.exec(path);
    const ids = inPath ? [inPath[1]] : memberIdsFrom(operation.value as { value?: unknown }[]);
    if (ids.length === 0) continue;

    if (op === "remove") await removeMembers(principal, group, ids);
    else if (op === "replace") await setMembers(principal, group, ids);
    else await addMembers(principal, group, ids);
  }

  return getGroup(principal, id);
}

export async function replaceGroup(
  principal: ScimPrincipal,
  id: string,
  input: ScimGroupInput,
): Promise<Group> {
  const group = await getGroup(principal, id);

  if (typeof input.displayName === "string" && input.displayName.trim()) {
    await getDb()
      .update(s.scimGroups)
      .set({ displayName: input.displayName.trim() })
      .where(eq(s.scimGroups.id, group.id));
  }

  await setMembers(principal, group, memberIdsFrom(input.members));
  return getGroup(principal, id);
}

/**
 * Deletes a group.
 *
 * Everybody in it has their role recomputed first, because after the rows
 * are gone there is nothing left to recompute from — and a group deletion
 * that leaves ten people holding an admin role they were granted by it is
 * the worst possible outcome of tidying up a directory.
 */
export async function deleteGroup(principal: ScimPrincipal, id: string): Promise<void> {
  const group = await getGroup(principal, id);
  const members = await membersOf(group.id);

  await getDb().delete(s.scimGroups).where(eq(s.scimGroups.id, group.id));

  for (const member of members) await recomputeRole(principal, member.id);

  await recordQuietly({
    workspaceId: principal.workspaceId,
    actor: null,
    action: "member.group_deleted",
    resourceType: "scim_group",
    resourceId: group.id,
    metadata: { displayName: group.displayName, members: members.length, via: "scim" },
  });
}

/* ----------------------------------------------------------- membership */

function memberIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (entry && typeof entry === "object" ? (entry as { value?: unknown }).value : null))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function addMembers(principal: ScimPrincipal, group: Group, ids: string[]): Promise<void> {
  const valid = await validMembers(principal, ids);
  if (valid.length === 0) return;

  await getDb()
    .insert(s.scimGroupMembers)
    .values(valid.map((member) => ({ groupId: group.id, memberId: member.id })))
    .onConflictDoNothing();

  for (const member of valid) await recomputeRole(principal, member.id);
}

async function removeMembers(principal: ScimPrincipal, group: Group, ids: string[]): Promise<void> {
  const valid = await validMembers(principal, ids);
  if (valid.length === 0) return;

  await getDb()
    .delete(s.scimGroupMembers)
    .where(
      and(
        eq(s.scimGroupMembers.groupId, group.id),
        inArray(s.scimGroupMembers.memberId, valid.map((member) => member.id)),
      ),
    );

  for (const member of valid) await recomputeRole(principal, member.id);
}

async function setMembers(principal: ScimPrincipal, group: Group, ids: string[]): Promise<void> {
  const previous = await membersOf(group.id);
  const valid = await validMembers(principal, ids);
  const db = getDb();

  await db.delete(s.scimGroupMembers).where(eq(s.scimGroupMembers.groupId, group.id));
  if (valid.length > 0) {
    await db
      .insert(s.scimGroupMembers)
      .values(valid.map((member) => ({ groupId: group.id, memberId: member.id })))
      .onConflictDoNothing();
  }

  // Everybody who was in it *or* is now, because a replace both grants and
  // removes and the people who left need recomputing just as much.
  const touched = new Set([...previous.map((m) => m.id), ...valid.map((m) => m.id)]);
  for (const memberId of touched) await recomputeRole(principal, memberId);
}

/** Members of this workspace only. A directory cannot add somebody else's. */
async function validMembers(principal: ScimPrincipal, ids: string[]): Promise<Member[]> {
  const uuids = ids.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  );
  if (uuids.length === 0) return [];

  return getDb()
    .select()
    .from(s.members)
    .where(
      and(eq(s.members.workspaceId, principal.workspaceId), inArray(s.members.id, uuids)),
    );
}

/**
 * Recomputes a member's role from every group they are in.
 *
 * From all of them, never from the delta. Removing somebody from
 * `demo-admins` must not drop them to the connection default while they are
 * still in `support-leads`, which maps to admin as well — and applying the
 * delta is how that bug gets written.
 */
export async function recomputeRole(principal: ScimPrincipal, memberId: string): Promise<void> {
  const db = getDb();

  const member = await getUser(principal, memberId).catch(() => null);
  if (!member) return;

  // An owner keeps their role whatever the directory says. Ownership is a
  // billing and deletion relationship, and a group name must not be able to
  // take a workspace from the person paying for it.
  if (member.role === "owner") return;

  const groups = await db
    .select({ displayName: s.scimGroups.displayName })
    .from(s.scimGroupMembers)
    .innerJoin(s.scimGroups, eq(s.scimGroups.id, s.scimGroupMembers.groupId))
    .where(
      and(
        eq(s.scimGroupMembers.memberId, memberId),
        eq(s.scimGroups.connectionId, principal.connection.id),
      ),
    );

  const role = roleFor(principal.connection, groups.map((group) => group.displayName));
  if (role === member.role) return;

  await db.update(s.members).set({ role }).where(eq(s.members.id, memberId));

  // A privilege change ends every session that predates it. A demotion that
  // waits for the next sign-in takes effect exactly when it matters least.
  const ended = await revokeAllForMember(memberId, "role changed by directory");

  await recordQuietly({
    workspaceId: principal.workspaceId,
    actor: { memberId: null, email: member.email },
    action: "member.role_changed",
    resourceType: "member",
    resourceId: memberId,
    metadata: {
      from: member.role,
      to: role,
      via: "scim-groups",
      groups: groups.map((group) => group.displayName),
      sessionsEnded: ended,
    },
  });
}

/** Records that a directory spoke to us, matching the Users route. */
export async function groupCount(principal: ScimPrincipal): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(s.scimGroups)
    .where(eq(s.scimGroups.connectionId, principal.connection.id));
  return row?.total ?? 0;
}
