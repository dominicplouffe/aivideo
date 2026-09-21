import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getIdentityProvider, safeNext, type AuthMethod } from "@/lib/auth/identity";
import { findConnectionForDomain, findConnection } from "@/lib/auth/identity/provisioning";
import { issueState, serializeNonceCookie } from "@/lib/auth/identity/state";

/**
 * Starts a sign-in.
 *
 * Three front doors, and until now they were one: the form offered "Continue
 * with Google", "Continue with Microsoft" and "Continue with SSO", and all
 * three hit a single endpoint that resolved an enterprise SAML connection
 * from the email domain. Two of those labels promised an OAuth flow that did
 * not exist anywhere in the product.
 *
 *   ?method=google | microsoft   → that provider's OAuth, through AuthKit
 *   ?method=sso                  → the caller's own identity provider,
 *                                  resolved from their email domain
 *   ?method=authkit (default)    → AuthKit's hosted pane, which offers a
 *                                  password and a magic link
 */
export const dynamic = "force-dynamic";

const METHODS = new Set<AuthMethod>(["authkit", "google", "microsoft", "sso"]);

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Signing in requires a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const raw = params.get("method") ?? "authkit";
  const method: AuthMethod = METHODS.has(raw as AuthMethod) ? (raw as AuthMethod) : "authkit";
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const next = params.get("next");

  let organizationId: string | undefined;
  let connectionId: string | undefined;

  // Only the enterprise door needs to know who the caller is before they have
  // proved anything. The OAuth doors and the hosted pane collect the address
  // themselves, which is better — it means we never have to ask for an email
  // just to decide where to send the browser.
  if (method === "sso") {
    if (!email.includes("@")) {
      return backToSignIn(request, "sso-email-required", next);
    }
    const found = await findConnectionForDomain(email);
    if (!found.ok) {
      return backToSignIn(request, `sso-connection-${found.reason}`, next);
    }
    connectionId = found.connectionId;
    // Prefer the organization when the connection records one: it is what
    // the callback will match against, and starting the flow on the same
    // identifier it will finish on is what makes the mismatch check mean
    // something.
    const connection = await findConnection(found.connectionId);
    organizationId = connection?.organizationId ?? undefined;
    if (organizationId) connectionId = undefined;
  }

  const { state, nonce } = issueState({ next, connectionId: organizationId ?? connectionId });

  const url = getIdentityProvider().authorizationUrl({
    state,
    method,
    organizationId,
    connectionId,
    loginHint: email || undefined,
    intent: params.get("intent") === "sign-up" ? "sign-up" : undefined,
    redirectUri: callbackUrl(request),
  });

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Set-Cookie", serializeNonceCookie(nonce));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function backToSignIn(request: Request, reason: string, next: string | null): NextResponse {
  const url = new URL("/signin", process.env.NEXT_PUBLIC_SITE_URL ?? request.url);
  url.searchParams.set("error", reason);
  if (next) url.searchParams.set("next", safeNext(next));
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Where the identity provider sends the browser back to.
 *
 * Built from configuration rather than the request's `Host`, which an
 * attacker controls: a forged Host would otherwise put their own domain into
 * the redirect the provider is told to use.
 */
export function callbackUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL("/api/auth/authkit/callback", configured).toString();
  return new URL("/api/auth/authkit/callback", request.url).toString();
}
