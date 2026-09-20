import "server-only";
import { isDatabaseConfigured } from "@/lib/db/client";
import * as fixtures from "@/lib/app-data";
import type { Project } from "@/lib/app-data";

/**
 * The single read path for workspace data.
 *
 * When DATABASE_URL is set the repositories serve real rows; otherwise the
 * seeded fixtures do. Both return identical shapes, so no component knows or
 * cares which is behind it — and the project stays runnable with no
 * infrastructure, which is what makes it explorable.
 *
 * The database module is imported lazily so a deployment without a database
 * never even loads the driver.
 */

const WORKSPACE = process.env.DEMORIFF_WORKSPACE_SLUG ?? "meridian";

/** Which source is serving reads. Surfaced in the UI so it is never ambiguous. */
export function dataSource(): "postgres" | "fixtures" {
  return isDatabaseConfigured() ? "postgres" : "fixtures";
}

export async function getProjects(): Promise<Project[]> {
  if (!isDatabaseConfigured()) return fixtures.projects;
  try {
    const { listProjects } = await import("@/lib/db/repositories/projects");
    const rows = await listProjects(WORKSPACE);
    // An empty database means it has not been seeded. Falling back beats
    // rendering an empty product and leaving the reader to guess why.
    return rows.length > 0 ? rows : fixtures.projects;
  } catch (error) {
    console.error("[data] project read failed, serving fixtures:", error);
    return fixtures.projects;
  }
}

export async function getProject(idOrSlug: string): Promise<Project | null> {
  if (!isDatabaseConfigured()) return fixtures.getProject(idOrSlug) ?? null;
  try {
    const repo = await import("@/lib/db/repositories/projects");
    const bySlug = await repo.getProjectBySlug(WORKSPACE, idOrSlug);
    if (bySlug) return bySlug;
    // Ids are UUIDs in the database; anything else cannot be one.
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const byId = looksLikeUuid ? await repo.getProjectById(idOrSlug) : null;
    return byId ?? fixtures.getProject(idOrSlug) ?? null;
  } catch (error) {
    console.error("[data] project read failed, serving fixtures:", error);
    return fixtures.getProject(idOrSlug) ?? null;
  }
}

export async function getWorkspace() {
  if (!isDatabaseConfigured()) return fixtures.workspace;
  try {
    const { getWorkspace: read } = await import("@/lib/db/repositories/workspace");
    const ws = await read(WORKSPACE);
    return ws ?? fixtures.workspace;
  } catch (error) {
    console.error("[data] workspace read failed, serving fixtures:", error);
    return fixtures.workspace;
  }
}

/**
 * A project's retention curve, as fractions of viewers still watching.
 *
 * Returns real measurement when a database has any, and the seeded fixture
 * otherwise — the same fallback every other read here uses, and what keeps
 * the product explorable from a fresh clone.
 *
 * Resampled to `points` because a chart has a few dozen pixels per second
 * at best: drawing 2,400 points into 600 pixels is slower and no more
 * truthful. The maximum within each bucket is taken rather than the mean,
 * because a rewatched span is the signal and averaging flattens it.
 */
export async function getRetentionCurve(projectId: string, points = 48): Promise<number[]> {
  if (!isDatabaseConfigured()) return fixtures.retentionCurve(projectId, points);

  try {
    const { retentionCurve } = await import("@/lib/analytics/ingest");
    const curve = await retentionCurve(projectId);
    if (curve.length === 0) return fixtures.retentionCurve(projectId, points);

    const bucket = curve.length / points;
    return Array.from({ length: points }, (_, i) => {
      const from = Math.floor(i * bucket);
      const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
      let peak = 0;
      for (let n = from; n < to && n < curve.length; n++) {
        peak = Math.max(peak, curve[n].fraction);
      }
      return peak;
    });
  } catch {
    return fixtures.retentionCurve(projectId, points);
  }
}
