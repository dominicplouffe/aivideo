import { and, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { Actor } from "./authorize";
import type { Role } from "./roles";
import { readSessionCookie } from "./cookies";
import { verify } from "./sessions";

/**
 * Resolving who is making a request.
 *
 * One function that every route calls to get an `Actor`. It tries the
 * session cookie first — the real path — and falls back to a development
 * header that is refused outright in production.
 *
 * That header is refused with a throw rather than ignored, because a
 * development convenience which survives into production is how an
 * impersonation header becomes an authentication bypass, and a bypass that
 * fails loudly is one somebody notices.
 *
 * Single sign-on is the piece still missing: WorkOS issues the identity, and
 * `signIn` below is where it lands. Everything downstream of that — the
 * session row, the cookie, revocation — already works.
 */

export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

const DEV_ACTOR_HEADER = "x-demoriff-actor";

const REASONS: Record<string, string> = {
  revoked: "This session was signed out. Sign in again.",
  expired: "This session has expired. Sign in again.",
  idle: "You were signed out after a period of inactivity.",
  deactivated: "This account has been deactivated. Contact your workspace administrator.",
  "member-gone": "This account no longer exists.",
};

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
  if (!isDatabaseConfigured()) {
    throw new UnauthenticatedError(
      "Authentication requires a database; this deployment is running on fixtures.",
    );
  }

  const verdict = await verify(readSessionCookie(request));
  if (verdict.ok) {
    if (options.workspaceId && verdict.actor.workspaceId !== options.workspaceId) {
      throw new UnauthenticatedError("That session does not belong to this workspace.");
    }
    return verdict.actor;
  }
  if (verdict.reason !== "unknown") {
    // A session that existed and no longer works deserves a reason. "Signed
    // out because your account was deactivated" sends someone to their
    // administrator; a bare 401 sends them to support.
    throw new UnauthenticatedError(REASONS[verdict.reason]);
  }

  const email = actorEmail(request);
  if (!email) throw new UnauthenticatedError();

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

  // Unconditional, with no flag to switch it off. An escape hatch here buys
  // nothing — the header already works in every non-production environment —
  // so its only possible effect is to weaken production, and it left the
  // README describing a guard the code did not have.
  if (process.env.NODE_ENV === "production") {
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
