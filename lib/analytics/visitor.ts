import { createHmac, randomBytes } from "node:crypto";

/**
 * Cookieless visitor identity.
 *
 * The problem: two views from the same person on the same day should count
 * once, and nothing about that person should be storable, linkable across
 * days, or reversible by anyone who later reads the database.
 *
 * The answer is a salt that rotates every day and is **never written down**.
 * The key is `HMAC(salt, address + user-agent + asset)`, which deduplicates
 * within a day and is meaningless the day after — there is no salt left to
 * recompute it with. Somebody with the whole database and a specific person
 * in mind cannot confirm that person watched anything, because the input
 * that would let them check no longer exists.
 *
 * The asset is in the hash on purpose. Without it, the same key identifies a
 * viewer across every demo they see that day, which is a cross-site
 * behavioural profile — exactly the thing dropping cookies was supposed to
 * avoid.
 */

let currentSalt: { day: string; value: Buffer } | null = null;

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The day's salt, generated on first use and dropped when the day turns.
 *
 * Held in memory only. A process restart rotates it early, which
 * over-counts a handful of returning viewers and is the right trade: the
 * alternative is persisting the one value that makes the whole scheme
 * reversible.
 */
function saltFor(day: string): Buffer {
  if (currentSalt?.day === day) return currentSalt.value;
  currentSalt = { day, value: randomBytes(32) };
  return currentSalt.value;
}

export interface VisitorInput {
  ip: string | null;
  userAgent: string | null;
  /** Scopes the key to one asset, so it is not a cross-demo identifier. */
  assetId: string;
  now?: Date;
}

export function visitorKey(input: VisitorInput): { key: string; day: string } {
  const day = today(input.now);
  const material = [input.ip ?? "", input.userAgent ?? "", input.assetId].join("\u0000");
  const key = createHmac("sha256", saltFor(day)).update(material, "utf8").digest("hex");
  return { key, day };
}

/** Test seam: forces a known salt so a key can be asserted. */
export function setSaltForTesting(day: string, value: Buffer | null): void {
  currentSalt = value ? { day, value } : null;
}

/**
 * Device class from a user agent.
 *
 * Three buckets, deliberately. "Which of these is worth optimising for" is
 * answered by mobile-versus-desktop; anything finer is a fingerprint with a
 * chart drawn on it.
 */
export function deviceKind(userAgent: string | null): "mobile" | "tablet" | "desktop" {
  if (!userAgent) return "desktop";
  if (/\biPad\b|\bTablet\b|Android(?!.*Mobile)/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(userAgent)) return "mobile";
  return "desktop";
}
