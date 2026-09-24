-- chair-step: it (re)opens the signed-in lane on G13's two door rows and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the
--   EXECUTE grant to `authenticated` that G13's two `platform.client_callable_door` rows declare,
--   for `custom.view_record_order_set(uuid, uuid, uuid[])` and
--   `custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer)`. A GRANT
--   is the one shape the production allow-list refuses by name, so it comes through this route
--   (the same route as gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql). Nothing
--   is replaced, dropped or revoked; `anon` gains nothing. Apply AFTER
--   gridprim_a_view_keeps_the_order_a_person_dragged.sql. The inverse is
--   `migrations/inverse/gridprim_a_signed_in_person_may_order_a_view_by_hand_down.sql`.
-- lane: GRID-PRIMITIVES
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES G13, THE GRANT. The ddl guard takes a new definer's client EXECUTE back
-- at birth (measured on the clone 2026-09-24 02:22 UTC: both G13 doors held postgres only).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The rows are G13's; this file only says their signed-in lane is OPEN (it already is on a
-- first apply — this makes a re-apply after the inverse open it again).
update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('view_record_order_set', 'read_records_in_view_order')
   and declared_by = 'gridprim_a_view_keeps_the_order_a_person_dragged.sql';

select custom.reopen_declared_doors();
