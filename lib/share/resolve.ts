import "server-only";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getPublishedAsset, getPublishedAssetByProject } from "@/lib/db/repositories/assets";
import { getStorage } from "@/lib/storage";
import type { Project } from "@/lib/app-data";
import { resolveBrand, type ResolvedBrand } from "@/lib/brand";

/**
 * Resolves a public share slug.
 *
 * The one read in the application with no actor behind it: a share page is
 * served to strangers, so there is nobody to authorize and the *published*
 * flag is the entire access decision. That is why it goes through
 * `getPublishedAsset` rather than the project table — a project row exists
 * from the moment somebody starts recording, and reading from it would put
 * every draft in the workspace one guessed slug away.
 *
 * There is no fixture fallback. A seeded project used to be servable here by
 * slug even on a deployment with a real database, so `/d/<a seeded slug>`
 * resolved to a demo nobody in that workspace had made or published — a
 * public page, on the customer's own domain, showing a company that does not
 * exist. An unpublished or unknown slug is a 404.
 */

export interface ResolvedShare {
  project: Project;
  /** A signed, expiring URL for the rendered file. */
  videoUrl: string;
  publishedAt: string | null;
  /** Whose page this is, and how it is dressed. */
  brand: ShareBrand;
}

/**
 * The share page's dressing: the workspace's name, and the project's kit
 * when it wears one. The logo is a signed URL like the video, because the
 * page is public and the logo route is not.
 */
export interface ShareBrand {
  workspaceName: string;
  kit: { name: string; tokens: ResolvedBrand; logoUrl: string | null } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough to watch a demo twice without the link dying mid-play. */
const SHARE_URL_TTL_SECONDS = 4 * 60 * 60;

export async function resolveShare(slug: string): Promise<ResolvedShare | null> {
  if (!isDatabaseConfigured()) return null;

  // By slug first, then by project id: an embed snippet copied before the
  // slug form existed still resolves, and a URL somebody bookmarked keeps
  // working. Both go through the same published check.
  let asset = await getPublishedAsset(slug, "video");
  if (!asset && UUID.test(slug)) asset = await getPublishedAssetByProject(slug, "video");
  if (!asset) return null;

  const { getProjectById } = await import("@/lib/db/repositories/projects");
  const project = await getProjectById(asset.workspaceId, asset.projectId);
  if (!project) return null;

  const [workspaceId, ...rest] = (asset.storageKey ?? "").split("/");
  const signed = await getStorage().signedReadUrl(
    { workspaceId, path: rest.join("/") },
    SHARE_URL_TTL_SECONDS,
  );

  return {
    project,
    videoUrl: signed.url,
    publishedAt: asset.publishedAt?.toISOString() ?? null,
    brand: await shareBrand(asset.workspaceId, project),
  };
}

async function shareBrand(workspaceId: string, project: Project): Promise<ShareBrand> {
  const [workspace] = await getDb()
    .select({ name: s.workspaces.name })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, workspaceId))
    .limit(1);
  const workspaceName = workspace?.name ?? "";
  if (!project.brandKitId) return { workspaceName, kit: null };

  const { getBrandKit } = await import("@/lib/db/repositories/brand-kits");
  const kit = await getBrandKit(workspaceId, project.brandKitId);
  if (!kit) return { workspaceName, kit: null };
  const tokens = resolveBrand(kit.tokens);
  const logoUrl = tokens.logo
    ? (await getStorage().signedReadUrl({ workspaceId, path: tokens.logo.key }, SHARE_URL_TTL_SECONDS)).url
    : null;
  return { workspaceName, kit: { name: kit.name, tokens, logoUrl } };
}

/** Every published slug, for the sitemap and for static generation. */
export async function listPublishedSlugs(): Promise<string[]> {
  // No database, nothing published. The fixture branch here put eight
  // invented slugs into the production sitemap.
  if (!isDatabaseConfigured()) return [];
  const rows = await getDb()
    .select({ slug: s.assets.publicSlug, publishedAt: s.assets.publishedAt })
    .from(s.assets)
    .where(eq(s.assets.kind, "video"));
  return rows.filter((row) => row.publishedAt !== null).map((row) => row.slug);
}
