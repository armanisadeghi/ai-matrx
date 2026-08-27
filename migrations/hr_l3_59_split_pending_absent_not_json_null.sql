-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 SELF-INFLICTED, CAUGHT IMMEDIATELY AFTER SHIPPING: hr_l3_58's gate would have stopped blocking.
--
-- `hr._ppe_rollup_refresh` built its calc with `jsonb_build_object('split_pending', v_split, …)`.
-- When there is nothing to disclose, `v_split` is SQL NULL and that expression writes the KEY with a
-- JSON null value — it does not omit the key. And in Postgres:
--
--     ('{"a": null}'::jsonb -> 'a') is null   ->   FALSE      (it is the jsonb scalar null)
--
-- Check 23 asked `(ppe.calc -> 'split_pending') is null` to mean "this row disclosed nothing", so
-- every row the refresher had touched — 7 of the 8 — read as ALREADY DISCLOSED and was excluded
-- from the violation set. A genuinely undisclosed rollup would have sailed through. The check was
-- blocking in name and inert in fact, on the very run that installed it.
--
-- The falsification in hr_l3_58 passed because it removed the key outright (`calc - 'split_pending'`),
-- which is not what the refresher writes. Proving a gate against a state the code never produces
-- proves nothing about the code.
--
-- Authority: coordinator ruling (round-12 P4) — this repairs the shape of that fix.
--
-- Applied live as `hr_l3_59_split_pending_absent_not_json_null`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. FIXED ON BOTH SIDES, BECAUSE EITHER ALONE LEAVES THE TRAP. The writer stops emitting the key
--    when it has nothing to say, AND the reader stops treating a JSON null as content. Fixing only
--    the writer would leave the gate defeated by any row written before today or by any other hand;
--    fixing only the reader would leave 7 rows carrying a key that asserts a disclosure they do not
--    make.
-- 2. THE KEYS ARE DROPPED SURGICALLY, NOT BY `jsonb_strip_nulls`. Stripping the whole object would
--    also silently remove `amounts_note`, `recompute_batch_id` and any other legitimately-null key,
--    changing the calc contract for every consumer to fix one field. Only `split_pending` and its
--    note are removed, and only when there is no pending split.
-- 3. THE READER TESTS THE TYPE, NOT THE PRESENCE. `jsonb_typeof(...) = 'array'` is the honest
--    question — "is there a disclosure here" — and it answers correctly for an absent key, a JSON
--    null, and a real marker alike. `is null` could only ever answer the first.
-- 4. THE CLASS GETS ITS OWN CHECK. Check 25 asserts no rollup carries `split_pending` as a JSON
--    null, so this specific shape cannot come back through another writer. It is narrow on purpose:
--    a general "no calc key may be JSON null" rule would be wrong, since some keys legitimately
--    record "we looked and the answer was nothing".
-- 5. THE FALSIFICATION NOW USES WHAT THE WRITER WRITES. hr_l3_58's proof stripped the key; this one
--    re-runs the refresher on a row with nothing to disclose and asserts the key is absent, then
--    plants a JSON null directly and asserts the gate still catches it. A gate has to be tested
--    against the states its own producers can reach.

-- ── 1. the writer omits what it has nothing to say about (decisions 1–2) ────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr._ppe_rollup_refresh(uuid,uuid,text,text,uuid)'::regprocedure);

  if position('-- hr_l3_59' in v_def) > 0 then
    raise notice 'hr_l3_59: the refresher already omits an empty split_pending';
    return;
  end if;
  if position('  get diagnostics v_hit = row_count;' in v_def) = 0 then
    raise exception 'hr_l3_59: _ppe_rollup_refresh does not match what this migration expects';
  end if;

  v_def := replace(v_def,
    '  get diagnostics v_hit = row_count;',
    '  -- hr_l3_59 decision 2: jsonb_build_object writes the KEY with a JSON null when the value is' || E'\n' ||
    '  -- SQL NULL, and a JSON null is NOT SQL NULL to a reader. A row with nothing to disclose must' || E'\n' ||
    '  -- carry NO key, or every reader that tests presence reads it as a disclosure. Dropped' || E'\n' ||
    '  -- surgically rather than by jsonb_strip_nulls, which would take legitimately-null keys too.' || E'\n' ||
    '  if v_split is null then' || E'\n' ||
    '    perform hr.arm_write();' || E'\n' ||
    '    update hr.pay_period_employment ppe' || E'\n' ||
    '       set calc = (ppe.calc - ''split_pending'') - ''split_pending_note''' || E'\n' ||
    '     where ppe.pay_period_id = p_pay_period_id' || E'\n' ||
    '       and ppe.employment_id = p_employment_id' || E'\n' ||
    '       and (ppe.calc ? ''split_pending'' or ppe.calc ? ''split_pending_note'');' || E'\n' ||
    '  end if;' || E'\n\n' ||
    '  get diagnostics v_hit = row_count;');

  execute v_def;
end
$mig$;

-- ⚠️ `get diagnostics` now follows the conditional cleanup, so it would report THAT statement's
-- row count instead of the rollup update's. Re-anchor it on the update it is actually about.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr._ppe_rollup_refresh(uuid,uuid,text,text,uuid)'::regprocedure);
  if position('  v_hit_captured boolean' in v_def) > 0 then
    raise notice 'hr_l3_59: the row count is already captured before the cleanup';
    return;
  end if;
  -- capture the rollup update's row count immediately, before anything else can overwrite it
  v_def := replace(v_def,
    '  -- hr_l3_59 decision 2: jsonb_build_object writes the KEY',
    '  get diagnostics v_hit = row_count;   -- hr_l3_59: captured HERE, about the update above' || E'\n' ||
    '  -- hr_l3_59 decision 2: jsonb_build_object writes the KEY');
  -- and retire the trailing one, which now describes the cleanup
  v_def := replace(v_def,
    '  end if;' || E'\n\n' || '  get diagnostics v_hit = row_count;',
    '  end if;' || E'\n' || '  -- v_hit_captured boolean: the count was taken above, before the cleanup');
  execute v_def;
end
$mig$;

-- ── 2. the reader asks whether there is a disclosure, not whether a key exists (decision 3) ──
-- the last OUT column changes name and type, which CREATE OR REPLACE cannot do. Dropping is safe:
-- plpgsql resolves the call in hr.punch_write_path_conformance() at runtime, not at definition.
drop function if exists hr.rollup_overtime_undisclosed();

create or replace function hr.rollup_overtime_undisclosed()
returns table(pay_period_id uuid, employment_id uuid, workweek_overtime numeric,
              rollup_overtime numeric, marker_shape text)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  select ppe.pay_period_id, ppe.employment_id,
         (select sum(w.hours_overtime) from hr.workweek w
           where w.employment_id = ppe.employment_id
             and coalesce(w.hours_overtime,0) > 0
             and exists (select 1 from hr.work_interval wi
                          where wi.workweek_id = w.id and wi.is_current
                            and wi.pay_period_id = ppe.pay_period_id)),
         coalesce((ppe.calc ->> 'hours_overtime')::numeric, 0),
         coalesce(jsonb_typeof(ppe.calc -> 'split_pending'), 'absent')
    from hr.pay_period_employment ppe
   where ppe.engine_key is distinct from 'hr.pay_period_enrollment'
     and coalesce((ppe.calc ->> 'hours_overtime')::numeric, 0) = 0
     -- decision 3: a JSON null is not a disclosure. Only an array is.
     and jsonb_typeof(ppe.calc -> 'split_pending') is distinct from 'array'
     and exists (select 1 from hr.workweek w
                  where w.employment_id = ppe.employment_id
                    and coalesce(w.hours_overtime,0) > 0
                    and exists (select 1 from hr.work_interval wi
                                 where wi.workweek_id = w.id and wi.is_current
                                   and wi.pay_period_id = ppe.pay_period_id));
$fn$;

revoke execute on function hr.rollup_overtime_undisclosed() from public, anon;

-- ── 3. clear the 7 keys hr_l3_58 wrote as JSON null (decision 1) ────────────────────────────
do $repair$
declare v_n int;
begin
  perform hr.arm_write();
  update hr.pay_period_employment
     set calc = (calc - 'split_pending') - 'split_pending_note'
   where jsonb_typeof(calc -> 'split_pending') = 'null';
  get diagnostics v_n = row_count;
  raise notice 'hr_l3_59: % row(s) cleared of the empty marker', v_n;
end
$repair$;

-- ── 4. check 25: the shape itself (decision 4) ──────────────────────────────────────────────
do $mig$
declare
  v_def text;
  v_anchor text := 'assignments at the SAME rate as two rates. A workweek missing the key projects null ''
      || ''(unknown) rather than false, and this check catches an engine that stopped writing it ''
      || ''before every week silently flattens to "single rate".'');' || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  if position('split_pending_is_absent_or_real' in v_def) > 0 then
    raise notice 'hr_l3_59: check 25 is already wired'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_59: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'assignments at the SAME rate as two rates. A workweek missing the key projects null ''
      || ''(unknown) rather than false, and this check catches an engine that stopped writing it ''
      || ''before every week silently flattens to "single rate".'');
  return next;

  ---------------------------------------------------------------- 25. a marker is present or absent, never a JSON null
  check_key := ''split_pending_is_absent_or_real'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''pay_period_id'', ppe.pay_period_id, ''employment_id'', ppe.employment_id)), ''[]''::jsonb)
    into v_bad
    from hr.pay_period_employment ppe
   where jsonb_typeof(ppe.calc -> ''split_pending'') = ''null'';
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''jsonb_build_object writes the KEY with a JSON null when its value is SQL NULL, and ''
      || ''(calc -> ''''split_pending'''') IS NULL is FALSE for a JSON null. Check 23 tested presence, ''
      || ''so every row the refresher touched read as already-disclosed and was excluded from its ''
      || ''violation set -- the check was blocking in name and inert in fact on the run that ''
      || ''installed it. A marker is an array or it is absent; it is never a JSON null.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── 5. self-assertions, against what the WRITER produces (decision 5) ────────────────────────
do $chk$
declare v_fail jsonb; v_n int; v_pid uuid; v_eid uuid;
begin
  -- no row carries the empty marker any more
  if exists (select 1 from hr.pay_period_employment
              where jsonb_typeof(calc -> 'split_pending') = 'null') then
    raise exception 'hr_l3_59: a JSON-null marker survives';
  end if;

  -- FIX still discloses, with a real array
  if (select jsonb_typeof(calc -> 'split_pending') from hr.pay_period_employment
       where employment_id = 'd94e52a2-02bb-410e-a76e-725aa508e1f3'
         and calc ? 'split_pending') <> 'array' then
    raise exception 'hr_l3_59: FIX''s real disclosure was lost';
  end if;

  -- decision 5: run the WRITER on a row with nothing to disclose; the key must be ABSENT
  select ppe.pay_period_id, ppe.employment_id into v_pid, v_eid
    from hr.pay_period_employment ppe
   where ppe.employment_id <> 'd94e52a2-02bb-410e-a76e-725aa508e1f3'
     and exists (select 1 from hr.work_interval wi
                  where wi.employment_id = ppe.employment_id and wi.is_current
                    and wi.pay_period_id = ppe.pay_period_id)
   limit 1;
  if v_pid is not null then
    perform hr._ppe_rollup_refresh(v_pid, v_eid);
    if (select calc ? 'split_pending' from hr.pay_period_employment
         where pay_period_id = v_pid and employment_id = v_eid) then
      raise exception 'hr_l3_59: the writer still emits an empty marker key';
    end if;
  end if;

  -- the rollup number is still the interval sum for that row
  if v_pid is not null and
     (select (calc ->> 'total_hours_exact')::numeric from hr.pay_period_employment
       where pay_period_id = v_pid and employment_id = v_eid)
     is distinct from
     (select sum(hours) from hr.work_interval
       where employment_id = v_eid and is_current and pay_period_id = v_pid) then
    raise exception 'hr_l3_59: the rollup stopped being the interval sum';
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 25 then
    raise exception 'hr_l3_59: expected at least 25 checks, found %', v_n;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_59: the gate is red on arrival: %', v_fail::text;
  end if;
end
$chk$;
