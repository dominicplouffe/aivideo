import { ProviderError, isRetryableStatus } from "@/lib/providers/errors";
import type { AuthorizationRequest, SsoProfile, SsoProvider } from "./types";

/**
 * WorkOS SSO.
 *
 * WorkOS sits in front of the identity providers rather than being one: a
 * customer configures Okta, Entra, Google Workspace or a raw SAML metadata
 * file on their side, and we see one OAuth-shaped exchange regardless. That
 * is the entire reason to use it — supporting SAML directly means supporting
 * every enterprise IdP's interpretation of SAML, and each one is different.
 *
 * Two calls: send the browser to `/sso/authorize`, then trade the code at
 * `/sso/token` from the server. The client secret never leaves this process,
 * and the token call is the only place the profile can be trusted from — an
 * assertion that arrives any other way is an assertion somebody else wrote.
 */

const API = "https://api.workos.com";

export class WorkOsSso implements SsoProvider {
  readonly name = "workos";

  constructor(
    private readonly apiKey: string,
    private readonly clientId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(fetchImpl: typeof fetch = fetch): WorkOsSso {
    const apiKey = process.env.WORKOS_API_KEY;
    const clientId = process.env.WORKOS_CLIENT_ID;
    if (!apiKey || !clientId) {
      throw new ProviderError(
        "WORKOS_API_KEY and WORKOS_CLIENT_ID are both required for single sign-on.",
        { provider: "workos", retryable: false },
      );
    }
    return new WorkOsSso(apiKey, clientId, fetchImpl);
  }

  authorizationUrl(request: AuthorizationRequest): string {
    const url = new URL("/sso/authorize", API);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", request.state);
    // One of these is required, and it is what pins the login to a single
    // customer's identity provider. Without it the vendor would be free to
    // pick a connection from the email domain, which is the decision this
    // product makes for itself in `provisioning.ts`.
    if (request.connectionId) url.searchParams.set("connection", request.connectionId);
    else if (request.organizationId) url.searchParams.set("organization", request.organizationId);
    if (request.loginHint) url.searchParams.set("login_hint", request.loginHint);
    return url.toString();
  }

  async exchange(code: string, redirectUri: string): Promise<SsoProfile> {
    const response = await this.fetchImpl(`${API}/sso/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.apiKey,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Deliberately not surfaced to the browser. A code exchange failure
      // can carry the client id and the connection back in its message, and
      // the person triggering it is not necessarily the account's owner.
      throw new ProviderError(
        `WorkOS refused the code exchange: ${response.status} ${detail.slice(0, 300)}`,
        { provider: "workos", retryable: isRetryableStatus(response.status), status: response.status },
      );
    }

    const body = (await response.json()) as WorkOsTokenResponse;
    const profile = body.profile;
    if (!profile?.email || !profile.id || !profile.connection_id) {
      throw new ProviderError("WorkOS returned a token response with no usable profile.", {
        provider: "workos",
        retryable: false,
        status: 502,
      });
    }

    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    return {
      externalId: profile.idp_id || profile.id,
      email: profile.email.trim().toLowerCase(),
      name: name || profile.email.split("@")[0],
      connectionId: profile.connection_id,
      organizationId: profile.organization_id ?? undefined,
      // WorkOS sends groups only when the connection is configured to map
      // them. An empty list means "the directory said nothing", which is a
      // different thing from "no groups" — so the caller falls back to the
      // connection's default role rather than stripping privileges.
      groups: Array.isArray(profile.groups) ? profile.groups : [],
      provider: "workos",
    };
  }
}

interface WorkOsTokenResponse {
  profile?: {
    id?: string;
    idp_id?: string;
    email?: string;
    first_name?: string | null;
    last_name?: string | null;
    connection_id?: string;
    organization_id?: string | null;
    groups?: string[];
  };
}
