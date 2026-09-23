-- chair-step: ten UPDATEs on our own door register (platform.client_callable_door.contract_probe).
--   NON-ADDITIVE BY CONSTRUCTION. Nothing is created, dropped or granted, no function body is
--   touched, and no row of anybody's data is read, written or moved. Inverse:
--   migrations/inverse/argsruled2_the_last_ten_doors_can_be_called_by_their_contract_down.sql
--   (all ten were NULL).
-- lock: platform
-- lane: ARGS-RULED-2
--
-- ARGS-RULED-2 — THE TEN DOORS WHOSE ARGUMENTS WERE JUST RULED CAN NOW BE EXECUTED BY THE
-- GENERATED DOOR CONTRACT.
--
-- `aidream/db/generate_door_contract_test.py` turns `argument_rules` into a live pytest, but it
-- emits a door only when `contract_probe` says how to CALL it: a legal value for every argument
-- and, for every entity id, the foreign and invented value to put in its place. None of the ten
-- had one, so the rules written by
-- argsruled2_every_argument_of_the_last_ten_doors_says_what_it_is.sql were declarations no test
-- executed — lesson 28's "a declared rule no test executes is a wish".
--
-- Every `{placeholder}` names an id the world module seeds inside the test's own rolled-back
-- transaction: aidream/tests/door_contracts/argsruled2_door_world.py (Willow Creek Veterinary
-- Clinic, the caller's organization, and High Desert Equine Services, a tenant she is not in).

set lock_timeout = '4s';

update platform.client_callable_door set contract_probe = '{"p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_kind": {"type": "text", "legal": "structure"}, "p_ids": {"type": "uuid[]", "legal": "{{table}}", "foreign_value": "{{foreign_table}}", "invented_value": "{{invented}}"}}'::jsonb
 where schema_name = 'custom' and function_name = 'hub_changed_by' and identity_args = 'p_organization_id uuid, p_kind text, p_ids uuid[]';

update platform.client_callable_door set contract_probe = '{"p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_table_id": {"type": "uuid", "legal": "{table}", "foreign_value": "{foreign_table}", "invented_value": "{invented}"}, "p_rows": {"type": "jsonb", "legal": "[]"}, "p_mapping": {"type": "jsonb", "legal": "{}"}}'::jsonb
 where schema_name = 'custom' and function_name = 'io_import_declare_columns' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb';

update platform.client_callable_door set contract_probe = '{"p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_portal_id": {"type": "uuid", "legal": "{portal}", "foreign_value": "{foreign_portal}", "invented_value": "{invented}"}, "p_confirm_title": {"type": "text", "legal": "{portal_title}"}, "p_reason": {"type": "text", "legal": "The clinic moved client records to the new booking portal."}}'::jsonb
 where schema_name = 'custom' and function_name = 'portal_archive' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text, p_reason text';

update platform.client_callable_door set contract_probe = '{"p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_portal_id": {"type": "uuid", "legal": "{portal}", "foreign_value": "{foreign_portal}", "invented_value": "{invented}"}, "p_confirm_title": {"type": "text", "legal": "{portal_title}"}}'::jsonb
 where schema_name = 'custom' and function_name = 'portal_restore' and identity_args = 'p_organization_id uuid, p_portal_id uuid, p_confirm_title text';

update platform.client_callable_door set contract_probe = '{"p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_table_id": {"type": "uuid", "legal": "{table}", "foreign_value": "{foreign_table}", "invented_value": "{invented}"}, "p_chunk": {"type": "integer", "legal": "0"}, "p_include_table": {"type": "boolean", "legal": "false"}}'::jsonb
 where schema_name = 'custom' and function_name = 'table_archive' and identity_args = 'p_organization_id uuid, p_table_id uuid, p_chunk integer, p_include_table boolean';

update platform.client_callable_door set contract_probe = '{"p_dimension": {"type": "text", "legal": "feedback"}, "p_category_id": {"type": "uuid", "legal": null, "foreign_value": "{foreign_cat}", "invented_value": "{invented}"}, "p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_name": {"type": "text", "legal": "Dental cleaning follow-up", "null_outcome": {"sqlstate": "22004", "why": "the legal call CREATES, and a created category needs a name"}}, "p_slug": {"type": "text", "legal": null}, "p_set_slug": {"type": "boolean", "legal": "false"}, "p_parent_id": {"type": "uuid", "legal": null, "foreign_value": "{foreign_cat}", "invented_value": "{invented}"}, "p_set_parent": {"type": "boolean", "legal": "false"}, "p_color": {"type": "text", "legal": null}, "p_set_color": {"type": "boolean", "legal": "false"}, "p_icon": {"type": "text", "legal": null}, "p_set_icon": {"type": "boolean", "legal": "false"}, "p_position": {"type": "integer", "legal": null}, "p_set_position": {"type": "boolean", "legal": "false"}, "p_placement_type": {"type": "text", "legal": null}, "p_set_placement_type": {"type": "boolean", "legal": "false"}, "p_metadata_patch": {"type": "jsonb", "legal": null}, "p_is_system": {"type": "boolean", "legal": "false"}}'::jsonb
 where schema_name = 'public' and function_name = 'cat_write' and identity_args = 'p_dimension text, p_category_id uuid, p_organization_id uuid, p_name text, p_slug text, p_set_slug boolean, p_parent_id uuid, p_set_parent boolean, p_color text, p_set_color boolean, p_icon text, p_set_icon boolean, p_position integer, p_set_position boolean, p_placement_type text, p_set_placement_type boolean, p_metadata_patch jsonb, p_is_system boolean';

update platform.client_callable_door set contract_probe = '{"p_source_id": {"type": "uuid", "legal": "{doc}", "foreign_value": "{foreign_doc}", "invented_value": "{invented}"}, "p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}}'::jsonb
 where schema_name = 'public' and function_name = 'fork_processed_document' and identity_args = 'p_source_id uuid, p_organization_id uuid';

update platform.client_callable_door set contract_probe = '{"p_conversation_id": {"type": "uuid", "legal": "{conversation}", "foreign_value": "{foreign_conversation}", "invented_value": "{invented}"}, "p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_token": {"type": "text", "legal": null}}'::jsonb
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door set contract_probe = '{"p_set_id": {"type": "uuid", "legal": "{set}", "foreign_value": "{foreign_set}", "invented_value": "{invented}"}, "p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_token": {"type": "text", "legal": null}}'::jsonb
 where schema_name = 'public' and function_name = 'fork_shared_flashcard_set' and identity_args = 'p_set_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door set contract_probe = '{"p_quiz_id": {"type": "uuid", "legal": "{quiz}", "foreign_value": "{foreign_quiz}", "invented_value": "{invented}"}, "p_organization_id": {"type": "uuid", "legal": "{org}", "foreign_value": "{foreign_org}", "invented_value": "{invented}"}, "p_token": {"type": "text", "legal": null}}'::jsonb
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text';
