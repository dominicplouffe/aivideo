import { createHash } from "node:crypto";

/**
 * The audit chain's hash.
 *
 * Kept in its own module, with no database imports, because this function is
 * the definition of the chain: if it changes, every previously written entry
 * stops verifying. It is versioned in the payload for exactly that reason —
 * when the format has to change, old entries can still be checked with the
 * rule they were written under.
 */

export const CHAIN_VERSION = "v1";

/** The first entry's predecessor. Not a hash of anything; a documented start. */
export const GENESIS = "genesis";

export interface ChainableEntry {
  workspaceId: string;
  seq: number;
  prevHash: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
}

/**
 * Canonical JSON: sorted keys, no incidental whitespace.
 *
 * `JSON.stringify` preserves insertion order, so two objects with the same
 * contents can serialise differently and hash differently. An audit chain
 * that fails to verify because a caller built an object in a different order
 * is worse than no chain at all — it trains people to ignore the alarm.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Hashes one entry over its own contents and its predecessor's hash.
 *
 * Fields are joined with a delimiter that cannot occur in any of them — a
 * null byte — rather than a pipe or a colon. Otherwise an action named
 * `a|b` and a resource type `c` hash identically to an action `a` and a
 * resource type `b|c`, and the chain can be forged by choosing names.
 */
export function hashEntry(entry: ChainableEntry): string {
  const payload = [
    CHAIN_VERSION,
    entry.workspaceId,
    String(entry.seq),
    entry.prevHash,
    entry.action,
    entry.resourceType,
    entry.resourceId ?? "",
    entry.actorId ?? "",
    entry.actorEmail ?? "",
    entry.ip ?? "",
    entry.createdAt.toISOString(),
    canonicalJson(entry.metadata ?? null),
  ].join("\u0000");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}
