-- HR domain L5 — migration 16 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 A MANAGER WHO MANAGES SOMEBODY COULD NOT SEE THEIR BALANCES.
--
-- `hr.leave_balances` offered the `team` scope only when `hr._leave_admin_rung` returned
-- `'manager'`, and that predicate reads `hr.role_assignment` — a **hand-maintained list of role
-- keys**. SPEC-LEAVE §11 says the opposite in as many words: *"the manager's team scope is derived
-- from `hr.reporting_line` at the configured depth, **never from a hand-maintained list**."* §16
-- then grants a manager their reports' balances outright.
--
-- So a person who genuinely manages someone — who holds `leave_approve`, who gets their requests,
-- who decides them — fell to `rung='none'`, the scope collapsed to `Mine`, and with no enrollment
-- of their own they saw an empty list. Not a refusal they could act on: an empty table that looks
-- like nobody has a balance.
--
-- Found by a control, not by reading: the filter assertions in `hrb017_leave_proof.py` §14 all
-- passed against zero rows until one asserted the UNFILTERED list is non-empty first. Every filter
-- "worked" on an empty list.
--
-- Authority: SPEC-LEAVE §11 (the scope law), §16 (the role matrix), SPEC-ACCESS §4.1 THE VIEW LAW.
-- Applied live as `hr_l5_16_manager_scope_is_derived`. Idempotent.

create or replace function hr._leave_has_reports(p_employment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  -- §11: DERIVED from the reporting line, never from a role somebody remembered to assign.
  select exists (
    select 1 from hr.reporting_line rl
     where rl.manager_employment_id = p_employment_id and rl.deleted_at is null);
$function$;

comment on function hr._leave_has_reports(uuid) is
  'SPEC-LEAVE §11: a manager''s team scope is derived from hr.reporting_line, NEVER from a '
  'hand-maintained list. Somebody who manages a person is a manager for the purpose of seeing '
  'that person''s leave, whether or not anyone assigned them the role key.';

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
  v_fig jsonb; v_scope text; v_unknown jsonb; v_manages boolean;
  v_allowed constant text[] := array[
    'leave_policy_id','department_id','location_id','manager_employment_id',
    'negative_only','capped_out_only','expiring_carryover_only'];
  v_expires date; v_expiring numeric;
begin
  p_filters := coalesce(p_filters, '{}'::jsonb);

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
  v_manages := v_me is not null and hr._leave_has_reports(v_me);

  -- THE VIEW LAW: every list declares its scope IN WORDS, `mine` is the default, and an org-wide
  -- list is a deliberate choice a role has to carry. The `team` rung is now DERIVED (§11): if you
  -- manage somebody, you may see their balance, whatever the role table says about you.
  v_scope := case
    when p_scope = 'organization' and v_rung in ('hr_admin','hr_owner','payroll_admin','leave_administrator')
      then 'organization'
    when p_scope in ('team','organization') and (v_rung = 'manager' or v_manages) then 'team'
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
         -- a manager sees their reports AND their own row; a team list that hides the reader's
         -- own balance is a list they will think is broken.
         or (v_scope = 'team' and (en.employment_id = v_me or exists (
               select 1 from hr.reporting_line rl
                where rl.employment_id = en.employment_id
                  and rl.manager_employment_id = v_me and rl.deleted_at is null)))
       )
       and (p_filters ->> 'leave_policy_id' is null
            or en.leave_policy_id = (p_filters ->> 'leave_policy_id')::uuid)
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

    v_expires := null; v_expiring := null;
    if v_r.carryover_expires_after_days is not null then
      select l.occurred_on + v_r.carryover_expires_after_days, l.hours_delta
        into v_expires, v_expiring
        from hr.leave_ledger l
       where l.employment_id = v_r.employment_id and l.leave_policy_id = v_r.leave_policy_id
         and l.entry_kind = 'carryover'
       order by l.occurred_on desc, l.created_at desc limit 1;
      if v_expires is not null and v_expires < current_date then
        v_expires := null; v_expiring := null;
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
    'manages_people', coalesce(v_manages, false),
    'can_adjust', v_rung in ('hr_admin','hr_owner'),
    'filters_applied', p_filters,
    'known_axes', to_jsonb(v_allowed),
    'rows', v_rows,
    -- An empty list has three different causes and only one of them is reassuring, so it says
    -- which. "Nobody has a balance" and "you cannot see anybody's balance" must never look alike.
    'empty_statement', case when jsonb_array_length(v_rows) = 0 then
      case when p_filters <> '{}'::jsonb
             then 'Nobody matching this filter has a balance in view.'
           when v_scope = 'mine' and not coalesce(v_manages, false) and v_rung = 'none'
             then 'You are not enrolled in a leave policy, and you do not manage anyone whose '
               || 'balances you could see.'
           when v_scope = 'mine' then 'You are not enrolled in a leave policy.'
           else 'Nobody in this scope is enrolled in a leave policy.' end end);
end
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_balances';
  if v_def not like '%_leave_has_reports%' then
    raise exception 'hr_l5_16: the team scope is still gated on a hand-maintained role list';
  end if;
  if v_def not like '%empty_statement%' then
    raise exception 'hr_l5_16: an empty balances list still says nothing about why it is empty';
  end if;
end $$;
