-- chair-step: this REVOKEs from `authenticated` the EXECUTE sc3_the_context_doors_can_be_reached.sql granted on custom.context_resolve(jsonb) and custom.resolve_context(text, uuid, uuid[], uuid[]), closing their two door rows first (the register hands a declared door's grant straight back otherwise). Nothing else is touched; the server then falls back to the path it had before (the three-argument door's hand-off still answers, as the store owner).
-- lane: SC-3

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by sc3_the_context_doors_can_be_reached_down.sql: the store-side context resolver is not reachable by a signed-in client until its grant file is applied again'
 where (schema_name, function_name, identity_args) in
       (('custom', 'context_resolve', 'p_bindings jsonb'),
        ('custom', 'resolve_context', 'p_entity_type text, p_entity_id uuid, p_record_ids uuid[], p_table_ids uuid[]'));

revoke execute on function custom.context_resolve(jsonb) from authenticated;
revoke execute on function custom.resolve_context(text, uuid, uuid[], uuid[]) from authenticated;
