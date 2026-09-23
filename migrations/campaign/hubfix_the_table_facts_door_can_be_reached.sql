-- chair-step: this GRANTs EXECUTE on ONE function to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. The function is already declared in platform.client_callable_door by hubfix_each_table_says_who_can_see_it_and_whose_it_is.sql, which runs before this file.
-- lane: HUB-FIX (the hub's lanes — who can see each Table, and whether the caller made it)
--
--   custom.table_facts(uuid)   → authenticated, EXECUTE
--
-- and nothing else. `anon` gains nothing. WHO MAY CALL IT is not decided by this grant: it
-- asks custom.assert_client_may_reach first and narrows to the Tables the caller can open.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.table_facts(uuid) to authenticated;
