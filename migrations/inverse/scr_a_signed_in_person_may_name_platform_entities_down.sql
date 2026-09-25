-- lock: custom,platform
-- lane: SC-R
-- chair-step: the inverse of scr_a_signed_in_person_may_name_platform_entities.sql.
-- It REVOKES EXECUTE on custom.entity_reference_kinds() and custom.entity_reference_words(uuid, jsonb)
-- from authenticated. What it undoes: the field editor can no longer list the kinds a record may
-- point at, and a chip can no longer be named before it is saved ("permission denied"). The door
-- rows stay (they belong to scr_a_field_can_point_at_a_platform_entity.sql) but their signed-in
-- lane is CLOSED first, with its reason — otherwise the declared-doors sweep puts the grant
-- straight back in the same statement.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by scr_a_signed_in_person_may_name_platform_entities_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name in ('entity_reference_kinds', 'entity_reference_words')
   and declared_by = 'scr_a_field_can_point_at_a_platform_entity.sql';

revoke execute on function custom.entity_reference_kinds() from authenticated;
revoke execute on function custom.entity_reference_words(uuid, jsonb) from authenticated;
