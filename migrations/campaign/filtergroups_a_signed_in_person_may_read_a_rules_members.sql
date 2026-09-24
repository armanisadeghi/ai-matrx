-- chair-step: it (re)opens the signed-in lane on two door rows that
--   filtergroups_a_views_nested_question_is_one_where_clause.sql declares and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated` for
--   `custom.rule_members_visible(uuid, uuid, integer, integer)` (a saved view's membership, walled and
--   paged) and `custom.pipeline_board(uuid, uuid, text, jsonb)` (the board under a view's filter). A
--   GRANT is the one shape the production allow-list refuses by name, so it comes through this route
--   (the same route as gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql). Nothing is
--   replaced, dropped or revoked; `anon` gains nothing; `custom.rule_members` gains nothing (its row
--   is server-only). Apply AFTER filtergroups_a_views_nested_question_is_one_where_clause.sql. The
--   inverse is `migrations/inverse/filtergroups_a_signed_in_person_may_read_a_rules_members_down.sql`.
-- lane: S2-PRIME
-- lock: custom,platform
--
-- LANE S2-PRIME FILTER-GROUPS, THE GRANT. The ddl guard takes a new definer's client EXECUTE back at
-- birth ("definer_default_public_execute_cleared_at_birth"), so without this file a real
-- test@test.com connection gets "permission denied" from both doors and ViewSwitcher's membership
-- views stay as dead as they are today (UI-CHAMPIONS-PLAN-ATTACK hole 5).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The rows are the lane file's; this file only says their signed-in lane is OPEN (it already is on
-- a first apply — this makes a re-apply after the inverse open it again).
update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom'
   and ((function_name = 'rule_members_visible'
         and identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[])
     or (function_name = 'pipeline_board'
         and identity_argtypes = array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'jsonb'::regtype]::oid[]))
   and declared_by = 'filtergroups_a_views_nested_question_is_one_where_clause.sql';

select custom.reopen_declared_doors();
