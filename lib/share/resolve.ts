import "server-only";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getPublishedAsset, getPublishedAssetByProject } from "@/lib/db/repositories/assets";
import { getStorage } from "@/lib/storage";
import * as fixtures from "@/lib/app-data";
import type { Project } from "@/lib/app-data";

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
 * The fixture fallback stays for a deployment with no database, which is
 * what makes the marketing site's demo links work from a fresh clone.
 */

export interface ResolvedShare {
  project: Project;
  /** A signed, expiring URL for the rendered file. Null for fixtures. */
  videoUrl: string | null;
  publishedAt: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long enough to watch a demo twice without the link dying mid-play. */
const SHARE_URL_TTL_SECONDS = 4 * 60 * 60;

export async function resolveShare(slug: string): Promise<ResolvedShare | null> {
  if (!isDatabaseConfigured()) {
    const project = fixtures.getProject(slug);
    return project ? { project, videoUrl: null, publishedAt: null } : null;
  }

  // By slug first, then by project id: an embed snippet copied before the
  // slug form existed still resolves, and a URL somebody bookmarked keeps
  // working. Both go through the same published check.
  let asset = await getPublishedAsset(slug, "video");
  if (!asset && UUID.test(slug)) asset = await getPublishedAssetByProject(slug, "video");
  if (!asset) {
    // A fixture with the same slug is still servable — the seeded demos are
    // public by intent. Anything else is a miss.
    const project = fixtures.getProject(slug);
    return project ? { project, videoUrl: null, publishedAt: null } : null;
  }

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
  };
}

/** Every published slug, for the sitemap and for static generation. */
export async function listPublishedSlugs(): Promise<string[]> {
  if (!isDatabaseConfigured()) {
    return fixtures.projects.filter((p) => p.status === "published").map((p) => p.slug);
  }
  const rows = await getDb()
    .select({ slug: s.assets.publicSlug, publishedAt: s.assets.publishedAt })
    .from(s.assets)
    .where(eq(s.assets.kind, "video"));
  return rows.filter((row) => row.publishedAt !== null).map((row) => row.slug);
}
