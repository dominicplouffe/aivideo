import { MockIdentity } from "./mock";
import { WorkOsAuthKit } from "./authkit";
import type { IdentityProvider } from "./types";

export * from "./types";
export { safeNext } from "./state";
export { logoutUrl, sessionIdFrom } from "./authkit";

/**
 * Which identity provider is in use.
 *
 * WorkOS AuthKit when it is configured, the deterministic mock otherwise —
 * and in production there is no otherwise. A deployment with no identity
 * provider configured cannot sign anybody in, which is the correct behaviour:
 * the alternative is a mock that mints a claim for any address somebody types.
 */
export function getIdentityProvider(): IdentityProvider {
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    return WorkOsAuthKit.fromEnv();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No identity provider is configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID.",
    );
  }
  return new MockIdentity(process.env.DEMORIFF_SSO_MOCK_ORGANIZATION);
}

/**
 * Whether anybody can sign in at all.
 *
 * The sign-in page reads this so that a production deployment with no
 * credentials says so on the page, rather than rendering three buttons that
 * each fail once clicked.
 */
export function identityConfigured(): boolean {
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) return true;
  return process.env.NODE_ENV !== "production";
}
