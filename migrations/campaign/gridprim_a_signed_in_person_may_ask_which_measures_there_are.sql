-- chair-step: it ends in `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to
--   `authenticated` that the two `platform.client_callable_door` rows above it declare, for
--   `custom.agg_operations()` and `custom.agg_buckets()` and nothing else. A GRANT is the one shape
--   the production allow-list refuses by name, so it comes through this route (the same route as
--   choiceval_the_values_become_words.sql). Nothing is replaced, dropped or revoked; `anon` gains
--   nothing. The inverse is
--   `migrations/inverse/gridprim_a_signed_in_person_may_ask_which_measures_there_are_down.sql`.
-- lane: GRID-PRIMITIVES
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES (chair ruling 2026-09-22 20:00 PT): THE PICKER'S LIST WAS REFUSED.
-- `@ai-matrx/records`' `aggOperations()` and `aggBuckets()` call these two functions so a
-- summary picker offers exactly the measures and periods the store computes. On the main
-- database neither holds EXECUTE for `authenticated` (measured 2026-09-23 02:1x UTC,
-- has_function_privilege = false), so every signed-in person's picker got "permission denied"
-- — a screen that would lie in the grid port the moment it fell back to a typed list. Both are
-- IMMUTABLE, take no argument, read no table and return a closed vocabulary, so there is no
-- row for a caller to name and no access decision to make; the closed-schema guard only needs
-- them DECLARED before it lets the grant stand.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'agg_operations', '', array[]::oid[],
   'The closed list of measures custom.record_aggregate computes (count, sum, avg, min, max, median, filled, empty, unique). IMMUTABLE, no argument, reads no table and no record of any organization: a summary picker asks it so it can never offer a measure the store refuses.',
   'gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql', null, true, false),
  ('custom', 'agg_buckets', '', array[]::oid[],
   'The closed list of periods custom.record_aggregate buckets a date by (day, week, month, quarter, year). IMMUTABLE, no argument, reads no table and no record of any organization: a chart picker asks it so it can never offer a period the store refuses.',
   'gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql', null, true, false)
on conflict do nothing;

select custom.reopen_declared_doors();
