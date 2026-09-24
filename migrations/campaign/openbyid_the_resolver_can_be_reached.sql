-- chair-step: this GRANTs EXECUTE on the two doors openbyid_one_address_opens_any_id.sql added to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing declared grant changed; the only row it touches is the two door rows that file declared, set back to the open signed-in lane. Both functions are already declared in platform.client_callable_door by that file, which runs before this one.
-- lane: ROUTE-RESOLVER (one address, /o/<id>, that opens any id the platform mints)
--
--   platform.resolve_id(uuid, text)   → authenticated, EXECUTE   (the one door /o/<id> calls)
--   custom.where_id_opens(uuid)       → authenticated, EXECUTE   (platform.resolve_id is SECURITY
--                                                                 INVOKER, so the person must be
--                                                                 able to call the store's half)
--
-- and nothing else. `anon` gains nothing: new functions are closed to it at birth
-- (platform.close_new_functions_to_anon), and custom._where_id_may_open is granted to no client.
-- WHO MAY SEE WHAT is not decided by these grants: each object's own read rule decides it.
--
-- Idempotent: an already-holds GRANT is a no-op, and the two door rows are set to the open
-- signed-in lane they were declared with (the inverse closes them first, because the register
-- hands a declared door's grant straight back otherwise — so re-applying after the inverse must
-- reopen them before it grants).

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where (schema_name, function_name) in (('platform', 'resolve_id'), ('custom', 'where_id_opens'));

grant execute on function platform.resolve_id(uuid, text) to authenticated;
grant execute on function custom.where_id_opens(uuid) to authenticated;
