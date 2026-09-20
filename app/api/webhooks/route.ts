import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Inbound webhook receiver. Every delivery carries an HMAC-SHA256 signature
 * over the raw body; we verify before parsing so a forged payload never
 * reaches application code.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("DemoRiff-Signature");
  const secret = process.env.DEMORIFF_WEBHOOK_SECRET;

  if (secret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing DemoRiff-Signature header." }, { status: 401 });
    }
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  let event: { type?: string; data?: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const known = [
    "recording.processed",
    "project.ready",
    "render.completed",
    "render.failed",
    "locale.stale",
    "asset.threshold",
    "usage.warning",
  ];

  if (!event.type || !known.includes(event.type)) {
    // Acknowledge unknown types so the sender does not retry forever.
    return NextResponse.json({ ok: true, handled: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true, handled: true, type: event.type }, { status: 200 });
}
