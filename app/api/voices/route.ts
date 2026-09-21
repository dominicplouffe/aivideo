import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { voices as voiceFixtures } from "@/lib/app-data";
import { record } from "@/lib/audit/log";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";

/**
 * Voices, and the consent action that matters most.
 *
 * Revocation is a POST rather than a DELETE on purpose: nothing is deleted.
 * The voice row, its consent record and the sample key all survive, because
 * the question a year from now is not "does this voice exist" but "was this
 * video made with permission, and when did that permission end". A DELETE
 * would destroy the only evidence that answers it.
 */

/** Maps the two authorization errors onto responses. Used by both verbs. */
function unauthorized(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}

/**
 * Lists voices available to the workspace. Mirrors GET /v1/voices.
 *
 * From the database when there is one, so `revoked_at` is the real answer.
 * The fixture list is the fallback for a deployment running without one —
 * but it used to be the *only* answer, which meant the voices page could
 * not show that a clone had been revoked through this very endpoint.
 */
export async function GET(request: Request) {
  if (isDatabaseConfigured()) {
    try {
      const actor = await resolveActor(request);
      authorize(actor, "project.view", { workspaceId: actor.workspaceId });

      const { listVoicesForWorkspace } = await import("@/lib/db/repositories/voices");
      const rows = await listVoicesForWorkspace(actor.workspaceId);

      if (rows.length > 0) {
        return NextResponse.json({
          object: "list",
          data: rows.map((voice) => ({
            id: voice.id,
            name: voice.name,
            kind: voice.kind,
            consented_at: voice.consentRecordedAt?.toISOString() ?? null,
            revoked_at: voice.revokedAt?.toISOString() ?? null,
          })),
          has_more: false,
        });
      }
    } catch (error) {
      const refusal = unauthorized(error);
      if (refusal) return refusal;
      throw error;
    }
  }

  const data = voiceFixtures.map((voice) => ({
    id: voice.id,
    name: voice.name,
    descriptor: voice.descriptor,
    accent: voice.accent,
    kind: voice.kind,
    languages: voice.languages,
    consented_at: voice.consented ?? null,
    revoked_at: null,
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

  // Withdrawing consent is owner-only, and it is checked here rather than
  // in the repository: the repository is also how a worker and a migration
  // reach this row, and neither of those has a person to authorise.
  let actor;
  try {
    actor = await resolveActor(request, { workspaceId: existing.workspaceId ?? undefined });
    authorize(actor, "voice.revoke", { workspaceId: actor.workspaceId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const voice =
    action === "revoke" ? await revokeVoice(existing.id) : await reinstateVoice(existing.id);

  // Recorded, not "logged". This is the entry a person points at years later
  // to show when their permission ended, so it is written to the chained,
  // append-only trail and its failure is not swallowed.
  await record({
    workspaceId: actor.workspaceId,
    actor,
    action: action === "revoke" ? "voice.revoked" : "voice.reinstated",
    resourceType: "voice",
    resourceId: existing.id,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    metadata: {
      voiceName: existing.name,
      providerVoiceId: existing.providerVoiceId,
      revokedAt: voice?.revokedAt?.toISOString() ?? null,
    },
  });

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
