-- chair-step: this DROPS the one function lane FORMS-FIX-1 added, `custom.form_public_asks(uuid, jsonb, text, text)`, and deletes its one `platform.client_callable_door` row. No data is touched: the function reads and writes no table of its own, and nothing else was created, replaced or dropped by the up. After it, the public form's branching route answers with the door's refusal and the page shows every conditional question with its sentence — the state before this lane. Run the grant's inverse (`formsfix1_the_server_lane_can_ask_which_questions_come_next_down.sql`) first when the grant was applied; a DROP takes the grant with it either way.
-- lane: FORMS-FIX-1
--
-- FORMS-FIX-1 inverse, rule 27. The door row goes first because it names the function.

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'form_public_asks';

drop function if exists custom.form_public_asks(uuid, jsonb, text, text);
