import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { bitmapFrom, countWatched, emptyBitmap, mergeBitmaps, parseSpans, reachedEnd } from "./bitmap";
import { deviceKind, visitorKey } from "./visitor";

/**
 * Ingestion.
 *
 * Two write paths, and the split matters. A **view** is recorded the moment
 * the player mounts, because a demo that is opened and abandoned is a fact
 * worth having — it is usually the most important fact. A **session
 * summary** arrives once, when the tab goes away, carrying the whole watch
 * pattern at once.
 *
 * Both are upserts keyed on the viewer's daily key, so a refresh is the same
 * view rather than a second one, and a viewer who comes back in the
 * afternoon adds to their morning's bitmap instead of appearing twice.
 */

export interface ViewInput {
  workspaceId: string;
  projectId: string;
  assetSeconds: number;
  ip: string | null;
  userAgent: string | null;
  fromOrigin: string | null;
  locale?: string | null;
  now?: Date;
}

/** Records that a demo was opened. Idempotent within the viewer's day. */
export async function recordView(input: ViewInput): Promise<{ created: boolean }> {
  const { key, day } = visitorKey({
    ip: input.ip,
    userAgent: input.userAgent,
    assetId: input.projectId,
    now: input.now,
  });

  const rows = await getDb()
    .insert(s.analyticsSessions)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      visitorKey: key,
      day,
      fromOrigin: input.fromOrigin,
      locale: input.locale ?? null,
      deviceKind: deviceKind(input.userAgent),
      watched: emptyBitmap(input.assetSeconds),
      assetSeconds: Math.max(1, Math.ceil(input.assetSeconds)),
      startedAt: input.now ?? new Date(),
      updatedAt: input.now ?? new Date(),
    })
    .onConflictDoNothing({
      target: [s.analyticsSessions.projectId, s.analyticsSessions.visitorKey, s.analyticsSessions.day],
    })
    .returning({ id: s.analyticsSessions.id });

  return { created: rows.length > 0 };
}

export interface SummaryInput extends ViewInput {
  /** Run-length encoded watched spans, e.g. `"0-12,30-44"`. */
  spans: string;
  ctaClicked?: boolean;
}

/**
 * Records a finished viewing session.
 *
 * Merges rather than replaces. A viewer who watches the first minute, leaves
 * the tab, comes back and watches the last minute has seen both — and a
 * summary that overwrote the earlier bitmap would report that they skipped
 * the middle *and* the beginning.
 */
export async function recordSummary(input: SummaryInput): Promise<{ watchedSeconds: number }> {
  const { key, day } = visitorKey({
    ip: input.ip,
    userAgent: input.userAgent,
    assetId: input.projectId,
    now: input.now,
  });

  const assetSeconds = Math.max(1, Math.ceil(input.assetSeconds));
  const incoming = bitmapFrom(parseSpans(input.spans, assetSeconds), assetSeconds);
  const now = input.now ?? new Date();

  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(s.analyticsSessions)
      .where(
        and(
          eq(s.analyticsSessions.projectId, input.projectId),
          eq(s.analyticsSessions.visitorKey, key),
          eq(s.analyticsSessions.day, day),
        ),
      )
      .for("update")
      .limit(1);

    const merged = existing?.watched ? mergeBitmaps(existing.watched, incoming) : incoming;
    const watchedSeconds = countWatched(merged);

    if (!existing) {
      await tx.insert(s.analyticsSessions).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        visitorKey: key,
        day,
        fromOrigin: input.fromOrigin,
        locale: input.locale ?? null,
        deviceKind: deviceKind(input.userAgent),
        watched: merged,
        assetSeconds,
        watchedSeconds,
        reachedEnd: reachedEnd(merged),
        ctaClicked: input.ctaClicked ?? false,
        startedAt: now,
        updatedAt: now,
      });
      return { watchedSeconds };
    }

    await tx
      .update(s.analyticsSessions)
      .set({
        watched: merged,
        watchedSeconds,
        reachedEnd: reachedEnd(merged),
        // Never un-clicks: a call to action clicked in the morning stays
        // clicked when the afternoon's summary arrives without it.
        ctaClicked: existing.ctaClicked || (input.ctaClicked ?? false),
        updatedAt: now,
      })
      .where(eq(s.analyticsSessions.id, existing.id));

    return { watchedSeconds };
  });
}

/** Records that the demo's call to action was clicked. */
export async function recordCta(input: ViewInput): Promise<void> {
  const { key, day } = visitorKey({
    ip: input.ip,
    userAgent: input.userAgent,
    assetId: input.projectId,
    now: input.now,
  });

  await getDb()
    .update(s.analyticsSessions)
    .set({ ctaClicked: true, updatedAt: input.now ?? new Date() })
    .where(
      and(
        eq(s.analyticsSessions.projectId, input.projectId),
        eq(s.analyticsSessions.visitorKey, key),
        eq(s.analyticsSessions.day, day),
      ),
    );
}

// --- reading it back -------------------------------------------------------

export interface RetentionPoint {
  second: number;
  viewers: number;
  fraction: number;
}

/**
 * The retention curve, per second, computed in the database.
 *
 * `get_bit` over a `generate_series` against the stored bitmaps. No
 * pipeline, no pre-aggregation, no nightly job — the shape of the data is
 * what makes the query cheap, rather than a layer of machinery compensating
 * for the shape being wrong.
 */
export async function retentionCurve(
  projectId: string,
  options: { since?: Date; workspaceId?: string } = {},
): Promise<RetentionPoint[]> {
  const db = getDb();

  // A project id is not a secret — it appears in every embed snippet — so
  // without the workspace predicate anybody signed in anywhere could read
  // anybody else's retention curve by guessing or reading one.
  const scope = [eq(s.analyticsSessions.projectId, projectId)];
  if (options.since) scope.push(gte(s.analyticsSessions.startedAt, options.since));
  if (options.workspaceId) scope.push(eq(s.analyticsSessions.workspaceId, options.workspaceId));

  const [summary] = await db
    .select({
      sessions: sql<number>`count(*)::int`,
      seconds: sql<number>`coalesce(max(${s.analyticsSessions.assetSeconds}), 0)::int`,
    })
    .from(s.analyticsSessions)
    .where(and(...scope));

  if (!summary || summary.sessions === 0 || summary.seconds === 0) return [];

  const since = options.since ?? new Date(0);
  // `second` is a keyword in Postgres, so the series column is aliased
  // rather than named — otherwise the parser reads it as an interval unit
  // and the query fails on something that looks nothing like the problem.
  const rows = await db.execute(sql`
    SELECT tick.n AS second,
           count(*) FILTER (
             WHERE tick.n < length(watched) AND get_bit(watched, tick.n) = 1
           )::int AS viewers
      FROM analytics_sessions,
           generate_series(0, ${summary.seconds - 1}::int) AS tick(n)
     WHERE project_id = ${projectId}::uuid
       -- An ISO string, not a Date. The query builder converts one; a raw
       -- template hands the value straight to the driver, which only takes
       -- strings and buffers — and the resulting error names neither dates
       -- nor this query.
       AND started_at >= ${since.toISOString()}::timestamptz
       AND (${options.workspaceId ?? null}::uuid IS NULL
            OR workspace_id = ${options.workspaceId ?? null}::uuid)
       AND watched IS NOT NULL
     GROUP BY tick.n
     ORDER BY tick.n;
  `);

  return (rows as unknown as { second: number; viewers: number }[]).map((row) => ({
    second: Number(row.second),
    viewers: Number(row.viewers),
    fraction: summary.sessions > 0 ? Number(row.viewers) / summary.sessions : 0,
  }));
}

export interface ProjectAnalytics {
  views: number;
  uniqueDays: number;
  completionRate: number;
  ctaRate: number;
  averageWatchedSeconds: number;
  byOrigin: { origin: string; views: number }[];
  byDevice: { device: string; views: number }[];
}

export async function projectAnalytics(
  projectId: string,
  options: { since?: Date } = {},
): Promise<ProjectAnalytics> {
  const db = getDb();
  const where = options.since
    ? and(eq(s.analyticsSessions.projectId, projectId), gte(s.analyticsSessions.startedAt, options.since))
    : eq(s.analyticsSessions.projectId, projectId);

  const [totals] = await db
    .select({
      views: sql<number>`count(*)::int`,
      uniqueDays: sql<number>`count(distinct ${s.analyticsSessions.day})::int`,
      completed: sql<number>`count(*) FILTER (WHERE ${s.analyticsSessions.reachedEnd})::int`,
      cta: sql<number>`count(*) FILTER (WHERE ${s.analyticsSessions.ctaClicked})::int`,
      averageWatched: sql<number>`coalesce(avg(${s.analyticsSessions.watchedSeconds}), 0)::float`,
    })
    .from(s.analyticsSessions)
    .where(where);

  const origins = await db
    .select({
      origin: sql<string>`coalesce(${s.analyticsSessions.fromOrigin}, 'direct')`,
      views: sql<number>`count(*)::int`,
    })
    .from(s.analyticsSessions)
    .where(where)
    .groupBy(sql`coalesce(${s.analyticsSessions.fromOrigin}, 'direct')`)
    .orderBy(sql`count(*) DESC`)
    .limit(10);

  const devices = await db
    .select({
      device: sql<string>`coalesce(${s.analyticsSessions.deviceKind}, 'desktop')`,
      views: sql<number>`count(*)::int`,
    })
    .from(s.analyticsSessions)
    .where(where)
    .groupBy(sql`coalesce(${s.analyticsSessions.deviceKind}, 'desktop')`)
    .orderBy(sql`count(*) DESC`);

  const views = totals?.views ?? 0;
  return {
    views,
    uniqueDays: totals?.uniqueDays ?? 0,
    completionRate: views > 0 ? (totals?.completed ?? 0) / views : 0,
    ctaRate: views > 0 ? (totals?.cta ?? 0) / views : 0,
    averageWatchedSeconds: totals?.averageWatched ?? 0,
    byOrigin: origins,
    byDevice: devices,
  };
}
