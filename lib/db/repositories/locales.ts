import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";

/**
 * Per-project locales.
 *
 * The `locales` table has existed since migration 0000 and nothing had ever
 * written a row to it. The localization page rendered the `localeMatrix`
 * fixture instead — twelve languages with statuses attached, so every
 * workspace was told German was published and reviewed by Jonas Weber,
 * Japanese was 68% rendered, and French had gone stale. A workspace that
 * had never translated anything saw the same twelve rows as one that had.
 *
 * Every read here is scoped through `projects` to a workspace. A locale row
 * belongs to a project rather than to a workspace directly, so a query that
 * starts from `locales` reads across tenants unless it joins — which is
 * exactly the shape of mistake that is easy to make once and never notice.
 */

export type LocaleStatus = "none" | "queued" | "rendering" | "published" | "stale";

export interface ProjectLocale {
  id: string;
  projectId: string;
  code: string;
  status: LocaleStatus;
  reviewerId: string | null;
  pinnedSegmentIds: string[];
  sourceVersion: number;
  progress: number | null;
  updatedAt: string;
}

function toLocale(row: typeof s.locales.$inferSelect): ProjectLocale {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    status: row.status,
    reviewerId: row.reviewerId,
    pinnedSegmentIds: row.pinnedSegmentIds ?? [],
    sourceVersion: row.sourceVersion,
    progress: row.progress,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every locale row for a workspace, across all of its projects. */
export async function listLocalesForWorkspace(workspaceId: string): Promise<ProjectLocale[]> {
  const rows = await getDb()
    .select({ locale: s.locales })
    .from(s.locales)
    .innerJoin(s.projects, eq(s.projects.id, s.locales.projectId))
    .where(and(eq(s.projects.workspaceId, workspaceId), sql`${s.projects.deletedAt} is null`))
    .orderBy(asc(s.locales.code));

  return rows.map((row) => toLocale(row.locale));
}

export async function listLocalesForProject(
  workspaceId: string,
  projectId: string,
): Promise<ProjectLocale[]> {
  const rows = await getDb()
    .select({ locale: s.locales })
    .from(s.locales)
    .innerJoin(s.projects, eq(s.projects.id, s.locales.projectId))
    .where(and(eq(s.projects.workspaceId, workspaceId), eq(s.locales.projectId, projectId), isNull(s.projects.deletedAt)))
    .orderBy(asc(s.locales.code));

  return rows.map((row) => toLocale(row.locale));
}

/**
 * Adds languages to a project, queued.
 *
 * Idempotent per (project, code): asking twice for German does not create a
 * second row or restart one that is already rendering. The unique index
 * enforces that; the conflict clause is what stops it being an error.
 *
 * Returns null when the project is not in this workspace, rather than
 * inserting against an id from somewhere else.
 */
export async function addLocales(
  workspaceId: string,
  projectId: string,
  codes: string[],
): Promise<ProjectLocale[] | null> {
  if (codes.length === 0) return [];

  const db = getDb();
  const [owned] = await db
    .select({ id: s.projects.id })
    .from(s.projects)
    .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId)))
    .limit(1);
  if (!owned) return null;

  const unique = [...new Set(codes)];
  await db
    .insert(s.locales)
    .values(unique.map((code) => ({ projectId, code, status: "queued" as const })))
    // A language already on the project keeps whatever state it has reached.
    // `DO UPDATE` here would reset a published translation to queued.
    .onConflictDoNothing({ target: [s.locales.projectId, s.locales.code] });

  const rows = await db
    .select()
    .from(s.locales)
    .where(and(eq(s.locales.projectId, projectId), inArray(s.locales.code, unique)));
  return rows.map(toLocale);
}

export async function setLocaleStatus(
  workspaceId: string,
  localeId: string,
  status: LocaleStatus,
  progress: number | null = null,
): Promise<ProjectLocale | null> {
  const db = getDb();
  // The workspace check has to happen against the parent project; `locales`
  // carries no workspace column of its own.
  const [owned] = await db
    .select({ id: s.locales.id })
    .from(s.locales)
    .innerJoin(s.projects, eq(s.projects.id, s.locales.projectId))
    .where(and(eq(s.locales.id, localeId), eq(s.projects.workspaceId, workspaceId)))
    .limit(1);
  if (!owned) return null;

  const [row] = await db
    .update(s.locales)
    .set({ status, progress, updatedAt: new Date() })
    .where(eq(s.locales.id, localeId))
    .returning();
  return row ? toLocale(row) : null;
}

export async function removeLocale(workspaceId: string, localeId: string): Promise<boolean> {
  const db = getDb();
  const [owned] = await db
    .select({ id: s.locales.id })
    .from(s.locales)
    .innerJoin(s.projects, eq(s.projects.id, s.locales.projectId))
    .where(and(eq(s.locales.id, localeId), eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
    .limit(1);
  if (!owned) return false;

  const rows = await db
    .delete(s.locales)
    .where(eq(s.locales.id, localeId))
    .returning({ id: s.locales.id });
  return rows.length > 0;
}

/**
 * Marks a project's published translations stale.
 *
 * Called when the source is re-cut. Only `published` rows move: a queued or
 * rendering translation is already going to reflect the new source, and
 * marking it stale would report work as out of date before it had started.
 */
export async function markStaleForProject(projectId: string): Promise<number> {
  const rows = await getDb()
    .update(s.locales)
    .set({ status: "stale", updatedAt: new Date() })
    .where(and(eq(s.locales.projectId, projectId), eq(s.locales.status, "published")))
    .returning({ id: s.locales.id });
  return rows.length;
}
