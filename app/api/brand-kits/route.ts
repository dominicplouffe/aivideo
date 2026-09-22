import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { createBrandKit, listBrandKits } from "@/lib/db/repositories/brand-kits";
import { MAX_KIT_NAME, sanitizeBrandTokens } from "@/lib/brand";

/**
 * The workspace's brand kits. Anybody who can view projects can read them,
 * because the Studio's picker has to; making or changing one takes
 * `brand.edit`.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const data = await listBrandKits(guard.actor.workspaceId);
  return NextResponse.json({ object: "list", data, has_more: false });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;

  let body: { name?: unknown; tokens?: unknown; locked?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the kit a name." }, { status: 422 });
  if (name.length > MAX_KIT_NAME) return NextResponse.json({ error: "That name is too long." }, { status: 422 });

  const parsed = sanitizeBrandTokens(body.tokens ?? {});
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });

  const existing = await listBrandKits(guard.actor.workspaceId);
  if (existing.some((kit) => kit.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: `There is already a kit called ${name}.` }, { status: 409 });
  }

  const kit = await createBrandKit({
    workspaceId: guard.actor.workspaceId,
    name,
    tokens: parsed.tokens,
    locked: body.locked === true,
  });
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "brand.kit.created",
    resourceType: "brand_kit",
    resourceId: kit.id,
    metadata: { name },
  });
  return NextResponse.json({ kit }, { status: 201 });
}
