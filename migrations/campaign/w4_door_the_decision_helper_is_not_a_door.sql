-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W4-DOOR-WRITE — THE MEMBERSHIP HELPER IS NOT A DOOR, SO NO CLIENT HOLDS IT.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-19 00:20Z, ONE MINUTE AFTER THE LANE
-- LANDED. `custom.assert_client_may_reach` is the decision the eight write doors make, and
-- it is SECURITY INVOKER on purpose — it is only ever called from inside a SECURITY DEFINER
-- door, where `current_user` is already the definer. Being invoker is exactly what put it
-- outside the reach of `platform.enforce_definer_client_grants`, which judges DEFINER
-- functions only. So PostgreSQL's own default — EXECUTE to PUBLIC on every new function —
-- and this database's twenty ALTER DEFAULT PRIVILEGES rows handed it to `public`, and
-- therefore to `anon`: `has_function_privilege('anon', …)` read TRUE, in a schema whose
-- whole contract is that `anon` reaches nothing.
--
-- It leaks no data — it returns void and answers a membership question the caller already
-- knows the answer to — but "anon reaches nothing in custom" is a privilege fact that is
-- either zero or it is not a fact, and a census that reads one is the census doing its job.
--
-- THE CLASS, for the next lane: a helper you add beside a door is not covered by the door
-- guard. Every new function in this schema, DEFINER or INVOKER, ends its file revoked from
-- public and anon unless it has a `platform.client_callable_door` row saying otherwise —
-- and the event trigger W4-IO added then re-grants exactly the declared doors, so a blanket
-- revoke is now safe to write.

set lock_timeout = '5s';
set statement_timeout = '120s';

revoke execute on function custom.assert_client_may_reach(uuid, text) from public;
revoke execute on function custom.assert_client_may_reach(uuid, text) from anon;
revoke execute on function custom.assert_client_may_reach(uuid, text) from authenticated;
