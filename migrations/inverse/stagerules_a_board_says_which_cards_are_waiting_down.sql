-- INVERSE of migrations/campaign/stagerules_a_board_says_which_cards_are_waiting.sql.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'pipeline_pending';
drop function if exists custom.pipeline_pending(uuid, uuid);
