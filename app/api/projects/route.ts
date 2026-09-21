import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { getProjects } from "@/lib/data";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { createProject } from "@/lib/db/repositories/projects";
import { getRecording } from "@/lib/db/repositories/recordings";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Lists workspace projects. Mirrors `GET /v1/projects` in the public API.
 *
 * Authenticated whenever there is a database to authenticate against. This
 * route used to read the fixtures directly and required nothing, which was
 * harmless only for as long as the fixtures were all it could reach — and an
 * endpoint that is safe because of what it happens to be wired to is an
 * endpoint that leaks the day somebody wires it to the real thing. It reads
 * through the data access layer now, where the workspace scoping and the
 * permission check live.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isDatabaseConfigured()) {
    try {
      const actor = await resolveActor(request);
      authorize(actor, "project.view", { workspaceId: actor.workspaceId });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const collection = url.searchParams.get("collection");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25) || 25);

  const all = await getProjects();
  const matching = all
    .filter((p) => (status ? p.status === status : true))
    .filter((p) => (collection ? p.collection === collection : true));

  const data = matching.slice(0, limit).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    duration_sec: p.durationSec,
    source_duration_sec: p.sourceDurationSec,
    collection: p.collection,
    brand_kit: p.brandKit,
    voice: p.voice,
    locales: p.locales,
    outputs: p.outputs,
    updated_at: p.updatedAt,
    analytics: { views: p.views, completion_rate: p.completion, cta_clicks: p.ctaClicks },
  }));

  // Against the filtered total, not the whole table: `has_more` measured
  // against everything would say there is another page when the filter has
  // already returned all of its matches.
  return NextResponse.json({ object: "list", data, has_more: data.length < matching.length });
}

/**
 * Creates a project from a take.
 *
 * The recording has to exist and belong to this workspace, and it has to
 * have bytes. A project pointing at an empty recording is a row that renders
 * a player with nothing in it, and the person who made it has no way to tell
 * whether their upload failed or the app did.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.create");
  if ("response" in guard) return guard.response;

  let body: { recording_id?: unknown; title?: unknown; description?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Give the recording a name." }, { status: 422 });
  }
  if (title.length > 140) {
    return NextResponse.json({ error: "That name is too long." }, { status: 422 });
  }

  const recordingId = typeof body.recording_id === "string" ? body.recording_id : "";
  const recording = recordingId
    ? await getRecording(guard.actor.workspaceId, recordingId)
    : null;

  if (recordingId && !recording) {
    return NextResponse.json({ error: "No such recording." }, { status: 404 });
  }
  if (recording && !recording.mediaKey) {
    return NextResponse.json(
      { error: "That recording has not finished uploading." },
      { status: 409 },
    );
  }

  const project = await createProject({
    workspaceId: guard.actor.workspaceId,
    recordingId: recording?.id ?? null,
    ownerId: guard.actor.memberId,
    title,
    description: typeof body.description === "string" ? body.description.slice(0, 500) : null,
    sourceDurationSec: recording?.durationSec ?? null,
  });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.created",
    resourceType: "project",
    resourceId: project.id,
    metadata: { title, recordingId: recording?.id ?? null },
  });

  return NextResponse.json({ project }, { status: 201 });
}
