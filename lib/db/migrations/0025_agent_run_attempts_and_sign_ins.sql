-- Fixing a run instead of copying it.
--
-- A run that failed before it made anything is edited and tried again as
-- the same run: `attempt` counts the tries, and each action in the trail
-- says which try it belongs to, so the history reads "Attempt 1 · stopped
-- at sign-in" rather than disappearing. A run that did make a project is
-- recorded again as a new run, which points back at the one it revises.
--
-- `sign_ins` is which stored sign-in the run uses on each site, chosen per
-- run and part of what is approved.
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "attempt" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "sign_ins" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "revised_from" uuid REFERENCES "agent_runs"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN IF NOT EXISTS "attempt" integer DEFAULT 1 NOT NULL;
