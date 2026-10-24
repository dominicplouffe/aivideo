import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getIdentityProvider } from "@/lib/auth/identity";
import { provision } from "@/lib/auth/identity/provisioning";
import {
  clearNonceCookie,
  readNonceCookie,
  verifyState,
} from "@/lib/auth/identity/state";
import { issue } from "@/lib/auth/sessions";
import { serializeSessionCookie } from "@/lib/auth/cookies";
import { recordQuietly } from "@/lib/audit/log";
import { ProviderError } from "@/lib/providers/errors";
import { callbackUrl } from "../route";

/**
 * Where the identity provider sends somebody back to.
 *
 * The order of the checks below is the security of the whole flow, and it is
 * unchanged from the SSO callback this replaced:
 *
 *   1. a database, or there is nobody to be
 *   2. the provider's own refusal, before we read anything it sent
 *   3. the signed state and its nonce cookie — this is the login-CSRF check,
 *      and it is what stops a code obtained in one browser being redeemed in
 *      another
 *   4. a code at all
 *   5. the exchange, which is the only place a profile can be trusted from
 *   6. the organization that came back is the organization we started with
 *   7. provisioning, which decides the workspace
 *   8. a session, and only then
 */
export const dynamic = "force-dynamic";

/** WorkOS refusals that are instructions, not failures. */
const INSTRUCTIONS: Record<string, string> = {
  email_verification_required: "email-unverified",
  organization_selection_required: "organization-selection-required",
  mfa_enrollment: "mfa-required",
  mfa_challenge: "mfa-required",
  sso_required: "sso-required",
};

function refuse(request: Request, reason: string, next?: string): NextResponse {
  const url = new URL("/signin", process.env.NEXT_PUBLIC_SITE_URL ?? request.url);
  url.searchParams.set("error", reason);
  // Kept once the state has verified, so somebody asked to verify an address
  // first still ends up where they were going (a paid plan's checkout).
  if (next && next !== "/app") url.searchParams.set("next", next);
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

  if (params.get("error")) return refuse(request, "idp-refused");

  const verdict = verifyState(params.get("state"), readNonceCookie(request));
  if (!verdict.ok) return refuse(request, `state-${verdict.reason}`);

  const code = params.get("code");
  if (!code) return refuse(request, "no-code");

  let profile;
  try {
    profile = await getIdentityProvider().exchange(code, callbackUrl(request));
  } catch (error) {
    // A vendor code means the person has to do something else first — verify
    // an address, pick an organization, enroll in MFA — and saying which is
    // the difference between a page they can act on and one that just says
    // "try again".
    const instruction =
      error instanceof ProviderError && error.detail.code
        ? INSTRUCTIONS[error.detail.code]
        : undefined;
    if (!instruction) console.error("[auth] code exchange failed:", error);
    return refuse(request, instruction ?? "exchange-failed", verdict.payload.next);
  }

  // The organization the browser asked for must be the organization the
  // login came back through. Without this, a flow started against one
  // customer's identity provider could be completed with a code minted
  // against another's.
  //
  // A pinned flow that comes back carrying *no* organization is refused for
  // the same reason, and it is the sharper case: falling through would send
  // an enterprise login down the self-serve path and hand somebody a brand
  // new personal workspace, which to them looks exactly like their company's
  // one having been emptied.
  if (verdict.payload.organizationId) {
    if (verdict.payload.organizationId !== profile.organizationId) {
      return refuse(request, "connection-mismatch");
    }
  }

  const result = await provision(profile, { firstTouch: verdict.payload.firstTouch });
  if (!result.ok) {
    if (result.workspaceId) {
      await recordQuietly({
        workspaceId: result.workspaceId,
        actor: { memberId: null, email: profile.email },
        action: "session.sso_refused",
        resourceType: "member",
        ip: clientIp(request),
        metadata: { reason: result.reason, organizationId: profile.organizationId ?? null },
      });
    }
    return refuse(request, `sso-${result.reason}`);
  }

  const { token, session } = await issue({
    memberId: result.member.id,
    workspaceId: result.member.workspaceId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
    // So signing out here can sign them out there too.
    workosSessionId: profile.sessionId ?? null,
  });

  // A workspace being created is its own event, and a more consequential one
  // than a sign-in: it is the moment a tenant exists.
  if (result.workspaceCreated) {
    await recordQuietly({
      workspaceId: result.member.workspaceId,
      actor: { memberId: result.member.id, email: result.member.email },
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: result.member.workspaceId,
      ip: clientIp(request),
      metadata: { via: profile.authenticationMethod },
    });
  }

  await recordQuietly({
    workspaceId: result.member.workspaceId,
    actor: { memberId: result.member.id, email: result.member.email },
    action: result.created ? "member.provisioned" : "session.started",
    resourceType: "session",
    resourceId: session.id,
    ip: clientIp(request),
    metadata: {
      via: profile.provider,
      method: profile.authenticationMethod,
      organizationId: profile.organizationId ?? null,
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
  response.headers.append("Set-Cookie", clearNonceCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
