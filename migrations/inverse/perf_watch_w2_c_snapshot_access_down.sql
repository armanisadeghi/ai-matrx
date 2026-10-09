-- chair-step: inverse of perf_watch_w2_c_snapshot_access.sql — the regeneration has no separate undo; the policies and grants it emitted belong to ops.perf_statement_snapshot and are dropped with the table by perf_watch_w2_b_statement_snapshot_down.sql. This file only proves the order: it refuses while _d's collector still exists.
do $check$
begin
  if to_regprocedure('ops.perf_statement_collect()') is not null then
    raise exception 'apply perf_watch_w2_d_functions_down.sql first';
  end if;
end
$check$;
