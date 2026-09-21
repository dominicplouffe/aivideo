import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { clearSessionCookie, originAllowed, readSessionCookie, serializeSessionCookie } from "@/lib/auth/cookies";
import { issue, listForMember, revoke, revokeAllForMember, verify } from "@/lib/auth/sessions";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { logoutUrl } from "@/lib/auth/identity";

/**
 * Sign in, sign out, and see where you are signed in.
 *
 * Identity arrives through `/api/auth/authkit`; this route is what happens
 * on either side of it — the session row, the cookie, and revocation that
 * takes effect at once rather than at the next expiry.
 *
 * The POST here is a development shortcut that looks up an existing member
 * by address and believes it. That is fine on a laptop and an authentication
 * bypass anywhere else, so it is refused in production. A shortcut which can
 * authenticate anybody has to fail loudly somewhere, and the earliest place
 * is better than the latest.
 */

const SSO_PENDING =
  "Email sign-in is a development convenience and is refused here. Use one of " +
  "the sign-in buttons, which go through your identity provider.";

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
  // Refused in production unconditionally.
  //
  // The first version of this said "unless WORKOS_API_KEY is set", which
  // meant that setting that variable — exactly what somebody deploying
  // would do while wiring up SSO — silently enabled an email-only sign-in
  // where anybody could become anybody by typing their address. An
  // environment variable that turns a development shortcut into a
  // production authentication bypass is the worst shape a guard can have.
  //
  // When the WorkOS exchange exists it gets its own branch above this one,
  // and this stays exactly as it is.
  if (process.env.NODE_ENV === "production") {
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

  // Ordered, because an address may be a member of more than one workspace
  // — `members` is unique on (workspace, email), not on email. This took the
  // first row with no ORDER BY, so somebody in two workspaces landed in
  // whichever one Postgres happened to return that day. Most recently used
  // is the best guess available until there is a picker to ask with.
  const [member] = await getDb()
    .select()
    .from(s.members)
    .where(eq(s.members.email, email))
    .orderBy(desc(s.members.lastActiveAt), s.members.createdAt, s.members.id)
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
  const response = NextResponse.json({
    ok: true,
    // Where to go next to end the session at the identity provider too.
    //
    // Ours is already revoked above; theirs is not, and a browser that still
    // holds it will sail straight back through "continue with Google"
    // without being asked anything. That looks, to the person who just
    // pressed sign out, exactly like sign-out having done nothing.
    //
    // Returned rather than redirected to, because this is a DELETE answering
    // a fetch: the caller decides whether to follow it.
    logout_url: verdict?.ok ? workosLogoutUrl(verdict.session.workosSessionId, request) : null,
  });
  response.headers.set("Set-Cookie", clearSessionCookie());
  return response;
}

/** The provider's logout URL, when this session came from the provider. */
function workosLogoutUrl(sessionId: string | null, request: Request): string | null {
  if (!sessionId) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return logoutUrl(sessionId, new URL("/signin", origin).toString());
}
