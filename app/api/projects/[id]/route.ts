import { NextResponse } from "next/server";
import { sanitizeEditState } from "@/lib/api/edit-state";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { deleteProject, getProjectById, renameProject, saveBrandKit, saveEditState, saveVoice } from "@/lib/db/repositories/projects";
import { recordQuietly } from "@/lib/audit/log";

/**
 * One project: read it, save what the Studio did to it, and delete it.
 *
 * The Studio used to show "Saved" after a 650ms timeout and write nothing
 * anywhere — every decision a person made was lost on reload, including
 * which chapters they had deleted. This is the endpoint that makes the
 * indicator tell the truth.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  return NextResponse.json({ project });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Two things the Studio saves here: the edit, on nearly every change, and
 * the narrating voice, when a person picks one. Either or both may be sent.
 */
export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { edit_state?: unknown; voice_id?: unknown; brand_kit_id?: unknown; title?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const hasEdit = body.edit_state !== undefined;
  const hasVoice = body.voice_id !== undefined;
  const hasKit = body.brand_kit_id !== undefined;
  const hasTitle = body.title !== undefined;
  if (!hasEdit && !hasVoice && !hasKit && !hasTitle) {
    return NextResponse.json({ error: "Send title, edit_state, voice_id, brand_kit_id, or several." }, { status: 422 });
  }
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (hasTitle && !title) return NextResponse.json({ error: "Give the project a name." }, { status: 422 });
  if (hasTitle && title.length > 140) return NextResponse.json({ error: "That name is too long." }, { status: 422 });
  if (hasKit && body.brand_kit_id !== null && !(typeof body.brand_kit_id === "string" && UUID.test(body.brand_kit_id))) {
    return NextResponse.json({ error: "brand_kit_id must be a kit id or null." }, { status: 422 });
  }

  const editState = hasEdit ? sanitizeEditState(body.edit_state) : null;
  if (hasEdit && !editState) {
    return NextResponse.json({ error: "edit_state is malformed." }, { status: 422 });
  }
  if (hasVoice && body.voice_id !== null && !(typeof body.voice_id === "string" && UUID.test(body.voice_id))) {
    return NextResponse.json({ error: "voice_id must be a voice id or null." }, { status: 422 });
  }

  const { id } = await context.params;
  const response: Record<string, unknown> = {};

  if (editState) {
    const saved = await saveEditState(guard.actor.workspaceId, id, editState);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    // No audit entry. An editor autosaves on every keystroke-adjacent change,
    // and an audit log that records each one buries the entries that matter.
    response.edit_state = editState;
  }

  if (hasVoice) {
    const voiceId = body.voice_id as string | null;
    let voice: { id: string; name: string } | null = null;
    if (voiceId) {
      // A voice this workspace may actually use: the studio library, or one
      // of its own clones whose consent still stands. Anything else is
      // refused here rather than at render time, when the person who chose
      // it is no longer looking.
      const { getVoice } = await import("@/lib/db/repositories/voices");
      const found = await getVoice(voiceId);
      if (!found || (found.workspaceId !== null && found.workspaceId !== guard.actor.workspaceId)) {
        return NextResponse.json({ error: "No such voice." }, { status: 404 });
      }
      if (found.revokedAt) {
        return NextResponse.json(
          { error: `${found.name} has withdrawn consent and cannot narrate.` },
          { status: 409 },
        );
      }
      if (!found.available) {
        return NextResponse.json(
          { error: `${found.name} is no longer offered by the synthesis provider.` },
          { status: 409 },
        );
      }
      voice = { id: found.id, name: found.name };
    }
    const saved = await saveVoice(guard.actor.workspaceId, id, voiceId);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    // Audited, unlike the edit: replacing whose voice a video speaks with is
    // a decision somebody may need to account for later.
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "project.voice.changed",
      resourceType: "project",
      resourceId: id,
      metadata: { voiceId, voiceName: voice?.name ?? null },
    });
    response.voice = voice;
  }

  if (hasTitle) {
    const saved = await renameProject(guard.actor.workspaceId, id, title);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "project.renamed",
      resourceType: "project",
      resourceId: id,
      metadata: { title },
    });
    response.title = title;
  }

  if (hasKit) {
    const kitId = body.brand_kit_id as string | null;
    let kitName: string | null = null;
    if (kitId) {
      // A kit of this workspace, checked here rather than at render time.
      const { getBrandKit } = await import("@/lib/db/repositories/brand-kits");
      const kit = await getBrandKit(guard.actor.workspaceId, kitId);
      if (!kit) return NextResponse.json({ error: "No such brand kit." }, { status: 404 });
      kitName = kit.name;
    }
    const saved = await saveBrandKit(guard.actor.workspaceId, id, kitId);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "project.brand_kit_changed",
      resourceType: "project",
      resourceId: id,
      metadata: { brandKitId: kitId, name: kitName },
    });
    response.brand_kit_id = kitId;
  }

  return NextResponse.json(response);
}

/**
 * Deletes a project. It leaves the library, the Studio and its share page at
 * once, and stops counting against the plan; see `deleteProject` for what
 * is kept behind the scenes. A second delete is a 404, not a second entry
 * in the audit log.
 */
export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.delete");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const deleted = await deleteProject(guard.actor.workspaceId, id);
  if (!deleted) return NextResponse.json({ error: "No such project." }, { status: 404 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.deleted",
    resourceType: "project",
    resourceId: id,
    metadata: { title: deleted.title, slug: deleted.slug },
  });

  return NextResponse.json({ deleted: true, id });
}
