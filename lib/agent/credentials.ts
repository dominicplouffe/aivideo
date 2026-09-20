import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { open as unseal, seal } from "@/lib/crypto/secrets";
import { recordQuietly } from "@/lib/audit/log";
import type { ActingParty } from "./run";
import { normaliseEntry } from "./allowlist";

/**
 * Credentials the agent is allowed to use.
 *
 * A demo account for a customer's own product, sealed at rest and scoped to
 * exactly one origin. Three properties, and the second is the one that gets
 * left out:
 *
 *  1. **Sealed.** AES-256-GCM, like the SIEM token, because it has to be
 *     presented rather than recognised.
 *  2. **Bound to an origin, checked at use.** A credential for
 *     `https://app.acme.com` is never presented anywhere else, so an agent
 *     that has been talked into visiting another page cannot be talked into
 *     typing the password there. This is the difference between "the agent
 *     has credentials" and "the agent has credentials for this site".
 *  3. **Rotatable in place.** One row, one label, a new secret — nothing
 *     that references it has to change, which is what makes rotation
 *     something a person will actually do.
 *
 * `lastUsedAt` is recorded because the most common way these leak is that
 * the demo account for a product nobody demos any more still works, and
 * nobody can see that it does.
 */

export type Credential = typeof s.agentCredentials.$inferSelect;

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export async function storeCredential(input: {
  workspaceId: string;
  label: string;
  origin: string;
  username?: string | null;
  secret: string;
  actor: ActingParty;
}): Promise<Credential> {
  const origin = normaliseEntry(input.origin);
  if (!origin || origin.startsWith("*.")) {
    // A wildcard is fine for deciding where the agent may *browse*. It is
    // not fine for deciding where a password may be typed.
    throw new CredentialError("A credential must name one exact origin.");
  }
  if (!origin.startsWith("https://")) {
    throw new CredentialError("A credential origin must be https.");
  }

  const [existing] = await getDb()
    .select()
    .from(s.agentCredentials)
    .where(
      and(
        eq(s.agentCredentials.workspaceId, input.workspaceId),
        eq(s.agentCredentials.label, input.label),
      ),
    )
    .limit(1);

  const values = {
    workspaceId: input.workspaceId,
    label: input.label,
    origin,
    username: input.username ?? null,
    secretSealed: seal(input.secret),
    rotatedAt: existing ? new Date() : null,
    revokedAt: null,
  };

  const [row] = existing
    ? await getDb()
        .update(s.agentCredentials)
        .set(values)
        .where(eq(s.agentCredentials.id, existing.id))
        .returning()
    : await getDb().insert(s.agentCredentials).values(values).returning();

  await recordQuietly({
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: existing ? "agent.credential_rotated" : "agent.credential_stored",
    resourceType: "agent_credential",
    resourceId: row.id,
    // The origin and the label, never the secret and never the username's
    // value beyond whether one is set.
    metadata: { label: input.label, origin, hasUsername: Boolean(input.username) },
  });

  return row;
}

export async function revokeCredential(
  workspaceId: string,
  label: string,
  actor: ActingParty,
): Promise<boolean> {
  const [row] = await getDb()
    .update(s.agentCredentials)
    // The secret is cleared, not merely marked. A revoked credential whose
    // ciphertext is still in the table is a revoked credential that comes
    // back if anybody ever un-sets the flag.
    .set({ revokedAt: new Date(), secretSealed: seal("") })
    .where(
      and(
        eq(s.agentCredentials.workspaceId, workspaceId),
        eq(s.agentCredentials.label, label),
        isNull(s.agentCredentials.revokedAt),
      ),
    )
    .returning();

  if (!row) return false;

  await recordQuietly({
    workspaceId,
    actor,
    action: "agent.credential_revoked",
    resourceType: "agent_credential",
    resourceId: row.id,
    metadata: { label, origin: row.origin },
  });
  return true;
}

export interface ResolvedCredential {
  label: string;
  username: string | null;
  secret: string;
  origin: string;
}

/**
 * The credential for one origin, or nothing.
 *
 * Takes the origin the browser is *actually on*, never the one the outline
 * said it would be on. Those differ exactly when it matters: after a
 * redirect to somewhere the agent did not plan to go.
 */
export async function credentialForOrigin(
  workspaceId: string,
  origin: string,
): Promise<ResolvedCredential | null> {
  const normalised = normaliseEntry(origin);
  if (!normalised) return null;

  const [row] = await getDb()
    .select()
    .from(s.agentCredentials)
    .where(
      and(
        eq(s.agentCredentials.workspaceId, workspaceId),
        eq(s.agentCredentials.origin, normalised),
        isNull(s.agentCredentials.revokedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  const secret = unseal(row.secretSealed);
  if (!secret) return null;

  await getDb()
    .update(s.agentCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(s.agentCredentials.id, row.id));

  return { label: row.label, username: row.username, secret, origin: row.origin };
}

/** For the settings screen. Never returns a secret. */
export async function listCredentials(workspaceId: string) {
  const rows = await getDb()
    .select()
    .from(s.agentCredentials)
    .where(eq(s.agentCredentials.workspaceId, workspaceId));

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    origin: row.origin,
    username: row.username,
    rotated_at: row.rotatedAt?.toISOString() ?? null,
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
    revoked: row.revokedAt !== null,
  }));
}
