-- chair-step: inverse of perf_watch_w3_e_client_event.sql — drops ops.perf_client_event (raw page-speed rows only; the hourly vital samples stay in ops.perf_sample) and its registry row. Apply _g_down and _f_down first.
--
-- WHAT IT DOES NOT UNDO: nothing structural is left behind. Raw rows are not recoverable.
set local lock_timeout = '3s';
drop table if exists ops.perf_client_event cascade;
delete from platform.entity_types where token = 'ops_perf_client_event';
