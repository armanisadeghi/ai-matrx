-- chair-step: this GRANTs EXECUTE on TWO functions to `authenticated` and re-opens their two platform.client_callable_door rows to the signed-in lane (a no-op on first apply; after the inverse closed them it puts them back). A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no other declared grant changed. Both functions are declared in platform.client_callable_door by sc1p_a_table_says_where_it_lives_and_its_owner_can_move_it.sql, which runs before this file.
-- lane: SC-1 (the owner's "see what org this data is in … and set the org")
--
--   custom.table_home(uuid, uuid)           → authenticated, EXECUTE
--   custom.table_move(uuid, uuid, integer)  → authenticated, EXECUTE
--
-- and nothing else. `anon` gains nothing. WHAT A CALLER SEES OR MOVES is not decided by this
-- grant: both bodies answer only for a Table custom.where_id_opens says the caller may open, and
-- the move refuses anyone but its maker or an owner/admin of its organization.
--
-- Idempotent: an already-holds GRANT is a no-op.

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where (schema_name, function_name) in (('custom', 'table_home'), ('custom', 'table_move'))
   and not signed_in_callers;

grant execute on function custom.table_home(uuid, uuid) to authenticated;
grant execute on function custom.table_move(uuid, uuid, integer) to authenticated;
