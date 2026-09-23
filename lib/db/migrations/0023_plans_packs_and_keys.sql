-- The catalogue is now Free, Bring your own keys, Studio and Enterprise.
--
-- Workspaces on the three plans that no longer exist read as Studio, the
-- nearest by price and shape. Studio sells more projects in packs; BYOK runs
-- on a twelve-month term; and a workspace on BYOK holds its own vendor keys,
-- sealed the same way the connectors' credentials are.
UPDATE "workspaces" SET "plan" = 'studio', "video_seconds_limit" = 9000
  WHERE "plan" IN ('starter', 'team', 'scale');
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "project_packs" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "plan_term_ends_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_vendor_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "vendor" text NOT NULL,
  "key_sealed" text NOT NULL,
  "last4" text NOT NULL,
  "verified_at" timestamp with time zone,
  "created_by" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_vendor_keys_workspace_vendor_key"
  ON "workspace_vendor_keys" ("workspace_id", "vendor");
