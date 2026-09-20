CREATE TABLE "sso_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text DEFAULT 'workos' NOT NULL,
	"connection_id" text NOT NULL,
	"organization_id" text,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_role" "member_role" DEFAULT 'viewer' NOT NULL,
	"role_mappings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"just_in_time" boolean DEFAULT true NOT NULL,
	"scim_token_hash" text,
	"scim_token_hint" text,
	"scim_token_issued_at" timestamp with time zone,
	"scim_last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_connections_connection_key" ON "sso_connections" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_connections_scim_token_key" ON "sso_connections" USING btree ("scim_token_hash");--> statement-breakpoint
CREATE INDEX "sso_connections_workspace_idx" ON "sso_connections" USING btree ("workspace_id");