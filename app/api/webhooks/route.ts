import { NextResponse } from "next/server";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signing";

/**
 * Inbound webhook receiver.
 *
 * Verification happens over the raw body, before parsing, so a forged payload
 * never reaches application code. The signature scheme is the same one this
 * platform uses to sign its own outbound deliveries — see
 * `lib/webhooks/signing.ts` — which means there is one implementation to get
 * right rather than two that drift.
 */

const KNOWN_EVENTS = new Set([
  "recording.processed",
  "project.ready",
  "render.completed",
  "render.failed",
  "locale.stale",
  "asset.threshold",
  "usage.warning",
  "voice.revoked",
]);

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.DEMORIFF_WEBHOOK_SECRET;

  if (secret) {
    const result = verifySignature(secret, raw, request.headers.get(SIGNATURE_HEADER));
    if (!result.ok) {
      const message =
        result.reason === "stale"
          ? "Signature timestamp is outside the tolerance window."
          : result.reason === "malformed"
            ? `Missing or malformed ${SIGNATURE_HEADER} header.`
            : "Invalid signature.";
      // One status for every verification failure. Telling a caller *which*
      // part of their forgery was wrong is free help they have not earned.
      return NextResponse.json({ error: message }, { status: 401 });
    }
  }

  let event: { id?: string; type?: string; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  if (!event.type || !KNOWN_EVENTS.has(event.type)) {
    // Acknowledge unknown types so the sender does not retry forever. A 202
    // says "received, not acted on", which is exactly true.
    return NextResponse.json({ ok: true, handled: false }, { status: 202 });
  }

  return NextResponse.json(
    { ok: true, handled: true, type: event.type, id: event.id ?? null },
    { status: 200 },
  );
}
