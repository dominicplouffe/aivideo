CREATE TABLE "analytics_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"visitor_key" text NOT NULL,
	"day" date NOT NULL,
	"from_origin" text,
	"locale" text,
	"device_kind" text,
	"watched" bit varying,
	"asset_seconds" integer NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"reached_end" boolean DEFAULT false NOT NULL,
	"cta_clicked" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_watched_nonneg" CHECK ("analytics_sessions"."watched_seconds" >= 0),
	CONSTRAINT "analytics_asset_seconds_positive" CHECK ("analytics_sessions"."asset_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_sessions_dedupe" ON "analytics_sessions" USING btree ("project_id","visitor_key","day");--> statement-breakpoint
CREATE INDEX "analytics_sessions_project_idx" ON "analytics_sessions" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_workspace_idx" ON "analytics_sessions" USING btree ("workspace_id","started_at");