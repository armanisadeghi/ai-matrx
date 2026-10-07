-- chair-step: drops 15 functions (and the 17 triggers that call them) that can never run — every one reads tables moved to the deprecated schema (udt_* and custom_record / custom_entity_definition). Census 2026-10-06: no caller in any live function body (names searched as substrings), no RLS policy, view, default or active cron job, no code call in matrx-frontend / aidream / matrx-local / matrx-extend; every trigger sits on a deprecated.* table. Plain DROP, no CASCADE, so an unexpected dependent refuses the whole file.
-- drop_dead_functions_on_retired_udt_and_custom_record_tables.sql
--
-- Deliberately NOT dropped (still reachable): the platform.cutover_* family and
-- workbench.udt_dataset_* / udt_structured_list_* archive doors (called by the
-- cut-over RPCs), workbench._udt_row_words (via udt_row_words_many),
-- workbench.dataset_readable_by (named in the T13 guard allowlist),
-- platform._custom_record_grant_guard (still attached to the live iam.permissions),
-- workbench._moved_older_table_takes_no_writes (the write block on the retired tables),
-- and public.udt_dataset_row_versions_trim(_scoped) (an inactive cron job names it).

-- triggers on retired tables, first
drop trigger _guard_custom_object on deprecated.custom_entity_definition;
drop trigger _guard_custom_record on deprecated.custom_record;
drop trigger trigger_cascade_udt_datasets_security on deprecated.udt_datasets;
drop trigger trigger_inherit_security_udt_dataset_fields on deprecated.udt_dataset_fields;
drop trigger trigger_inherit_security_udt_dataset_rows on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_validate on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_version_insert on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_version_delete on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_version_update on deprecated.udt_dataset_rows;
drop trigger guard_template_schema_mutation on deprecated.udt_dataset_fields;
drop trigger _udt_computed_on_update on deprecated.udt_dataset_rows;
drop trigger _udt_autonumber on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_relation_cells_take_ids on deprecated.udt_dataset_rows;
drop trigger udt_dataset_rows_activity on deprecated.udt_dataset_rows;

-- the functions
drop function platform._custom_entity_definition_guard();
drop function platform._custom_record_guard();
drop function public._d31_impl_add_data_row_to_user_table(uuid, jsonb);
drop function public._d31_impl_get_user_table_complete(uuid, text, text);
drop function public._d31_impl_update_user_list(uuid, character varying, text, boolean, boolean, boolean, jsonb);
drop function public._d31_impl_update_user_table_config(uuid, jsonb, jsonb);
drop function public._d31_impl_update_user_table_metadata(uuid, text, text, boolean, boolean);
drop function public.cascade_table_security_settings();
drop function public.inherit_table_security_on_insert();
drop function public.udt_dataset_rows_validate_trigger();
drop function public.udt_log_row_version();
drop function workbench.guard_template_schema_mutation();
drop function workbench.udt_assign_autonumbers();
drop function workbench.udt_relation_cells_take_ids();
drop function workbench.udt_row_activity();

-- a door follows its function: the three dropped functions that carried an access
-- declaration lose it in this same transaction (each name had exactly one overload)
delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name in ('_d31_impl_get_user_table_complete', '_d31_impl_update_user_list', '_d31_impl_update_user_table_config');
