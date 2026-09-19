-- chair-step: the three unified-data ramp doors are SECURITY DEFINER and carry a server_only access declaration, so the DDL guard correctly revoked EXECUTE from every role including service_role. The admin screen reaches them through its own API route, which verifies the signed-in person is a platform admin from their own session and then uses the service key — so service_role, and nothing else, needs EXECUTE back. This is a GRANT, which the additive allow-list refuses by name, so it is a chair step with its body printed.
--
-- WHAT THIS GRANTS, EXACTLY, AND TO WHOM
-- --------------------------------------
--   · EXECUTE on platform.unified_data_ramp_state / _gate / _set, to service_role ONLY.
--   · USAGE on schema campaign_watch, to service_role ONLY — needed because
--     _gate and _set RETURN campaign_watch.ramp_gate_run, and a caller that
--     cannot see the schema cannot name the composite type it is handed back.
--
-- NOT anon. NOT authenticated. NOT PUBLIC. A browser still cannot reach any of
-- these under any identity, which is what their client_callable_door rows say.
--
-- WHY service_role IS NOT A BACK DOOR HERE. The service key never leaves the
-- Next.js server process. The route that holds it does two things before it is
-- used: it reads the caller's OWN session and it refuses anyone who is not a
-- platform admin. The identity check happens where an identity exists; inside
-- the function, auth.uid() is null and the same check would refuse everybody.
--
-- THE UNDO, one line each:
--   revoke execute on function platform.unified_data_ramp_state(uuid) from service_role;
--   revoke execute on function platform.unified_data_ramp_gate(text, uuid) from service_role;
--   revoke execute on function platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) from service_role;
--   revoke usage on schema campaign_watch from service_role;
-- It is in migrations/inverse/w7_off_the_ramp_doors_are_reachable_inverse.sql.

set lock_timeout = '3s';
set statement_timeout = '2min';

grant usage on schema campaign_watch to service_role;

grant execute on function platform.unified_data_ramp_state(uuid) to service_role;
grant execute on function platform.unified_data_ramp_gate(text, uuid) to service_role;
grant execute on function platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) to service_role;
