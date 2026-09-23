import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { sanitizeEditState } from "@/lib/api/edit-state";
import { getProjectById } from "@/lib/db/repositories/projects";
import { createCheckpoint, listCheckpoints } from "@/lib/db/repositories/checkpoints";

/**
 * A project's history of edits worth going back to. `GET` lists them,
 * newest first; `POST` takes one now, with the edit the Studio holds, which
 * may be newer than what the autosave has stored.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const data = (await listCheckpoints(guard.actor.workspaceId, id)).map(({ editState: _state, ...rest }) => {
    void _state;
    return rest;
  });
  return NextResponse.json({ object: "list", data, has_more: false });
}

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { label?: unknown; edit_state?: unknown; kind?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return NextResponse.json({ error: "Give the checkpoint a label." }, { status: 422 });

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  // The edit as the Studio holds it, or as stored if none was sent.
  const editState = body.edit_state !== undefined ? sanitizeEditState(body.edit_state) : (project.editState ?? {});
  if (!editState) return NextResponse.json({ error: "edit_state is malformed." }, { status: 422 });

  const checkpoint = await createCheckpoint({
    workspaceId: guard.actor.workspaceId,
    projectId: id,
    label,
    kind: body.kind === "ai" ? "ai" : "manual",
    editState,
    createdBy: guard.actor.memberId,
  });
  const { editState: _state, ...summary } = checkpoint;
  void _state;
  return NextResponse.json({ checkpoint: summary }, { status: 201 });
}
