import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ROLES, type Role } from "../roles";
import { revokeAllForMember } from "../sessions";
import type { SsoProfile } from "./types";

/**
 * Turning an assertion into a member.
 *
 * This is where single sign-on is either safe or not, and the whole of it
 * comes down to one question: **who decides which workspace this person
 * joins?**
 *
 * The tempting answer is the email domain — `@meridian.com` joins Meridian.
 * It is also wrong, because it means anybody who can get an identity
 * provider to assert an address at a customer's domain becomes a member of
 * that customer's workspace, and the customer never agreed to trust that
 * identity provider. Domain ownership is not the same claim as "this
 * directory speaks for us".
 *
 * So the connection decides. A workspace admin registers a connection once,
 * and every assertion that arrives through it lands in that workspace and
 * nowhere else. The email domain is then used only to *narrow* the set the
 * connection may create — never to widen it.
 */

export type ProvisionResult =
  | {
      ok: true;
      member: typeof s.members.$inferSelect;
      created: boolean;
      roleChanged: boolean;
      connection: typeof s.ssoConnections.$inferSelect;
    }
  | {
      ok: false;
      reason: ProvisionRefusal;
      message: string;
      /** Known for every refusal except one nobody has connected. */
      workspaceId?: string;
    };

export type ProvisionRefusal =
  | "unknown-connection"
  | "connection-disabled"
  | "domain-not-claimed"
  | "no-just-in-time"
  | "deactivated"
  | "no-seats";

/** A role name the identity provider sent, if it is one this product has. */
function asRole(value: unknown): Role | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null;
}

/**
 * The role an assertion earns.
 *
 * Group mappings are applied in the order the admin wrote them and the
 * highest privilege wins, because a person in both `engineering` and
 * `demo-admins` should get the admin role rather than whichever group the
 * directory happened to list first.
 *
 * An owner is never assigned from a directory. Ownership is a billing and
 * deletion relationship, and letting a group name confer it would mean a
 * directory administrator could take a workspace from the person paying for
 * it. Someone has to press a button in the product for that.
 */
export function roleFor(
  connection: Pick<typeof s.ssoConnections.$inferSelect, "defaultRole" | "roleMappings">,
  groups: string[],
): Role {
  const mapped = groups
    .map((group) => asRole(connection.roleMappings?.[group]))
    .filter((role): role is Role => role !== null && role !== "owner");

  if (mapped.length === 0) return connection.defaultRole as Role;

  // ROLES is ordered most privileged first, so the lowest index wins.
  return mapped.reduce((best, role) =>
    ROLES.indexOf(role) < ROLES.indexOf(best) ? role : best,
  );
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

/** Whether this connection is permitted to provision this address. */
export function domainAllowed(
  connection: Pick<typeof s.ssoConnections.$inferSelect, "domains">,
  email: string,
): boolean {
  const domains = connection.domains ?? [];
  // An empty list is "no domains claimed", not "every domain". The
  // permissive reading of an empty allowlist is how allowlists fail open.
  if (domains.length === 0) return false;
  const domain = domainOf(email);
  return domains.some((claimed) => claimed.trim().toLowerCase() === domain);
}

export async function findConnection(connectionId: string) {
  const [connection] = await getDb()
    .select()
    .from(s.ssoConnections)
    .where(eq(s.ssoConnections.connectionId, connectionId))
    .limit(1);
  return connection ?? null;
}

/**
 * Finds or creates the member an assertion refers to, and returns the row.
 *
 * Existing members are matched on `externalId` first and email second. That
 * order matters: an identity provider is allowed to change somebody's email
 * address, and matching on email alone would create a second account for the
 * same person and silently strand everything the first one owned.
 */
export async function provision(profile: SsoProfile): Promise<ProvisionResult> {
  const connection = await findConnection(profile.connectionId);
  if (!connection) {
    return {
      ok: false,
      reason: "unknown-connection",
      message: "That identity provider is not connected to any workspace.",
    };
  }
  if (connection.disabledAt) {
    return {
      ok: false,
      reason: "connection-disabled",
      workspaceId: connection.workspaceId,
      message: "Single sign-on is switched off for this workspace.",
    };
  }

  const db = getDb();
  const role = roleFor(connection, profile.groups);

  const byExternal = profile.externalId
    ? await db
        .select()
        .from(s.members)
        .where(
          and(
            eq(s.members.workspaceId, connection.workspaceId),
            eq(s.members.externalId, profile.externalId),
          ),
        )
        .limit(1)
    : [];

  const byEmail = byExternal.length
    ? []
    : await db
        .select()
        .from(s.members)
        .where(
          and(
            eq(s.members.workspaceId, connection.workspaceId),
            eq(s.members.email, profile.email),
          ),
        )
        .limit(1);

  const existing = byExternal[0] ?? byEmail[0] ?? null;

  if (!existing) {
    if (!connection.justInTime) {
      return {
        ok: false,
        reason: "no-just-in-time",
      workspaceId: connection.workspaceId,
        message: "This workspace provisions accounts from its directory. Ask an administrator to add you.",
      };
    }
    if (!domainAllowed(connection, profile.email)) {
      return {
        ok: false,
        reason: "domain-not-claimed",
      workspaceId: connection.workspaceId,
        message: "That email domain is not claimed by this workspace's single sign-on connection.",
      };
    }

    const [created] = await db
      .insert(s.members)
      .values({
        workspaceId: connection.workspaceId,
        email: profile.email,
        name: profile.name,
        role,
        externalId: profile.externalId,
        lastActiveAt: new Date(),
      })
      .returning();

    return { ok: true, member: created, created: true, roleChanged: false, connection };
  }

  if (existing.deactivatedAt) {
    // Not reactivated by signing in. Somebody was offboarded on purpose, and
    // an assertion from a directory that has not caught up is not consent to
    // undo that. SCIM reactivates; a login does not.
    return {
      ok: false,
      reason: "deactivated",
      workspaceId: connection.workspaceId,
      message: "This account has been deactivated. Contact your workspace administrator.",
    };
  }

  // An owner keeps their role no matter what the directory says, for the
  // same reason a group cannot confer ownership.
  const nextRole = existing.role === "owner" ? "owner" : role;
  const roleChanged = nextRole !== existing.role;

  const [updated] = await db
    .update(s.members)
    .set({
      name: profile.name || existing.name,
      email: profile.email,
      role: nextRole,
      externalId: profile.externalId || existing.externalId,
      lastActiveAt: new Date(),
    })
    .where(eq(s.members.id, existing.id))
    .returning();

  // A privilege change ends every session that predates it. Otherwise a
  // demotion takes effect only on the next sign-in, which is precisely when
  // it matters least — the tab that is already open is the one with the
  // access somebody just decided to remove.
  if (roleChanged) {
    await revokeAllForMember(existing.id, "role changed by directory");
  }

  return { ok: true, member: updated, created: false, roleChanged, connection };
}

/**
 * Which connection an email domain should be sent to, for routing only.
 *
 * This is a convenience so somebody can type their work address instead of
 * being handed a connection id, and it is emphatically *not* an
 * authorization decision — the connection still checks its own claimed
 * domains before it provisions anybody, so routing here can only send a
 * person to a login that will then refuse them.
 *
 * Ambiguity is refused rather than resolved. Two workspaces claiming the
 * same domain is a support conversation, not a coin flip, and guessing would
 * mean sending somebody into the wrong company's identity provider.
 */
export async function findConnectionForDomain(email: string): Promise<
  { ok: true; connectionId: string } | { ok: false; reason: "none" | "ambiguous" }
> {
  const domain = domainOf(email);
  if (!domain) return { ok: false, reason: "none" };

  const rows = await getDb()
    .select()
    .from(s.ssoConnections)
    .where(isNull(s.ssoConnections.disabledAt));

  const matches = rows.filter((row) => domainAllowed(row, `x@${domain}`));
  if (matches.length === 0) return { ok: false, reason: "none" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, connectionId: matches[0].connectionId };
}

/** Connections a workspace has registered. For the settings screen. */
export async function listConnections(workspaceId: string) {
  return getDb()
    .select()
    .from(s.ssoConnections)
    .where(and(eq(s.ssoConnections.workspaceId, workspaceId), isNull(s.ssoConnections.disabledAt)));
}
