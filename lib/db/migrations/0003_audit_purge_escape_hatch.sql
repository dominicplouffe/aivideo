-- One named escape hatch, instead of an accidental one.
--
-- The append-only trigger made a hidden decision visible: deleting a
-- workspace cascades into its audit log, and "deleting the workspace erases
-- the evidence of who deleted it" is not a property anyone should ship by
-- accident.
--
-- But erasure is also a legal obligation, so the rule cannot simply be
-- "never". It is: an entry may never be *edited*, under any circumstances,
-- because there is no lawful reason to change what happened; and entries may
-- be *deleted* only inside a transaction that has explicitly declared it is
-- performing an erasure. A cascade from a routine workspace delete has not
-- declared anything, so it still fails loudly.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('demoriff.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation',
          HINT = 'Corrections are new entries. Erasure must set demoriff.audit_purge.';
END;
$$ LANGUAGE plpgsql;
