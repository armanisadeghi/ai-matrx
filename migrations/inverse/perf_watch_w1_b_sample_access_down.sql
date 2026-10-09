-- chair-step: inverse of perf_watch_w1_b_sample_access.sql — the regeneration has no separate undo; the policies and grants it emitted belong to ops.perf_sample and are dropped with the table by perf_watch_w1_a_catalog_and_sample_down.sql. This file only proves the order: it refuses while _c's functions still exist.
do $check$
begin
  if to_regprocedure('ops.perf_record_sample(uuid,text,jsonb,boolean)') is not null then
    raise exception 'apply perf_watch_w1_c_functions_down.sql first';
  end if;
end
$check$;
