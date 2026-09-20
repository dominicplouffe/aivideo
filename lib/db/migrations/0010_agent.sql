CREATE TYPE "public"."agent_action_kind" AS ENUM('navigate', 'click', 'type', 'select', 'wait', 'scroll', 'assert', 'screenshot', 'refused');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('drafted', 'outlining', 'awaiting_approval', 'approved', 'recording', 'recorded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "agent_action_kind" NOT NULL,
	"outline_ordinal" integer,
	"url" text,
	"target" text,
	"detail" jsonb,
	"refused_reason" text,
	"at_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"label" text NOT NULL,
	"origin" text NOT NULL,
	"username" text,
	"secret_sealed" text NOT NULL,
	"rotated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"brief" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'drafted' NOT NULL,
	"outline" jsonb,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by" uuid,
	"requested_by_email" text,
	"approved_by" uuid,
	"approved_by_email" text,
	"approved_at" timestamp with time zone,
	"approved_outline_hash" text,
	"recording_id" uuid,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requested_by_members_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_approved_by_members_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_actions_run_ordinal_key" ON "agent_actions" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "agent_actions_run_idx" ON "agent_actions" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_credentials_workspace_label_key" ON "agent_credentials" USING btree ("workspace_id","label");--> statement-breakpoint
CREATE INDEX "agent_credentials_workspace_idx" ON "agent_credentials" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_idx" ON "agent_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");