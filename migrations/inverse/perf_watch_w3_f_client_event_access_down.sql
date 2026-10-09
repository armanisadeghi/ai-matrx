-- chair-step: inverse of perf_watch_w3_f_client_event_access.sql — the regeneration has no separate undo; the policies and grants it emitted belong to ops.perf_client_event and are dropped with the table by perf_watch_w3_e_client_event_down.sql. This file only proves the order: it refuses while _g's door still exists.
do $check$
begin
  if to_regprocedure('ops.perf_client_report(jsonb)') is not null then
    raise exception 'apply perf_watch_w3_g_vitals_and_cli_down.sql first';
  end if;
end
$check$;
