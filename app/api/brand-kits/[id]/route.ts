import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { deleteBrandKit, getBrandKit, listBrandKits, updateBrandKit } from "@/lib/db/repositories/brand-kits";
import { getStorage } from "@/lib/storage";
import { MAX_KIT_NAME, sanitizeBrandTokens } from "@/lib/brand";

/** One kit: read, change, or remove. */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const kit = await getBrandKit(guard.actor.workspaceId, id);
  if (!kit) return NextResponse.json({ error: "No such kit." }, { status: 404 });
  return NextResponse.json({ kit });
}

export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;

  let body: { name?: unknown; tokens?: unknown; locked?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const { id } = await context.params;
  const current = await getBrandKit(guard.actor.workspaceId, id);
  if (!current) return NextResponse.json({ error: "No such kit." }, { status: 404 });

  const patch: { name?: string; tokens?: typeof current.tokens; locked?: boolean } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Give the kit a name." }, { status: 422 });
    if (name.length > MAX_KIT_NAME) return NextResponse.json({ error: "That name is too long." }, { status: 422 });
    const others = await listBrandKits(guard.actor.workspaceId);
    if (others.some((kit) => kit.id !== id && kit.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `There is already a kit called ${name}.` }, { status: 409 });
    }
    patch.name = name;
  }
  if (body.tokens !== undefined) {
    const parsed = sanitizeBrandTokens(body.tokens);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 });
    // The logo is not part of what a PATCH says; it is kept from the kit as
    // it is, so saving the colours never quietly drops the image.
    patch.tokens = current.tokens.logo ? { ...parsed.tokens, logo: current.tokens.logo } : parsed.tokens;
  }
  if (body.locked !== undefined) {
    if (typeof body.locked !== "boolean") return NextResponse.json({ error: "locked must be true or false." }, { status: 422 });
    patch.locked = body.locked;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Send name, tokens, locked, or several." }, { status: 422 });
  }

  const kit = await updateBrandKit(guard.actor.workspaceId, id, patch);
  if (!kit) return NextResponse.json({ error: "No such kit." }, { status: 404 });
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "brand.kit.updated",
    resourceType: "brand_kit",
    resourceId: kit.id,
    metadata: { version: kit.version, fields: Object.keys(patch) },
  });
  return NextResponse.json({ kit });
}

export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const kit = await getBrandKit(guard.actor.workspaceId, id);
  if (!kit) return NextResponse.json({ error: "No such kit." }, { status: 404 });

  // Projects pointing at it fall back to no kit: the column is `set null`
  // on delete. Said in the response so the caller can say it to the person.
  const removed = await deleteBrandKit(guard.actor.workspaceId, id);
  if (!removed) return NextResponse.json({ error: "No such kit." }, { status: 404 });
  if (kit.tokens.logo) {
    await getStorage().remove({ workspaceId: guard.actor.workspaceId, path: kit.tokens.logo.key }).catch(() => {});
  }
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "brand.kit.deleted",
    resourceType: "brand_kit",
    resourceId: id,
    metadata: { name: kit.name, releasedProjects: kit.usedBy },
  });
  return NextResponse.json({ deleted: true, released_projects: kit.usedBy });
}
