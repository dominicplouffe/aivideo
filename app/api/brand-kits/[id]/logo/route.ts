import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { getBrandKit, setBrandKitLogo } from "@/lib/db/repositories/brand-kits";
import { getStorage } from "@/lib/storage";
import { LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/brand";

/**
 * A kit's logo: the bytes in, and back out for the editor and the Studio.
 *
 * Stored under the workspace like a recording, and served through this
 * route rather than a public URL for the same reason. The share page, which
 * is public, gets a signed expiring URL from the share resolver instead.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function PUT(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const kit = await getBrandKit(guard.actor.workspaceId, id);
  if (!kit) return NextResponse.json({ error: "No such kit." }, { status: 404 });

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(LOGO_TYPES as readonly string[]).includes(contentType)) {
    return NextResponse.json({ error: "A logo is a PNG, JPEG or WebP image." }, { status: 415 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return NextResponse.json({ error: "That file is empty." }, { status: 422 });
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: `A logo is at most ${MAX_LOGO_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }
  if (!looksLikeImage(bytes, contentType)) {
    return NextResponse.json({ error: "That file is not the image type it claims to be." }, { status: 415 });
  }

  // A new key per upload, so a browser or CDN holding the old one never
  // shows it in place of the new. The old object is removed afterwards.
  const key = `brand/${kit.id}/logo-${Date.now().toString(36)}.${EXTENSIONS[contentType]}`;
  const storage = getStorage();
  await storage.put({ workspaceId: guard.actor.workspaceId, path: key }, bytes, contentType);
  const updated = await setBrandKitLogo(guard.actor.workspaceId, id, { key, contentType });
  if (kit.tokens.logo) {
    await storage.remove({ workspaceId: guard.actor.workspaceId, path: kit.tokens.logo.key }).catch(() => {});
  }
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "brand.kit.logo_set",
    resourceType: "brand_kit",
    resourceId: id,
    metadata: { bytes: bytes.byteLength, contentType },
  });
  return NextResponse.json({ kit: updated });
}

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const kit = await getBrandKit(guard.actor.workspaceId, id);
  if (!kit?.tokens.logo) return NextResponse.json({ error: "That kit has no logo." }, { status: 404 });
  const bytes = await getStorage()
    .get({ workspaceId: guard.actor.workspaceId, path: kit.tokens.logo.key })
    .catch(() => null);
  if (!bytes) return NextResponse.json({ error: "That kit's logo is missing." }, { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": kit.tokens.logo.contentType,
      // The key changes on every upload, so this can be cached hard.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}

export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  const kit = await getBrandKit(guard.actor.workspaceId, id);
  if (!kit) return NextResponse.json({ error: "No such kit." }, { status: 404 });
  if (kit.tokens.logo) {
    await getStorage().remove({ workspaceId: guard.actor.workspaceId, path: kit.tokens.logo.key }).catch(() => {});
  }
  const updated = await setBrandKitLogo(guard.actor.workspaceId, id, null);
  return NextResponse.json({ kit: updated });
}

/** The first bytes of a PNG, JPEG or WebP, so a renamed script is not stored as a logo. */
function looksLikeImage(bytes: Uint8Array, contentType: string): boolean {
  const startsWith = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  switch (contentType) {
    case "image/png":
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith([0xff, 0xd8, 0xff]);
    case "image/webp":
      return startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8);
    default:
      return false;
  }
}
