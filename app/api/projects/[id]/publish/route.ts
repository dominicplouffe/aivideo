import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById, setProjectStatus } from "@/lib/db/repositories/projects";
import { setPublished } from "@/lib/db/repositories/assets";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Puts a rendered video on its public URL, and takes it down again.
 *
 * Separate from rendering on purpose. Finishing an encode is not a decision
 * to publish somebody's product walkthrough at a guessable address, and a
 * product that conflates the two will eventually publish something nobody
 * meant to.
 *
 * Audited in both directions: who made a thing public, and who took it back,
 * are among the few events in this application worth being able to answer
 * months later.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function toggle(request: Request, context: Context, published: boolean) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.publish");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const asset = await setPublished(guard.actor.workspaceId, id, published);
  if (!asset) {
    return NextResponse.json(
      { error: "There is nothing rendered to publish yet. Export the video first." },
      { status: 409 },
    );
  }

  await setProjectStatus(id, published ? "published" : "ready");

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: published ? "project.published" : "project.unpublished",
    resourceType: "project",
    resourceId: id,
    metadata: { slug: asset.publicSlug },
  });

  return NextResponse.json({
    published,
    slug: asset.publicSlug,
    url: `/d/${asset.publicSlug}`,
  });
}

export const POST = (request: Request, context: Context) => toggle(request, context, true);
export const DELETE = (request: Request, context: Context) => toggle(request, context, false);
