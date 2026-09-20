CREATE TYPE "public"."siem_format" AS ENUM('json', 'cef', 'ecs');--> statement-breakpoint
CREATE TABLE "siem_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "siem_format" DEFAULT 'json' NOT NULL,
	"url" text NOT NULL,
	"auth_header_name" text,
	"auth_value_sealed" text,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "siem_destinations" ADD CONSTRAINT "siem_destinations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "siem_destinations_workspace_name_key" ON "siem_destinations" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "siem_destinations_workspace_idx" ON "siem_destinations" USING btree ("workspace_id");