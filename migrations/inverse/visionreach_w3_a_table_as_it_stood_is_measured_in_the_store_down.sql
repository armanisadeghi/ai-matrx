-- chair-step: this removes custom.record_aggregate_as_of and its platform.client_callable_door row (the records tool's as-of totals stop working until its client goes back to adding up every page of custom.query_table_as_of itself).
-- lane: VISION-REACH
-- lock: custom

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_aggregate_as_of';
drop function custom.record_aggregate_as_of(uuid, uuid, timestamp with time zone, text, text, text, jsonb);
