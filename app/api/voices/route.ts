import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { voices as voiceFixtures } from "@/lib/app-data";

/**
 * Voices, and the consent action that matters most.
 *
 * Revocation is a POST rather than a DELETE on purpose: nothing is deleted.
 * The voice row, its consent record and the sample key all survive, because
 * the question a year from now is not "does this voice exist" but "was this
 * video made with permission, and when did that permission end". A DELETE
 * would destroy the only evidence that answers it.
 */

/** Lists voices available to the workspace. Mirrors GET /v1/voices. */
export async function GET() {
  const data = voiceFixtures.map((voice) => ({
    id: voice.id,
    name: voice.name,
    descriptor: voice.descriptor,
    accent: voice.accent,
    kind: voice.kind,
    languages: voice.languages,
    consented_at: voice.consented ?? null,
  }));
  return NextResponse.json({ object: "list", data, has_more: false });
}

export async function POST(request: Request) {
  let body: { voice_id?: string; action?: string };
  try {
    body = (await request.json()) as { voice_id?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const voiceId = body.voice_id;
  const action = body.action;

  if (!voiceId) {
    return NextResponse.json({ error: "voice_id is required." }, { status: 400 });
  }
  if (action !== "revoke" && action !== "reinstate") {
    return NextResponse.json(
      { error: 'action must be "revoke" or "reinstate".' },
      { status: 400 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Consent changes require a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  const { getVoice, revokeVoice, reinstateVoice } = await import("@/lib/db/repositories/voices");

  const existing = await getVoice(voiceId);
  if (!existing) {
    return NextResponse.json({ error: `Unknown voice ${voiceId}.` }, { status: 404 });
  }
  if (existing.kind !== "clone") {
    // Studio voices are licensed by the vendor. There is no person whose
    // consent could be withdrawn, so there is nothing here to revoke.
    return NextResponse.json(
      { error: "Only cloned voices carry a consent record." },
      { status: 409 },
    );
  }

  const voice =
    action === "revoke" ? await revokeVoice(existing.id) : await reinstateVoice(existing.id);

  return NextResponse.json({
    id: voice?.id,
    name: voice?.name,
    kind: voice?.kind,
    revoked_at: voice?.revokedAt?.toISOString() ?? null,
    // Said plainly, because the guarantee is the product: queued and future
    // renders check this before they encode anything.
    effect:
      action === "revoke"
        ? "No further renders will use this voice, including re-renders of existing projects."
        : "This voice may be used again.",
  });
}
