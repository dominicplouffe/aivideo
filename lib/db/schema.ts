import {
  pgTable, pgEnum, text, uuid, integer, real, boolean, timestamp,
  jsonb, index, uniqueIndex, primaryKey, check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
   Enums
   ============================================================ */

export const planEnum = pgEnum("plan", ["free", "starter", "team", "scale", "enterprise"]);
export const regionEnum = pgEnum("region", ["us", "eu", "au"]);
export const roleEnum = pgEnum("member_role", ["owner", "admin", "creator", "reviewer", "viewer"]);
export const projectStatusEnum = pgEnum("project_status", ["draft", "processing", "ready", "published", "stale"]);
export const recordingSourceEnum = pgEnum("recording_source", ["extension", "desktop", "upload", "connector", "agent"]);
export const recordingStatusEnum = pgEnum("recording_status", ["awaiting_upload", "uploaded", "transcribing", "ready", "failed"]);
export const outputKindEnum = pgEnum("output_kind", ["video", "guide", "interactive", "clips"]);
export const renderStatusEnum = pgEnum("render_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const localeStatusEnum = pgEnum("locale_status", ["none", "queued", "rendering", "published", "stale"]);
export const voiceKindEnum = pgEnum("voice_kind", ["studio", "clone"]);
export const maskRuleTypeEnum = pgEnum("mask_rule_type", ["detector", "selector", "region", "pattern"]);
export const assetAccessEnum = pgEnum("asset_access", ["public", "email_gate", "password", "domain", "personalized"]);

/* ============================================================
   Workspaces and people
   ============================================================ */

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    plan: planEnum("plan").notNull().default("free"),
    region: regionEnum("region").notNull().default("us"),
    seatsTotal: integer("seats_total").notNull().default(1),
    // Metered in seconds so partial minutes never round in our favour.
    videoSecondsLimit: integer("video_seconds_limit").notNull().default(600),
    videoSecondsUsed: integer("video_seconds_used").notNull().default(0),
    periodStartsAt: timestamp("period_starts_at", { withTimezone: true }).notNull().defaultNow(),
    shareDomain: text("share_domain"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workspaces_slug_key").on(t.slug),
    check("workspaces_usage_nonneg", sql`${t.videoSecondsUsed} >= 0`),
    check("workspaces_limit_nonneg", sql`${t.videoSecondsLimit} >= 0`),
  ],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("creator"),
    // Set when the account arrives via SCIM, so we never overwrite directory state.
    externalId: text("external_id"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("members_workspace_email_key").on(t.workspaceId, t.email),
    index("members_workspace_idx").on(t.workspaceId),
  ],
);

/* ============================================================
   Brand, voices, masking
   ============================================================ */

export const brandKits = pgTable(
  "brand_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Locked kits cannot be overridden by a creator at render time.
    locked: boolean("locked").notNull().default(false),
    // The twelve design tokens, versioned as a whole so a change can be diffed.
    tokens: jsonb("tokens").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("brand_kits_workspace_name_key").on(t.workspaceId, t.name),
    index("brand_kits_workspace_idx").on(t.workspaceId),
  ],
);

export const voices = pgTable(
  "voices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Studio voices are global; clones belong to one workspace.
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    providerVoiceId: text("provider_voice_id").notNull(),
    name: text("name").notNull(),
    descriptor: text("descriptor"),
    accent: text("accent"),
    kind: voiceKindEnum("kind").notNull().default("studio"),
    // Consent is a property of the person, not the workspace. Revoking it
    // must stop future renders, so it is stored with the voice itself.
    consentSubjectId: uuid("consent_subject_id").references(() => members.id, { onDelete: "set null" }),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
    consentAudioKey: text("consent_audio_key"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("voices_workspace_idx").on(t.workspaceId),
    uniqueIndex("voices_provider_scope_key").on(t.providerVoiceId, t.workspaceId),
    // A clone without a consent record must never exist.
    check(
      "voices_clone_requires_consent",
      sql`${t.kind} <> 'clone' OR (${t.consentSubjectId} IS NOT NULL AND ${t.consentRecordedAt} IS NOT NULL)`,
    ),
  ],
);

export const maskingPolicies = pgTable(
  "masking_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Enforced policies cannot be disabled by the person recording.
    enforced: boolean("enforced").notNull().default(false),
    rules: jsonb("rules").$type<{ type: string; [k: string]: unknown }[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("masking_policies_workspace_name_key").on(t.workspaceId, t.name)],
);

/* ============================================================
   Recordings — the immutable source
   ============================================================ */

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    source: recordingSourceEnum("source").notNull(),
    status: recordingStatusEnum("status").notNull().default("awaiting_upload"),
    // Storage key, never a URL — URLs are signed per request.
    mediaKey: text("media_key"),
    bytes: integer("bytes"),
    durationSec: real("duration_sec"),
    width: integer("width"),
    height: integer("height"),
    fps: integer("fps"),
    maskingPolicyId: uuid("masking_policy_id").references(() => maskingPolicies.id, { onDelete: "set null" }),
    // The interaction log: what was clicked, not just where. This is what
    // makes automatic direction possible rather than approximate.
    events: jsonb("events").$type<unknown[]>(),
    // Word-level alignment. Segment-level would not support the edit model.
    transcript: jsonb("transcript").$type<{ language: string; words: unknown[] } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("recordings_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("recordings_status_idx").on(t.status),
  ],
);

/* ============================================================
   Projects and segments — the editing surface
   ============================================================ */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    recordingId: uuid("recording_id").references(() => recordings.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => members.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("draft"),
    collection: text("collection"),
    brandKitId: uuid("brand_kit_id").references(() => brandKits.id, { onDelete: "set null" }),
    voiceId: uuid("voice_id").references(() => voices.id, { onDelete: "set null" }),
    // Edit decisions live here: which words are cut, which scenes deleted,
    // and the toggles. The finished duration is derived from this plus
    // segments, never stored as an independent number that could drift.
    editState: jsonb("edit_state").$type<Record<string, unknown>>().notNull().default({}),
    sourceDurationSec: real("source_duration_sec"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("projects_workspace_slug_key").on(t.workspaceId, t.slug),
    index("projects_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
    index("projects_status_idx").on(t.workspaceId, t.status),
  ],
);

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    // The interaction this segment is built around, e.g. click → #new-shipment.
    action: text("action"),
    // Word-level rows: {w, t, d, cut?, em?}. The edited timeline is computed
    // from these, so removing fillers genuinely shortens the output.
    words: jsonb("words").$type<{ w: string; t: number; d: number; cut?: boolean; em?: boolean }[]>().notNull(),
    // Camera direction. Null means the director suppressed a zoom here.
    zoom: jsonb("zoom").$type<{ scale: number; x: number; y: number; easing?: string } | null>(),
    // True when inferred from cursor dynamics rather than captured intent.
    zoomInferred: boolean("zoom_inferred").notNull().default(false),
  },
  (t) => [
    uniqueIndex("segments_project_ordinal_key").on(t.projectId, t.ordinal),
    index("segments_project_idx").on(t.projectId),
    check("segments_time_ordered", sql`${t.endSec} >= ${t.startSec}`),
  ],
);

/* ============================================================
   Renders, assets, locales
   ============================================================ */

export const renders = pgTable(
  "renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    status: renderStatusEnum("status").notNull().default("queued"),
    outputs: jsonb("outputs").$type<Record<string, { status: string; key?: string }>>().notNull().default({}),
    locales: jsonb("locales").$type<string[]>().notNull().default([]),
    // The edit decision list the worker consumes. Snapshotted at submit time
    // so a later edit cannot change what a running render produces.
    edl: jsonb("edl").$type<Record<string, unknown>>(),
    // Only finished video seconds are billed; derived assets are free.
    secondsBilled: integer("seconds_billed").notNull().default(0),
    // Replaying a key returns the original render instead of duplicating work.
    idempotencyKey: text("idempotency_key"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    webhookUrl: text("webhook_url"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("renders_idempotency_key").on(t.workspaceId, t.idempotencyKey),
    index("renders_project_idx").on(t.projectId),
    index("renders_status_queued_idx").on(t.status, t.queuedAt),
    check("renders_seconds_nonneg", sql`${t.secondsBilled} >= 0`),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    renderId: uuid("render_id").references(() => renders.id, { onDelete: "set null" }),
    kind: outputKindEnum("kind").notNull(),
    locale: text("locale").notNull().default("en-US"),
    // Stable across re-renders, so embeds never break when content updates.
    publicSlug: text("public_slug").notNull(),
    storageKey: text("storage_key"),
    access: assetAccessEnum("access").notNull().default("public"),
    ctaUrl: text("cta_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assets_public_slug_key").on(t.publicSlug, t.locale, t.kind),
    index("assets_project_idx").on(t.projectId),
  ],
);

export const locales = pgTable(
  "locales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: localeStatusEnum("status").notNull().default("none"),
    reviewerId: uuid("reviewer_id").references(() => members.id, { onDelete: "set null" }),
    // Pinned segments preserve a reviewer's manual correction across
    // regeneration — without this, reviewers stop reviewing.
    pinnedSegmentIds: jsonb("pinned_segment_ids").$type<string[]>().notNull().default([]),
    // Compared against the source project to detect staleness.
    sourceVersion: integer("source_version").notNull().default(0),
    progress: real("progress"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("locales_project_code_key").on(t.projectId, t.code),
    index("locales_status_idx").on(t.status),
  ],
);

/* ============================================================
   Audit — append only
   ============================================================ */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => members.id, { onDelete: "set null" }),
    // Retained even when the member row is gone, so the trail survives offboarding.
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    ip: text("ip"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_resource_idx").on(t.resourceType, t.resourceId),
  ],
);

/* ============================================================
   Relations
   ============================================================ */

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(members),
  projects: many(projects),
  recordings: many(recordings),
  brandKits: many(brandKits),
}));

export const projectRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  recording: one(recordings, { fields: [projects.recordingId], references: [recordings.id] }),
  owner: one(members, { fields: [projects.ownerId], references: [members.id] }),
  brandKit: one(brandKits, { fields: [projects.brandKitId], references: [brandKits.id] }),
  voice: one(voices, { fields: [projects.voiceId], references: [voices.id] }),
  segments: many(segments),
  renders: many(renders),
  assets: many(assets),
  locales: many(locales),
}));

export const segmentRelations = relations(segments, ({ one }) => ({
  project: one(projects, { fields: [segments.projectId], references: [projects.id] }),
}));

export const memberRelations = relations(members, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [members.workspaceId], references: [workspaces.id] }),
  projects: many(projects),
}));

export const renderRelations = relations(renders, ({ one, many }) => ({
  project: one(projects, { fields: [renders.projectId], references: [projects.id] }),
  assets: many(assets),
}));

export const localeRelations = relations(locales, ({ one }) => ({
  project: one(projects, { fields: [locales.projectId], references: [projects.id] }),
  reviewer: one(members, { fields: [locales.reviewerId], references: [members.id] }),
}));
