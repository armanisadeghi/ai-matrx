-- HR domain L3 — migration 13c (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 A RECOMPUTE WAS SILENTLY RETIRING A STATUTORY PREMIUM SOMEBODY IS OWED. Found by execution.
-- The premium step correctly SKIPS a day that already carries its premium line (the one-per-day
-- cap). But the skipped row was then not in `v_new_ids`, and step 7 supersedes every current
-- interval in the week that is not in `v_new_ids` - so the second recompute of a week marked the
-- meal premium `is_current = false` and it vanished from every read. Measured: after one recompute
-- the day carried 1 current premium row; after a second, 0.
-- A meal-premium hour is a statutory payment. Losing it on an unrelated recompute is a wage
-- underpayment that no surface would show, because the row still exists - just not as current.
--
-- THE FIX: a deliberately-kept row is tracked and excluded from the supersede sweep. Skipping a
-- write and retiring the thing you skipped are opposite intentions, and the code now says which
-- one it means.
-- Applied live as `hr_l3_13c_recompute_preserves_premium_lines`. Idempotent.

do $outer$
declare
  v_def text; v_n int := 0; t record;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('v_keep' in v_def) > 0 then
    raise notice 'hr_l3_13c: already applied'; return;
  end if;

  for t in
    select * from (values
      (E'  v_prem      jsonb := ''[]''::jsonb;',
       E'  v_prem      jsonb := ''[]''::jsonb;\n  v_keep      uuid[] := ''{}'';   -- rows deliberately kept current; never superseded below\n  v_keep_id   uuid;'),
      (E'    if exists (select 1 from hr.work_interval w\n                where w.employment_id = p_employment_id and w.is_current\n                  and w.local_work_date = r.local_work_date\n                  and w.earning_code_id = v_ec) then\n      continue;\n    end if;',
       E'    -- Already carries this premium for that day: KEEP it current rather than rewriting it,\n    -- and protect it from the supersede sweep. Skipping a write and retiring what you skipped are\n    -- opposite intentions; a recompute that ships no new intervals must not retire a statutory line.\n    select w.id into v_keep_id from hr.work_interval w\n      where w.employment_id = p_employment_id and w.is_current\n        and w.local_work_date = r.local_work_date\n        and w.earning_code_id = v_ec\n      limit 1;\n    if v_keep_id is not null then\n      v_keep := v_keep || v_keep_id;\n      v_keep_id := null;\n      continue;\n    end if;'),
      (E'       and not (w.id = any(v_new_ids))\n    returning w.id)',
       E'       and not (w.id = any(v_new_ids || v_keep))\n    returning w.id)')
    ) x(from_txt, to_txt)
  loop
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_13c: replacement target not found: %', left(t.from_txt, 90);
    end if;
    v_def := replace(v_def, t.from_txt, t.to_txt);
    v_n := v_n + 1;
  end loop;

  execute v_def;
  raise notice 'hr_l3_13c: applied % replacement(s)', v_n;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
  if v_def not like '%any(v_new_ids || v_keep)%' then
    raise exception 'hr_l3_13c: the supersede sweep does not honour kept rows';
  end if;
end $$;

