import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { listAssets } from "@/lib/db/repositories/assets";
import { getProjectById } from "@/lib/db/repositories/projects";
import { getStorage } from "@/lib/storage";

/**
 * The written walkthrough a render produced.
 *
 * Steps come back with a signed URL per screenshot rather than a storage
 * key. The key would oblige every caller to know how to turn one into a
 * readable link, and the guide editor is a browser — it cannot sign
 * anything, and it should not be able to.
 */
export const dynamic = "force-dynamic";

const SCREENSHOT_TTL_SECONDS = 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredGuide {
  title: string;
  locale: string;
  steps: { ordinal: number; title: string; body: string; atSec: number; screenshotKey: string | null }[];
}

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  // A project of this workspace that still exists; a deleted one's guide goes with it.
  const project = UUID.test(id) ? await getProjectById(guard.actor.workspaceId, id) : null;
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const assets = await listAssets(id);
  const guide = assets.find(
    (asset) => asset.kind === "guide" && asset.workspaceId === guard.actor.workspaceId,
  );

  // Not an error. A project with no rendered guide is the normal state for
  // one nobody has exported yet, and the editor shows the transcript-derived
  // draft in that case.
  if (!guide?.storageKey) return NextResponse.json({ guide: null });

  const storage = getStorage();
  const [workspaceId, ...rest] = guide.storageKey.split("/");

  let document: StoredGuide;
  try {
    const bytes = await storage.get({ workspaceId, path: rest.join("/") });
    document = JSON.parse(new TextDecoder().decode(bytes)) as StoredGuide;
  } catch {
    return NextResponse.json({ guide: null });
  }

  const steps = await Promise.all(
    document.steps.map(async (step) => {
      if (!step.screenshotKey) return { ...step, screenshotUrl: null };
      const [ws, ...path] = step.screenshotKey.split("/");
      const signed = await storage.signedReadUrl(
        { workspaceId: ws, path: path.join("/") },
        SCREENSHOT_TTL_SECONDS,
      );
      return { ...step, screenshotUrl: signed.url };
    }),
  );

  // The Markdown sits beside the JSON, under the same render prefix.
  const markdownKey = guide.storageKey.replace(/guide\.json$/, "guide.md");
  const [mdWorkspace, ...mdPath] = markdownKey.split("/");
  const markdown = await storage
    .signedReadUrl({ workspaceId: mdWorkspace, path: mdPath.join("/") }, SCREENSHOT_TTL_SECONDS)
    .catch(() => null);

  return NextResponse.json({
    guide: {
      title: document.title,
      locale: document.locale,
      steps,
      markdown_url: markdown?.url ?? null,
      published_at: guide.publishedAt?.toISOString() ?? null,
    },
  });
}
