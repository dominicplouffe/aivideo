import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";
import type { Project, Segment, ProjectStatus, OutputKind } from "@/lib/app-data";

/**
 * Reads projects out of Postgres in exactly the shape the UI already consumes.
 *
 * Keeping the returned type identical to the fixture type is deliberate: it
 * lets pages move onto the database without touching a single component, and
 * it makes the fixture fallback a genuine drop-in rather than an approximation.
 */

type Row = typeof s.projects.$inferSelect;
type SegRow = typeof s.segments.$inferSelect;

function toSegment(r: SegRow): Segment {
  return {
    id: r.id,
    title: r.title,
    start: r.startSec,
    end: r.endSec,
    words: r.words,
    action: r.action ?? undefined,
    zoom: r.zoom ?? undefined,
  };
}

function toProject(
  r: Row,
  segs: SegRow[],
  extras: {
    ownerFixtureId: string;
    brandKitName: string;
    voiceLabel: string;
    locales: string[];
    outputs: OutputKind[];
    views: number;
    completion: number;
    ctaClicks: number;
  },
): Project {
  // Finished duration is derived from the segments that survive the edit,
  // never stored — a stored copy is what lets a duration drift from its cut.
  const deleted = new Set<number>(
    ((r.editState as { deletedSegments?: number[] })?.deletedSegments ?? []) as number[],
  );
  const removeFillers = (r.editState as { removeFillers?: boolean })?.removeFillers ?? true;
  const durationSec = segs.reduce((total, seg, i) => {
    if (deleted.has(i)) return total;
    const spoken = seg.words
      .filter((w) => !(removeFillers && w.cut))
      .reduce((n, w) => n + w.d, 0);
    return total + spoken + 0.35;
  }, 0);

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? "",
    status: r.status as ProjectStatus,
    durationSec: Math.round(durationSec),
    sourceDurationSec: r.sourceDurationSec ?? 0,
    updatedAt: r.updatedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    owner: extras.ownerFixtureId,
    brandKit: extras.brandKitName,
    voice: extras.voiceLabel,
    locales: extras.locales,
    outputs: extras.outputs,
    views: extras.views,
    completion: extras.completion,
    ctaClicks: extras.ctaClicks,
    collection: r.collection ?? "",
    segments: segs.sort((a, b) => a.ordinal - b.ordinal).map(toSegment),
  };
}

async function hydrate(rows: Row[]): Promise<Project[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [segs, locs, asts, kits, vcs] = await Promise.all([
    getDb().select().from(s.segments).where(inArray(s.segments.projectId, ids)),
    getDb().select().from(s.locales).where(inArray(s.locales.projectId, ids)),
    getDb().select().from(s.assets).where(inArray(s.assets.projectId, ids)),
    getDb().select().from(s.brandKits),
    getDb().select().from(s.voices),
  ]);

  const segsBy = new Map<string, SegRow[]>();
  for (const seg of segs) {
    const list = segsBy.get(seg.projectId) ?? [];
    list.push(seg);
    segsBy.set(seg.projectId, list);
  }
  const locBy = new Map<string, string[]>();
  for (const l of locs) locBy.set(l.projectId, [...(locBy.get(l.projectId) ?? []), l.code]);
  const outBy = new Map<string, Set<OutputKind>>();
  for (const a of asts) {
    const set = outBy.get(a.projectId) ?? new Set<OutputKind>();
    set.add(a.kind as OutputKind);
    outBy.set(a.projectId, set);
  }
  const kitName = new Map(kits.map((k) => [k.id, k.name]));
  const voiceLabel = new Map(vcs.map((v) => [v.id, `${v.name} — ${v.descriptor ?? ""}`]));

  return rows.map((r) =>
    toProject(r, segsBy.get(r.id) ?? [], {
      ownerFixtureId: r.ownerId ?? "",
      brandKitName: r.brandKitId ? (kitName.get(r.brandKitId) ?? "") : "",
      voiceLabel: r.voiceId ? (voiceLabel.get(r.voiceId) ?? "—") : "—",
      locales: locBy.get(r.id) ?? [],
      outputs: [...(outBy.get(r.id) ?? [])],
      // Engagement lives in the analytics store, not the primary database.
      // Zero here is honest: this row has no analytics attached yet.
      views: 0,
      completion: 0,
      ctaClicks: 0,
    }),
  );
}

export async function listProjects(workspaceSlug: string): Promise<Project[]> {
  const ws = await getDb().query.workspaces.findFirst({
    where: eq(s.workspaces.slug, workspaceSlug),
  });
  if (!ws) return [];
  const rows = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.workspaceId, ws.id), isNull(s.projects.deletedAt)))
    .orderBy(desc(s.projects.updatedAt));
  return hydrate(rows);
}

export async function getProjectBySlug(
  workspaceSlug: string,
  slug: string,
): Promise<Project | null> {
  const ws = await getDb().query.workspaces.findFirst({
    where: eq(s.workspaces.slug, workspaceSlug),
  });
  if (!ws) return null;
  const rows = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.workspaceId, ws.id), eq(s.projects.slug, slug)))
    .limit(1);
  const [project] = await hydrate(rows);
  return project ?? null;
}

/**
 * A project by id, within a workspace.
 *
 * The workspace is required rather than optional. An id-only lookup reads
 * across every tenant in the database and leaves it to the caller to check
 * afterwards — which is a check somebody eventually forgets, and the kind
 * that fails silently by returning the wrong customer's data rather than an
 * error anyone notices.
 */
/** Every project in a workspace, by id rather than slug. */
export async function listProjectsForWorkspace(workspaceId: string): Promise<Project[]> {
  const rows = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
    .orderBy(desc(s.projects.updatedAt));
  return hydrate(rows);
}

/** A project by slug, within a workspace identified by id. */
export async function getProjectBySlugForWorkspace(
  workspaceId: string,
  slug: string,
): Promise<Project | null> {
  const rows = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.workspaceId, workspaceId), eq(s.projects.slug, slug)))
    .limit(1);
  const [project] = await hydrate(rows);
  return project ?? null;
}

export async function getProjectById(workspaceId: string, id: string): Promise<Project | null> {
  const rows = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.id, id), eq(s.projects.workspaceId, workspaceId)))
    .limit(1);
  const [project] = await hydrate(rows);
  return project ?? null;
}

/** Projects whose locales have fallen behind their source. */
export async function listStaleProjects(workspaceSlug: string): Promise<Project[]> {
  const all = await listProjects(workspaceSlug);
  return all.filter((p) => p.status === "stale");
}
