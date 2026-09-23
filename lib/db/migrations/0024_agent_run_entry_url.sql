-- Where a run starts, as the person asking typed it. Kept so a run can be
-- revised with every field it was created with, not only its brief.
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "entry_url" text;
