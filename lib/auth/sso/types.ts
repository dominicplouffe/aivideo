import type { Role } from "../roles";

/**
 * Single sign-on, as a provider interface.
 *
 * The same shape as every other vendor boundary in this repository: a narrow
 * interface, a deterministic implementation for development and tests, and
 * one adapter per vendor. Nothing above this layer knows the word "WorkOS".
 */

export interface SsoProfile {
  /** The identity provider's own id for this person. Stable across renames. */
  externalId: string;
  email: string;
  name: string;
  /** The connection the assertion came through. Decides the workspace. */
  connectionId: string;
  organizationId?: string;
  /** Directory groups, when the provider sends them. Mapped to a role. */
  groups: string[];
  /** What the provider called itself, for the audit entry. */
  provider: string;
}

export interface AuthorizationRequest {
  /** Opaque, signed, single-use. Carried through and checked on return. */
  state: string;
  /** Restricts the identity provider to one connection or organization. */
  connectionId?: string;
  organizationId?: string;
  /** The hint a user typed, so the vendor can pick the right connection. */
  loginHint?: string;
  redirectUri: string;
}

export interface SsoProvider {
  readonly name: string;
  /** Where to send the browser to start the exchange. */
  authorizationUrl(request: AuthorizationRequest): string;
  /** Trades the one-time code for a profile. Never called from a browser. */
  exchange(code: string, redirectUri: string): Promise<SsoProfile>;
}

/** What a connection decided about somebody, before any row is written. */
export interface ProvisioningDecision {
  outcome: "provision" | "update" | "refused";
  workspaceId?: string;
  role?: Role;
  reason?: string;
}
