-- AuthKit returns an organization, not a connection.
--
-- `organization_id` has been on this table since 0007 and nothing ever read
-- it: workspace resolution went through `connection_id`, because the old
-- `/sso/token` exchange returned one. The User Management API does not — an
-- enterprise login comes back carrying `organization_id` — so that column
-- becomes the binding, and it needs the guarantee the connection already has.
--
-- Partial, because the column is nullable and a workspace that has not set up
-- single sign-on has no organization. Several nulls are not a conflict; two
-- workspaces claiming one organization is, and without this index the second
-- one would quietly start receiving the first one's logins.
CREATE UNIQUE INDEX IF NOT EXISTS "sso_connections_organization_key"
  ON "sso_connections" ("organization_id")
  WHERE "organization_id" IS NOT NULL;
--> statement-breakpoint
-- Signing out here has to sign the person out at the identity provider too.
-- Without this, "sign out" followed by "continue with Google" silently
-- re-authenticates against the still-live upstream session, which to the
-- person looks exactly like sign-out having done nothing.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "workos_session_id" text;
