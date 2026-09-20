import { MockSso } from "./mock";
import { WorkOsSso } from "./workos";
import type { SsoProvider } from "./types";

export * from "./types";
export { safeNext } from "./state";

/**
 * Which identity provider is in use.
 *
 * WorkOS when it is configured, the deterministic mock otherwise — and in
 * production there is no otherwise. A deployment with no identity provider
 * configured cannot sign anybody in, which is the correct behaviour and the
 * one `app/api/auth/route.ts` has enforced since before this existed.
 */
export function getSsoProvider(): SsoProvider {
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) {
    return WorkOsSso.fromEnv();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No identity provider is configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID.",
    );
  }
  return new MockSso(process.env.DEMORIFF_SSO_MOCK_CONNECTION ?? "conn_development");
}

/** Whether single sign-on can run at all. Used to shape the sign-in page. */
export function ssoConfigured(): boolean {
  if (process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID) return true;
  return process.env.NODE_ENV !== "production";
}
