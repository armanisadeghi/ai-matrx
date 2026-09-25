-- lock: platform
-- lane: ARGS-RULED-2
--
-- INVERSE of migrations/campaign/argsruled2_the_last_ten_doors_can_be_called_by_their_contract.sql: the ten
-- contract_probe values go back to NULL, which is what they held. Rule 27 only.

set lock_timeout = '2s';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'custom' and function_name = 'hub_changed_by' and identity_args = 'p_organization_id uuid, p_kind text, p_ids uuid[]';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'custom' and function_name = 'io_import_declare_columns' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'custom' and function_name = 'portal_archive' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text, p_reason text';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'custom' and function_name = 'portal_restore' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'custom' and function_name = 'table_archive' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_chunk integer, p_include_table boolean';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'public' and function_name = 'cat_write' and identity_args = 'p_dimension text, p_category_id uuid, p_organization_id uuid, p_name text, p_slug text, p_set_slug boolean, p_parent_id uuid, p_set_parent boolean, p_color text, p_set_color boolean, p_icon text, p_set_icon boolean, p_position integer, p_set_position boolean, p_placement_type text, p_set_placement_type boolean, p_metadata_patch jsonb, p_is_system boolean';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'public' and function_name = 'fork_processed_document' and identity_args = 'p_source_id uuid, p_organization_id uuid';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'public' and function_name = 'fork_shared_flashcard_set' and identity_args = 'p_set_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door set contract_probe = NULL
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text';
