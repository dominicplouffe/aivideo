import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { getProjectById, saveEditState } from "@/lib/db/repositories/projects";
import { createCheckpoint, getCheckpoint } from "@/lib/db/repositories/checkpoints";

/**
 * Puts the edit back as a checkpoint had it.
 *
 * The edit as it stands is checkpointed first, so going back is itself
 * something a person can go back from. Answers with the restored edit for
 * the Studio to load.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; cid: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  const { id, cid } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const checkpoint = await getCheckpoint(guard.actor.workspaceId, id, cid);
  if (!checkpoint) return NextResponse.json({ error: "No such checkpoint." }, { status: 404 });

  await createCheckpoint({
    workspaceId: guard.actor.workspaceId,
    projectId: id,
    label: `Before going back to “${checkpoint.label}”`,
    kind: "restore",
    editState: project.editState ?? {},
    createdBy: guard.actor.memberId,
  });
  const saved = await saveEditState(guard.actor.workspaceId, id, checkpoint.editState);
  if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.edit_restored",
    resourceType: "project",
    resourceId: id,
    metadata: { checkpointId: cid, label: checkpoint.label },
  });
  return NextResponse.json({ edit_state: checkpoint.editState, label: checkpoint.label });
}
