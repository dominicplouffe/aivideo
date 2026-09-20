CREATE TYPE "public"."asset_access" AS ENUM('public', 'email_gate', 'password', 'domain', 'personalized');--> statement-breakpoint
CREATE TYPE "public"."locale_status" AS ENUM('none', 'queued', 'rendering', 'published', 'stale');--> statement-breakpoint
CREATE TYPE "public"."mask_rule_type" AS ENUM('detector', 'selector', 'region', 'pattern');--> statement-breakpoint
CREATE TYPE "public"."output_kind" AS ENUM('video', 'guide', 'interactive', 'clips');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'starter', 'team', 'scale', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'processing', 'ready', 'published', 'stale');--> statement-breakpoint
CREATE TYPE "public"."recording_source" AS ENUM('extension', 'desktop', 'upload', 'connector', 'agent');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('awaiting_upload', 'uploaded', 'transcribing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('us', 'eu', 'au');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'creator', 'reviewer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."voice_kind" AS ENUM('studio', 'clone');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"render_id" uuid,
	"kind" "output_kind" NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"public_slug" text NOT NULL,
	"storage_key" text,
	"access" "asset_access" DEFAULT 'public' NOT NULL,
	"cta_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"ip" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"tokens" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" "locale_status" DEFAULT 'none' NOT NULL,
	"reviewer_id" uuid,
	"pinned_segment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_version" integer DEFAULT 0 NOT NULL,
	"progress" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "masking_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "member_role" DEFAULT 'creator' NOT NULL,
	"external_id" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recording_id" uuid,
	"owner_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"collection" text,
	"brand_kit_id" uuid,
	"voice_id" uuid,
	"edit_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_duration_sec" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid,
	"source" "recording_source" NOT NULL,
	"status" "recording_status" DEFAULT 'awaiting_upload' NOT NULL,
	"media_key" text,
	"bytes" integer,
	"duration_sec" real,
	"width" integer,
	"height" integer,
	"fps" integer,
	"masking_policy_id" uuid,
	"events" jsonb,
	"transcript" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "render_status" DEFAULT 'queued' NOT NULL,
	"outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edl" jsonb,
	"seconds_billed" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"webhook_url" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "renders_seconds_nonneg" CHECK ("renders"."seconds_billed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"start_sec" real NOT NULL,
	"end_sec" real NOT NULL,
	"action" text,
	"words" jsonb NOT NULL,
	"zoom" jsonb,
	"zoom_inferred" boolean DEFAULT false NOT NULL,
	CONSTRAINT "segments_time_ordered" CHECK ("segments"."end_sec" >= "segments"."start_sec")
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"provider_voice_id" text NOT NULL,
	"name" text NOT NULL,
	"descriptor" text,
	"accent" text,
	"kind" "voice_kind" DEFAULT 'studio' NOT NULL,
	"consent_subject_id" uuid,
	"consent_recorded_at" timestamp with time zone,
	"consent_audio_key" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voices_clone_requires_consent" CHECK ("voices"."kind" <> 'clone' OR ("voices"."consent_subject_id" IS NOT NULL AND "voices"."consent_recorded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"region" "region" DEFAULT 'us' NOT NULL,
	"seats_total" integer DEFAULT 1 NOT NULL,
	"video_seconds_limit" integer DEFAULT 600 NOT NULL,
	"video_seconds_used" integer DEFAULT 0 NOT NULL,
	"period_starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"share_domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "workspaces_usage_nonneg" CHECK ("workspaces"."video_seconds_used" >= 0),
	CONSTRAINT "workspaces_limit_nonneg" CHECK ("workspaces"."video_seconds_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_render_id_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."renders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locales" ADD CONSTRAINT "locales_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locales" ADD CONSTRAINT "locales_reviewer_id_members_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "masking_policies" ADD CONSTRAINT "masking_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_brand_kit_id_brand_kits_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_voice_id_voices_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."voices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_masking_policy_id_masking_policies_id_fk" FOREIGN KEY ("masking_policy_id") REFERENCES "public"."masking_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voices" ADD CONSTRAINT "voices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voices" ADD CONSTRAINT "voices_consent_subject_id_members_id_fk" FOREIGN KEY ("consent_subject_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_public_slug_key" ON "assets" USING btree ("public_slug","locale","kind");--> statement-breakpoint
CREATE INDEX "assets_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audit_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kits_workspace_name_key" ON "brand_kits" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "brand_kits_workspace_idx" ON "brand_kits" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locales_project_code_key" ON "locales" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "locales_status_idx" ON "locales" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "masking_policies_workspace_name_key" ON "masking_policies" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "members_workspace_email_key" ON "members" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "members_workspace_idx" ON "members" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_slug_key" ON "projects" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "projects_workspace_updated_idx" ON "projects" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "recordings_workspace_created_idx" ON "recordings" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "recordings_status_idx" ON "recordings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "renders_idempotency_key" ON "renders" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "renders_project_idx" ON "renders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "renders_status_queued_idx" ON "renders" USING btree ("status","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_project_ordinal_key" ON "segments" USING btree ("project_id","ordinal");--> statement-breakpoint
CREATE INDEX "segments_project_idx" ON "segments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "voices_workspace_idx" ON "voices" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voices_provider_scope_key" ON "voices" USING btree ("provider_voice_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces" USING btree ("slug");