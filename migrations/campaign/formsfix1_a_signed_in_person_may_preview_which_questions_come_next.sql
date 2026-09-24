-- chair-step: it (re)opens the signed-in lane on the one door row formsfix1_the_owners_preview_asks_the_store_the_same_question.sql declares and runs `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated` that row declares, for `custom.form_preview_asks(uuid, uuid, jsonb, jsonb)`. A GRANT is the one shape the production allow-list refuses by name, so it comes through this route. Nothing is replaced, dropped or revoked; `anon` gains nothing. Apply AFTER that file. The inverse is `migrations/inverse/formsfix1_a_signed_in_person_may_preview_which_questions_come_next_down.sql`.
-- lane: FORMS-FIX-1
-- lock: custom,platform
--
-- The ddl guard takes a new definer's client EXECUTE back at birth, so the grant is its own step.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = 'form_preview_asks'
   and declared_by = 'formsfix1_the_owners_preview_asks_the_store_the_same_question.sql';

select custom.reopen_declared_doors();
