import { NextResponse } from "next/server";
import { projects } from "@/lib/app-data";

/** Lists workspace projects. Mirrors GET /v1/projects in the public API. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const collection = url.searchParams.get("collection");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 25) || 25);

  const data = projects
    .filter((p) => (status ? p.status === status : true))
    .filter((p) => (collection ? p.collection === collection : true))
    .slice(0, limit)
    .map((p) => ({
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

  return NextResponse.json({ object: "list", data, has_more: data.length < projects.length });
}
