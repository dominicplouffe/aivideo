import type { Role } from "../roles";

/**
 * Identity, as a provider interface.
 *
 * The same shape as every other vendor boundary in this repository: a narrow
 * interface, a deterministic implementation for development and tests, and
 * one adapter per vendor. Nothing above this layer knows the word "WorkOS".
 *
 * This was `SsoProfile`, and `connectionId` was required, because the only
 * way in was an enterprise SAML connection and the connection decided the
 * workspace. Once somebody can arrive through Google or a password there is
 * no connection to speak of, so the anchor moves to `organizationId` — which
 * is present for an enterprise login and absent for a self-serve one, and
 * that absence is exactly what distinguishes the two paths.
 */

export interface AuthProfile {
  /** The identity provider's own id for this person. Stable across renames. */
  externalId: string;
  email: string;
  name: string;
  /**
   * Whether the provider is willing to say this person owns this address.
   *
   * The whole reason self-serve signup could not run in production was that
   * nothing answered this question — the form took an address and believed
   * it. A workspace is never created on a `false`.
   */
  emailVerified: boolean;
  /**
   * How they proved it: `GoogleOAuth`, `MicrosoftOAuth`, `Password`,
   * `MagicAuth`, `SSO`. Recorded in the audit entry, because "signed in" and
   * "signed in with the corporate directory" are different events.
   */
  authenticationMethod: string;
  /**
   * The organization the login belonged to, when it belonged to one.
   *
   * Present for an enterprise login and absent for a self-serve one. It
   * decides the workspace, and the email domain never does — anybody who can
   * get an identity provider to assert an address at a customer's domain
   * would otherwise land inside that customer's workspace, and the customer
   * never agreed to trust that provider.
   */
  organizationId?: string;
  /**
   * The provider's own id for this login session, when they issue one.
   *
   * Carried so signing out here can sign them out there too. It is the id
   * rather than the access token on purpose: nothing downstream needs a
   * bearer credential, and a token that is never held cannot be leaked by
   * something that holds it.
   */
  sessionId?: string;
  /** Directory groups, when the provider sends them. Mapped to a role. */
  groups: string[];
  /** What the provider called itself, for the audit entry. */
  provider: string;
}

/** Which front door to send somebody through. */
export type AuthMethod = "authkit" | "google" | "microsoft" | "sso";

export interface AuthorizationRequest {
  /** Opaque, signed, single-use. Carried through and checked on return. */
  state: string;
  /** Which provider to use. Ignored when an organization is named. */
  method: AuthMethod;
  /** Restricts the login to one organization or connection. */
  organizationId?: string;
  connectionId?: string;
  /** The hint a user typed, so the vendor can prefill it. */
  loginHint?: string;
  /** Whether to open on the sign-up or the sign-in pane. */
  intent?: "sign-up" | "sign-in";
  redirectUri: string;
}

export interface IdentityProvider {
  readonly name: string;
  /** Where to send the browser to start the exchange. */
  authorizationUrl(request: AuthorizationRequest): string;
  /** Trades the one-time code for a profile. Never called from a browser. */
  exchange(code: string, redirectUri: string): Promise<AuthProfile>;
}

/** What a connection decided about somebody, before any row is written. */
export interface ProvisioningDecision {
  outcome: "provision" | "update" | "refused";
  workspaceId?: string;
  role?: Role;
  reason?: string;
}
