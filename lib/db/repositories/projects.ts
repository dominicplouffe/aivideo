import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";
import type { Project, Segment, ProjectStatus, OutputKind } from "@/lib/app-data";
import { silentSpanSec, wordKey } from "@/lib/segments";
import { chapterSpan, hydrateEditState } from "@/lib/edit-state";
import { slugify } from "@/lib/utils";

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
    hasMedia: boolean;
  },
): Project {
  // Finished duration is derived from the segments that survive the edit,
  // never stored — a stored copy is what lets a duration drift from its cut.
  const deleted = new Set<number>(
    ((r.editState as { deletedSegments?: number[] })?.deletedSegments ?? []) as number[],
  );
  const removeFillers = (r.editState as { removeFillers?: boolean })?.removeFillers ?? true;
  const storedCuts = (r.editState as { cutWords?: unknown })?.cutWords;
  const cutWords = new Set(
    (Array.isArray(storedCuts) ? storedCuts : [])
      .filter(
        (pair): pair is [number, number] =>
          Array.isArray(pair) && pair.length === 2 && pair.every((n) => Number.isInteger(n)),
      )
      .map(([segIndex, wordIndex]) => wordKey(segIndex, wordIndex)),
  );
  const durationSec = segs.reduce((total, seg, i) => {
    if (deleted.has(i)) return total;
    // Narrated, or silent: the chapter plays whole. See BuildEdlInput.continuous.
    if (r.voiceId || seg.words.length === 0) {
      if (r.voiceId) {
        const bounds = chapterSpan({ start: seg.startSec, end: seg.endSec }, i, hydrateEditState(r.editState));
        return total + silentSpanSec(bounds);
      }
      const span = silentSpanSec({ start: seg.startSec, end: seg.endSec });
      return span > 0 ? total + span + 0.35 : total;
    }
    const spoken = seg.words
      .filter((w, j) => !(removeFillers && w.cut) && !cutWords.has(wordKey(i, j)))
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
    voiceId: r.voiceId ?? null,
    locales: extras.locales,
    outputs: extras.outputs,
    views: extras.views,
    completion: extras.completion,
    ctaClicks: extras.ctaClicks,
    collection: r.collection ?? "",
    segments: segs.sort((a, b) => a.ordinal - b.ordinal).map(toSegment),
    recordingId: r.recordingId ?? null,
    hasMedia: extras.hasMedia,
    editState: (r.editState as Record<string, unknown> | null) ?? null,
  };
}

async function hydrate(rows: Row[]): Promise<Project[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const recordingIds = rows.map((r) => r.recordingId).filter((id): id is string => id !== null);

  const [segs, locs, asts, kits, vcs, recs, stats] = await Promise.all([
    getDb().select().from(s.segments).where(inArray(s.segments.projectId, ids)),
    getDb().select().from(s.locales).where(inArray(s.locales.projectId, ids)),
    getDb().select().from(s.assets).where(inArray(s.assets.projectId, ids)),
    getDb().select().from(s.brandKits),
    getDb().select().from(s.voices),
    // Which takes have bytes. One query rather than one per card.
    recordingIds.length > 0
      ? getDb()
          .select({ id: s.recordings.id, mediaKey: s.recordings.mediaKey })
          .from(s.recordings)
          .where(inArray(s.recordings.id, recordingIds))
      : Promise.resolve([] as { id: string; mediaKey: string | null }[]),
    // Engagement, counted from the analytics store. One grouped query for
    // every project being hydrated, not one per card.
    getDb()
      .select({
        projectId: s.analyticsSessions.projectId,
        views: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) FILTER (WHERE ${s.analyticsSessions.reachedEnd})::int`,
        cta: sql<number>`count(*) FILTER (WHERE ${s.analyticsSessions.ctaClicked})::int`,
      })
      .from(s.analyticsSessions)
      .where(inArray(s.analyticsSessions.projectId, ids))
      .groupBy(s.analyticsSessions.projectId),
  ]);

  const withMedia = new Set(recs.filter((r) => r.mediaKey !== null).map((r) => r.id));

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
  const statsBy = new Map(
    stats.map((row) => {
      const views = Number(row.views ?? 0);
      return [
        row.projectId,
        {
          views,
          completion: views > 0 ? Number(row.completed ?? 0) / views : 0,
          cta: Number(row.cta ?? 0),
        },
      ] as const;
    }),
  );
  const kitName = new Map(kits.map((k) => [k.id, k.name]));
  const voiceLabel = new Map(vcs.map((v) => [v.id, `${v.name} — ${v.descriptor ?? ""}`]));

  return rows.map((r) =>
    toProject(r, segsBy.get(r.id) ?? [], {
      ownerFixtureId: r.ownerId ?? "",
      brandKitName: r.brandKitId ? (kitName.get(r.brandKitId) ?? "") : "",
      voiceLabel: r.voiceId ? (voiceLabel.get(r.voiceId) ?? "—") : "—",
      locales: locBy.get(r.id) ?? [],
      outputs: [...(outBy.get(r.id) ?? [])],
      // Engagement lives in `analytics_sessions`, which is in this same
      // database — these three were hardcoded to 0 with a comment saying
      // engagement lived elsewhere, so every project reported no views
      // forever however many it had. The dashboard showed "Total views 0"
      // beside a "Views this month 10" read from the very same table.
      views: statsBy.get(r.id)?.views ?? 0,
      completion: statsBy.get(r.id)?.completion ?? 0,
      ctaClicks: statsBy.get(r.id)?.cta ?? 0,
      hasMedia: r.recordingId !== null && withMedia.has(r.recordingId),
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

/**
 * Creates a project from a recording.
 *
 * The slug is derived from the title and made unique within the workspace by
 * appending a counter — not a random suffix. A person who records "Shipments
 * walkthrough" twice should get `shipments-walkthrough` and
 * `shipments-walkthrough-2`, because they will read these in a URL and a
 * random suffix tells them nothing about which is which.
 */
export async function createProject(input: {
  workspaceId: string;
  recordingId: string | null;
  ownerId: string | null;
  title: string;
  description?: string | null;
  sourceDurationSec?: number | null;
  /** Free text, chosen by the person recording. Null means uncategorised. */
  collection?: string | null;
}): Promise<Project> {
  const db = getDb();
  const base = slugify(input.title) || "untitled-recording";

  const taken = new Set(
    (
      await db
        .select({ slug: s.projects.slug })
        .from(s.projects)
        .where(eq(s.projects.workspaceId, input.workspaceId))
    ).map((row) => row.slug),
  );

  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const [row] = await db
    .insert(s.projects)
    .values({
      workspaceId: input.workspaceId,
      recordingId: input.recordingId,
      ownerId: input.ownerId,
      slug,
      title: input.title,
      description: input.description ?? null,
      // Processing, not draft: the take has arrived and work is queued on it.
      // Draft would suggest somebody has to do something next, and at this
      // point nobody does.
      status: "processing",
      sourceDurationSec: input.sourceDurationSec ?? null,
      // Written at creation. The recorder has always asked for this and the
      // create path has always discarded it, so every project arrived
      // uncategorised however carefully somebody filled the form in.
      collection: input.collection?.trim() || null,
    })
    .returning();

  const [project] = await hydrate([row]);
  return project;
}

/**
 * A second project cut from the same take: the chapters, every edit and
 * the chosen voice as they stand this moment, under a new name, so somebody
 * can try a different cut without touching the one they have. The
 * recording is shared, not copied — nothing is uploaded or transcribed
 * again — and the copy has no share, renders or view counts of its own yet.
 */
export async function duplicateProject(
  workspaceId: string,
  projectId: string,
  ownerId: string | null,
): Promise<{ ok: true; project: Project } | { ok: false; reason: string; status: 404 | 409 }> {
  const outcome = await getDb().transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(s.projects)
      .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
      .limit(1);
    if (!source) return { ok: false as const, reason: "No such project.", status: 404 as const };
    if (source.status === "processing") {
      return {
        ok: false as const,
        reason: "That project is still being processed. Copy it once its chapters are ready.",
        status: 409 as const,
      };
    }
    const rows = await tx.select().from(s.segments).where(eq(s.segments.projectId, projectId)).orderBy(s.segments.ordinal);

    const title = copyTitle(source.title);
    const taken = new Set(
      (
        await tx
          .select({ slug: s.projects.slug })
          .from(s.projects)
          .where(eq(s.projects.workspaceId, workspaceId))
      ).map((row) => row.slug),
    );
    const base = slugify(title) || "untitled-recording";
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

    const [row] = await tx
      .insert(s.projects)
      .values({
        workspaceId,
        recordingId: source.recordingId,
        ownerId,
        slug,
        title,
        description: source.description,
        // A published project's copy is not published: the share belongs to
        // the original. Everything else keeps its footing.
        status: source.status === "published" ? "ready" : source.status,
        collection: source.collection,
        brandKitId: source.brandKitId,
        voiceId: source.voiceId,
        editState: source.editState,
        sourceDurationSec: source.sourceDurationSec,
      })
      .returning();

    if (rows.length > 0) {
      await tx.insert(s.segments).values(
        rows.map((seg) => ({
          projectId: row.id,
          ordinal: seg.ordinal,
          title: seg.title,
          startSec: seg.startSec,
          endSec: seg.endSec,
          action: seg.action,
          words: seg.words,
          zoom: seg.zoom,
          zoomInferred: seg.zoomInferred,
        })),
      );
    }
    return { ok: true as const, row };
  });
  if (!outcome.ok) return outcome;
  const [project] = await hydrate([outcome.row]);
  return { ok: true, project };
}

/**
 * "Launch demo" → "Launch demo (copy)"; a copy of a copy is
 * "Launch demo (copy 2)", not "Launch demo (copy) (copy)".
 */
export function copyTitle(title: string): string {
  const match = /^(.*?)\s\(copy(?: (\d+))?\)$/.exec(title.trim());
  const stem = match ? match[1] : title.trim();
  const n = match ? Number(match[2] ?? 1) + 1 : 1;
  const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
  return `${stem.slice(0, 140 - suffix.length)}${suffix}`;
}

/** Saves the Studio's edit decisions. The only writer of `edit_state`. */
export async function saveEditState(
  workspaceId: string,
  projectId: string,
  editState: Record<string, unknown>,
): Promise<boolean> {
  const [updated] = await getDb()
    .update(s.projects)
    .set({ editState, updatedAt: new Date() })
    .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId)))
    .returning({ id: s.projects.id });
  return Boolean(updated);
}

/** Sets, or clears, the voice that narrates a project's renders. */
export async function saveVoice(
  workspaceId: string,
  projectId: string,
  voiceId: string | null,
): Promise<boolean> {
  const [updated] = await getDb()
    .update(s.projects)
    .set({ voiceId, updatedAt: new Date() })
    .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId)))
    .returning({ id: s.projects.id });
  return Boolean(updated);
}

/**
 * Splits a chapter at a word: the word and everything after it become a new
 * chapter, titled from its first words, beginning at the word's frame. The
 * first half keeps the chapter's title, zoom and timing. Every edit that
 * names a chapter is renumbered in the same transaction.
 */
export async function splitSegment(
  workspaceId: string,
  projectId: string,
  segIndex: number,
  wordIndex: number,
): Promise<{ ok: true; segments: number } | { ok: false; reason: string }> {
  const { remapStoredForSplit } = await import("@/lib/edit-state");
  const { titleFor } = await import("@/lib/pipeline/segment");
  return getDb().transaction(async (tx) => {
    const [project] = await tx
      .select({ id: s.projects.id, editState: s.projects.editState })
      .from(s.projects)
      .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
      .limit(1);
    if (!project) return { ok: false as const, reason: "No such project." };
    const rows = await tx.select().from(s.segments).where(eq(s.segments.projectId, projectId)).orderBy(s.segments.ordinal);
    const row = rows[segIndex];
    if (!row) return { ok: false as const, reason: "No such chapter." };
    if (wordIndex <= 0 || wordIndex >= row.words.length) {
      return { ok: false as const, reason: "A chapter can only be split between two of its words." };
    }
    const before = row.words.slice(0, wordIndex);
    const after = row.words.slice(wordIndex);
    const boundary = after[0].t;

    // Later chapters move down one, from the last so no two share an ordinal.
    for (let i = rows.length - 1; i > segIndex; i--) {
      await tx.update(s.segments).set({ ordinal: i + 1 }).where(eq(s.segments.id, rows[i].id));
    }
    await tx.update(s.segments).set({ endSec: boundary, words: before }).where(eq(s.segments.id, row.id));
    await tx.insert(s.segments).values({
      projectId,
      ordinal: segIndex + 1,
      title: titleFor(after, segIndex + 1),
      startSec: boundary,
      endSec: row.endSec,
      words: after,
      action: null,
      zoom: null,
      zoomInferred: false,
    });
    await tx
      .update(s.projects)
      .set({
        editState: remapStoredForSplit((project.editState ?? {}) as Record<string, unknown>, segIndex, wordIndex) as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(s.projects.id, projectId));
    return { ok: true as const, segments: rows.length + 1 };
  });
}

/** Folds a chapter into the one before it, undoing a split or joining two the segmenter kept apart. */
export async function mergeSegmentIntoPrevious(
  workspaceId: string,
  projectId: string,
  segIndex: number,
): Promise<{ ok: true; segments: number } | { ok: false; reason: string }> {
  const { remapStoredForMerge } = await import("@/lib/edit-state");
  return getDb().transaction(async (tx) => {
    const [project] = await tx
      .select({ id: s.projects.id, editState: s.projects.editState })
      .from(s.projects)
      .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
      .limit(1);
    if (!project) return { ok: false as const, reason: "No such project." };
    const rows = await tx.select().from(s.segments).where(eq(s.segments.projectId, projectId)).orderBy(s.segments.ordinal);
    if (segIndex <= 0 || segIndex >= rows.length) return { ok: false as const, reason: "There is no chapter before this one to merge into." };
    const previous = rows[segIndex - 1];
    const row = rows[segIndex];

    await tx
      .update(s.segments)
      .set({ endSec: row.endSec, words: [...previous.words, ...row.words] })
      .where(eq(s.segments.id, previous.id));
    await tx.delete(s.segments).where(eq(s.segments.id, row.id));
    for (let i = segIndex + 1; i < rows.length; i++) {
      await tx.update(s.segments).set({ ordinal: i - 1 }).where(eq(s.segments.id, rows[i].id));
    }
    await tx
      .update(s.projects)
      .set({
        editState: remapStoredForMerge(
          (project.editState ?? {}) as Record<string, unknown>,
          segIndex,
          previous.words.length,
        ) as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(s.projects.id, projectId));
    return { ok: true as const, segments: rows.length - 1 };
  });
}

/** Replaces a project's segments. Used once, when a transcript lands. */
export async function replaceSegments(
  projectId: string,
  segments: {
    ordinal: number;
    title: string;
    startSec: number;
    endSec: number;
    action?: string | null;
    words: { w: string; t: number; d: number; cut?: boolean; em?: boolean }[];
  }[],
): Promise<void> {
  const db = getDb();
  await db.delete(s.segments).where(eq(s.segments.projectId, projectId));
  if (segments.length === 0) return;

  await db.insert(s.segments).values(
    segments.map((segment) => ({
      projectId,
      ordinal: segment.ordinal,
      title: segment.title,
      startSec: segment.startSec,
      endSec: segment.endSec,
      action: segment.action ?? null,
      words: segment.words,
    })),
  );
}

export async function setProjectStatus(
  projectId: string,
  status: typeof s.projects.$inferInsert["status"],
  extra: { durationSec?: number | null } = {},
): Promise<void> {
  await getDb()
    .update(s.projects)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(s.projects.id, projectId));
}
