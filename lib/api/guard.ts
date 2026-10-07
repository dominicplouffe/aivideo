import { NextResponse } from "next/server";
import { authorize, ForbiddenError, type Actor } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/roles";
import { isStaff } from "@/lib/admin/staff";
import { MemberChangeError } from "@/lib/db/repositories/members";

/**
 * The shape every authenticated route repeats.
 *
 * Extracted after writing it for the eighth time. The repetition was not the
 * problem — the risk is that the ninth copy is subtly different, and an
 * authorization check that differs between routes is one that is wrong in at
 * least one of them.
 */
export async function requireActor(
  request: Request,
  permission: Permission,
): Promise<{ actor: Actor } | { response: NextResponse }> {
  try {
    const actor = await resolveActor(request);
    authorize(actor, permission, { workspaceId: actor.workspaceId });
    return { actor };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { response: NextResponse.json({ error: error.message }, { status: 401 }) };
    }
    if (error instanceof ForbiddenError) {
      return { response: NextResponse.json({ error: error.message }, { status: 403 }) };
    }
    throw error;
  }
}

/** One message, so every route tells somebody the same three commands. */
export function needsDatabase(): NextResponse {
  return NextResponse.json(
    {
      error:
        "This needs a database. Set DATABASE_URL in .env.local, run `npm run db:migrate` " +
        "and `npm run db:seed`, then restart the dev server.",
    },
    { status: 503 },
  );
}

/**
 * A DemoRiff staff member, or a 404.
 *
 * Not a 403: to everybody else these routes do not exist, and a refusal
 * that names a permission is an invitation to look for a way to get it.
 */
export async function requireStaff(request: Request): Promise<{ actor: Actor } | { response: NextResponse }> {
  const notFound = { response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  try {
    const actor = await resolveActor(request);
    return (await isStaff(actor)) ? { actor } : notFound;
  } catch (error) {
    if (error instanceof UnauthenticatedError) return notFound;
    throw error;
  }
}

/** A refused membership change as a response: 409 for a rule, 404 for a missing row, 403 for a permission. */
export function membershipRefusal(error: unknown): NextResponse {
  if (error instanceof MemberChangeError) {
    return NextResponse.json({ error: error.message, reason: error.reason }, { status: error.reason === "not-found" ? 404 : 409 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}

/** The address links in emails point at: the configured site, or the request's own origin. */
export function siteOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

/** The caller's address, for the audit log. */
export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
