import { createHash } from "node:crypto";
import type { AuthorizationRequest, SsoProfile, SsoProvider } from "./types";

/**
 * A deterministic identity provider, for development and tests.
 *
 * It exists so the whole flow — state, nonce, callback, provisioning, role
 * mapping, session issue — can be exercised without a vendor account. The
 * authorization URL points back at our own callback with a code that encodes
 * the assertion, which is exactly the kind of thing that must never run in
 * production, so it refuses to.
 */
export class MockSso implements SsoProvider {
  readonly name = "mock";

  constructor(private readonly connectionId: string) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("The mock identity provider cannot be used in production.");
    }
  }

  authorizationUrl(request: AuthorizationRequest): string {
    const email = request.loginHint ?? "dev@meridian.com";
    const code = encode({
      email,
      connectionId: request.connectionId ?? this.connectionId,
      groups: [],
    });
    const url = new URL(request.redirectUri);
    url.searchParams.set("code", code);
    url.searchParams.set("state", request.state);
    return url.toString();
  }

  async exchange(code: string): Promise<SsoProfile> {
    const claim = decode(code);
    return {
      // Stable for a given address, so a second sign-in matches the first.
      externalId: `mock_${createHash("sha256").update(claim.email).digest("hex").slice(0, 16)}`,
      email: claim.email.trim().toLowerCase(),
      name: claim.email.split("@")[0],
      connectionId: claim.connectionId,
      groups: claim.groups,
      provider: "mock",
    };
  }
}

interface MockClaim {
  email: string;
  connectionId: string;
  groups: string[];
}

export function encode(claim: MockClaim): string {
  return Buffer.from(JSON.stringify(claim), "utf8").toString("base64url");
}

function decode(code: string): MockClaim {
  try {
    const claim = JSON.parse(Buffer.from(code, "base64url").toString("utf8")) as MockClaim;
    if (!claim.email || !claim.connectionId) throw new Error("incomplete");
    return { ...claim, groups: Array.isArray(claim.groups) ? claim.groups : [] };
  } catch {
    throw new Error("The mock identity provider was handed a code it did not issue.");
  }
}
