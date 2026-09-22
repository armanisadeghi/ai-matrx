-- chair-step: the inverse of
--   `migrations/campaign/oldtables_w7_a_moved_dataset_is_archived_and_says_where_it_went.sql`.
--   It drops the two `workbench` functions that file created and deletes the two
--   `platform.client_callable_door` rows and the one `platform.feature_knob` register row that
--   came with them. Nothing before 2026-09-22 held any of them.
--
--   IT DELETES NO `platform.knob_override` ROW, NO `workbench.udt_datasets` ROW AND NOTHING IN
--   THE RECORD STORE. An organization already moved keeps its override, its archived datasets
--   keep their `metadata.moved_to` pointer, and every record copied into the store stays
--   exactly where it is under its own id. Running this removes the DOORS, not the move: after
--   it, nothing can archive another dataset and nothing can bring an archived one back, which
--   is precisely why it is a chair step and not a routine undo.
--
--   TO UNDO AN ACTUAL MOVE, do it the other way round and before this file:
--     select workbench.udt_dataset_unarchive(<dataset id>);          -- once per dataset
--     delete from platform.knob_override
--      where feature = 'data_tables' and key = 'older_tables_moved'
--        and scope_kind = 'organization' and scope_id = <organization id>;
--
--   `drop function` = ACCESS SHARE on no table (DDL-LOCK census). Nothing here is
--   window-class and nothing here blocks a reader, a writer or a sign-in.
--
-- lock: platform
-- lane: OLD-TABLES-4

drop function if exists workbench.udt_dataset_archive(uuid, uuid, text);
drop function if exists workbench.udt_dataset_unarchive(uuid);

delete from platform.client_callable_door
 where schema_name = 'workbench'
   and function_name in ('udt_dataset_archive', 'udt_dataset_unarchive');

delete from platform.feature_knob
 where feature = 'data_tables'
   and key = 'older_tables_moved';
