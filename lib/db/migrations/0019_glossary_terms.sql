-- Words a workspace spells its own way.
--
-- A brand name the transcriber keeps getting wrong should be fixed once, not
-- in every recording. Each term maps what is heard to what is shown and,
-- when the spelling is not how the word is said, to what a narrator says.
CREATE TABLE IF NOT EXISTS "glossary_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "heard" text NOT NULL,
  "heard_key" text NOT NULL,
  "text" text NOT NULL,
  "spoken" text,
  "created_by" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "glossary_terms_workspace_heard_key"
  ON "glossary_terms" ("workspace_id", "heard_key");
