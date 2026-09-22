-- INVERSE of migrations/campaign/a_table_is_archived_in_chunks_and_survives_a_cut.sql
-- (lane FIX-10B, VERIFIER-10 F3).
--
-- It drops the one function that file added and its door row. Nothing else existed before it,
-- so nothing else is put back.
--
-- WHAT IT DOES NOT UNDO, AND SAYS SO: the records any run of `custom.table_archive` archived.
-- Those went through `custom.record_delete` and are soft-deleted, which is the store's own
-- reversible state — `custom.record_restore(organization, record)` brings any of them back,
-- one deliberate act at a time. A migration that un-archived a person's rows to tidy up after
-- itself would be the destructive thing this campaign never does.

begin;

drop function if exists custom.table_archive(uuid, uuid, integer, boolean);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'table_archive';

commit;
