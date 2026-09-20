import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signatures.
 *
 * One scheme, used in both directions, so there is never a question of which
 * side signs what. The header looks like:
 *
 *     DemoRiff-Signature: t=1758394800,v1=9f86d081...
 *
 * The signature covers `${timestamp}.${body}`, not the body alone. That one
 * detail is the difference between a signature and a replay-proof signature:
 * a bare body HMAC stays valid forever, so anyone who captures one delivery
 * can replay it — "render.completed" for a render that was later revoked,
 * "usage.warning" every minute — and every replay verifies perfectly.
 *
 * Verification is timing-safe and bounded by a tolerance window, because a
 * signature that never expires is only half a defence.
 */

export const SIGNATURE_HEADER = "DemoRiff-Signature";
export const SIGNATURE_VERSION = "v1";

/** How far a delivery's timestamp may drift before it is refused. */
export const DEFAULT_TOLERANCE_SEC = 300;

export function signPayload(
  secret: string,
  body: string,
  timestampSec: number = Math.floor(Date.now() / 1000),
): string {
  const digest = createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
  return `t=${timestampSec},${SIGNATURE_VERSION}=${digest}`;
}

export type VerifyResult =
  | { ok: true; timestampSec: number }
  | { ok: false; reason: "malformed" | "stale" | "mismatch" };

export function verifySignature(
  secret: string,
  body: string,
  header: string | null,
  options: { toleranceSec?: number; nowSec?: number } = {},
): VerifyResult {
  if (!header) return { ok: false, reason: "malformed" };

  const parts = new Map(
    header
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([k, v]) => [k, v] as const),
  );

  const timestampSec = Number(parts.get("t"));
  const provided = parts.get(SIGNATURE_VERSION);
  if (!provided || !Number.isFinite(timestampSec)) return { ok: false, reason: "malformed" };

  const now = options.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  // Drift runs both ways: a sender's clock can be ahead of ours.
  if (Math.abs(now - timestampSec) > tolerance) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  // Compare lengths first: timingSafeEqual throws on a mismatch, and the
  // length of a hex digest is not a secret.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };

  return { ok: true, timestampSec };
}
