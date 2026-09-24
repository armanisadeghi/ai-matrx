-- chair-step: this GRANTs EXECUTE on ONE function to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. The function is already declared in platform.client_callable_door by accesspersonal_every_table_i_can_open_in_every_organization.sql, which runs before this file.
-- lane: ACCESS-IS-PERSONAL (the Data hub's "All my organizations" list)
--
--   custom.tables_i_can_open()   → authenticated, EXECUTE
--
-- and nothing else. `anon` gains nothing. WHAT A CALLER SEES is not decided by this grant: the
-- function walks only the caller's own organizations and narrows to what the ladder admits.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.tables_i_can_open() to authenticated;
