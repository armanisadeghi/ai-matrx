-- chair-step: the inverse of histscreens_a_restore_says_who_did_it.sql. It DROPS the four
-- overloads that file created and deletes their platform.client_callable_door rows. The
-- forms that existed before are untouched, so every browser call behaves exactly as it
-- does now; what goes away is the SERVER lane's ability to say who performed a restore, so
-- an agent's restore goes back to being recorded under the person it acted for. Nothing is
-- rewritten: the versions written while the new forms were live keep the authorship they
-- were given, which is the correct one.
-- lane: HISTORY-SCREENS

drop function if exists custom.value_restore(uuid, uuid, text, integer, jsonb);
drop function if exists custom.record_restore_version(uuid, uuid, integer, jsonb);
drop function if exists custom.io_restore(uuid, uuid, integer, jsonb);
drop function if exists custom.history_restore_body(jsonb, jsonb, text, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('history_restore_body', 'io_restore', 'record_restore_version',
                         'value_restore')
   and array_length(identity_argtypes, 1) in (4, 5)
   and declared_by = 'histscreens_a_restore_says_who_did_it.sql';
