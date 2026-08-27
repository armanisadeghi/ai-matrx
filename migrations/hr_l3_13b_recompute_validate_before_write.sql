-- HR domain L3 — migration 13b (register item HRB-015, lane L3 punch + kiosk).
--
-- TWO DEFECTS IN `hr.recompute_apply`, BOTH FOUND BY EXECUTION.
--
-- 🚨 1. A REFUSAL AFTER A PARTIAL WRITE, WHICH POISONED THE IDEMPOTENCY KEY.
--    The workweek row was written at step 4 and the intervals at step 5. An interval that failed
--    validation returned a refusal envelope - but the workweek row, carrying
--    `calc.recompute_idempotency_key`, was already in. The caller's retry with the SAME key then
--    matched the replay branch and returned `replayed: true` with ZERO intervals, reporting success
--    for a recompute that never wrote anything. Proven live: two refused calls left a workweek row
--    behind and the third call replayed it. A retry that silently converts a failure into a success
--    is the worst shape a failure can take on a payroll figure.
--    THE FIX IS THE DISCIPLINE THE REST OF THIS LANE ALREADY USES: validate everything, write
--    nothing. Every interval is resolved and checked BEFORE the workweek row is touched. The
--    idempotency key is therefore only ever stamped on a recompute that fully landed.
--
-- 🚨 2. EARNING CODES WERE RESOLVED IN THE CALLER'S ORG ONLY, SO NO ORG COULD RECOMPUTE.
--    `hr.earning_code` is seeded in the SYSTEM org (39c38960-…) as the platform set - verified
--    live: 38 codes, none of them in the organization under test. An organization that has not
--    authored its own codes therefore could not recompute a single hour. That is over-tightening,
--    weighed exactly as heavily as a leak. Resolution now falls back to the system org, with the
--    organization's OWN code winning where both exist - the same precedence `hr.capability` uses
--    for `hr.access_role`, so an org can override a platform code without forking the lookup.
--
-- Applied live as `hr_l3_13b_recompute_validate_before_write`. Idempotent.

create or replace function hr._earning_code_id(p_organization_id uuid, p_code text)
returns uuid
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select ec.id from hr.earning_code ec
   where ec.code = p_code
     and ec.deleted_at is null
     and ec.organization_id in (p_organization_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
   -- the organization's own row wins over the platform seed of the same code
   order by (ec.organization_id = p_organization_id) desc, ec.is_active desc
   limit 1;
$$;

comment on function hr._earning_code_id(uuid, text) is
  'L3: resolve an earning code for an org, falling back to the SYSTEM org platform set. The org own code wins where both exist.';

do $outer$
declare
  v_def text; v_n int := 0; t record;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('VALIDATE EVERYTHING, WRITE NOTHING' in v_def) > 0 then
    raise notice 'hr_l3_13b: already applied'; return;
  end if;

  for t in
    select * from (values
      -- (a) insert the pre-pass immediately before the workweek write
      (E'  ---------------------------------------------------------------- 4. the workweek row\n  perform hr.arm_write();',
       E'  ---------------------------------------------------------------- 3b. VALIDATE EVERYTHING, WRITE NOTHING\n  -- Every earning code is resolved BEFORE the workweek row is touched, so a bad interval can\n  -- never leave a workweek behind carrying an idempotency key for a recompute that did not land.\n  for v_iv in select * from jsonb_array_elements(p_intervals) loop\n    if coalesce((v_iv ->> ''earning_code_id'')::uuid,\n                hr._earning_code_id(v_org, v_iv ->> ''earning_code'')) is null then\n      return hr._punch_refusal(''hr_recompute_unknown_earning_code'',\n        ''An interval names an earning code this organization does not have, and the platform set ''\n        || ''does not carry it either. Every computed interval carries an earning code; the badge ''\n        || ''reads its name, never an enum token.'',\n        jsonb_build_object(''earning_code'', v_iv ->> ''earning_code'',\n                           ''local_work_date'', v_iv ->> ''local_work_date'',\n                           ''organization_id'', v_org));\n    end if;\n  end loop;\n\n  ---------------------------------------------------------------- 4. the workweek row\n  perform hr.arm_write();'),
      -- (b) the write-loop lookup now uses the shared resolver, and can no longer refuse mid-write
      (E'    v_ec := coalesce((v_iv ->> ''earning_code_id'')::uuid,\n                     (select ec.id from hr.earning_code ec\n                       where ec.organization_id = v_org and ec.code = (v_iv ->> ''earning_code'')\n                         and ec.deleted_at is null limit 1));\n    if v_ec is null then\n      return hr._punch_refusal(''hr_recompute_unknown_earning_code'',\n        ''An interval names an earning code this organization does not have. Every computed interval ''\n        || ''carries an earning code; the badge reads its name, never an enum token.'',\n        jsonb_build_object(''earning_code'', v_iv ->> ''earning_code'',\n                           ''local_work_date'', v_iv ->> ''local_work_date''));\n    end if;',
       E'    -- already proven resolvable by the 3b pre-pass; this cannot refuse mid-write\n    v_ec := coalesce((v_iv ->> ''earning_code_id'')::uuid,\n                     hr._earning_code_id(v_org, v_iv ->> ''earning_code''));'),
      -- (c) premium codes resolve through the same fallback
      (E'    select ec.id into v_ec from hr.earning_code ec\n     where ec.organization_id = v_org and ec.deleted_at is null and ec.is_active\n       and ec.code = case when r.exception_kind = ''meal_not_provided''\n                          then ''MEAL_PREMIUM'' else ''REST_PREMIUM'' end\n     limit 1;',
       E'    v_ec := hr._earning_code_id(v_org, case when r.exception_kind = ''meal_not_provided''\n                                                 then ''MEAL_PREMIUM'' else ''REST_PREMIUM'' end);')
    ) x(from_txt, to_txt)
  loop
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_13b: replacement target not found: %', left(t.from_txt, 90);
    end if;
    v_def := replace(v_def, t.from_txt, t.to_txt);
    v_n := v_n + 1;
  end loop;

  execute v_def;
  raise notice 'hr_l3_13b: applied % replacement(s)', v_n;
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
  if v_def not like '%VALIDATE EVERYTHING, WRITE NOTHING%' then
    raise exception 'hr_l3_13b: the pre-pass did not land';
  end if;
  if v_def like '%where ec.organization_id = v_org and ec.code =%' then
    raise exception 'hr_l3_13b: an org-only earning code lookup remains';
  end if;
  if v_def not like '%_earning_code_id%' then
    raise exception 'hr_l3_13b: the shared earning-code resolver is not used';
  end if;
end $$;

