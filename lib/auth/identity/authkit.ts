import { ProviderError, isRetryableStatus } from "@/lib/providers/errors";
import type { AuthProfile, AuthorizationRequest, IdentityProvider } from "./types";

/**
 * WorkOS AuthKit, on the User Management API.
 *
 * WorkOS sits in front of the identity providers rather than being one: a
 * person arrives through Google, Microsoft, a password, a magic link or their
 * employer's Okta, and we see one OAuth-shaped exchange regardless. That is
 * the entire reason to use it — supporting SAML directly means supporting
 * every enterprise IdP's interpretation of SAML, and each one is different.
 *
 * This replaced an adapter written against the older `/sso/*` API, which
 * could only do the enterprise half. The sign-in form offered "Continue with
 * Google" and "Continue with Microsoft" beside it, and both resolved a SAML
 * connection from the email domain — three buttons, one behaviour, and two
 * labels promising an OAuth flow that did not exist.
 *
 * Two calls: send the browser to `/user_management/authorize`, then trade the
 * code at `/user_management/authenticate` from the server. The client secret
 * never leaves this process, and the token call is the only place the profile
 * can be trusted from — a profile that arrives any other way is a profile
 * somebody else wrote.
 */

const API = "https://api.workos.com";

/** What WorkOS calls each front door. */
const PROVIDERS: Record<string, string> = {
  authkit: "authkit",
  google: "GoogleOAuth",
  microsoft: "MicrosoftOAuth",
};

export class WorkOsAuthKit implements IdentityProvider {
  readonly name = "workos";

  constructor(
    private readonly apiKey: string,
    private readonly clientId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(fetchImpl: typeof fetch = fetch): WorkOsAuthKit {
    const apiKey = process.env.WORKOS_API_KEY;
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!apiKey || !clientId) {
      throw new ProviderError(
        "WORKOS_API_KEY and WORKOS_CLIENT_ID are both required to sign anybody in.",
        { provider: "workos", retryable: false },
      );
    }
    // The client id goes into a URL every visitor sees. With the two values
    // swapped, that URL carries the secret key — which is how it leaked once.
    if (!clientId.startsWith("client_")) {
      throw new ProviderError(
        "WORKOS_CLIENT_ID must start with client_; check it is not swapped with WORKOS_API_KEY.",
        { provider: "workos", retryable: false },
      );
    }
    return new WorkOsAuthKit(apiKey, clientId, fetchImpl);
  }

  authorizationUrl(request: AuthorizationRequest): string {
    const url = new URL("/user_management/authorize", API);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", request.state);

    // Exactly one of these three. An organization or a connection pins the
    // login to a single customer's identity provider; `provider` opens the
    // hosted pane instead. Sending more than one is how you end up with a
    // login that silently ignores the restriction you thought you set.
    if (request.organizationId) {
      url.searchParams.set("organization_id", request.organizationId);
    } else if (request.connectionId) {
      url.searchParams.set("connection_id", request.connectionId);
    } else {
      url.searchParams.set("provider", PROVIDERS[request.method] ?? "authkit");
    }

    if (request.loginHint) url.searchParams.set("login_hint", request.loginHint);
    // Only meaningful on the hosted pane. The OAuth providers have no such
    // concept, and an organization login lands wherever that organization
    // says it does.
    if (request.intent && request.method === "authkit" && !request.organizationId) {
      url.searchParams.set("screen_hint", request.intent);
    }
    return url.toString();
  }

  async exchange(code: string): Promise<AuthProfile> {
    const response = await this.fetchImpl(`${API}/user_management/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.apiKey,
        grant_type: "authorization_code",
        code,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const vendorCode = errorCodeIn(detail);

      // Some of these are not failures, they are instructions: WorkOS is
      // saying the person has to do something else first. Carrying the code
      // through lets the sign-in page say which, instead of collapsing every
      // one of them into "we could not complete the sign-in".
      throw new ProviderError(
        vendorCode
          ? `WorkOS refused the exchange: ${vendorCode}`
          : // Deliberately vague to the browser. An exchange failure can carry
            // the client id and the organization back in its message, and the
            // person triggering it is not necessarily the account's owner.
            `WorkOS refused the exchange: ${response.status} ${detail.slice(0, 300)}`,
        {
          provider: "workos",
          retryable: vendorCode ? false : isRetryableStatus(response.status),
          status: response.status,
          code: vendorCode ?? undefined,
        },
      );
    }

    const body = (await response.json()) as AuthenticateResponse;
    const user = body.user;
    if (!user?.email || !user.id) {
      throw new ProviderError("WorkOS returned a response with no usable user.", {
        provider: "workos",
        retryable: false,
        status: 502,
      });
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return {
      externalId: user.id,
      email: user.email.trim().toLowerCase(),
      name: name || user.email.split("@")[0],
      // Absent is treated as unverified. The one place this value is used is
      // the gate in front of creating a workspace, and a missing field is not
      // a reason to assume somebody owns an address.
      emailVerified: user.email_verified === true,
      authenticationMethod: body.authentication_method ?? "unknown",
      organizationId: body.organization_id ?? undefined,
      sessionId: sessionIdFrom(body.access_token) ?? undefined,
      // WorkOS sends groups only when the connection is configured to map
      // them. An empty list means "the directory said nothing", which is a
      // different thing from "no groups" — so the caller falls back to the
      // connection's default role rather than stripping privileges.
      groups: Array.isArray(body.user_groups) ? body.user_groups : [],
      provider: "workos",
    };
  }
}

/**
 * The session id inside an access token, so signing out here signs out there.
 *
 * The payload is read without verifying the signature, and that is safe for
 * one specific reason: this token arrived over TLS in the body of an exchange
 * we made with our own client secret. It is not a token a browser handed us,
 * so there is no forgery to defend against — and verifying it would mean
 * fetching and caching a JWKS to learn something we were told directly.
 */
export function sessionIdFrom(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sid?: unknown;
    };
    return typeof claims.sid === "string" ? claims.sid : null;
  } catch {
    return null;
  }
}

/** Where to send a browser to end the WorkOS session as well as ours. */
export function logoutUrl(sessionId: string, returnTo?: string): string {
  const url = new URL("/user_management/sessions/logout", API);
  url.searchParams.set("session_id", sessionId);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  return url.toString();
}

/** The machine-readable `code` in an error body, when there is one. */
function errorCodeIn(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail) as { code?: unknown; error?: unknown };
    if (typeof parsed.code === "string") return parsed.code;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON. Nothing to read, and the status still says enough.
  }
  return null;
}

interface AuthenticateResponse {
  user?: {
    id?: string;
    email?: string;
    email_verified?: boolean;
    first_name?: string | null;
    last_name?: string | null;
  };
  organization_id?: string | null;
  access_token?: string;
  refresh_token?: string;
  authentication_method?: string;
  user_groups?: string[];
}
