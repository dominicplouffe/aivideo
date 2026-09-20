ALTER TABLE "audit_events" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "prev_hash" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_workspace_seq_key" ON "audit_events" USING btree ("workspace_id","seq");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_seq_positive" CHECK ("audit_events"."seq" > 0);--> statement-breakpoint
-- Append-only, enforced by the database rather than by discipline.
--
-- Every application grows a code path that "just fixes up" a row, and an
-- audit log with such a path is a log of what someone wanted you to believe.
-- There is no UPDATE or DELETE here for anyone: a correction is a new entry
-- that says what was corrected.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation',
          HINT = 'Record a correcting entry instead of altering history.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
