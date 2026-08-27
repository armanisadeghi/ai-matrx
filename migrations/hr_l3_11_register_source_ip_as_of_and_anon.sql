-- HR domain L3 — migration 11 (register item HRB-015, lane L3 punch + kiosk).
-- Full header and RECORDED TECHNICAL DECISIONS live in
-- matrx-frontend/migrations/hr_l3_11_register_source_ip_as_of_and_anon.sql.
-- Applied live as `hr_l3_11_register_source_ip_as_of_and_anon`. Idempotent.

create or replace function hr._punch_ip_visible(
  p_user uuid, p_employment_id uuid, p_at date, p_mine uuid[])
returns boolean
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
begin
  -- SPEC-TIME 4.7: "An employee can always see their own." No capability, no date, no exception.
  if p_employment_id = any(coalesce(p_mine, '{}'::uuid[])) then
    return true;
  end if;
  if p_user is null then return false; end if;
  -- 0 law 1: as_of is the date of the FACT, never now()
  return coalesce((hr._can_edit_punch(p_user, p_employment_id, p_at) ->> 'ok')::boolean, false);
end
$$;

comment on function hr._punch_ip_visible(uuid, uuid, date, uuid[]) is
  'L3: may this caller see source_ip on this punch? Self always (SPEC-TIME 4.7); everyone else needs punch-edit authority AS OF that punch local_work_date (0 law 1).';

do $outer$
declare
  v_def text; v_n int := 0; t record;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_register(jsonb,jsonb)'::regprocedure;

  if position('_punch_ip_visible' in v_def) > 0 then
    raise notice 'hr_l3_11: already applied';
    return;
  end if;

  for t in
    select * from (values
      (E'  if v_emp_ids is not null then\n    foreach e in array v_emp_ids loop\n      if e = any(v_mine)\n         or coalesce((hr._can_edit_punch(v_uid, e, current_date) ->> \'ok\')::boolean, false) then\n        v_ipok := v_ipok || e;\n      end if;\n    end loop;\n  end if;',
       E'  -- 🚨 source_ip visibility is resolved PER ROW, as of THAT punch local_work_date\n  -- (SPEC-TIME 4.7 + 0 law 1). The precomputed array this replaced was built only when explicit\n  -- employment ids were given, and used current_date - so an employee reading their OWN register,\n  -- and every org-wide pull, saw source_ip_visible:false on every row including their own punches.'),
      (E'\'source_ip_visible\', (f.employment_id = any(v_ipok)),',
       E'\'source_ip_visible\', hr._punch_ip_visible(v_uid, f.employment_id, f.local_work_date, v_mine),'),
      (E'\'source_ip\', case when f.employment_id = any(v_ipok) then host(f.source_ip) end,',
       E'\'source_ip\', case when hr._punch_ip_visible(v_uid, f.employment_id, f.local_work_date, v_mine)\n                                 then host(f.source_ip) end,'),
      (E'    \'source_ip_visible_for_employment_ids\', to_jsonb(v_ipok));',
       E'    \'source_ip_policy\', \'Your own punches always show source_ip. Anyone else needs punch-edit authority over that employee as of that punch work date.\');')
    ) x(from_txt, to_txt)
  loop
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_11: replacement target not found in hr.punch_register: %', left(t.from_txt, 70);
    end if;
    v_def := replace(v_def, t.from_txt, t.to_txt);
    v_n := v_n + 1;
  end loop;

  execute v_def;
  raise notice 'hr_l3_11: applied % replacement(s)', v_n;
end $outer$;

-- 🚨 Defence in depth. `revoke ... from anon` alone does NOT work: Postgres grants EXECUTE on every
-- new function to PUBLIC by default, and anon inherits it there. The revoke has to name PUBLIC.
-- Safe to revoke: nothing calls these hr bodies as a client role - the five public.hr_* wrappers
-- and public.hr_kiosk_punch are SECURITY DEFINER and execute as the owner, and `hr` is not exposed
-- to PostgREST at all.
revoke all on function hr.punch_register(jsonb, jsonb) from public, anon;
revoke all on function hr.punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) from public, anon;
revoke all on function hr.clock_state(uuid) from public, anon;
revoke all on function hr.punch_correct(uuid[], jsonb, text) from public, anon;
revoke all on function hr.punch_void(uuid, text) from public, anon;

do $$
declare v_def text; v_bad text;
begin
  v_def := pg_get_functiondef('hr.punch_register(jsonb,jsonb)'::regprocedure);
  if v_def not like '%_punch_ip_visible%' then
    raise exception 'hr_l3_11: punch_register does not use the per-row visibility predicate';
  end if;
  if v_def like '%any(v_ipok)%' then
    raise exception 'hr_l3_11: a v_ipok array test remains in punch_register';
  end if;
  if v_def like '%_can_edit_punch(v_uid, e, current_date)%' then
    raise exception 'hr_l3_11: punch_register still resolves authority at current_date';
  end if;

  select string_agg(f, ', ') into v_bad from unnest(array[
    'hr.punch_register(jsonb,jsonb)',
    'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)',
    'hr.clock_state(uuid)',
    'hr.punch_correct(uuid[],jsonb,text)',
    'hr.punch_void(uuid,text)']) f
   where has_function_privilege('anon', f::regprocedure, 'EXECUTE');
  if v_bad is not null then
    raise exception 'hr_l3_11: anon still holds EXECUTE on: %', v_bad;
  end if;

  -- and the client doors must still work
  if not has_function_privilege('authenticated','public.hr_punch_register(jsonb,jsonb)','EXECUTE')
     or not has_function_privilege('anon','public.hr_kiosk_punch(text,text,text,timestamptz,text,uuid,jsonb,jsonb)','EXECUTE') then
    raise exception 'hr_l3_11: a client door lost its grant';
  end if;
end $$;

