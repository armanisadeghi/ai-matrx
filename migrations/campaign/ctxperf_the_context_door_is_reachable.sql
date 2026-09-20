-- chair-step: ONE GRANT and ONE REVOKE, on a function this campaign creates in the statement
-- before it. The additive allow-list refuses every GRANT by name and correctly so, so it comes
-- through this route and a person reads exactly which function and why.
-- lane: CONTEXT-PERF
--
--   custom.context_resolve(uuid, jsonb, text)  -> authenticated, EXECUTE
--
-- WHAT IT OPENS, EXACTLY. `custom.context_resolve` is SECURITY INVOKER and holds no visibility
-- logic: every value it answers came out of `custom.read_record` and every version out of
-- `custom.record_values_versioned`, both of which `authenticated` already holds EXECUTE on and
-- both of which decide for themselves. So this grant opens no row, no field and no organization
-- that the same caller could not already reach one door at a time; it opens the SHAPE that lets
-- them reach it in one round trip instead of three per field. Its row in
-- `platform.client_callable_door` is written by
-- `ctxperf_one_door_answers_a_whole_turns_context.sql`, which runs before this file.
--
-- THE REVOKE is PUBLIC's default EXECUTE on this brand-new function, taken back before anybody
-- holds it. It narrows nothing that exists: the function is created in the same batch of work and
-- has never been callable by anyone. No other door, grant or policy is touched.

revoke all on function custom.context_resolve(uuid, jsonb, text) from public;
grant execute on function custom.context_resolve(uuid, jsonb, text) to authenticated;
