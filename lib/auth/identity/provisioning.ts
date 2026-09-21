import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { randomBytes } from "node:crypto";
import { slugify } from "@/lib/utils";
import { ROLES, type Role } from "../roles";
import { revokeAllForMember } from "../sessions";
import type { AuthProfile } from "./types";

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
 * So the organization decides. A workspace admin registers a connection
 * once, and every assertion that arrives through that organization lands in
 * that workspace and nowhere else. The email domain is then used only to
 * *narrow* the set it may create — never to widen it.
 *
 * There are two paths below, and the difference between them is whether the
 * login carried an organization:
 *
 *  - **With one** it is an enterprise login, and everything above applies.
 *  - **Without one** it is self-serve — somebody arriving through Google, a
 *    password or a magic link. That person gets a workspace of their own and
 *    owns it. They are *never* joined to an existing workspace, however
 *    familiar their email domain looks, because the rule above does not stop
 *    applying just because the front door changed.
 */

export type ProvisionResult =
  | {
      ok: true;
      member: typeof s.members.$inferSelect;
      /** A member row was written rather than found. */
      created: boolean;
      /** A workspace was written too — this person signed up. */
      workspaceCreated: boolean;
      roleChanged: boolean;
      /** Absent on a self-serve login, which has no connection. */
      connection?: typeof s.ssoConnections.$inferSelect;
    }
  | {
      ok: false;
      reason: ProvisionRefusal;
      message: string;
      /** Known for every refusal except one nobody has connected. */
      workspaceId?: string;
    };

export type ProvisionRefusal =
  | "unknown-organization"
  | "connection-disabled"
  | "domain-not-claimed"
  | "no-just-in-time"
  | "deactivated"
  | "email-unverified"
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
 * The connection an organization belongs to.
 *
 * AuthKit returns an `organization_id` rather than a connection id, so this
 * is the lookup that decides the workspace. A partial unique index on the
 * column makes it one row at most, which is the security property: a second
 * workspace cannot claim an organization and start receiving its logins.
 */
export async function findConnectionForOrganization(organizationId: string) {
  const [connection] = await getDb()
    .select()
    .from(s.ssoConnections)
    .where(eq(s.ssoConnections.organizationId, organizationId))
    .limit(1);
  return connection ?? null;
}

/**
 * Turns an authenticated profile into a member, whichever door they used.
 *
 * The organization is the fork. Everything about the enterprise path below
 * was already here and is unchanged; the self-serve path is new, and is the
 * reason signup can run in production at all.
 */
export async function provision(profile: AuthProfile): Promise<ProvisionResult> {
  return profile.organizationId
    ? provisionThroughOrganization(profile, profile.organizationId)
    : provisionSelfServe(profile);
}

/**
 * Finds or creates the member an assertion refers to, and returns the row.
 *
 * Existing members are matched on `externalId` first and email second. That
 * order matters: an identity provider is allowed to change somebody's email
 * address, and matching on email alone would create a second account for the
 * same person and silently strand everything the first one owned.
 */
async function provisionThroughOrganization(
  profile: AuthProfile,
  organizationId: string,
): Promise<ProvisionResult> {
  const connection = await findConnectionForOrganization(organizationId);
  if (!connection) {
    // No workspace has claimed this organization. Refused outright rather
    // than falling through to the self-serve path, which would hand an
    // enterprise login a brand new personal workspace and look, to the
    // person, exactly like their company's one had been emptied.
    return {
      ok: false,
      reason: "unknown-organization",
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

    return {
      ok: true,
      member: created,
      created: true,
      workspaceCreated: false,
      roleChanged: false,
      connection,
    };
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

  return {
    ok: true,
    member: updated,
    created: false,
    workspaceCreated: false,
    roleChanged,
    connection,
  };
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

/* ------------------------------------------------------------ self-serve */

/**
 * Somebody arriving without an organization: Google, Microsoft, a password.
 *
 * This is signup, and it exists because the old `POST /api/auth/signup` could
 * not run in production for a reason it stated plainly — nothing verified
 * that the person typing an address owned it. Now something does, and the
 * gate below is the whole of the difference.
 *
 * What this deliberately does **not** do is look at the email domain to find
 * an existing workspace to join. That is the same mistake the module header
 * warns about, wearing different clothes: a Google account at a company's
 * domain is proof that Google will deliver mail there, not that the company
 * agreed to let its holder into their workspace.
 */
async function provisionSelfServe(profile: AuthProfile): Promise<ProvisionResult> {
  // The gate. An unverified address is somebody's *claim* to an address, and
  // creating a workspace on a claim is exactly what the 501 was protecting
  // against.
  if (!profile.emailVerified) {
    return {
      ok: false,
      reason: "email-unverified",
      message: "Confirm your email address, then sign in again.",
    };
  }

  const db = getDb();

  // Every workspace this address is a live member of. Ordered so the answer
  // is the same on every call: `app/api/auth/route.ts` took the first row
  // with no ORDER BY, so somebody in two workspaces landed in whichever one
  // Postgres happened to return that day.
  const memberships = await db
    .select()
    .from(s.members)
    .where(and(eq(s.members.email, profile.email), isNull(s.members.deactivatedAt)))
    .orderBy(desc(s.members.lastActiveAt), s.members.createdAt, s.members.id);

  if (memberships.length === 0) {
    // Including somebody whose only membership was deactivated. That is
    // deliberate and is not the same as the enterprise path's refusal: an
    // offboarding removes a person from *that workspace*, not from the
    // product, and giving them a workspace of their own undoes none of it.
    // The old row stays deactivated and they cannot reach it.
    return signUp(profile);
  }

  // More than one is legal — `members` is unique on (workspace, email), not
  // on email — and picking the most recently used one is the best guess
  // available until there is a picker to ask with. It is recorded on the way
  // through so the choice is at least visible.
  const existing = memberships[0];

  const [updated] = await db
    .update(s.members)
    .set({
      name: existing.name || profile.name,
      // Recorded so a later sign-in matches this person even if they change
      // their address at the provider.
      externalId: existing.externalId || profile.externalId,
      lastActiveAt: new Date(),
    })
    .where(eq(s.members.id, existing.id))
    .returning();

  return {
    ok: true,
    member: updated,
    created: false,
    workspaceCreated: false,
    roleChanged: false,
  };
}

/**
 * A workspace, and the person who owns it.
 *
 * Both rows in one transaction. A workspace with no members is unreachable —
 * nobody can sign into it and nobody can delete it — so a failure between the
 * two inserts would leave a row that exists only to be orphaned.
 */
async function signUp(profile: AuthProfile): Promise<ProvisionResult> {
  const db = getDb();

  // Named after the company in their address when we have nothing better,
  // because "Alex Morgan's workspace" is a name nobody keeps.
  const suggested = profile.email.split("@")[1]?.split(".")[0] ?? "workspace";
  const name = suggested.charAt(0).toUpperCase() + suggested.slice(1);
  const base = slugify(name) || "workspace";

  return db.transaction(async (tx) => {
    const workspace = await insertWithFreeSlug(tx, name, base);

    const [member] = await tx
      .insert(s.members)
      .values({
        workspaceId: workspace.id,
        email: profile.email,
        name: profile.name,
        // The first member owns the workspace. Somebody has to be able to
        // invite the second one and cancel the plan.
        role: "owner",
        externalId: profile.externalId,
        lastActiveAt: new Date(),
      })
      .returning();

    return {
      ok: true as const,
      member,
      created: true,
      workspaceCreated: true,
      roleChanged: false,
    };
  });
}

/**
 * Inserts the workspace under a slug nobody else holds.
 *
 * Optimistic, and both halves of that matter. The first version read every
 * slug in the table into a Set and counted upwards from the first free one,
 * which is wrong twice over: it is a full scan of `workspaces` on every
 * signup, and — because reading and writing were separate statements — two
 * people from the same company signing up in the same second both saw
 * `acme-4` free, and the second one's insert died on `workspaces_slug_key`.
 * They got an error on the one request that was supposed to create their
 * account.
 *
 * `ON CONFLICT DO NOTHING` is what makes the retry possible inside a
 * transaction: a plain failed insert aborts the whole thing, so there would
 * be nothing left to retry with.
 */
async function insertWithFreeSlug(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  name: string,
  base: string,
): Promise<typeof s.workspaces.$inferSelect> {
  for (let attempt = 0; attempt < 6; attempt++) {
    // The plain form first, so the common case gets the readable slug.
    // After that, random rather than sequential: `-2` tells the next person
    // somebody already has the plain form, and walking the sequence counts
    // how many companies share a name.
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;

    const [row] = await tx
      .insert(s.workspaces)
      .values({ name, slug, plan: "free", seatsTotal: 1 })
      .onConflictDoNothing({ target: s.workspaces.slug })
      .returning();

    if (row) return row;
  }

  // Six collisions on six random hex characters is not chance. Something is
  // wrong that a seventh attempt will not fix, and failing loudly beats
  // looping until the request times out.
  throw new Error(`Could not find a free workspace slug for "${base}".`);
}
