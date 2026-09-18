-- soft_delete_orphan_census_drives_from_removed_parents — 2026-09-18
--
-- THE FINDING. `pnpm check:soft-delete-cascade:strict` (CI job "removing a thing still removes its
-- parts", BLOCKING) cannot measure anything: public.__soft_delete_cascade_conformance() dies with
-- 57014 (statement timeout) under PostgREST's ~8s ceiling. UNMEASURED is not a pass.
--
-- THE ROOT CAUSE, PROFILED. platform.soft_delete_orphan_census() walks the 17 declared edges and
-- for each runs `count(*) from child join parent on parent.id = child.fk where child.deleted_at is
-- null and parent.deleted_at is not null`. Sixteen edges answer in ~90ms. The seventeenth —
-- mandate.reference (2.3M rows) -> mandate.definition — takes 6–10s: the planner merge-joins by
-- walking the ENTIRE child index (1.1M live rows, 700k buffers) against 74 removed parents. The
-- question is "which live children point at a removed parent", and the cheap way to ask it is to
-- start from the removed parents: `child.fk = any(array(select id from parent where deleted_at is
-- not null))` — 74 index probes, 30ms on the same edge (EXPLAIN ANALYZE 2026-09-18). The census
-- rewrite is the class fix: every future edge on a large child table gets the parent-driven
-- shape, not a full walk. Nothing about the answer changes — same predicate, same rows.
--
-- based-on: platform.soft_delete_orphan_census() e3e74eb1bbb0c4574d0a6699b136fa5e489e220e0b888a025bb7b2614b50df1e

create or replace function platform.soft_delete_orphan_census()
 returns table(edge text, action text, live_rows_under_removed_parent bigint)
 language plpgsql
 stable
as $function$
declare
  e record;
  v_n bigint;
  v_child_soft_deletable boolean;
begin
  for e in select * from platform.soft_delete_edge
            order by parent_schema, parent_table, child_schema, child_table loop

    select exists (
      select 1 from information_schema.columns c
       where c.table_schema = e.child_schema
         and c.table_name   = e.child_table
         and c.column_name  = 'deleted_at'
    ) into v_child_soft_deletable;

    -- Parent-driven: the set of removed parents is small and the child's FK is indexed, so this is
    -- a handful of index probes instead of a walk of every live child row (mandate.reference:
    -- 6–10s as a join, 30ms this way — see the header).
    execute format(
      'select count(*) from %I.%I ch '
      'where %s and ch.%I = any (array(select pa.%I from %I.%I pa where pa.deleted_at is not null))',
      e.child_schema, e.child_table,
      case when v_child_soft_deletable then 'ch.deleted_at is null' else 'true' end,
      e.child_column, e.parent_column, e.parent_schema, e.parent_table
    ) into v_n;

    edge := format('%s.%s.%s -> %s.%s',
                   e.child_schema, e.child_table, e.child_column,
                   e.parent_schema, e.parent_table);
    action := e.action;
    live_rows_under_removed_parent := v_n;
    return next;
  end loop;
end;
$function$;

-- Proof, same transaction, under the ceiling the gate actually runs behind: the whole conformance
-- RPC must answer inside PostgREST's budget or this migration fails.
do $proof$
declare v_started timestamptz := clock_timestamp(); v_n int; v_ms numeric;
begin
  select count(*) into v_n from public.__soft_delete_cascade_conformance();
  v_ms := extract(epoch from clock_timestamp() - v_started) * 1000;
  if v_n < 6 then
    raise exception 'orphan_census: the conformance RPC returned only % check(s)', v_n;
  end if;
  -- PostgREST cancels at ~8s; a migration that leaves the RPC slower than that has fixed nothing.
  if v_ms > 8000 then
    raise exception 'orphan_census: __soft_delete_cascade_conformance still takes % ms (> 8000)', round(v_ms);
  end if;
  raise notice 'orphan_census: __soft_delete_cascade_conformance answered % checks in % ms', v_n, round(v_ms);
end $proof$;
