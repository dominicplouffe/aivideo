import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getSsoProvider } from "@/lib/auth/sso";
import { findConnectionForDomain } from "@/lib/auth/sso/provisioning";
import { issueState, safeNext, serializeNonceCookie } from "@/lib/auth/sso/state";

/**
 * Start single sign-on.
 *
 * A GET, because it is reached by clicking a link — but a GET that changes
 * nothing except a short-lived nonce cookie, so there is nothing here for a
 * cross-site request to abuse. The dangerous half of the flow is the
 * callback, and that is where the checks are.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Single sign-on requires a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const email = params.get("email")?.trim().toLowerCase() || undefined;
  let connectionId = params.get("connection") ?? undefined;
  const organizationId = params.get("organization") ?? undefined;

  // Typing a work address is kinder than being handed a connection id, so
  // the domain routes the request — and routing is all it does. The
  // connection checks its own claimed domains before it provisions anybody,
  // so a wrong guess here can only lead to a login that then refuses.
  if (!connectionId && !organizationId && email) {
    const found = await findConnectionForDomain(email);
    if (!found.ok) return backToSignIn(request, `sso-connection-${found.reason}`, params.get("next"));
    connectionId = found.connectionId;
  }

  if (!connectionId && !organizationId) {
    // Without one of these the vendor would choose a connection for us.
    // Which workspace a login lands in is this product's decision, and it
    // is made from a row an admin owns.
    return NextResponse.json(
      { error: "A connection, organization or work email is required to begin single sign-on." },
      { status: 400 },
    );
  }

  const { state, nonce } = issueState({ next: params.get("next"), connectionId });

  const url = getSsoProvider().authorizationUrl({
    state,
    connectionId,
    organizationId,
    loginHint: params.get("email") ?? undefined,
    redirectUri: callbackUrl(request),
  });

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Set-Cookie", serializeNonceCookie(nonce));
  // A redirect into an identity provider is not something to keep.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function backToSignIn(request: Request, reason: string, next: string | null): NextResponse {
  const url = new URL("/signin", process.env.NEXT_PUBLIC_SITE_URL ?? request.url);
  url.searchParams.set("error", reason);
  const safe = safeNext(next, "");
  if (safe) url.searchParams.set("next", safe);
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * The callback URL, which must be byte-identical in both legs of the flow.
 *
 * Taken from configuration rather than the request when it is set, because
 * `Host` is an attacker-controlled header behind a permissive proxy and a
 * redirect_uri built from it is a redirect_uri somebody else chose.
 */
export function callbackUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL("/api/auth/sso/callback", configured).toString();
  return new URL("/api/auth/sso/callback", request.url).toString();
}
