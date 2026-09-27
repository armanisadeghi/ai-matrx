-- chair-step: INVERSE of migrations/campaign/choicetails_a_removing_a_choice_cells_still_use_asks_where_they_go.sql (lane CHOICE-TAILS, 2026-09-27).
-- lane: CHOICE-TAILS
-- The two doors the up file adds, and their registry rows. No existing body was replaced.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('field_choice_usage', 'field_update_rehoming_choices');
drop function if exists custom.field_update_rehoming_choices(uuid, uuid, jsonb, jsonb, jsonb);
drop function if exists custom.field_choice_usage(uuid, uuid);
