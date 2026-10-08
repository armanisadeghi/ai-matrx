-- chair-step: inverse of perf_watch_w2_g_status.sql — drops ops.perf_watch_status() and its client_callable_door row. aidream's server_status then reports perf_watch with an error note (it degrades, never breaks).
drop function if exists ops.perf_watch_status();
delete from platform.client_callable_door where schema_name = 'ops' and function_name = 'perf_watch_status';
