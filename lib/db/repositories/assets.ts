import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";

/**
 * A project's published outputs.
 *
 * One row per (project, kind, locale), updated in place on a re-render
 * rather than replaced. That is what makes the claim an embed makes — "this
 * URL keeps working when the content changes" — true: the public slug is
 * minted once and outlives every render that follows it.
 */

export type Asset = typeof s.assets.$inferSelect;

export async function recordRenderedAsset(input: {
  workspaceId: string;
  projectId: string;
  kind: typeof s.assets.$inferInsert["kind"];
  locale: string;
  storageKey: string;
  publicSlug: string;
}): Promise<Asset> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(s.assets)
    .where(
      and(
        eq(s.assets.projectId, input.projectId),
        eq(s.assets.kind, input.kind),
        eq(s.assets.locale, input.locale),
      ),
    )
    .limit(1);

  if (existing) {
    // The file is replaced; `publishedAt` is left exactly as it was. That
    // is the promise an embed makes — re-rendering updates what a live URL
    // serves and never silently un-shares it, nor silently shares a draft
    // somebody had deliberately taken down.
    const [updated] = await db
      .update(s.assets)
      .set({ storageKey: input.storageKey })
      .where(eq(s.assets.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(s.assets)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: input.kind,
      locale: input.locale,
      storageKey: input.storageKey,
      publicSlug: input.publicSlug,
      // Rendering is not publishing. A finished file is not a decision to
      // put somebody's product walkthrough on the open internet at a
      // guessable URL, and the two have to be separate actions.
      publishedAt: null,
    })
    .returning();
  return created;
}

/** Every output a project has produced. */
export async function listAssets(projectId: string): Promise<Asset[]> {
  return getDb().select().from(s.assets).where(eq(s.assets.projectId, projectId));
}

/**
 * An asset by the slug a share page or an embed was given.
 *
 * Unpublished assets are not returned, and the caller gets `null` — the same
 * answer as for a slug that does not exist. Anything else is an oracle for
 * which projects a company has made but not released.
 */
export async function getPublishedAsset(
  publicSlug: string,
  kind: typeof s.assets.$inferInsert["kind"] = "video",
  locale = "en-US",
): Promise<Asset | null> {
  const [row] = await getDb()
    .select()
    .from(s.assets)
    .where(
      and(
        eq(s.assets.publicSlug, publicSlug),
        eq(s.assets.kind, kind),
        eq(s.assets.locale, locale),
        isNotNull(s.assets.publishedAt),
        isNotNull(s.assets.storageKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Puts a project's rendered output on its public URL, or takes it down. */
export async function setPublished(
  workspaceId: string,
  projectId: string,
  published: boolean,
  kind: typeof s.assets.$inferInsert["kind"] = "video",
): Promise<Asset | null> {
  const db = getDb();
  const [row] = await db
    .update(s.assets)
    .set({ publishedAt: published ? new Date() : null })
    .where(
      and(
        eq(s.assets.workspaceId, workspaceId),
        eq(s.assets.projectId, projectId),
        eq(s.assets.kind, kind),
      ),
    )
    .returning();
  return row ?? null;
}

/** The same check as `getPublishedAsset`, addressed by project id. */
export async function getPublishedAssetByProject(
  projectId: string,
  kind: typeof s.assets.$inferInsert["kind"] = "video",
  locale = "en-US",
): Promise<Asset | null> {
  const [row] = await getDb()
    .select()
    .from(s.assets)
    .where(
      and(
        eq(s.assets.projectId, projectId),
        eq(s.assets.kind, kind),
        eq(s.assets.locale, locale),
        isNotNull(s.assets.publishedAt),
        isNotNull(s.assets.storageKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
