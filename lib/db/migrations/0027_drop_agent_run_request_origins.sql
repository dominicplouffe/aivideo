-- The list of services a run's pages might call is gone: pages load and call
-- whatever they need, and only where the tab itself goes is checked.
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "request_origins";
