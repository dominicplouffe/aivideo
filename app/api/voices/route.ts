import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { record } from "@/lib/audit/log";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { providerReport } from "@/lib/providers";
import { capabilityLive, providersFor } from "@/lib/providers/for-workspace";

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
 * From the database, so `revoked_at` is the real answer.
 *
 * An empty workspace returns an empty list. This used to fall through to a
 * four-voice fixture whenever the real query found nothing — so a brand-new
 * account was told it had Ava, Marcus, Yuki and a cloned voice with a
 * recorded consent date, none of which existed, and any of which could be
 * selected for a render that would then fail to find them.
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Voices require a database." }, { status: 503 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "project.view", { workspaceId: actor.workspaceId });

    const { listVoicesForWorkspace } = await import("@/lib/db/repositories/voices");
    const rows = await listVoicesForWorkspace(actor.workspaceId);

    return NextResponse.json({
      object: "list",
      data: rows.map((voice) => ({
        id: voice.id,
        name: voice.name,
        kind: voice.kind,
        descriptor: voice.descriptor,
        accent: voice.accent,
        preview_url: voice.previewUrl,
        available: voice.available,
        consented_at: voice.consentRecordedAt?.toISOString() ?? null,
        revoked_at: voice.revokedAt?.toISOString() ?? null,
      })),
      has_more: false,
    });
  } catch (error) {
    const refusal = unauthorized(error);
    if (refusal) return refusal;
    throw error;
  }
}

/**
 * Imports the vendor's studio library. `POST /api/voices {action: "sync"}`.
 *
 * Owners and admins, because it writes rows every workspace sees. Refused
 * outright when synthesis is mocked: the mock's catalogue is three invented
 * names, and importing them would put voices in the picker that no render
 * could ever produce.
 */
async function sync(request: Request): Promise<NextResponse> {
  let actor;
  try {
    actor = await resolveActor(request);
    authorize(actor, "voice.manage", { workspaceId: actor.workspaceId });
  } catch (error) {
    const refusal = unauthorized(error);
    if (refusal) return refusal;
    throw error;
  }

  const resolved = await providersFor(actor.workspaceId);
  const synthesis = capabilityLive(resolved, "synthesis", providerReport());
  if (!synthesis.live) {
    return NextResponse.json(
      {
        error: resolved.source === "workspace"
          ? synthesis.hint
          : `Synthesis is not configured, so there is no catalogue to import. Set ${synthesis.hint || "a synthesis provider"} first.`,
      },
      { status: 409 },
    );
  }

  const catalogue = await resolved.providers.synthesis.listVoices();
  const { syncStudioVoices } = await import("@/lib/db/repositories/voices");
  const result = await syncStudioVoices(catalogue);

  await record({
    workspaceId: actor.workspaceId,
    actor,
    action: "voice.library.synced",
    resourceType: "voice",
    resourceId: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    metadata: { provider: resolved.providers.synthesis.name, ...result },
  });

  return NextResponse.json({ ...result, provider: resolved.providers.synthesis.name });
}

export async function POST(request: Request) {
  let body: { voice_id?: string; action?: string };
  try {
    body = (await request.json()) as { voice_id?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Voices require a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  if (body.action === "sync") return sync(request);

  const voiceId = body.voice_id;
  const action = body.action;

  if (!voiceId) {
    return NextResponse.json({ error: "voice_id is required." }, { status: 400 });
  }
  if (action !== "revoke" && action !== "reinstate") {
    return NextResponse.json(
      { error: 'action must be "sync", "revoke" or "reinstate".' },
      { status: 400 },
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
