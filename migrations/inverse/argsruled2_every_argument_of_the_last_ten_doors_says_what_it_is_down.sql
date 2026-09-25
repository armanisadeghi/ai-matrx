-- lock: platform
-- lane: ARGS-RULED-2
--
-- INVERSE of migrations/campaign/argsruled2_every_argument_of_the_last_ten_doors_says_what_it_is.sql:
-- every door row's argument_rules goes back to exactly what it held on the MAIN database on
-- 2026-09-23 before that file ran. Rule 27 only.

set lock_timeout = '2s';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'custom' and function_name = 'hub_changed_by' and identity_args = 'p_organization_id uuid, p_kind text, p_ids uuid[]';

update platform.client_callable_door
   set argument_rules = '{"version": 1, "arguments": {"p_rows": {"type": "jsonb", "check": "the rows of the file, read ONLY for their header names and up to twelve sample values a column, so the store can infer what each new column holds. Nothing in them reaches an access decision and no row is written.", "optional": false, "position": 3, "null_rule": {"default": "[]"}}, "p_mapping": {"type": "jsonb", "check": "headers the person has already mapped to columns by hand; a mapped header is never declared as a new column. It decides nothing but which headers are left over.", "optional": true, "position": 4, "null_rule": {"default": "{}"}}, "p_table_id": {"type": "uuid", "check": "the custom Table the columns are added to; it is handed to custom.assert_client_may_change, which is where the admin rung on the Table is decided.", "entity": null, "optional": false, "position": 2, "null_rule": {"sqlstate": "23503"}, "entity_reason": "Access is decided by organization_id and the admin rung on this Table, asked before anything is declared; the id names the table the new Field documents point at."}, "p_organization_id": {"type": "uuid", "check": "the organization of the caller: it is handed to custom.assert_store_door and custom.assert_client_may_change, and every column declared is written into the Field kernel of that organization.", "entity": null, "optional": false, "position": 1, "null_rule": {"sqlstate": "22004"}, "entity_reason": "It is an organization id and this door makes no access decision with it beyond handing it to the two predicates custom.field_declare already uses."}}}'::jsonb
 where schema_name = 'custom' and function_name = 'io_import_declare_columns' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb';

update platform.client_callable_door
   set argument_rules = '{"version": 1, "arguments": {"p_reason": {"type": "text", "check": "free text, stored as written", "optional": true, "position": 4, "null_rule": {"means": "no reason was typed"}, "sql_default": "NULL"}, "p_portal_id": {"type": "uuid", "check": "narrowed to p_organization_id in the lookup, then custom.assert_client_may_change(client_table_id, admin, table)", "access": "admin on the portal''s client Table", "entity": "portal", "foreign": {"sqlstate": "02000", "same_as_invented": true}, "optional": false, "position": 2, "null_rule": {"sqlstate": "02000"}}, "p_confirm_title": {"type": "text", "check": "compared to the portal''s stored title; never selects a row", "optional": false, "position": 3, "null_rule": {"sqlstate": "23514"}}, "p_organization_id": {"type": "uuid", "check": "custom.assert_client_may_reach(p_organization_id) — a non-member is refused 42501 before any read", "access": "member", "entity": "organization", "optional": false, "position": 1, "null_rule": {"sqlstate": "42501"}}}, "declared_by": "orgcleanup_a_portal_is_archived_never_deleted.sql"}'::jsonb
 where schema_name = 'custom' and function_name = 'portal_archive' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text, p_reason text';

update platform.client_callable_door
   set argument_rules = '{"version": 1, "arguments": {"p_portal_id": {"type": "uuid", "check": "narrowed to p_organization_id, then custom.assert_client_may_change(client_table_id, admin, table)", "access": "admin on the portal''s client Table", "entity": "portal", "foreign": {"sqlstate": "02000", "same_as_invented": true}, "optional": false, "position": 2, "null_rule": {"sqlstate": "02000"}}, "p_confirm_title": {"type": "text", "check": "compared to the portal''s stored title; never selects a row", "optional": false, "position": 3, "null_rule": {"sqlstate": "23514"}}, "p_organization_id": {"type": "uuid", "check": "custom.assert_client_may_reach(p_organization_id)", "access": "member", "entity": "organization", "optional": false, "position": 1, "null_rule": {"sqlstate": "42501"}}}, "declared_by": "orgcleanup_a_portal_is_archived_never_deleted.sql"}'::jsonb
 where schema_name = 'custom' and function_name = 'portal_restore' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'custom' and function_name = 'table_archive' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_chunk integer, p_include_table boolean';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'public' and function_name = 'cat_write' and identity_args = 'p_dimension text, p_category_id uuid, p_organization_id uuid, p_name text, p_slug text, p_set_slug boolean, p_parent_id uuid, p_set_parent boolean, p_color text, p_set_color boolean, p_icon text, p_set_icon boolean, p_position integer, p_set_position boolean, p_placement_type text, p_set_placement_type boolean, p_metadata_patch jsonb, p_is_system boolean';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'public' and function_name = 'fork_processed_document' and identity_args = 'p_source_id uuid, p_organization_id uuid';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'public' and function_name = 'fork_shared_flashcard_set' and identity_args = 'p_set_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door
   set argument_rules = NULL
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text';
