import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { recordQuietly } from "@/lib/audit/log";
import { serializeSessionCookie } from "@/lib/auth/cookies";
import { issue } from "@/lib/auth/sessions";
import { getSsoProvider } from "@/lib/auth/sso";
import { provision } from "@/lib/auth/sso/provisioning";
import { clearNonceCookie, readNonceCookie, verifyState } from "@/lib/auth/sso/state";
import { callbackUrl } from "../route";

/**
 * Where an identity provider returns the browser.
 *
 * This is the sharp end of single sign-on, and it does four things in a
 * fixed order, none of which may be skipped:
 *
 *  1. Check the `state` against the nonce cookie. A code presented without a
 *     state this server issued *to this browser* is somebody else's code,
 *     and accepting it signs the victim into the attacker's account.
 *  2. Exchange the code server-side. A profile that did not come back from
 *     the token endpoint is a profile whoever drove the browser wrote.
 *  3. Provision through the connection, which is what decides the workspace.
 *  4. Issue a session, and only then redirect.
 *
 * Failures redirect to the sign-in page with a short reason rather than
 * rendering a message here. The browser is mid-navigation from another
 * origin, and the useful thing to give somebody at that moment is the form
 * they were trying to get past.
 */
export const dynamic = "force-dynamic";

function refuse(request: Request, reason: string): NextResponse {
  const url = new URL("/signin", process.env.NEXT_PUBLIC_SITE_URL ?? request.url);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url, 302);
  response.headers.append("Set-Cookie", clearNonceCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return refuse(request, "no-database");

  const params = new URL(request.url).searchParams;

  // An identity provider that refuses reports it here rather than by failing
  // to respond. Surfaced as its own reason: "your administrator has not
  // assigned you this application" is not the same problem as a bad code.
  if (params.get("error")) return refuse(request, "idp-refused");

  const verdict = verifyState(params.get("state"), readNonceCookie(request));
  if (!verdict.ok) return refuse(request, `state-${verdict.reason}`);

  const code = params.get("code");
  if (!code) return refuse(request, "no-code");

  let profile;
  try {
    profile = await getSsoProvider().exchange(code, callbackUrl(request));
  } catch (error) {
    // The vendor's message can carry the client id and the connection, and
    // the person holding this browser is not necessarily the account owner.
    console.error("[sso] code exchange failed:", error);
    return refuse(request, "exchange-failed");
  }

  // The connection the browser asked for must be the connection the
  // assertion came back through. Without this check a login started against
  // a workspace the attacker controls could be completed with an assertion
  // from somewhere else entirely.
  if (verdict.payload.connectionId && verdict.payload.connectionId !== profile.connectionId) {
    return refuse(request, "connection-mismatch");
  }

  const result = await provision(profile);
  if (!result.ok) {
    // Recorded against the workspace that refused, when there is one. A
    // connection nobody has registered belongs to no workspace, and there is
    // no tenant's log to write a stranger's failed login into.
    if (result.workspaceId) {
      await recordQuietly({
        workspaceId: result.workspaceId,
        actor: { memberId: null, email: profile.email },
        action: "session.sso_refused",
        resourceType: "member",
        ip: clientIp(request),
        metadata: { reason: result.reason, connectionId: profile.connectionId },
      });
    }
    return refuse(request, `sso-${result.reason}`);
  }

  const { token, session } = await issue({
    memberId: result.member.id,
    workspaceId: result.member.workspaceId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  await recordQuietly({
    workspaceId: result.member.workspaceId,
    actor: { memberId: result.member.id, email: result.member.email },
    action: result.created ? "member.provisioned" : "session.started",
    resourceType: "session",
    resourceId: session.id,
    ip: clientIp(request),
    metadata: {
      via: profile.provider,
      connectionId: profile.connectionId,
      roleChanged: result.roleChanged,
      role: result.member.role,
    },
  });

  const destination = new URL(
    verdict.payload.next,
    process.env.NEXT_PUBLIC_SITE_URL ?? request.url,
  );
  const response = NextResponse.redirect(destination, 302);
  response.headers.append("Set-Cookie", serializeSessionCookie(token));
  // The nonce has done its job, and leaving it would let a second callback
  // reuse the same state.
  response.headers.append("Set-Cookie", clearNonceCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
