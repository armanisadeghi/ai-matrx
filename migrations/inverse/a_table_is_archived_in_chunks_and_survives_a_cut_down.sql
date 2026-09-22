-- INVERSE of migrations/campaign/a_table_is_archived_in_chunks_and_survives_a_cut.sql
-- (lane FIX-10B, VERIFIER-10 F3).
--
-- It shuts the one client door that file opened. Nothing else existed before it, so nothing
-- else is put back.
--
-- WHY THE FUNCTION ITSELF STAYS STANDING (the ground-standing rule, clauses (a) and (d)).
-- When this inverse was written, `custom.table_archive` was this lane's alone. It is not any
-- more: `custom.migrate_purge`, added later by
-- `migrations/campaign/storetails2_the_purge_archives_first_and_the_hard_delete_is_a_compliance_door.sql`,
-- calls it as its ONE chunked archive path, and `custom.migrate_purge` is named by the store
-- door's own refusal hint -- so the body is reachable from every `custom._store_door` trigger
-- on `custom.external_link`, `custom.external_source` and `custom.record`. Dropping it would
-- leave those triggers attached over a function that is gone: not a defect put back, a broken
-- store. So the behaviour this lane introduced is NEUTERED instead of demolished -- the client
-- door row goes, so no client can reach `custom.table_archive` any more, exactly as before this
-- lane ran -- and the body stays for the later migration that adopted it.
--
-- WHAT IT DOES NOT UNDO, AND SAYS SO: the records any run of `custom.table_archive` archived.
-- Those went through `custom.record_delete` and are soft-deleted, which is the store's own
-- reversible state — `custom.record_restore(organization, record)` brings any of them back,
-- one deliberate act at a time. A migration that un-archived a person's rows to tidy up after
-- itself would be the destructive thing this campaign never does.

begin;

-- The body is deliberately NOT dropped: see the header. `custom.migrate_purge` calls it.

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'table_archive';

commit;
