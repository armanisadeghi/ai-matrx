-- target: branch
-- w0_sync_associations_triggers — THE LAST TWO `platform` OBJECTS THE BRANCH LACKED.
--
-- `platform.associations` carries two triggers on production that this branch never
-- received. Their functions — `platform.enforce_client_association_endpoint_access` and
-- `platform._retired_migrates_from_role` — landed in
-- `w0_sync_ruling_schema_functions.sql`; these are the triggers that actually make them
-- fire. §4.6 hands `platform.associations` to `W1-REL`, which replaces two OTHER triggers
-- on the same table and will read the live set before it does: a lane that rehearses
-- against fourteen triggers and ships against sixteen is rehearsing the wrong table.
--
-- Both definitions are production's own `pg_get_triggerdef` output, verbatim.
-- `DROP TRIGGER IF EXISTS` precedes each so the file is re-runnable; neither trigger
-- exists here, so neither DROP removes anything today.
--
--   uv run python db/apply_migrations.py --source campaign \
--     --only w0_sync_associations_triggers.sql --target branch --lane W0-SYNC --no-generate

DROP TRIGGER IF EXISTS trg_associations_aa_client_endpoint_access ON platform.associations;
CREATE TRIGGER trg_associations_aa_client_endpoint_access BEFORE INSERT OR UPDATE ON platform.associations FOR EACH ROW EXECUTE FUNCTION platform.enforce_client_association_endpoint_access();

DROP TRIGGER IF EXISTS trg_associations_ab_retired_migrates_from ON platform.associations;
CREATE TRIGGER trg_associations_ab_retired_migrates_from BEFORE INSERT OR UPDATE ON platform.associations FOR EACH ROW EXECUTE FUNCTION platform._retired_migrates_from_role();
