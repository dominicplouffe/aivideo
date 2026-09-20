CREATE TYPE "public"."usage_kind" AS ENUM('render', 'topup', 'credit', 'adjustment');--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"seconds" integer NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"period_starts_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "topup_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "hard_stop_at_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "usage_notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_idempotency_key" ON "usage_events" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "usage_events_period_idx" ON "usage_events" USING btree ("workspace_id","period_starts_at");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_topup_nonneg" CHECK ("workspaces"."topup_seconds" >= 0);