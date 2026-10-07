import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import { listExports } from "@/lib/db/repositories/assets";

/**
 * What a project has produced: each rendered video and guide, with when it
 * was made and whether it is published.
 *
 * A finished render used to be reachable only from the export dialog that
 * made it, through a link that expired fifteen minutes later; close the
 * dialog and the file was in storage with no way back to it.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id).catch(() => null);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const exports = await listExports(guard.actor.workspaceId, id);
  return NextResponse.json({
    exports: exports.map((e) => ({
      id: e.id,
      kind: e.kind,
      locale: e.locale,
      published: e.published,
      rendered_at: e.renderedAt,
      bytes: e.bytes,
      share_url: e.kind === "video" ? `/d/${e.publicSlug}` : null,
      download_url: `/api/projects/${id}/exports/${e.id}`,
    })),
  });
}
