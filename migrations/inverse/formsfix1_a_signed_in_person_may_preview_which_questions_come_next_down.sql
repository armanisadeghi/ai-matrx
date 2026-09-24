-- lock: custom,platform
-- lane: FORMS-FIX-1
-- chair-step: the inverse of formsfix1_a_signed_in_person_may_preview_which_questions_come_next.sql. It REVOKES EXECUTE on custom.form_preview_asks from authenticated. What it undoes: the owner's form preview is refused again and shows every question with the store's sentence. The door row stays (it belongs to the function's own file) but its signed-in lane is CLOSED first, with its reason — otherwise the declared-doors sweep puts the grant straight back.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by formsfix1_a_signed_in_person_may_preview_which_questions_come_next_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name = 'form_preview_asks'
   and declared_by = 'formsfix1_the_owners_preview_asks_the_store_the_same_question.sql';

revoke execute on function custom.form_preview_asks(uuid, uuid, jsonb, jsonb) from authenticated;
