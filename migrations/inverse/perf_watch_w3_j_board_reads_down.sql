-- chair-step: drops the two read-only admin board functions perf_watch_w3_j_board_reads.sql created (and their door rows); the admin page falls back to nothing until the up is re-applied.
delete from platform.client_callable_door
 where schema_name = 'ops' and function_name in ('perf_watch_board', 'perf_watch_history');
drop function if exists ops.perf_watch_board(integer, integer);
drop function if exists ops.perf_watch_history(uuid, integer);
notify pgrst, 'reload schema';
