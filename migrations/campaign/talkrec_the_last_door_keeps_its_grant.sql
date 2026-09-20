-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE LAST DOOR IN A FILE KEPT NO GRANT, AND NOTHING SAID SO.
--
-- Lane TALK-TO-RECORD, 2026-09-20. `platform.close_new_functions_to_anon` takes EXECUTE back
-- from every new function in a closed schema, and `platform.reopen_declared_doors('custom')`
-- hands it back to the ones with a `platform.client_callable_door` row — but that sweep runs
-- at the NEXT DDL statement. A file whose last statement is the door row of its last function
-- therefore ships that function with NO grant, and the migration reports OK: measured on the
-- main database at 15:11:56Z, `custom.conversation_scope_context` had
-- `has_function_privilege('authenticated', …) = false` while its five siblings in the same
-- file were true.
--
-- COMMENT ON is DDL and is on the additive allow-list, so one comment per door both documents
-- the door and runs the sweep. It is also the honest fix: a door's purpose belongs on the
-- function, not only in a registry table.

comment on function custom.conversation_scope(uuid, uuid) is
  'TALK-TO-RECORD / AGT-N-9: what one conversation is about. Answers bound=false, or the record '
  'id with readable=false and the reason when the person may no longer open it.';

comment on function custom.conversation_scope_bind(uuid, uuid, uuid) is
  'TALK-TO-RECORD / AGT-N-9: point a conversation at one record. The edge is a platform.associations '
  'row conversation --record_scope--> custom_record; the scope TYPE is the record''s Table.';

comment on function custom.conversation_scope_unbind(uuid, uuid) is
  'TALK-TO-RECORD / AGT-N-9: this conversation is no longer about a particular record.';

comment on function custom.record_scope_context(uuid, uuid, integer, integer, integer) is
  'TALK-TO-RECORD / AGT-N-9: one door, one round trip — a record''s Fields with their (record, '
  'field, version) triples, its relations one hop out, its history, its comments and its Table''s '
  'other records, every piece through the read door under the operating person''s own '
  'field-level security, and every withheld Field named with the store''s reason.';

comment on function custom.conversation_scope_context(uuid, uuid, integer, integer, integer) is
  'TALK-TO-RECORD / AGT-N-9: the binding and the context of a bound conversation in one call.';
