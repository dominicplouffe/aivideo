import { createHash } from "node:crypto";

/**
 * Derives a stable UUID from a fixture identifier.
 *
 * Seeding must be idempotent: re-running it has to produce the same primary
 * keys, or every run would orphan the previous rows and break any URL that
 * referenced them. A hash-derived v5-shaped UUID gives that for free without
 * storing a mapping table.
 */
export function stableUuid(namespace: string, name: string): string {
  const h = createHash("sha1").update(`${namespace}:${name}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join("-");
}
