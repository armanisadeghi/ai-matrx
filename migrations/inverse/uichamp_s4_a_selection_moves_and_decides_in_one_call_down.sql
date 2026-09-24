-- lock: custom,platform
-- lane: S4
-- chair-step: the inverse of uichamp_s4_a_selection_moves_and_decides_in_one_call.sql. It DROPS custom.pipeline_move_many(uuid, jsonb) and custom.work_decide_many(uuid, jsonb), deletes their platform.client_callable_door rows and the custom/batch_items_max knob (with any organization override of it). Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: the moves and decisions those doors made stay made — each was an ordinary write through custom.pipeline_move / custom.work_approval_decide, with its own history row.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists custom.pipeline_move_many(uuid, jsonb);
drop function if exists custom.work_decide_many(uuid, jsonb);
delete from platform.client_callable_door
 where declared_by = 'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql';
delete from platform.knob_override where feature = 'custom' and key = 'batch_items_max';
delete from platform.feature_knob where feature = 'custom' and key = 'batch_items_max';
