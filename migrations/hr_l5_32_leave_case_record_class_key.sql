-- HR domain L5 — migration 32 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 hr.leave_case_open hardcoded record_class_key = 'medical', which is not in hr.record_class
-- and raised 23503 on EVERY case open. The FIX 1 column drift (42703, hr_l5_31) fired one line
-- earlier and MASKED it, so a real case could never be opened even after FIX 1 — this had to be
-- fixed for the acceptance criterion ("a real leave admin opening a case returns a real case") to
-- actually hold. The correct class is `leave_case_medical` — the ONLY `hr.record_class` whose
-- `entity_tokens` is exactly `['hr_leave_case']` ("Protected and extended leave cases carrying
-- medical facts", restricted tier). Resolved FROM the registry by its entity token, never guessed,
-- so a future rename of the class key is caught here rather than at a live case open.
--
-- Applied live as `hr_l5_32_leave_case_record_class_key`. Idempotent.

do $$
declare v_def text; v_new text; v_key text;
begin
  -- the record class that OWNS the hr_leave_case token — read, never assumed
  select class_key into v_key
    from hr.record_class
   where entity_tokens @> array['hr_leave_case'] and is_active and deleted_at is null
   limit 1;
  if v_key is null then
    raise exception 'hr_l5_32: no active record_class owns hr_leave_case — cannot resolve the key';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_case_open';

  if v_def not like '%''leave_case_engine'', ''1'', ''{}''::jsonb,%'
     or v_def like '%' || quote_literal(v_key) || ', v_org)%' then
    raise notice 'hr_l5_32: leave_case_open already uses the correct record class — nothing to do.';
  else
    -- the literal sits between the engine tag and v_org in the values list
    v_new := replace(v_def, E'\n     ''medical'', v_org)', E'\n     ' || quote_literal(v_key) || ', v_org)');
    if v_new = v_def then
      raise exception 'hr_l5_32: the ''medical'' literal did not match — re-derive from the live body';
    end if;
    execute v_new;
  end if;
end $$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'leave_case_open', 'hr_l5_32',
   array['leave_case_medical'],
   array[E'\n     ''medical'', v_org'],
   'hr_l5_32: hr_leave_case''s record_class is leave_case_medical (the class whose entity_tokens is [hr_leave_case]). The original hardcoded ''medical'' does not exist in hr.record_class and 23503''d on every case open. If the class key is renamed, this must break at cert, not at a live case open.',
   true)
on conflict do nothing;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_case_open';
  if v_def like E'%\n     ''medical'', v_org)%' then
    raise exception 'hr_l5_32: the nonexistent ''medical'' record class key survives';
  end if;
  if v_def not like '%leave_case_medical%' then
    raise exception 'hr_l5_32: the correct leave_case_medical key did not land';
  end if;
end $$;
