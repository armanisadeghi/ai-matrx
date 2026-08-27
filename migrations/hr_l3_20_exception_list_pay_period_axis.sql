-- HR domain L3 — migration 20 (register item HRB-015, lane L3 punch + kiosk).
--
-- `hr.attendance_exception_list` gains a `pay_period_id` filter axis, for the route-28 exceptions
-- strip (SPEC-TIME 5.4). Scalar, one value per axis, matching the shipped `employment_id` shape.
--
-- 🚨 WHY THIS IS NOT A DATE WINDOW. The obvious implementation - `local_work_date between
-- period_start_on and period_end_on` - is wrong at exactly the place that matters. Overtime is
-- computed on the whole WORKWEEK, and a workweek routinely straddles a period boundary; that is
-- what `hr.pay_period.boundary_workweek_ids` exists for. A naive window silently drops the
-- exceptions on the outside days of a boundary week - the days most likely to carry an unapproved-
-- overtime or missed-punch finding, because they are the ones whose hours land in a different
-- period than the calendar suggests. Silently returning FEWER rows than the period owns, on the
-- surface a manager approves from, is the failure mode worth engineering against.
--
-- THE ENVELOPE, in `hr._exception_in_pay_period`:
--   ROSTER - the employment is in the period when it has a `hr.pay_period_employment` row for it,
--     OR its `pay_group_id` is the period's pay group. The union is deliberate: the ppe row is the
--     authoritative per-employee timecard state, but it does not exist for everyone the moment a
--     period opens, and scoping to it alone would make the strip look empty on a fresh period.
--   DATES - the period's own range, OR any day inside a WORKWEEK tied to this period. A workweek
--     is tied when its id is in `boundary_workweek_ids`, or when it carries a current
--     `hr.work_interval` whose `pay_period_id` is this period. Both linkages are read because the
--     first is maintained by the period lane and the second by the recompute lane, and a row that
--     has only one of them is still genuinely in the period.
--
-- An unknown period is REFUSED BY NAME rather than returning an empty list, because "no exceptions
-- in this period" and "that period does not exist" are answers a manager would act on differently.
-- The id is also checked against the caller's organizations, so the refusal cannot be used to probe
-- whether a period id exists in someone else's tenant.
--
-- Applied live as `hr_l3_20_exception_list_pay_period_axis`. Idempotent.

create or replace function hr._exception_in_pay_period(
  p_employment_id uuid, p_date date, p_pay_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select exists (
    select 1
      from hr.pay_period pp
     where pp.id = p_pay_period_id
       -- ROSTER: the authoritative ppe row, or the pay group it has not been materialised for yet
       and (exists (select 1 from hr.pay_period_employment ppe
                     where ppe.pay_period_id = pp.id
                       and ppe.employment_id = p_employment_id)
            or exists (select 1 from hr.employment em
                        where em.id = p_employment_id
                          and em.pay_group_id = pp.pay_group_id))
       -- DATES: the period range, OR a workweek tied to this period (the boundary-week case)
       and (p_date between pp.period_start_on and pp.period_end_on
            or exists (
              select 1 from hr.workweek ww
               where ww.employment_id = p_employment_id
                 and p_date between ww.week_start_local_date and (ww.week_start_local_date + 6)
                 and (ww.id = any (coalesce(pp.boundary_workweek_ids, '{}'::uuid[]))
                      or exists (select 1 from hr.work_interval wi
                                  where wi.workweek_id = ww.id
                                    and wi.pay_period_id = pp.id
                                    and wi.is_current)))));
$$;

comment on function hr._exception_in_pay_period(uuid, date, uuid) is
  'L3: is this (employment, day) inside a pay period? Roster = pay_period_employment or the pay group; dates = the period range OR a workweek tied to the period. NOT a naive date window - that drops boundary-week days (SPEC-TIME 5.4, 9.6).';

do $outer$
declare
  v_def   text;
  v_anchor text;
  v_block  text;
  v_decl_from text;
  v_decl_to   text;
  v_gate_from text;
  v_gate_to   text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.attendance_exception_list(jsonb,jsonb)'::regprocedure;

  if position('_exception_in_pay_period' in v_def) > 0 then
    raise notice 'hr_l3_20: already applied';
    return;
  end if;

  -- 1. declare the resolved period id
  v_decl_from := '  f      jsonb := coalesce(p_filters, ''{}''::jsonb);';
  v_decl_to   := concat(
    '  f      jsonb := coalesce(p_filters, ''{}''::jsonb);', chr(10),
    '  v_period uuid;   -- hr_l3_20: the pay_period_id axis, resolved and validated once');

  -- 2. resolve + refuse an unknown period, after the page is computed
  v_gate_from := '  pg := hr._time_page(p_page);';
  v_gate_to := concat(
    '  pg := hr._time_page(p_page);', chr(10), chr(10),
    '  -- hr_l3_20: an unknown period is refused BY NAME. "No exceptions in this period" and "that', chr(10),
    '  -- period does not exist" are answers a manager acts on differently. Scoped to the caller''s', chr(10),
    '  -- organizations so the refusal cannot probe another tenant''s period ids.', chr(10),
    '  if f ->> ''pay_period_id'' is not null then', chr(10),
    '    begin', chr(10),
    '      v_period := (f ->> ''pay_period_id'')::uuid;', chr(10),
    '    exception when invalid_text_representation then', chr(10),
    '      return hr._time_refusal(''hr_pay_period_not_found'',', chr(10),
    '        ''That pay period id is not a valid identifier.'',', chr(10),
    '        jsonb_build_object(''pay_period_id'', f ->> ''pay_period_id''));', chr(10),
    '    end;', chr(10),
    '    if not exists (select 1 from hr.pay_period pp', chr(10),
    '                    where pp.id = v_period and pp.organization_id = any (v_orgs)) then', chr(10),
    '      return hr._time_refusal(''hr_pay_period_not_found'',', chr(10),
    '        ''That pay period does not exist in your organization, so its exceptions cannot be listed.'',', chr(10),
    '        jsonb_build_object(''pay_period_id'', v_period));', chr(10),
    '    end if;', chr(10),
    '  end if;');

  -- 3. the predicate itself, into BOTH the count CTE and the page CTE
  v_anchor := concat(
    '       and (f ->> ''work_location_id'' is null', chr(10),
    '            or ae.work_location_id = (f ->> ''work_location_id'')::uuid)');
  v_block := concat(
    v_anchor, chr(10),
    '       and (v_period is null', chr(10),
    '            or hr._exception_in_pay_period(ae.employment_id, ae.local_work_date, v_period))');

  if position(v_decl_from in v_def) = 0 then
    raise exception 'hr_l3_20: the declare block anchor was not found';
  end if;
  if position(v_gate_from in v_def) = 0 then
    raise exception 'hr_l3_20: the page anchor was not found';
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_20: the work_location_id predicate was not found';
  end if;

  v_def := replace(v_def, v_decl_from, v_decl_to);
  v_def := replace(v_def, v_gate_from, v_gate_to);
  v_def := replace(v_def, v_anchor, v_block);   -- hits both CTEs

  execute v_def;
end $outer$;

do $$
declare v_def text; v_n int;
begin
  v_def := pg_get_functiondef('hr.attendance_exception_list(jsonb,jsonb)'::regprocedure);
  if v_def not like '%hr_pay_period_not_found%' then
    raise exception 'hr_l3_20: the unknown-period refusal did not land';
  end if;
  -- the predicate must be in BOTH the count CTE and the page CTE, or the total disagrees with the rows
  v_n := (length(v_def) - length(replace(v_def, 'hr._exception_in_pay_period(ae.employment_id', '')))
         / length('hr._exception_in_pay_period(ae.employment_id');
  if v_n <> 2 then
    raise exception 'hr_l3_20: the period predicate appears % time(s), expected 2 (count CTE + page CTE)', v_n;
  end if;
end $$;
