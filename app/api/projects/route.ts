import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { getProjects } from "@/lib/data";

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
