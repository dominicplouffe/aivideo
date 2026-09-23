import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getRun } from "@/lib/agent/run";
import { getStorage } from "@/lib/storage";

/**
 * A screenshot the agent kept when a step failed. Served through the app,
 * scoped to the run's workspace, and only from that run's own folder:
 * these are pictures of a customer's product.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const run = await getRun(guard.actor.workspaceId, id).catch(() => null);
  if (!run || !new RegExp(`^agent/${id}/[a-z0-9]+\\.png$`).test(key)) {
    return NextResponse.json({ error: "No such screenshot." }, { status: 404 });
  }
  const bytes = await getStorage().get({ workspaceId: guard.actor.workspaceId, path: key }).catch(() => null);
  if (!bytes) return NextResponse.json({ error: "No such screenshot." }, { status: 404 });
  return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400, immutable" } });
}
