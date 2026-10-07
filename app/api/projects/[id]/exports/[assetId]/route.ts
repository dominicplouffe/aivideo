import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor, siteOrigin } from "@/lib/api/guard";
import { getExport } from "@/lib/db/repositories/assets";
import { getProjectById } from "@/lib/db/repositories/projects";
import { getStorage } from "@/lib/storage";

/**
 * Downloads one export, through a link signed now.
 *
 * A redirect rather than a URL handed out in advance: storage links expire,
 * and a Download button that stopped working fifteen minutes after the page
 * loaded is the problem this exists to solve.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; assetId: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Long enough for a large file on a slow connection to finish. */
const DOWNLOAD_TTL_SECONDS = 60 * 60;

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id, assetId } = await context.params;
  const notFound = NextResponse.json({ error: "No such export." }, { status: 404 });
  if (!UUID.test(id) || !UUID.test(assetId)) return notFound;

  const asset = await getExport(guard.actor.workspaceId, id, assetId);
  if (!asset?.storageKey) return notFound;

  // A guide's asset points at the structured guide.json the editor reads;
  // the file a person wants is the Markdown written beside it.
  const key = asset.kind === "guide" ? asset.storageKey.replace(/guide\.json$/, "guide.md") : asset.storageKey;
  const [workspaceId, ...rest] = key.split("/");
  const signed = await getStorage().signedReadUrl({ workspaceId, path: rest.join("/") }, DOWNLOAD_TTL_SECONDS);

  // Against the site's own address, not the request's: behind the proxy a
  // request arrives addressed to the container (http://0.0.0.0:3000), and a
  // redirect built from that sends the browser nowhere.
  const target = new URL(signed.url, siteOrigin(request));
  // Saved under the project's name rather than "render.mp4" every time.
  const project = await getProjectById(guard.actor.workspaceId, id);
  const base = project?.slug ?? "export";
  target.searchParams.set("name", asset.kind === "guide" ? `${base}-guide.md` : `${base}.${key.split(".").pop()}`);

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
