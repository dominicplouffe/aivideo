import { and, eq, isNotNull, ne } from "drizzle-orm";
import { randomBytes } from "node:crypto";
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

/**
 * A public slug nobody else is using.
 *
 * `/d/[slug]` is one global namespace — `getPublishedAsset` looks a slug up
 * across every workspace, because a share page is served to strangers and
 * there is no tenant in the URL to scope it by. The slug was taken straight
 * from `project.slug`, which is unique only *within* a workspace, so two
 * customers who both titled a project "Onboarding walkthrough" were handed
 * the same public address. Whoever published first owned it; the second
 * customer's own share link served the first one's video, and their render
 * could never file an asset at all because the unique index refused the
 * insert — so they could not publish, and nothing said why.
 *
 * A project keeps one slug across its locales and kinds, so the candidate is
 * only rejected when another *project* holds it.
 */
async function mintPublicSlug(projectId: string, preferred: string): Promise<string> {
  const db = getDb();

  // A project that has already filed an asset keeps the slug it was given.
  // Minting a second one would strand every embed of the first.
  const [own] = await db
    .select({ slug: s.assets.publicSlug })
    .from(s.assets)
    .where(eq(s.assets.projectId, projectId))
    .limit(1);
  if (own) return own.slug;

  const base = preferred || "demo";
  const taken = async (candidate: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: s.assets.id })
      .from(s.assets)
      .where(and(eq(s.assets.publicSlug, candidate), ne(s.assets.projectId, projectId)))
      .limit(1);
    return row !== undefined;
  };

  if (!(await taken(base))) return base;

  // Random rather than a counter. `-2` would tell the next customer that
  // somebody else already has the plain form, and walking the sequence would
  // enumerate how many workspaces share a project title.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${randomBytes(3).toString("hex")}`;
    if (!(await taken(candidate))) return candidate;
  }
  // Eight collisions on six random hex characters means something other than
  // chance; a full random slug is still a working address.
  return `${base}-${randomBytes(8).toString("hex")}`;
}

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
      publicSlug: await mintPublicSlug(input.projectId, input.publicSlug),
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
