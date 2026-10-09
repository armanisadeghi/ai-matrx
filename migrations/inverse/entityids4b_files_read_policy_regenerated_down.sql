-- chair-step: it regenerates the files.files read policy from iam.entity_read_expr after the entityids4a inverse put the generator back (the record child lane no longer asks the kernel about a parent no file names), then drops iam.child_parent_fresh_allows
-- lane: ENTITY-IDS-4
-- window-class: iam.apply_rls on files.files (policy DDL)
-- Inverse of migrations/campaign/entityids4b_files_read_policy_regenerated.sql; run after
-- migrations/inverse/entityids4a_fresh_rows_links_and_archived_files_down.sql.
select iam.apply_rls('files', 'files', 'file', 'entity');
drop function if exists iam.child_parent_fresh_allows(text, text, uuid);
delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'child_parent_fresh_allows';
