/**
 * Seeds the database from the fixtures in lib/app-data.ts.
 *
 * Idempotent: identifiers are derived from the fixture ids, and the workspace
 * is removed (cascading) before re-insert, so running this repeatedly
 * converges on the same rows rather than accumulating duplicates.
 *
 *   npm run db:seed
 */
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getDb, closeDb } from "../client";
import * as s from "../schema";
import { stableUuid } from "../ids";
import {
  workspace as wsFixture, members as memberFixtures, brandKits as kitFixtures,
  voices as voiceFixtures, projects as projectFixtures, localeMatrix,
} from "../../app-data";

/** Refers to the row Postgres was about to insert, inside an upsert. */
const sqlExcluded = (column: string) => drizzleSql.raw(`excluded."${column}"`);

const NS = "demoriff.seed.v1";
const id = (kind: string, key: string) => stableUuid(`${NS}:${kind}`, key);

const WORKSPACE_SLUG = "meridian";

async function main() {
  console.log("seeding…");

  // --- workspace (cascade clears everything beneath it) --------------------
  // The audit log does not cascade: its trigger refuses a delete that has
  // not declared itself an erasure, which is exactly the protection that
  // stops a routine teardown from removing the record of who tore it down.
  // Reseeding is a declared erasure, so it says so.
  await getDb().transaction(async (tx) => {
    await tx.execute(drizzleSql`SELECT set_config('demoriff.audit_purge', 'on', true)`);
    await tx.delete(s.workspaces).where(eq(s.workspaces.slug, WORKSPACE_SLUG));
  });

  const workspaceId = id("workspace", WORKSPACE_SLUG);
  await getDb().insert(s.workspaces).values({
    id: workspaceId,
    slug: WORKSPACE_SLUG,
    name: wsFixture.name,
    plan: "team",
    region: "us",
    seatsTotal: wsFixture.seats.total,
    videoSecondsLimit: wsFixture.minutes.total * 60,
    videoSecondsUsed: wsFixture.minutes.used * 60,
    shareDomain: "demos.meridian.app",
  });

  // --- members -------------------------------------------------------------
  const roleMap: Record<string, typeof s.members.$inferInsert.role> = {
    Owner: "owner", Admin: "admin", Creator: "creator",
    Reviewer: "reviewer", Viewer: "viewer",
  };
  await getDb().insert(s.members).values(
    memberFixtures.map((m) => ({
      id: id("member", m.id),
      workspaceId,
      email: m.email,
      name: m.name,
      role: roleMap[m.role] ?? "creator",
      lastActiveAt: m.lastActive === "now" ? new Date() : null,
    })),
  );

  // --- brand kits ----------------------------------------------------------
  await getDb().insert(s.brandKits).values(
    kitFixtures.map((k) => ({
      id: id("kit", k.id),
      workspaceId,
      name: k.name,
      locked: k.locked,
      tokens: {
        colors: k.colors, font: k.font, intro: k.intro, outro: k.outro,
        cursor: k.cursor, music: k.music, captionStyle: k.captionStyle,
      },
    })),
  );

  // --- masking policy ------------------------------------------------------
  const policyId = id("policy", "production-safeguards");
  await getDb().insert(s.maskingPolicies).values({
    id: policyId,
    workspaceId,
    name: "Production safeguards",
    enforced: true,
    rules: [
      { type: "detector", detectors: ["email", "phone", "card", "iban", "api_key", "jwt"] },
      { type: "selector", selector: "[data-customer-name]", style: "blur" },
      { type: "region", rect: [0, 0.12, 0.18, 0.88], style: "pixelate" },
      { type: "pattern", regex: "ACC-[0-9]{8}", style: "redact" },
    ],
  });

  // --- voices --------------------------------------------------------------
  // Clones carry a consent record; the schema refuses to store one without it.
  const cloneSubject: Record<string, string> = {
    "clone-renata": "usr_1",
    "clone-daniel": "usr_2",
  };
  // Studio voices are global reference data with workspace_id NULL, so the
  // workspace cascade above does not remove them. Upserting keeps the seed
  // idempotent; a plain insert collides on the primary key on the second run.
  await getDb().insert(s.voices).values(
    voiceFixtures.map((v) => {
      const subject = cloneSubject[v.id];
      return {
        id: id("voice", v.id),
        // Studio voices are global; clones belong to the workspace.
        workspaceId: v.kind === "clone" ? workspaceId : null,
        providerVoiceId: v.id,
        name: v.name,
        descriptor: v.descriptor,
        accent: v.accent,
        kind: v.kind,
        consentSubjectId: subject ? id("member", subject) : null,
        consentRecordedAt: v.consented ? new Date(v.consented) : null,
        consentAudioKey: v.consented ? `consent/${v.id}.wav` : null,
      };
    }),
  ).onConflictDoUpdate({
    target: s.voices.id,
    set: {
      name: sqlExcluded("name"),
      descriptor: sqlExcluded("descriptor"),
      accent: sqlExcluded("accent"),
      kind: sqlExcluded("kind"),
      workspaceId: sqlExcluded("workspace_id"),
      consentSubjectId: sqlExcluded("consent_subject_id"),
      consentRecordedAt: sqlExcluded("consent_recorded_at"),
      consentAudioKey: sqlExcluded("consent_audio_key"),
    },
  });

  // --- recordings, projects, segments, locales -----------------------------
  const kitByName = new Map(kitFixtures.map((k) => [k.name, id("kit", k.id)]));
  // Project fixtures label a voice as "Avery — Warm US" while the voice
  // fixture's descriptor is a longer phrase, so match on the name alone.
  const voiceByName = new Map(voiceFixtures.map((v) => [v.name.toLowerCase(), id("voice", v.id)]));
  const resolveVoice = (label: string) => {
    const name = label.split("—")[0]?.trim().toLowerCase() ?? "";
    return voiceByName.get(name) ?? null;
  };

  for (const p of projectFixtures) {
    const recordingId = id("recording", p.id);
    await getDb().insert(s.recordings).values({
      id: recordingId,
      workspaceId,
      createdBy: id("member", p.owner),
      source: "extension",
      status: "ready",
      mediaKey: `${workspaceId}/recordings/${p.id}/source.webm`,
      durationSec: p.sourceDurationSec,
      width: 3840,
      height: 2160,
      fps: 60,
      maskingPolicyId: policyId,
      events: p.segments
        .filter((seg) => seg.action)
        .map((seg) => ({ at: seg.start, kind: "click", selector: seg.action })),
      transcript: {
        language: "en-US",
        words: p.segments.flatMap((seg) =>
          seg.words.map((w) => ({ word: w.w, start: w.t, end: w.t + w.d, confidence: 0.95 })),
        ),
      },
    });

    const projectId = id("project", p.id);
    await getDb().insert(s.projects).values({
      id: projectId,
      workspaceId,
      recordingId,
      ownerId: id("member", p.owner),
      slug: p.slug,
      title: p.title,
      description: p.description,
      status: p.status,
      collection: p.collection,
      brandKitId: kitByName.get(p.brandKit) ?? null,
      voiceId: resolveVoice(p.voice),
      sourceDurationSec: p.sourceDurationSec,
      editState: {
        removeFillers: true, studioSound: true, captions: true,
        music: true, presenter: false, zoomEnabled: true, deletedSegments: [],
      },
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    });

    if (p.segments.length) {
      await getDb().insert(s.segments).values(
        p.segments.map((seg, i) => ({
          id: id("segment", seg.id),
          projectId,
          ordinal: i,
          title: seg.title,
          startSec: seg.start,
          endSec: seg.end,
          action: seg.action ?? null,
          words: seg.words,
          zoom: seg.zoom ?? null,
          zoomInferred: false,
        })),
      );
    }

    if (p.locales.length) {
      await getDb().insert(s.locales).values(
        p.locales.map((code) => {
          const row = localeMatrix.find((l) => l.code === code);
          return {
            id: id("locale", `${p.id}:${code}`),
            projectId,
            code,
            status: p.status === "stale" ? ("stale" as const) : (row?.status ?? "published"),
            reviewerId: null,
            pinnedSegmentIds: row?.pinned ? [id("segment", p.segments[0]?.id ?? "none")] : [],
            progress: row?.progress ?? null,
          };
        }),
      );
    }

    // Published projects have live assets at stable slugs.
    if (p.status === "published" && p.outputs.length) {
      await getDb().insert(s.assets).values(
        p.outputs.map((kind) => ({
          id: id("asset", `${p.id}:${kind}`),
          workspaceId,
          projectId,
          kind,
          locale: "en-US",
          publicSlug: p.slug,
          storageKey: `${workspaceId}/assets/${p.id}/${kind}`,
          access: "public" as const,
          ctaUrl: "https://meridian.app/demo",
          publishedAt: new Date(p.updatedAt),
        })),
      );
    }
  }

  // --- audit trail ---------------------------------------------------------
  // Written through the audit writer rather than inserted directly, so the
  // seeded entry is chained like any other. A seed that bypasses the writer
  // would leave the first link unverifiable, and "the chain is broken but
  // it is fine, that one is from the seed" is not a thing anyone should
  // have to know.
  const { record } = await import("@/lib/audit/log");
  await record({
    workspaceId,
    actor: null,
    action: "workspace.seeded",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: { projects: projectFixtures.length, members: memberFixtures.length },
  });

  const counts = await getDb().execute(
    `SELECT 'workspaces' t, count(*) n FROM workspaces
     UNION ALL SELECT 'members', count(*) FROM members
     UNION ALL SELECT 'brand_kits', count(*) FROM brand_kits
     UNION ALL SELECT 'voices', count(*) FROM voices
     UNION ALL SELECT 'recordings', count(*) FROM recordings
     UNION ALL SELECT 'projects', count(*) FROM projects
     UNION ALL SELECT 'segments', count(*) FROM segments
     UNION ALL SELECT 'locales', count(*) FROM locales
     UNION ALL SELECT 'assets', count(*) FROM assets
     ORDER BY 1`,
  );
  console.table(counts);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
