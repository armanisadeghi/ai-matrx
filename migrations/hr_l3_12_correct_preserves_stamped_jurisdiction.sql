-- HR domain L3 — migration 12 (register item HRB-015, lane L3 punch + kiosk).
-- Full header and RECORDED TECHNICAL DECISIONS live in
-- matrx-frontend/migrations/hr_l3_12_correct_preserves_stamped_jurisdiction.sql.
--
-- 🚨 `hr.punch_correct` RE-RESOLVED JURISDICTION INSTEAD OF PRESERVING THE STAMP, BREAKING 0 LAW 3.
-- It called `hr._punch_resolve_juris(employment_id, new_occurred_at)` and only refused when the
-- RECOMPUTED `local_work_date` differed - so the replacement punch was stamped with TODAY'S
-- position assignment. Correct a punch from three weeks ago after the employee transferred sites,
-- and the replacement silently lands in the new location, the new jurisdiction and the new
-- timezone. Every downstream figure - meal premiums, daily OT, the workday split - is then computed
-- under the wrong state's law, and the register shows two punches on one day claiming two different
-- jurisdictions with no edit between them.
--
-- SPEC-TIME 0 law 3: "Jurisdiction is read from the stamped record, never recomputed. `p_as_of` is
-- always the event date, never `now()`." A correction changes WHEN or WHAT KIND, never WHERE - a
-- punch that belongs to a different location is a void plus a new punch, which is exactly the door
-- the cross-work-date refusal already points at.
--
-- The resolver call is removed rather than repaired. The only thing it was still needed for was
-- computing the new `local_work_date` for the cross-date guard, and the ORIGINAL punch's stamped
-- `tz` is the correct clock for that by definition. Removing it also deletes a whole class of
-- failure: a correction can no longer be refused with `hr_punch_no_jurisdiction` because the
-- employee's assignment lapsed since the punch was made.
--
-- Applied live as `hr_l3_12_correct_preserves_stamped_jurisdiction`. Idempotent.

do $outer$
declare
  v_def text; v_n int := 0; t record;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_correct(uuid[],jsonb,text)'::regprocedure;

  if position('law 3: the replacement carries the ORIGINAL' in v_def) > 0 then
    raise notice 'hr_l3_12: already applied';
    return;
  end if;

  for t in
    select * from (values
      -- 1. the guard: use the ORIGINAL's stamped tz, and stop re-resolving
      (E'    ------------------------------------ decision 4: never across local_work_date\n    v_juris := hr._punch_resolve_juris(v_p.employment_id, v_new_at);\n    if not (v_juris ->> \'ok\')::boolean then\n      return hr._punch_refusal(\'hr_punch_no_jurisdiction\',\n        \'The new time falls on a date with no position assignment, so the governing jurisdiction \'\n        || \'cannot be resolved for it.\', v_juris || jsonb_build_object(\'punch_id\', v_id));\n    end if;\n    if (v_juris ->> \'local_work_date\')::date <> v_p.local_work_date then',
       E'    ------------------------------------ decision 4: never across local_work_date\n    -- 🚨 0 law 3: the replacement carries the ORIGINAL punch stamped {{JURIS}} verbatim. The new\n    -- local_work_date is computed in the ORIGINAL tz, which is the only correct clock for a fact\n    -- that already happened. Re-resolving the position assignment here would silently re-stamp a\n    -- three-week-old correction into whatever location the employee works at TODAY.\n    if ((v_new_at at time zone v_p.tz)::date) <> v_p.local_work_date then'),
      -- 2. the refusal message: name the recomputed date without the resolver
      (E'        \'That change would move the punch from \' || v_p.local_work_date::text || \' to \'\n        || (v_juris ->> \'local_work_date\') || \'. A punch never moves between work days: void this \'\n        || \'one and record a new punch on the correct day.\',\n        jsonb_build_object(\'punch_id\', v_id, \'from\', v_p.local_work_date,\n                           \'to\', (v_juris ->> \'local_work_date\')::date,',
       E'        \'That change would move the punch from \' || v_p.local_work_date::text || \' to \'\n        || ((v_new_at at time zone v_p.tz)::date)::text || \'. A punch never moves between work days: void this \'\n        || \'one and record a new punch on the correct day.\',\n        jsonb_build_object(\'punch_id\', v_id, \'from\', v_p.local_work_date,\n                           \'to\', (v_new_at at time zone v_p.tz)::date,'),
      -- 3. the plan: carry the stamp, not a recomputation
      (E'      \'position_assignment_id\', v_juris ->> \'position_assignment_id\',\n      \'work_location_id\', v_juris ->> \'work_location_id\',\n      \'jurisdiction_id\', v_juris ->> \'jurisdiction_id\',\n      \'tz\', v_juris ->> \'tz\',',
       E'      \'position_assignment_id\', v_p.position_assignment_id,\n      \'work_location_id\', v_p.work_location_id,\n      \'jurisdiction_id\', v_p.jurisdiction_id,\n      \'tz\', v_p.tz,')
    ) x(from_txt, to_txt)
  loop
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_12: replacement target not found in hr.punch_correct: %', left(t.from_txt, 80);
    end if;
    v_def := replace(v_def, t.from_txt, t.to_txt);
    v_n := v_n + 1;
  end loop;

  execute v_def;
  raise notice 'hr_l3_12: applied % replacement(s)', v_n;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.punch_correct(uuid[],jsonb,text)'::regprocedure);
  if v_def like '%_punch_resolve_juris%' then
    raise exception 'hr_l3_12: hr.punch_correct still re-resolves jurisdiction';
  end if;
  if v_def not like '%v_p.work_location_id%' or v_def not like '%v_p.jurisdiction_id%'
     or v_def not like '%v_p.position_assignment_id%' then
    raise exception 'hr_l3_12: hr.punch_correct does not carry the original stamp';
  end if;
end $$;

