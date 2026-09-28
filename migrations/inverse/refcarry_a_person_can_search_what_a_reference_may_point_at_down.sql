-- chair-step: the inverse of refcarry_a_person_can_search_what_a_reference_may_point_at.sql — it
--   removes the search door's platform.client_callable_door row and drops
--   custom.entity_reference_search(uuid, text[], text, integer). Nothing else is touched; the
--   entity-reference picker then says it cannot search (the store's own refusal).
-- lane: REFERENCE-CARRY
-- lock: custom,platform


delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'entity_reference_search'
   and declared_by = 'refcarry_a_person_can_search_what_a_reference_may_point_at.sql';

drop function if exists custom.entity_reference_search(uuid, text[], text, integer);
