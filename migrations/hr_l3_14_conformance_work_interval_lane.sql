-- HR domain L3 — migration 14 (register item HRB-015, lane L3 punch + kiosk).
-- Full header lives in matrx-frontend/migrations/hr_l3_14_conformance_work_interval_lane.sql.
--
-- 🚨 A CORRECTION TO THE INSTRUCTION, RECORDED RATHER THAN SILENTLY OBEYED.
-- The brief asked for `hr.recompute_apply` to be added to the write-path gate's INSERTER ALLOWLIST.
-- That allowlist (`c_inserters`) governs exactly one table: `hr.punch`. `hr.recompute_apply` writes
-- no punches - it writes `hr.work_interval` and `hr.workweek`, the COMPUTED lane. Adding it there
-- would have asserted, falsely, that it upholds every `hr.punch_record` invariant. Per this gate's
-- own decision 3, adding a name is a RULING, and a name that does not belong weakens the gate for
-- every future reader. What the instruction was reaching for is real, so it is built as its own
-- pair of checks fencing the computed lane the way 4 and 5 fence the raw lane.
--
-- 🚨 THE FIRST RUN OF CHECK 10 WENT RED, AND THE FINDING WAS CORRECT.
-- `hr.attendance_exception_resolve` (SQL-2's L3-14) also inserts `hr.work_interval` - legitimately:
-- its documented job is to write the statutory premium line when a manager resolves a
-- meal/rest exception. It is added to the allowlist AS A RULING, on the evidence of its own
-- contract: interval_kind=premium_only, hours=1.0, MEAL_PREMIUM/REST_PREMIUM, NO amount (one hour
-- at the regular rate is the engine's figure, never a zero), rest premium capped at one per day,
-- and a locked period refused with the adjustment lane named. Those are the same invariants
-- `hr.recompute_apply` upholds, which is the test for admission.
--
-- 🚨 OVERLAP RECORDED, NOT LEFT TO LUCK. Both functions can write a premium line for the SAME
-- exception - one when a manager resolves it, one when the week is recomputed. A double premium is
-- a real wage-and-hour defect. `hr.recompute_apply` guards against it by skipping any day that
-- already carries a current interval on that earning code, regardless of which function wrote it.
-- Owner of the reverse direction (resolve-after-recompute): SQL-2. Raised to the coordinator.
--
-- Applied live as `hr_l3_14_conformance_work_interval_lane`. Idempotent.

do $outer$
declare
  v_def text;
  v_anchor constant text :=
'  ---------------------------------------------------------------- 9. the writer is a hardened definer';
  v_block constant text :=
'  ---------------------------------------------------------------- 10. only sanctioned writers of the COMPUTED lane
  check_key := ''only_sanctioned_interval_writers'';
  select coalesce(jsonb_agg(fn order by fn), ''[]''::jsonb) into v_bad
    from (select n.nspname || ''.'' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prokind = ''f''
             and n.nspname not in (''pg_catalog'',''information_schema'')
             and pg_get_functiondef(p.oid) ~* (''insert'' || ''\s+into\s+hr\s*\.\s*work_interval\y'')
             and not (n.nspname || ''.'' || p.proname = any(array[
                   ''hr.recompute_apply'',                -- E-11 persist door
                   ''hr.attendance_exception_resolve'']))  -- the statutory premium line, L3-14
             and p.proname <> ''punch_write_path_conformance'') z;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''unsanctioned_interval_writers'', v_bad,
                ''sanctioned'', jsonb_build_array(''hr.recompute_apply'', ''hr.attendance_exception_resolve''),
                ''why'', ''Admission test: supersede-never-delete, refuse into a locked period, and ''
                    || ''never put money on an advisory-contributed line. Both sanctioned writers ''
                    || ''can emit a premium for the same exception, so both must dedupe per day.'');
  return next;

  ---------------------------------------------------------------- 11. nothing DELETES a computed interval
  check_key := ''no_interval_deleters'';
  select coalesce(jsonb_agg(fn order by fn), ''[]''::jsonb) into v_bad
    from (select n.nspname || ''.'' || p.proname as fn
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prokind = ''f''
             and n.nspname not in (''pg_catalog'',''information_schema'')
             and pg_get_functiondef(p.oid) ~* (''delete'' || ''\s+from\s+hr\s*\.\s*work_interval\y'')
             and p.proname <> ''punch_write_path_conformance'') z;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''deleters'', v_bad,
                ''why'', ''SPEC-TIME 4.1: superseded work_interval rows are NEVER deleted - ''
                    || ''is_current=false + superseded_by_id. The prior answer and its rule versions ''
                    || ''stay on disk, because a recomputed figure has to be explainable a year later.'');
  return next;

  ---------------------------------------------------------------- 9. the writer is a hardened definer';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_write_path_conformance()'::regprocedure;

  if position('only_sanctioned_interval_writers' in v_def) > 0 then
    raise notice 'hr_l3_14: already applied';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_14: anchor not found in hr.punch_write_path_conformance';
  end if;

  execute replace(v_def, v_anchor, v_block);
end $outer$;

do $$
declare v_fail text; v_n int;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n <> 11 then
    raise exception 'hr_l3_14: expected 11 checks, found %', v_n;
  end if;
  select string_agg(check_key, ', ') into v_fail
    from hr.punch_write_path_conformance() where not ok;
  if v_fail is not null then
    raise exception 'hr_l3_14: the conformance gate is RED: %', v_fail;
  end if;
end $$;

