-- chair-step: this GRANTs EXECUTE on ONE function, custom.tables_i_can_open(), to `authenticated`, after setting that function's own platform.client_callable_door row back to the open signed-in lane it was declared with. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement; the only row it touches is the one door row accesspersonal_every_table_i_can_open_in_every_organization.sql declared, which runs before this file.
-- lane: ACCESS-IS-PERSONAL (the Data hub's "All my organizations" list; successor lane ACTIVE-ORG-PAGES)
--
-- SUPERSEDES accesspersonal_the_tables_i_can_open_door_can_be_reached.sql, which only GRANTed and
-- so had no rule-27 inverse: its inverse must close the door row before it revokes (the register
-- hands a declared signed-in door its grant straight back otherwise), and re-applying a bare
-- GRANT after that close is refused by ddl_guard[client_grant_on_a_non_client_door]. This file
-- takes the shape openbyid_the_resolver_can_be_reached.sql uses: reopen the row, then grant.
-- The superseded file is left untouched and is never applied.
--
--   custom.tables_i_can_open()   → authenticated, EXECUTE
--
-- and nothing else. `anon` gains nothing. WHAT A CALLER SEES is not decided by this grant: the
-- function walks only the caller's own organizations and narrows to what the ladder admits.
--
-- Idempotent: the row is set to the lane it was declared with, and an already-holds GRANT is a
-- no-op.

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = 'tables_i_can_open';

grant execute on function custom.tables_i_can_open() to authenticated;
