import { and, eq } from "drizzle-orm";
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
    const [updated] = await db
      .update(s.assets)
      .set({ storageKey: input.storageKey, publishedAt: new Date() })
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
      publishedAt: new Date(),
    })
    .returning();
  return created;
}

/** Every output a project has produced. */
export async function listAssets(projectId: string): Promise<Asset[]> {
  return getDb().select().from(s.assets).where(eq(s.assets.projectId, projectId));
}

/** An asset by the slug a share page or an embed was given. */
export async function getAssetBySlug(
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
      ),
    )
    .limit(1);
  return row ?? null;
}
