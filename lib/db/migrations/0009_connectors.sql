CREATE TYPE "public"."connector_link_state" AS ENUM('in_sync', 'local_ahead', 'remote_ahead', 'diverged', 'unlinked');--> statement-breakpoint
CREATE TYPE "public"."connector_vendor" AS ENUM('zendesk', 'intercom', 'helpscout', 'notion', 'confluence');--> statement-breakpoint
CREATE TABLE "connector_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vendor" "connector_vendor" NOT NULL,
	"base_url" text NOT NULL,
	"container_id" text,
	"container_name" text,
	"credentials_sealed" text,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connector_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"pushed_hash" text,
	"remote_hash" text,
	"state" "connector_link_state" DEFAULT 'in_sync' NOT NULL,
	"last_pushed_at" timestamp with time zone,
	"last_pulled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_links" ADD CONSTRAINT "connector_links_installation_id_connector_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."connector_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_links" ADD CONSTRAINT "connector_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connector_installations_workspace_vendor_key" ON "connector_installations" USING btree ("workspace_id","vendor","base_url");--> statement-breakpoint
CREATE INDEX "connector_installations_workspace_idx" ON "connector_installations" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_links_installation_project_key" ON "connector_links" USING btree ("installation_id","project_id","locale");--> statement-breakpoint
CREATE INDEX "connector_links_project_idx" ON "connector_links" USING btree ("project_id");