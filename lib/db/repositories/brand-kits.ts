import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";
import type { BrandLogo, BrandTokens } from "@/lib/brand";

/**
 * Brand kits.
 *
 * The table has existed since the first migration and nothing read or wrote
 * it: the brand page and the Studio's brand tab both rendered a three-kit
 * fixture, so every workspace was shown "Meridian Dark", "Meridian Light"
 * and "Partner co-brand", complete with palettes, a lock claiming an admin
 * had enforced one, and a count of how many videos inherited it. A workspace
 * could not create a kit of its own, and the kit a project claimed to use
 * reached no renderer.
 *
 * `tokens` is stored as one JSON document and versioned as a whole, which is
 * what makes a change diffable — a token-per-row table would record twelve
 * independent edits with no way to say which belonged to the same change.
 */

/*
 * Not `server-only`: the render worker reads kits through this module to
 * find the typeface and colours a render was asked for, and the worker is a
 * process rather than a request.
 */

export type { BrandTokens } from "@/lib/brand";

export interface BrandKit {
  id: string;
  workspaceId: string;
  name: string;
  locked: boolean;
  tokens: BrandTokens;
  version: number;
  /** Projects currently pointing at this kit. Counted, never stored. */
  usedBy: number;
  createdAt: string;
  updatedAt: string;
}

function toKit(row: typeof s.brandKits.$inferSelect, usedBy = 0): BrandKit {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    locked: row.locked,
    tokens: (row.tokens ?? {}) as BrandTokens,
    version: row.version,
    usedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBrandKits(workspaceId: string): Promise<BrandKit[]> {
  // Counted in the query. The fixture carried a `usedBy` number written by
  // hand, so "48 videos inherit this kit" was true of no workspace. A join
  // rather than a correlated subquery: the subquery form counted zero for
  // every kit once the table it named was also the one being selected from.
  const rows = await getDb()
    .select({
      kit: s.brandKits,
      usedBy: sql<number>`count(${s.projects.id})::int`,
    })
    .from(s.brandKits)
    .leftJoin(s.projects, and(eq(s.projects.brandKitId, s.brandKits.id), isNull(s.projects.deletedAt)))
    .where(eq(s.brandKits.workspaceId, workspaceId))
    .groupBy(s.brandKits.id)
    .orderBy(asc(s.brandKits.createdAt));

  return rows.map((row) => toKit(row.kit, Number(row.usedBy ?? 0)));
}

export async function getBrandKit(workspaceId: string, id: string): Promise<BrandKit | null> {
  // Scoped to the workspace in the query rather than filtered afterwards: an
  // id-only lookup reads across every tenant.
  const [row] = await getDb()
    .select()
    .from(s.brandKits)
    .where(and(eq(s.brandKits.workspaceId, workspaceId), eq(s.brandKits.id, id)))
    .limit(1);
  return row ? toKit(row) : null;
}

export async function createBrandKit(input: {
  workspaceId: string;
  name: string;
  tokens?: BrandTokens;
  locked?: boolean;
}): Promise<BrandKit> {
  const [row] = await getDb()
    .insert(s.brandKits)
    .values({
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      tokens: (input.tokens ?? {}) as Record<string, unknown>,
      locked: input.locked ?? false,
    })
    .returning();
  return toKit(row);
}

/**
 * Replaces a kit's tokens and bumps its version.
 *
 * The version moves on every write, including one that changes nothing
 * visible, because the version is what a render records to say which kit it
 * was made under — and a render made after an edit has to be distinguishable
 * from one made before it.
 */
export async function updateBrandKit(
  workspaceId: string,
  id: string,
  patch: { name?: string; tokens?: BrandTokens; locked?: boolean },
): Promise<BrandKit | null> {
  const [row] = await getDb()
    .update(s.brandKits)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.tokens !== undefined ? { tokens: patch.tokens as Record<string, unknown> } : {}),
      ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
      version: sql`${s.brandKits.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(s.brandKits.workspaceId, workspaceId), eq(s.brandKits.id, id)))
    .returning();
  return row ? toKit(row) : null;
}

/**
 * Records where a kit's logo now lives, or that it has none. Bumps the
 * version like any other change: a render with the old logo has to be
 * tellable from one with the new.
 */
export async function setBrandKitLogo(
  workspaceId: string,
  id: string,
  logo: BrandLogo | null,
): Promise<BrandKit | null> {
  const current = await getBrandKit(workspaceId, id);
  if (!current) return null;
  const { logo: _dropped, ...rest } = current.tokens;
  void _dropped;
  return updateBrandKit(workspaceId, id, { tokens: logo ? { ...rest, logo } : rest });
}

export async function deleteBrandKit(workspaceId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(s.brandKits)
    .where(and(eq(s.brandKits.workspaceId, workspaceId), eq(s.brandKits.id, id)))
    .returning({ id: s.brandKits.id });
  return rows.length > 0;
}
