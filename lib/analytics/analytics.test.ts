import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { bitmapFrom, countWatched, mergeBitmaps, parseSpans, reachedEnd } from "./bitmap";
import { projectAnalytics, recordCta, recordSummary, recordView, retentionCurve } from "./ingest";
import { deviceKind, setSaltForTesting, today, visitorKey } from "./visitor";

/**
 * Two claims are under test: that the measurement is genuinely cookieless
 * and unlinkable, and that per-second retention is affordable — one row per
 * session, not one per ping.
 */

const RUN = isDatabaseConfigured();
const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1";
const OTHER_PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2";
const RECORDING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac1";

const VIEWER = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (Macintosh)" };

before(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test setup");
});

after(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test reset");
  const db = getDb();
  await db.insert(s.workspaces).values({ id: WS, slug: "analytics-test", name: "Analytics Test" });
  await db.insert(s.recordings).values({
    id: RECORDING, workspaceId: WS, source: "extension", status: "ready", durationSec: 120,
  });
  await db.insert(s.projects).values([
    { id: PROJECT, workspaceId: WS, recordingId: RECORDING, slug: "demo", title: "Demo", status: "published" },
    { id: OTHER_PROJECT, workspaceId: WS, recordingId: RECORDING, slug: "other", title: "Other", status: "published" },
  ]);
});

// --- the bitmap (no database needed) ---------------------------------------

describe("the watch bitmap", () => {
  it("records which seconds were seen, not just how many", () => {
    // "They scrubbed back and rewatched the pricing bit" is a thing this can
    // say and a duration counter cannot.
    const bitmap = bitmapFrom([0, 1, 2, 10, 11], 12);
    assert.equal(bitmap, "111000000011");
    assert.equal(countWatched(bitmap), 5);
  });

  it("parses run-length spans, which is what a player naturally produces", () => {
    // sendBeacon refuses a large body and will not tell the page it did.
    assert.deepEqual(parseSpans("0-3", 10), [0, 1, 2, 3]);
    assert.deepEqual(parseSpans("0-1,5-6", 10), [0, 1, 5, 6]);
    assert.deepEqual(parseSpans("7", 10), [7]);
  });

  it("ignores nonsense from the wire instead of dropping the view", () => {
    // The input comes from a browser on somebody else's page, where a paused
    // tab, a clock change or a re-edited asset all produce odd numbers.
    assert.deepEqual(parseSpans("", 10), []);
    assert.deepEqual(parseSpans("banana", 10), []);
    // Matched, not coerced: "-5--1" split on "-" and run through Number()
    // would yield a perfectly plausible 0-to-5 range out of nothing.
    assert.deepEqual(parseSpans("-5--1", 10), []);
    assert.deepEqual(parseSpans("1.5-2.5", 10), []);
    assert.deepEqual(parseSpans("8-99999", 10), [8, 9]);
    // Reversed spans are the same span.
    assert.deepEqual(parseSpans("6-3", 10), [3, 4, 5, 6]);
  });

  it("caps an asset length a client could claim is a year long", () => {
    assert.equal(bitmapFrom([0], 1e9).length, 6 * 60 * 60);
  });

  it("merges a returning viewer's sessions rather than replacing them", () => {
    // Watching the start, leaving, and coming back for the end means both
    // were seen — not that the beginning was skipped.
    assert.equal(mergeBitmaps("1100", "0011"), "1111");
    assert.equal(mergeBitmaps("1000", "1000"), "1000");
  });

  it("counts the last 5% as the end, not the final second", () => {
    // Players stop reporting a moment early and an outro runs past the last
    // spoken word. A completion rate of 0% is a metric nobody trusts twice.
    assert.equal(reachedEnd("0".repeat(95) + "1" + "0".repeat(4)), true);
    assert.equal(reachedEnd("1".repeat(50) + "0".repeat(50)), false);
    assert.equal(reachedEnd(""), false);
  });
});

// --- identity --------------------------------------------------------------

describe("cookieless identity", () => {
  it("gives the same viewer the same key within a day", () => {
    setSaltForTesting(today(), Buffer.from("fixed-salt-for-the-test"));
    const first = visitorKey({ ...VIEWER, assetId: PROJECT });
    const second = visitorKey({ ...VIEWER, assetId: PROJECT });
    assert.equal(first.key, second.key);
    setSaltForTesting(today(), null);
  });

  it("gives the same viewer a different key on a different demo", () => {
    setSaltForTesting(today(), Buffer.from("fixed-salt-for-the-test"));
    const a = visitorKey({ ...VIEWER, assetId: PROJECT });
    const b = visitorKey({ ...VIEWER, assetId: OTHER_PROJECT });
    // Otherwise one key follows a person across every demo they see that
    // day, which is the cross-site profile dropping cookies was meant to
    // avoid.
    assert.notEqual(a.key, b.key);
    setSaltForTesting(today(), null);
  });

  it("cannot be recomputed once the day's salt is gone", () => {
    setSaltForTesting("2026-01-01", Buffer.from("mondays-salt"));
    const monday = visitorKey({ ...VIEWER, assetId: PROJECT, now: new Date("2026-01-01T10:00:00Z") });

    // The salt is never written down. Tomorrow there is nothing left to
    // check a specific person's key against.
    setSaltForTesting("2026-01-02", Buffer.from("tuesdays-salt"));
    const tuesday = visitorKey({ ...VIEWER, assetId: PROJECT, now: new Date("2026-01-02T10:00:00Z") });

    assert.notEqual(monday.key, tuesday.key);
    assert.equal(monday.day, "2026-01-01");
    assert.equal(tuesday.day, "2026-01-02");
    setSaltForTesting(today(), null);
  });

  it("classifies devices coarsely, which is all a chart needs", () => {
    assert.equal(deviceKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148"), "mobile");
    assert.equal(deviceKind("Mozilla/5.0 (iPad; CPU OS 17_0)"), "tablet");
    assert.equal(deviceKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "desktop");
    assert.equal(deviceKind(null), "desktop");
  });
});

// --- against a real database -----------------------------------------------

describe("analytics", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  const base = { workspaceId: WS, projectId: PROJECT, assetSeconds: 100, fromOrigin: "https://customer.test" };

  it("counts a refresh as the same view", async () => {
    const first = await recordView({ ...base, ...VIEWER });
    const second = await recordView({ ...base, ...VIEWER });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal((await projectAnalytics(PROJECT)).views, 1);
  });

  it("counts a demo opened and abandoned, which is the fact that matters most", async () => {
    await recordView({ ...base, ...VIEWER });

    const stats = await projectAnalytics(PROJECT);
    assert.equal(stats.views, 1);
    assert.equal(stats.averageWatchedSeconds, 0);
    assert.equal(stats.completionRate, 0);
  });

  it("stores a whole session as one row with per-second resolution", async () => {
    await recordSummary({ ...base, ...VIEWER, spans: "0-9,50-59" });

    const rows = await getDb().select().from(s.analyticsSessions).where(eq(s.analyticsSessions.projectId, PROJECT));
    // 120 progress pings would have been 120 rows. This is one.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].watchedSeconds, 20);
    assert.equal(rows[0].watched?.length, 100);
    assert.equal(rows[0].watched?.slice(0, 10), "1111111111");
    assert.equal(rows[0].watched?.slice(10, 20), "0000000000");
  });

  it("adds a returning viewer's seconds to what they already saw", async () => {
    await recordSummary({ ...base, ...VIEWER, spans: "0-9" });
    const second = await recordSummary({ ...base, ...VIEWER, spans: "90-99" });

    assert.equal(second.watchedSeconds, 20);
    const [row] = await getDb().select().from(s.analyticsSessions).where(eq(s.analyticsSessions.projectId, PROJECT));
    assert.equal(row.reachedEnd, true);
    assert.equal((await projectAnalytics(PROJECT)).views, 1);
  });

  it("never un-clicks a call to action", async () => {
    await recordSummary({ ...base, ...VIEWER, spans: "0-9", ctaClicked: true });
    await recordSummary({ ...base, ...VIEWER, spans: "10-19" });

    const [row] = await getDb().select().from(s.analyticsSessions).where(eq(s.analyticsSessions.projectId, PROJECT));
    assert.equal(row.ctaClicked, true);
  });

  it("records a click that arrives after the view", async () => {
    await recordView({ ...base, ...VIEWER });
    await recordCta({ ...base, ...VIEWER });
    assert.equal((await projectAnalytics(PROJECT)).ctaRate, 1);
  });

  it("builds a retention curve in the database, per second", async () => {
    // Three viewers: all see the first ten seconds, one gets to the end.
    await recordSummary({ ...base, ip: "203.0.113.1", userAgent: "A", spans: "0-9" });
    await recordSummary({ ...base, ip: "203.0.113.2", userAgent: "B", spans: "0-49" });
    await recordSummary({ ...base, ip: "203.0.113.3", userAgent: "C", spans: "0-99" });

    const curve = await retentionCurve(PROJECT);

    assert.equal(curve.length, 100);
    assert.deepEqual(curve[0], { second: 0, viewers: 3, fraction: 1 });
    assert.equal(curve[20].viewers, 2);
    assert.equal(curve[60].viewers, 1);
    assert.equal(curve[99].viewers, 1);
  });

  it("shows a rewatched span as the peak it is", async () => {
    // A duration counter says "watched 30 seconds of a 100-second demo".
    // The curve says which 30, which is the difference between a number and
    // an insight.
    await recordSummary({ ...base, ip: "203.0.113.4", userAgent: "D", spans: "0-4,40-49" });
    await recordSummary({ ...base, ip: "203.0.113.5", userAgent: "E", spans: "0-4,40-49" });
    await recordSummary({ ...base, ip: "203.0.113.6", userAgent: "F", spans: "0-4" });

    const curve = await retentionCurve(PROJECT);
    assert.equal(curve[2].viewers, 3);
    assert.equal(curve[20].viewers, 0);
    assert.equal(curve[45].viewers, 2);
  });

  it("keeps each demo's numbers to itself", async () => {
    await recordSummary({ ...base, ...VIEWER, spans: "0-9" });
    await recordSummary({ ...base, projectId: OTHER_PROJECT, ...VIEWER, spans: "0-49" });

    assert.equal((await projectAnalytics(PROJECT)).views, 1);
    assert.equal((await projectAnalytics(OTHER_PROJECT)).views, 1);
    assert.equal((await retentionCurve(PROJECT))[20].viewers, 0);
    assert.equal((await retentionCurve(OTHER_PROJECT))[20].viewers, 1);
  });

  it("breaks views down by referring origin and device", async () => {
    await recordSummary({ ...base, ip: "1.1.1.1", userAgent: "Mozilla/5.0 (iPhone) Mobile", spans: "0-9" });
    await recordSummary({ ...base, ip: "1.1.1.2", userAgent: "Mozilla/5.0 (Macintosh)", spans: "0-9" });
    await recordSummary({
      ...base, ip: "1.1.1.3", userAgent: "Mozilla/5.0 (Macintosh)",
      fromOrigin: "https://news.test", spans: "0-9",
    });

    const stats = await projectAnalytics(PROJECT);
    assert.equal(stats.views, 3);
    assert.deepEqual(
      stats.byOrigin.map((row) => [row.origin, row.views]).sort(),
      [["https://customer.test", 2], ["https://news.test", 1]],
    );
    assert.deepEqual(
      stats.byDevice.map((row) => [row.device, row.views]).sort(),
      [["desktop", 2], ["mobile", 1]],
    );
  });

  it("returns an empty curve for a demo nobody has watched", async () => {
    assert.deepEqual(await retentionCurve(PROJECT), []);
    const stats = await projectAnalytics(PROJECT);
    // Zero views, not NaN rates — a dashboard rendering NaN% is how a
    // customer stops believing every other number on the page.
    assert.deepEqual([stats.views, stats.completionRate, stats.ctaRate], [0, 0, 0]);
  });
});
