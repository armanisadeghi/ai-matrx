-- HR domain L3 — migration 13d (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 `hr.recompute_apply` REFUSED A LEGITIMATE hr_owner, AND THE MESSAGE BLAMED THE CALLER.
-- Found by execution. The authority check resolved its `as_of` as
-- `(p_workweek ->> 'week_start_local_date')::date` — an OPTIONAL field. Everywhere else in the
-- function that field is optional and defaulted from `week_start_at` + `tz`; only the authority
-- check took it raw. When the engine omits it (it is derivable, so omitting it is reasonable) the
-- date is NULL, `hr.employments_of(user, NULL)` returns nothing, `hr.capability` returns false, and
-- the call answers `hr_no_recompute_authority` — "needs the engine service role, or
-- working_record.write over that employee. Neither applies here." The caller had exactly that.
-- A refusal that names the wrong cause is worse than a crash: it sends whoever is debugging it to
-- re-grant a role that was never missing.
--
-- THE FIX: the authority date is derived once into `v_as_of`, the same way the workweek row derives
-- it, so the two cannot disagree. `week_end_at` is the last-resort fallback, so the date is never
-- NULL while the envelope is well-formed at all.
-- Applied live as `hr_l3_13d_recompute_authority_as_of`. Idempotent.

do $outer$
declare
  v_def text; v_n int := 0; t record;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('v_as_of' in v_def) > 0 then
    raise notice 'hr_l3_13d: already applied'; return;
  end if;

  for t in
    select * from (values
      (E'  v_keep_id   uuid;',
       E'  v_keep_id   uuid;\n  v_as_of     date;   -- the ONE authority date, derived once (hr_l3_13d)'),
      (E'  ---------------------------------------------------------------- 1. authority (decision 2)',
       E'  -- 🚨 hr_l3_13d: derived exactly as the workweek row derives it. week_start_local_date is\n  -- OPTIONAL; taking it raw made a legitimate hr_owner look unauthorised.\n  v_as_of := coalesce(\n    (p_workweek ->> ''week_start_local_date'')::date,\n    (v_wk_start at time zone coalesce(p_workweek ->> ''tz'', ''UTC''))::date,\n    (v_wk_end   at time zone coalesce(p_workweek ->> ''tz'', ''UTC''))::date);\n\n  ---------------------------------------------------------------- 1. authority (decision 2)'),
      (E'          or coalesce((hr._can_edit_punch(v_uid, p_employment_id,\n                        (p_workweek ->> ''week_start_local_date'')::date) ->> ''ok'')::boolean, false)\n          or hr._punch_capability(v_uid, ''working_record.write'', p_employment_id,\n                                  (p_workweek ->> ''week_start_local_date'')::date)) then',
       E'          or coalesce((hr._can_edit_punch(v_uid, p_employment_id, v_as_of) ->> ''ok'')::boolean, false)\n          or hr._punch_capability(v_uid, ''working_record.write'', p_employment_id, v_as_of)) then'),
      (E'                         ''subject_employment_id'', p_employment_id));',
       E'                         ''subject_employment_id'', p_employment_id,\n                         ''as_of'', v_as_of));')
    ) x(from_txt, to_txt)
  loop
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_13d: replacement target not found: %', left(t.from_txt, 90);
    end if;
    v_def := replace(v_def, t.from_txt, t.to_txt);
    v_n := v_n + 1;
  end loop;

  execute v_def;
  raise notice 'hr_l3_13d: applied % replacement(s)', v_n;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
  if v_def not like '%v_as_of := coalesce(%' then
    raise exception 'hr_l3_13d: the derived authority date did not land';
  end if;
  -- EXACT string, not a wildcard span: the old two-line authority expression must be gone.
  if position(
       E'or hr._punch_capability(v_uid, ''working_record.write'', p_employment_id,\n                                  (p_workweek ->> ''week_start_local_date'')::date)) then'
       in v_def) > 0 then
    raise exception 'hr_l3_13d: the authority check still reads the raw optional field';
  end if;
  if v_def not like '%hr._punch_capability(v_uid, ''working_record.write'', p_employment_id, v_as_of)%' then
    raise exception 'hr_l3_13d: the authority check does not use the derived date';
  end if;
end $$;
