-- chair-step: undo chairdoors2_i_a_new_output_replaces_the_old_under_one_lock.sql — drops custom.record_write_graph_superseding and its platform.client_callable_door row, and the five helpers it uses. No other function, table, grant or data row is touched.
-- lane: CHAIR-DOORS-2
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_write_graph_superseding'
   and declared_by = 'chairdoors2_i_a_new_output_replaces_the_old_under_one_lock.sql';
drop function if exists custom.record_write_graph_superseding(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);
drop function if exists custom._output_person_wrote(uuid, uuid, jsonb, jsonb);
drop function if exists custom._output_mark_with_contained(uuid, uuid, jsonb, jsonb);
drop function if exists custom._output_mark(uuid, uuid, jsonb);
drop function if exists custom._output_contained(uuid, uuid);
drop function if exists custom._output_platform_keys(uuid, uuid);
