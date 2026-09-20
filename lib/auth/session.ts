import { and, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { Actor } from "./authorize";
import type { Role } from "./roles";

/**
 * Resolving who is making a request.
 *
 * Identity itself — SAML, SCIM, session cookies — is the next piece of work
 * and belongs behind WorkOS. What exists here is the *seam*: one function
 * that every route calls to get an `Actor`, so that when real sessions
 * arrive there is a single place to change and no route handler that
 * quietly trusts a header.
 *
 * Until then it resolves a member from the database by email. The header it
 * reads is accepted **only** outside production, and the check is a hard
 * throw rather than a silent fallback, because a development convenience
 * that survives into production is how an impersonation header becomes an
 * authentication bypass.
 */

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

const DEV_ACTOR_HEADER = "x-demoriff-actor";

export interface ResolveOptions {
  /** Restricts the lookup, so a member of another workspace is not found. */
  workspaceId?: string;
}

/**
 * Returns the acting member, or throws.
 *
 * Deactivated members resolve — `authorize` refuses them with a reason of
 * its own. Returning null here instead would report a disabled colleague's
 * request as "not signed in", which sends them to support rather than to
 * their administrator.
 */
export async function resolveActor(
  request: Request,
  options: ResolveOptions = {},
): Promise<Actor> {
  const email = actorEmail(request);
  if (!email) throw new UnauthenticatedError();

  if (!isDatabaseConfigured()) {
    throw new UnauthenticatedError(
      "Authentication requires a database; this deployment is running on fixtures.",
    );
  }

  const conditions = [eq(s.members.email, email)];
  if (options.workspaceId) conditions.push(eq(s.members.workspaceId, options.workspaceId));

  const [member] = await getDb()
    .select()
    .from(s.members)
    .where(and(...conditions))
    .limit(1);

  if (!member) throw new UnauthenticatedError("No member account for that identity.");

  return {
    memberId: member.id,
    workspaceId: member.workspaceId,
    email: member.email,
    role: member.role as Role,
    externalId: member.externalId,
    deactivatedAt: member.deactivatedAt,
  };
}

function actorEmail(request: Request): string | null {
  const header = request.headers.get(DEV_ACTOR_HEADER);
  if (!header) return null;

  if (process.env.NODE_ENV === "production" && process.env.DEMORIFF_ALLOW_ACTOR_HEADER !== "yes") {
    // A development convenience that survives into production is how an
    // impersonation header becomes an authentication bypass. Refusing is
    // louder than ignoring, and this is a bug worth being loud about.
    throw new UnauthenticatedError(
      `The ${DEV_ACTOR_HEADER} header is not accepted in production.`,
    );
  }

  return header.trim().toLowerCase() || null;
}

/** The workspace owner, for jobs and workers that act on nobody's behalf. */
export async function systemActorFor(workspaceId: string): Promise<Actor | null> {
  if (!isDatabaseConfigured()) return null;

  const [owner] = await getDb()
    .select()
    .from(s.members)
    .where(
      and(
        eq(s.members.workspaceId, workspaceId),
        eq(s.members.role, "owner"),
        isNull(s.members.deactivatedAt),
      ),
    )
    .limit(1);

  if (!owner) return null;
  return {
    memberId: owner.id,
    workspaceId: owner.workspaceId,
    email: owner.email,
    role: "owner",
    deactivatedAt: owner.deactivatedAt,
  };
}
