import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { clearSessionCookie, originAllowed, readSessionCookie, serializeSessionCookie } from "@/lib/auth/cookies";
import { issue, listForMember, revoke, revokeAllForMember, verify } from "@/lib/auth/sessions";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";

/**
 * Sign in, sign out, and see where you are signed in.
 *
 * The identity provider is the piece still missing — WorkOS issues the
 * assertion, and this is where it lands. What is here already is everything
 * that happens *after* identity is established, which is the part with the
 * sharp edges: the session row, the cookie, and revocation that takes effect
 * at once rather than at the next expiry.
 *
 * Until SSO is wired, sign-in accepts an email and is refused in production.
 * A development shortcut that can authenticate anybody must fail loudly
 * somewhere, and the earliest place is better than the latest.
 */

const SSO_PENDING =
  "Single sign-on is not configured for this deployment. Set WORKOS_API_KEY and WORKOS_CLIENT_ID.";

function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Where this account is signed in. */
export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request);
    const sessions = await listForMember(actor.memberId);
    const current = readSessionCookie(request);
    const currentVerdict = current ? await verify(current, { touchAfterMs: Number.MAX_SAFE_INTEGER }) : null;

    return NextResponse.json({
      member: { id: actor.memberId, email: actor.email, role: actor.role },
      sessions: sessions.map((session) => ({
        id: session.id,
        // Never the token, nor its hash: this list is shown in a browser.
        created_at: session.createdAt.toISOString(),
        last_seen_at: session.lastSeenAt.toISOString(),
        expires_at: session.absoluteExpiresAt.toISOString(),
        ip: session.ip,
        user_agent: session.userAgent,
        current: currentVerdict?.ok === true && currentVerdict.session.id === session.id,
      })),
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  // Also enforced in middleware for every API route. Kept here too: this is
  // the endpoint that mints credentials, and it should not depend on a
  // matcher pattern being right.
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Sign-in requires a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.WORKOS_API_KEY) {
    return NextResponse.json({ error: SSO_PENDING }, { status: 501 });
  }

  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });

  const [member] = await getDb()
    .select()
    .from(s.members)
    .where(eq(s.members.email, email))
    .limit(1);

  // The same answer whether the address is unknown or deactivated: a
  // sign-in form that distinguishes them is a membership oracle for anyone
  // who wants to know who works at a company.
  if (!member || member.deactivatedAt) {
    return NextResponse.json({ error: "No active account for that address." }, { status: 401 });
  }

  const { token, session } = await issue({
    memberId: member.id,
    workspaceId: member.workspaceId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  await recordQuietly({
    workspaceId: member.workspaceId,
    actor: { memberId: member.id, email: member.email },
    action: "session.started",
    resourceType: "session",
    resourceId: session.id,
    ip: clientIp(request),
    metadata: { userAgent: request.headers.get("user-agent") },
  });

  const response = NextResponse.json({
    member: { id: member.id, email: member.email, role: member.role },
    expires_at: session.absoluteExpiresAt.toISOString(),
  });
  response.headers.set("Set-Cookie", serializeSessionCookie(token));
  return response;
}

/** Sign out. `?all=true` ends every session this account holds. */
export async function DELETE(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  }

  const token = readSessionCookie(request);
  const verdict = token ? await verify(token, { touchAfterMs: Number.MAX_SAFE_INTEGER }) : null;

  if (verdict?.ok) {
    const everywhere = new URL(request.url).searchParams.get("all") === "true";
    if (everywhere) {
      const count = await revokeAllForMember(verdict.actor.memberId, "signed out everywhere");
      await recordQuietly({
        workspaceId: verdict.actor.workspaceId,
        actor: verdict.actor,
        action: "session.ended_everywhere",
        resourceType: "member",
        resourceId: verdict.actor.memberId,
        metadata: { sessions: count },
      });
    } else {
      await revoke(verdict.session.id, "signed out");
    }
  }

  // The cookie is cleared either way. A sign-out that leaves a cookie
  // behind because the session was already gone is a sign-out that looks
  // like it failed.
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}
