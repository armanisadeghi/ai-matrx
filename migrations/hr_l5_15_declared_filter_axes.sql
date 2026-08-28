-- HR domain L5 — migration 15 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 TWO DOORS THAT DECLARED A FILTER PARAMETER AND READ ALMOST NOTHING FROM IT.
--
-- `hr.leave_calendar(p_organization_id, p_from, p_to, **p_filters**)` read **nothing** from
-- `p_filters`. `hr.leave_balances(p_organization_id, p_scope, **p_filters**)` read exactly two of
-- the seven axes SPEC-LEAVE §5.1 names. A parameter a door advertises and ignores is worse than
-- one it never offered: the caller believes the list is scoped, the list is not, and **nothing
-- anywhere says so**. On a balances list that is a wrong number in front of an administrator; on a
-- who's-out calendar it is other people's absences rendered to somebody who filtered them out.
--
-- The axes are not invented here. §5.1: *"Filters: policy, department, location, manager,
-- negative-only, capped-out-only, expiring-carryover-only."* §10: *"Filters: team (my reports / a
-- department / a location), leave type, policy. Grouping by person or by day."*
--
-- **The unknown-key refusal is the program's existing one, not a variant.** `hr_l3_21` established
-- it on `hr.punch_register` and `hr.attendance_exception_list`: an unknown axis is REFUSED BY NAME
-- with the offending keys listed, because *a misspelled axis must never quietly widen* the result.
-- Same code, same refusal key (`hr_unknown_filter_axis`), same `unknown_axes` payload.
--
-- Authority: SPEC-LEAVE §5.1, §10, §2.3; the hr_l3_21 filter-axis discipline.
-- Applied live as `hr_l5_15_declared_filter_axes`. Idempotent.

-- -----------------------------------------------------------------------------------
-- 1. The shared refusal, in the shape the time lane already uses
-- -----------------------------------------------------------------------------------

create or replace function hr._leave_unknown_axes(p_filters jsonb, p_allowed text[])
returns jsonb
language sql
immutable
as $function$
  select (select jsonb_agg(k order by k)
            from jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) k
           where k <> all(p_allowed));
$function$;

comment on function hr._leave_unknown_axes(jsonb, text[]) is
  'The keys a caller passed that the door does not have. Named once so both leave lists refuse '
  'identically and neither can drift into silently ignoring an axis (hr_l3_21''s discipline).';

-- -----------------------------------------------------------------------------------
-- 2. /hr/leave/balances — all seven §5.1 axes
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_balances(
  p_organization_id uuid, p_scope text default 'organization', p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_uid uuid := auth.uid(); v_me uuid; v_rows jsonb := '[]'::jsonb; v_r record;
  v_fig jsonb; v_scope text; v_unknown jsonb;
  v_allowed constant text[] := array[
    'leave_policy_id','department_id','location_id','manager_employment_id',
    'negative_only','capped_out_only','expiring_carryover_only'];
  v_expires date; v_expiring numeric;
begin
  p_filters := coalesce(p_filters, '{}'::jsonb);

  -- hr_l3_21's discipline: refuse by name, never quietly widen.
  v_unknown := hr._leave_unknown_axes(p_filters, v_allowed);
  if v_unknown is not null then
    return jsonb_build_object(
      'granted', false, 'reason','hr_unknown_filter_axis',
      'detail','That filter names an axis this list does not have. Nothing was returned, because '
            || 'a misspelled axis must never quietly widen a list of other people''s balances.',
      'unknown_axes', v_unknown,
      'known_axes', to_jsonb(v_allowed));
  end if;

  v_rung := hr._leave_admin_rung(p_organization_id);
  select em.id into v_me
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;

  -- THE VIEW LAW (SPEC-ACCESS §4.1): every list declares its scope IN WORDS, and `mine` is the
  -- default. An org-wide list is a deliberate choice a role has to carry.
  v_scope := case
    when p_scope = 'organization' and v_rung in ('hr_admin','hr_owner','payroll_admin','leave_administrator')
      then 'organization'
    when p_scope in ('team','organization') and v_rung = 'manager' then 'team'
    else 'mine' end;

  for v_r in
    select en.employment_id, en.leave_policy_id, p.name as policy_name, p.leave_kind,
           p.balance_cap, p.carryover_expires_after_days
      from hr.leave_enrollment en
      join hr.leave_policy p on p.id = en.leave_policy_id and p.deleted_at is null
      join hr.employment em on em.id = en.employment_id and em.deleted_at is null
     where en.organization_id = p_organization_id and en.deleted_at is null
       and (en.effective_to is null or en.effective_to >= current_date)
       and (
         (v_scope = 'organization')
         or (v_scope = 'mine' and en.employment_id = v_me)
         or (v_scope = 'team' and exists (
               select 1 from hr.reporting_line rl
                where rl.employment_id = en.employment_id
                  and rl.manager_employment_id = v_me and rl.deleted_at is null))
       )
       and (p_filters ->> 'leave_policy_id' is null
            or en.leave_policy_id = (p_filters ->> 'leave_policy_id')::uuid)
       -- §5.1 department / location / manager: read off the primary assignment in force today,
       -- which is where the working record actually says a person sits.
       and (p_filters ->> 'department_id' is null or exists (
              select 1 from hr.position_assignment pa
               where pa.employment_id = en.employment_id and pa.is_primary and pa.deleted_at is null
                 and pa.effective_from <= current_date
                 and (pa.effective_to is null or pa.effective_to > current_date)
                 and pa.department_id = (p_filters ->> 'department_id')::uuid))
       and (p_filters ->> 'location_id' is null or exists (
              select 1 from hr.position_assignment pa
               where pa.employment_id = en.employment_id and pa.is_primary and pa.deleted_at is null
                 and pa.effective_from <= current_date
                 and (pa.effective_to is null or pa.effective_to > current_date)
                 and pa.location_id = (p_filters ->> 'location_id')::uuid))
       and (p_filters ->> 'manager_employment_id' is null or exists (
              select 1 from hr.reporting_line rl
               where rl.employment_id = en.employment_id and rl.deleted_at is null
                 and rl.manager_employment_id = (p_filters ->> 'manager_employment_id')::uuid))
  loop
    v_fig := hr.leave_figures(v_r.employment_id, v_r.leave_policy_id, current_date);

    -- the expiring-carryover axis needs the date, and §5's own sentence variant needs the hours,
    -- so both are computed here and returned whether or not the axis was used.
    v_expires := null; v_expiring := null;
    if v_r.carryover_expires_after_days is not null then
      select l.occurred_on + v_r.carryover_expires_after_days, l.hours_delta
        into v_expires, v_expiring
        from hr.leave_ledger l
       where l.employment_id = v_r.employment_id and l.leave_policy_id = v_r.leave_policy_id
         and l.entry_kind = 'carryover'
       order by l.occurred_on desc, l.created_at desc limit 1;
      if v_expires is not null and v_expires < current_date then
        v_expires := null; v_expiring := null;   -- already past: nothing is expiring
      end if;
    end if;

    if coalesce((p_filters ->> 'negative_only')::boolean, false)
       and coalesce((v_fig ->> 'ledger_balance')::numeric, 0) >= 0 then
      continue;
    end if;
    if coalesce((p_filters ->> 'capped_out_only')::boolean, false)
       and (v_r.balance_cap is null
            or coalesce((v_fig ->> 'ledger_balance')::numeric, 0) < v_r.balance_cap) then
      continue;
    end if;
    if coalesce((p_filters ->> 'expiring_carryover_only')::boolean, false)
       and (v_expires is null or coalesce(v_expiring, 0) <= 0) then
      continue;
    end if;

    v_rows := v_rows || jsonb_build_array(v_fig || jsonb_build_object(
      'employment_id', v_r.employment_id,
      'employee_name', hr._subject_display_name(v_r.employment_id, v_uid),
      'sentence', hr._leave_sentence(v_fig),
      'carryover_expires_on', v_expires,
      'carryover_expiring_hours', v_expiring,
      'capped_out', (v_r.balance_cap is not null
                     and coalesce((v_fig ->> 'ledger_balance')::numeric, 0) >= v_r.balance_cap),
      'ledger_href', format('/hr/leave/balances/%s/%s', v_r.employment_id, v_r.leave_policy_id)));
  end loop;

  return jsonb_build_object(
    'granted', v_rung <> 'none' or v_me is not null,
    'scope', v_scope,
    'scope_label', case v_scope when 'organization' then 'Organization'
                                when 'team' then 'My team' else 'Mine' end,
    'rung', v_rung,
    'can_adjust', v_rung in ('hr_admin','hr_owner'),
    'filters_applied', p_filters,
    'known_axes', to_jsonb(v_allowed),
    'rows', v_rows);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 3. /hr/leave/calendar — the §10 axes, and the grouping
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_calendar(
  p_organization_id uuid, p_from date, p_to date, p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_uid uuid := auth.uid(); v_me uuid; v_rung text; v_rows jsonb := '[]'::jsonb; v_r record;
  v_peers boolean; v_shows_type boolean; v_case_visible boolean; v_rung_for text;
  v_unknown jsonb; v_group text;
  v_allowed constant text[] := array[
    'team','department_id','location_id','leave_type','leave_policy_id','group_by'];
begin
  p_filters := coalesce(p_filters, '{}'::jsonb);

  v_unknown := hr._leave_unknown_axes(p_filters, v_allowed);
  if v_unknown is not null then
    return jsonb_build_object(
      'granted', false, 'reason','hr_unknown_filter_axis',
      'detail','That filter names an axis the who''s-out calendar does not have. Nothing was '
            || 'returned, because a misspelled axis must never quietly widen a view of other '
            || 'people''s absences.',
      'unknown_axes', v_unknown,
      'known_axes', to_jsonb(v_allowed));
  end if;

  v_group := coalesce(nullif(p_filters ->> 'group_by',''), 'person');
  if v_group not in ('person','day') then
    return jsonb_build_object('granted', false, 'reason','hr_unknown_grouping',
      'detail','The calendar groups by person or by day.', 'group_by', v_group);
  end if;

  select em.id into v_me
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;
  if v_me is null and v_uid is null then
    return jsonb_build_object('granted', false, 'reason','no_authenticated_caller');
  end if;
  v_rung := hr._leave_admin_rung(p_organization_id);
  v_peers := coalesce((hr._hr_knob('hr.leave','who_is_out_visible_to_peers', p_organization_id,'true'::jsonb) #>> '{}')::boolean, true);
  v_shows_type := coalesce((hr._hr_knob('hr.leave','who_is_out_shows_type', p_organization_id,'false'::jsonb) #>> '{}')::boolean, false);
  v_case_visible := coalesce((hr._hr_knob('hr.leave','case_existence_visible_to_manager', p_organization_id,'true'::jsonb) #>> '{}')::boolean, true);

  for v_r in
    select r.id, r.employment_id, r.starts_on, r.ends_on, r.approved_hours, r.is_partial_day,
           r.leave_case_id, p.leave_kind, p.name as policy_name
      from hr.leave_request r
      join hr.leave_policy p on p.id = r.leave_policy_id
     where r.organization_id = p_organization_id and r.deleted_at is null
       and r.state in ('approved','taken','partially_taken')
       and daterange(r.starts_on, r.ends_on, '[]') && daterange(p_from, p_to, '[]')
       and (p_filters ->> 'leave_policy_id' is null
            or r.leave_policy_id = (p_filters ->> 'leave_policy_id')::uuid)
       and (p_filters ->> 'leave_type' is null or p.leave_kind = p_filters ->> 'leave_type')
       -- "team" means MY REPORTS, which is the manager's own reading of the word
       and (coalesce((p_filters ->> 'team')::boolean, false) is not true
            or exists (select 1 from hr.reporting_line rl
                        where rl.employment_id = r.employment_id
                          and rl.manager_employment_id = v_me and rl.deleted_at is null))
       and (p_filters ->> 'department_id' is null or exists (
              select 1 from hr.position_assignment pa
               where pa.employment_id = r.employment_id and pa.is_primary and pa.deleted_at is null
                 and pa.effective_from <= current_date
                 and (pa.effective_to is null or pa.effective_to > current_date)
                 and pa.department_id = (p_filters ->> 'department_id')::uuid))
       and (p_filters ->> 'location_id' is null or exists (
              select 1 from hr.position_assignment pa
               where pa.employment_id = r.employment_id and pa.is_primary and pa.deleted_at is null
                 and pa.effective_from <= current_date
                 and (pa.effective_to is null or pa.effective_to > current_date)
                 and pa.location_id = (p_filters ->> 'location_id')::uuid))
     order by r.starts_on
  loop
    -- the rung is decided HERE, and only what the rung permits leaves this function.
    v_rung_for := case
      when v_r.employment_id = v_me then 'self'
      when v_rung in ('hr_admin','hr_owner','leave_administrator') then 'admin'
      when exists (select 1 from hr.reporting_line rl
                    where rl.employment_id = v_r.employment_id
                      and rl.manager_employment_id = v_me and rl.deleted_at is null) then 'manager'
      else 'peer' end;

    if v_rung_for = 'peer' and not v_peers then
      continue;   -- the knob is off: the person does not appear at all
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'employment_id', v_r.employment_id,
      'employee_name', hr._subject_display_name(v_r.employment_id, v_uid),
      'starts_on', v_r.starts_on, 'ends_on', v_r.ends_on,
      'partial_day', v_r.is_partial_day,
      'viewer_rung', v_rung_for,
      'label', case
        when v_r.leave_case_id is not null and v_rung_for in ('manager')
          then case when v_case_visible then 'Out — approved leave' else 'Out' end
        when v_rung_for = 'peer'
          then case when v_shows_type then format('Out — %s', v_r.leave_kind) else 'Out' end
        when v_rung_for in ('self','admin','manager')
          then format('Out — %s', v_r.policy_name)
        else 'Out' end,
      'existence_statement', case
        when v_r.leave_case_id is not null and v_rung_for = 'manager' and v_case_visible
          then 'This person has an approved leave. Details are held by HR.'
        else null end,
      'hours', case when v_rung_for in ('self','admin','manager') then v_r.approved_hours end,
      -- a peer's "Out" is not a door (§10)
      'href', case when v_rung_for = 'peer' then null
                   when v_rung_for = 'self' then '/hr/me/time-off'
                   else format('/hr/leave?request=%s', v_r.id) end,
      'case_linked', case when v_rung_for in ('admin','self') then (v_r.leave_case_id is not null) end));
  end loop;

  return jsonb_build_object(
    'granted', true, 'from', p_from, 'to', p_to, 'rung', v_rung,
    'group_by', v_group,
    'filters_applied', p_filters,
    'known_axes', to_jsonb(v_allowed),
    'entries', v_rows,
    -- empty is a STATE, not a blank (§10). It now says WHY it is empty, because "nobody is out"
    -- and "nobody matches your filter" are different facts and only one of them is reassuring.
    'empty_statement', case when jsonb_array_length(v_rows) = 0 then
      case when p_filters = '{}'::jsonb then 'Nobody is scheduled to be out.'
           else 'Nobody matching this filter is scheduled to be out.' end end);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 4. §2.3's matrix edits `requires_approval`, so the list has to serve it
-- -----------------------------------------------------------------------------------

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_list';
  if v_def like '%''requires_approval'', p.requires_approval%' then
    return;   -- already serving it
  end if;
  execute replace(v_def,
    E'''is_active'', p.is_active, ''version'', p.version,',
    E'''is_active'', p.is_active, ''version'', p.version,\n           ''requires_approval'', p.requires_approval,');
end $$;

-- -----------------------------------------------------------------------------------
-- 5. Self-proof — every declared axis is read, and an unknown one refuses
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_axis text; v_missing text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_balances';
  foreach v_axis in array array['leave_policy_id','department_id','location_id',
                                'manager_employment_id','negative_only','capped_out_only',
                                'expiring_carryover_only'] loop
    -- an axis is only "read" if it appears somewhere OTHER than the allow-list literal
    if (length(v_def) - length(replace(v_def, v_axis, ''))) / length(v_axis) < 2 then
      v_missing := v_missing || v_axis || ' ';
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'hr_l5_15: leave_balances declares but does not READ: %', v_missing;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_calendar';
  foreach v_axis in array array['team','department_id','location_id','leave_type',
                                'leave_policy_id','group_by'] loop
    if (length(v_def) - length(replace(v_def, v_axis, ''))) / length(v_axis) < 2 then
      v_missing := v_missing || v_axis || ' ';
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'hr_l5_15: leave_calendar declares but does not READ: %', v_missing;
  end if;

  if hr._leave_unknown_axes('{"policy_id":1}'::jsonb, array['leave_policy_id']) is null then
    raise exception 'hr_l5_15: a misspelled axis was not caught';
  end if;
  if hr._leave_unknown_axes('{"leave_policy_id":1}'::jsonb, array['leave_policy_id']) is not null then
    raise exception 'hr_l5_15: a legitimate axis was refused';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_policy_list';
  if v_def not like '%requires_approval%' then
    raise exception 'hr_l5_15: the policy list still does not serve requires_approval';
  end if;
end $$;
