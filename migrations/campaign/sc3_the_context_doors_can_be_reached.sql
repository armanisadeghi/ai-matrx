-- chair-step: this GRANTs EXECUTE on the two doors sc3_the_context_door_routes_by_id_for_the_person.sql added — custom.context_resolve(jsonb) and custom.resolve_context(text, uuid, uuid[], uuid[]) — to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement; the only rows it touches are the two door rows that file declared, set back to the open signed-in lane.
-- lane: SC-3 (the store-side context resolver, by id, for the person)
--
--   custom.context_resolve(jsonb)                          → authenticated, EXECUTE
--   custom.resolve_context(text, uuid, uuid[], uuid[])     → authenticated, EXECUTE
--
-- WHY `authenticated`: the server calls both acting as the person operating the agent
-- (matrx_records `acting_as` opens an RLS session with that person's claims and the
-- `authenticated` role), and the compare panel's server endpoint does the same. WHO MAY READ
-- WHAT is not decided by these grants: every record is asked through custom.where_id_opens for
-- that person and read through custom.read_record. `anon` gains nothing (new functions are
-- closed to it at birth).
--
-- Idempotent: an already-held GRANT is a no-op; the door rows are set to the lane they were
-- declared with (the inverse closes them first, so re-applying after the inverse reopens them
-- before it grants).

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where (schema_name, function_name, identity_args) in
       (('custom', 'context_resolve', 'p_bindings jsonb'),
        ('custom', 'resolve_context', 'p_entity_type text, p_entity_id uuid, p_record_ids uuid[], p_table_ids uuid[]'));

grant execute on function custom.context_resolve(jsonb) to authenticated;
grant execute on function custom.resolve_context(text, uuid, uuid[], uuid[]) to authenticated;
