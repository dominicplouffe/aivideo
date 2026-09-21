import { createHash } from "node:crypto";
import type { AuthProfile, AuthorizationRequest, IdentityProvider } from "./types";

/**
 * The development identity provider.
 *
 * Stands in for AuthKit when no WorkOS credentials are configured, so the
 * whole sign-in path — the routes, the signed state, the nonce cookie,
 * provisioning, the session — can be exercised without a vendor account. It
 * never leaves the application: `authorizationUrl` encodes the claim it would
 * have asserted into the `code` and returns our own callback URL, so the
 * browser bounces straight back and every check downstream runs for real.
 *
 * Refuses to exist in production. There are two independent guards on this,
 * here and in `getIdentityProvider`, because a mock identity provider reachable
 * in production is an authentication bypass — anybody could mint a claim for
 * any address.
 */
export class MockIdentity implements IdentityProvider {
  readonly name = "mock";

  private readonly organizationId?: string;

  constructor(organizationId?: string) {
    // `DEMORIFF_SSO_MOCK_ORGANIZATION=` in an env file is an empty string,
    // not an absent one, and an empty organization is no organization. Left
    // as-is it rides along in every mock claim and reads like an enterprise
    // login that happens to be falsy everywhere it is checked.
    this.organizationId = organizationId?.trim() || undefined;
    if (process.env.NODE_ENV === "production") {
      throw new Error("The mock identity provider must never run in production.");
    }
  }

  authorizationUrl(request: AuthorizationRequest): string {
    const url = new URL(request.redirectUri);
    url.searchParams.set(
      "code",
      encode({
        email: request.loginHint || "dev@example.com",
        // An organization login is an enterprise one and carries the
        // organization through; a `provider` login is self-serve and must
        // not, or every mock sign-in would look like an SSO sign-in.
        organizationId: request.organizationId ?? this.organizationId,
        method: request.method,
        groups: [],
      }),
    );
    url.searchParams.set("state", request.state);
    return url.toString();
  }

  async exchange(code: string): Promise<AuthProfile> {
    const claim = decode(code);
    if (!claim) {
      throw new Error("The mock identity provider was handed a code it did not issue.");
    }

    const email = claim.email.trim().toLowerCase();
    return {
      // Stable across logins for one address, the way a real provider's user
      // id is — otherwise every sign-in would look like a different person.
      externalId: `mock_${createHash("sha256").update(email).digest("hex").slice(0, 16)}`,
      email,
      name: email.split("@")[0],
      // The whole point of the development provider is to exercise the happy
      // path; an unverified address is reachable through `?verified=0` on the
      // route, which is how the refusal gets tested.
      emailVerified: claim.verified !== false,
      authenticationMethod: METHODS[claim.method ?? "authkit"] ?? "unknown",
      organizationId: claim.organizationId,
      groups: Array.isArray(claim.groups) ? claim.groups : [],
      provider: "mock",
    };
  }
}

const METHODS: Record<string, string> = {
  authkit: "Password",
  google: "GoogleOAuth",
  microsoft: "MicrosoftOAuth",
  sso: "SSO",
};

interface MockClaim {
  email: string;
  organizationId?: string;
  method?: string;
  groups?: string[];
  verified?: boolean;
}

export function encode(claim: MockClaim): string {
  return Buffer.from(JSON.stringify(claim), "utf8").toString("base64url");
}

function decode(code: string): MockClaim | null {
  try {
    const claim = JSON.parse(Buffer.from(code, "base64url").toString("utf8")) as MockClaim;
    return typeof claim?.email === "string" && claim.email.includes("@") ? claim : null;
  } catch {
    return null;
  }
}
