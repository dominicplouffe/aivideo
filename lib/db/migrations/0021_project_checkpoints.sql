-- A project's edit, as it stood at a moment worth going back to.
--
-- Taken before anything changes the edit on a person's behalf — an AI cut,
-- a restore — so "I don't like it" is one click, not a copy of the project.
-- The edit only: chapters and the recording are not touched by these.
CREATE TABLE IF NOT EXISTS "project_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "kind" text NOT NULL,
  "edit_state" jsonb NOT NULL,
  "created_by" uuid REFERENCES "members"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_checkpoints_project_idx"
  ON "project_checkpoints" ("project_id", "created_at");
