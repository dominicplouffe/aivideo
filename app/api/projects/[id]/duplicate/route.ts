import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { duplicateProject } from "@/lib/db/repositories/projects";
import { recordQuietly } from "@/lib/audit/log";

/**
 * A copy of a project to experiment on: same take, its own chapters, edit
 * and voice. Answers with the new project so the caller can open it.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.create");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const outcome = await duplicateProject(guard.actor.workspaceId, id, guard.actor.memberId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: outcome.status });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.duplicated",
    resourceType: "project",
    resourceId: outcome.project.id,
    metadata: { sourceProjectId: id, title: outcome.project.title },
  });
  return NextResponse.json({ project: outcome.project }, { status: 201 });
}
