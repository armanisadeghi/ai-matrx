-- The inverse of `migrations/campaign/storetxn_a_record_graph_is_one_transaction.sql`, for
-- rule 27 (up → inverse → up) ON THE CLONE. It removes only what that file added: the door
-- row, the provenance association type and the function itself. It is never run on the main
-- database — the door is additive and nothing is superseded by it.

revoke execute on function custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_write_graph';

delete from platform.association_types
 where source_type = 'message' and target_type = 'record';

drop function if exists custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb);
