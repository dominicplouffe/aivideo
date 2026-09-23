-- Services a run's pages may call, apart from the sites it may open.
--
-- One list used to govern both, so an app whose login posts to its own API
-- on another domain could not sign in: the request was blocked and the
-- agent reported a wrong password. The agent never navigates to these
-- origins and never types a password into them; pages may only fetch them.
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "request_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;
