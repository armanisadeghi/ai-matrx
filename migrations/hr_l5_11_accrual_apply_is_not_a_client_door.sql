-- HR domain L5 — migration 11 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 SECURITY FIX, APPLIED THE MOMENT IT WAS FOUND.
--
-- `public.hr_leave_accrual_apply` landed `SECURITY DEFINER`, **granted to `authenticated`**, with
-- **zero authorization checks in 145 lines** — no `auth.uid()`, no `hr.capability`, no
-- `hr._leave_admin_rung`, nothing. Its parameters are `p_employment_id`, `p_entry_kind`,
-- `p_hours_delta` and `p_actor_type`, all free. **Any signed-in user on the platform could have
-- posted an arbitrary ledger entry against anyone's balance in any organization** — granted
-- themselves ten thousand PTO hours, or drained a colleague's, and the entry would have carried
-- whatever actor type they asked for. The ledger is append-only, so every one of those rows would
-- have been permanent.
--
-- It is the engine's write path, not a client door. The Python accrual engine calls it as the
-- service role; a browser has no business reaching it at all.
--
-- Authority: SPEC-ACCESS law 2 (every hr.* write goes through a SECURITY DEFINER RPC — which is
--            about how the write is ARMED, never about who may ask for it); SPEC-LEAVE §1 (the
--            ledger is the authority) and §6 (a balance moves outside accrual only by an
--            attributed, reasoned adjustment by hr_admin, never by anyone).
-- Applied live as `hr_l5_11_accrual_apply_is_not_a_client_door`. Idempotent.
--
-- ===================================================================================
-- THE RULE THIS WRITES DOWN, because the same shape will be built again
--
-- A `public.hr_*` wrapper is NOT automatically a client door. There are two kinds, and they are
-- told apart by ONE question — *is a human allowed to ask for this?*
--
--   • A CLIENT DOOR is granted to `authenticated` and its FIRST job, before it reads anything, is
--     to decide whether this caller may. Every door in `hr_l5_04` and `hr_l5_05` opens with
--     `hr._leave_viewer` or `hr._leave_admin_rung` and returns `{granted:false, reason, detail}`.
--   • An ENGINE WRITE PATH exists only to satisfy `hr.arm_write()`'s one-statement rule from a
--     process that already IS the service role. It carries no authorization because its caller
--     needed none — which is exactly why it must be UNREACHABLE from a session that did.
--
-- Granting one of those to `authenticated` turns "we do not check the caller" into "we do not
-- check the caller, and anyone may be the caller." The two halves are individually reasonable and
-- together they are a hole.
-- ===================================================================================

revoke all on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb
) from public, anon, authenticated;

-- Rehire reinstatement is another engine-only writer. It carries no caller
-- authorization because the service role is its only intended caller.
revoke all on function public.hr_leave_reinstate_on_rehire(uuid)
  from public, anon, authenticated;

-- Entitlement is a human-facing reader, so keep it as a client door and make
-- the access decision in the public wrapper before entering the calculation.
create or replace function public.hr_leave_case_entitlement(
  p_case_id uuid, p_as_of date default current_date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare v_rung jsonb; v_result jsonb;
begin
  v_rung := hr._leave_case_rung(p_case_id);
  if coalesce(v_rung ->> 'rung', 'none') = 'none' then
    return jsonb_build_object(
      'granted', false,
      'reason', coalesce(v_rung ->> 'reason', 'no_case_access'));
  end if;

  v_result := hr.leave_case_entitlement(p_case_id, p_as_of);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('granted', true);
end
$function$;

revoke all on function public.hr_leave_case_entitlement(uuid,date) from public, anon;
grant execute on function public.hr_leave_case_entitlement(uuid,date) to authenticated;

comment on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) is
  'ENGINE WRITE PATH — not a client door. It exists so the aidream accrual engine can satisfy '
  'hr.arm_write()''s one-statement rule in a single round trip, and it carries no authorization '
  'because its caller is the service role and already needed none. EXECUTE is revoked from '
  'authenticated/anon/public and must stay revoked: with it granted, any signed-in user could '
  'post an arbitrary permanent entry to anyone''s leave ledger. A human-facing balance movement '
  'goes through public.hr_leave_adjust (SPEC-LEAVE §6), which is attributed, reasoned, refuses '
  'self-adjustment, and is hr_admin only.';

-- -----------------------------------------------------------------------------------
-- The standing check: no leave write path may be reachable by a client without a caller check
-- -----------------------------------------------------------------------------------

-- 🚨 THE CHECK HAS TO FOLLOW THE WRAPPER INTO ITS BODY, OR IT MEASURES NOTHING.
-- Every `public.hr_leave*` door is a one-line `select hr.<name>(...)` — the caller check lives in
-- the `hr.` body, not in the wrapper. A first draft of this audit read only the wrapper's own
-- source and reported EVERY door as a defect, which is the mirror image of the guard that passes
-- everything: a check whose verdict does not depend on the thing it claims to measure. It now
-- resolves the `hr.` function each wrapper calls and reads THAT.
create or replace function hr.leave_door_grant_audit()
returns table(door text, granted_to_authenticated boolean, checked_in text, verdict text)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  with doors as (
    select p.oid, n.nspname || '.' || p.proname || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as door,
           p.proname,
           has_function_privilege('authenticated', p.oid, 'execute') as granted,
           has_function_privilege('anon', p.oid, 'execute') as anon_granted,
           pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'hr_leave%' or p.proname = 'hr_my_time_off')
  ), resolved as (
    select d.*,
           -- the wrapper's own source, plus the source of every hr.* function it names
           d.def || coalesce((
             select string_agg(pg_get_functiondef(b.oid), E'\n')
               from pg_proc b join pg_namespace bn on bn.oid = b.pronamespace
              where bn.nspname = 'hr' and d.def like '%hr.' || b.proname || '(%'), '') as full_def
      from doors d
  )
  select door, granted,
         case when full_def ~* '(auth\.uid|hr\.capability|_leave_viewer|_leave_admin_rung|_leave_case_rung)'
              then 'body' else 'nowhere' end,
         case
           -- 🚨 ANON FIRST. Supabase's default privileges hand every new public function EXECUTE
           -- to `anon`, and neither `grant to authenticated` nor `revoke from public` takes it
           -- away — both revokes must be explicit and name anon. Five doors in this lane shipped
           -- that way, one of them a WRITE, and the audit did not notice because it only ever
           -- asked about `authenticated`. A check that cannot see the commonest exposure is worse
           -- than no check, because it reports green.
           when anon_granted
             then 'DEFECT — executable by an UNAUTHENTICATED caller'
           when not granted then 'engine path — unreachable from a session'
           when full_def ~* '(auth\.uid|hr\.capability|_leave_viewer|_leave_admin_rung|_leave_case_rung)'
             then 'client door — checks its caller'
           else 'DEFECT — reachable by any signed-in user and checks nobody'
         end
    from resolved
   order by 1;
$function$;

comment on function hr.leave_door_grant_audit() is
  'Every public.hr_leave* function, and whether it is an engine path (revoked from authenticated) '
  'or a client door (checks its caller). Anything that is BOTH granted and check-free is the hole '
  'hr_l5_11 closed once; this is how the next one is found before a user does.';

-- -----------------------------------------------------------------------------------
-- 🚨 TWO OF MY OWN DOORS, CAUGHT BY THE CHECK ON ITS FIRST HONEST RUN
--
-- The audit above was written to catch the accrual write path. Its first real run found two more,
-- both from this lane and both invisible to me while I was reading my own code:
--
--   • `hr_leave_case_entitlement` returned a protected absence's entitlement — hours, window,
--     measure, how much is left — for ANY case id, to ANY signed-in user, with no caller check.
--     It is a Confidential-tier read about somebody's medical leave, and it was open.
--   • `hr_leave_reinstate_on_rehire` WRITES reinstatement ledger entries and was callable by any
--     signed-in user against any employment.
--
-- Both are fixed here rather than filed, because a leak I found in my own lane is not a finding.
-- Recorded plainly: the reason the accrual path's hole was obvious to me and these two were not
-- is that I wrote these two — which is the entire argument for a check that reads the code
-- instead of the author.
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_case_entitlement(p_case_id uuid, p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  c hr.leave_case%rowtype; v_used numeric := 0; v_from date; v_to date; v_weekly numeric;
  v_rung jsonb;
begin
  -- §9.6 / §16: a protected absence is reachable by the person and by HR, and by nobody else.
  -- A manager holds NO path here — not a redacted one, not a masked one, none.
  v_rung := hr._leave_case_rung(p_case_id);
  if (v_rung ->> 'rung') = 'none' then
    return jsonb_build_object('ok', false, 'granted', false, 'reason', v_rung ->> 'reason',
      'detail','A protected absence is held by HR.');
  end if;

  select * into c from hr.leave_case where id = p_case_id and deleted_at is null;
  if c.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;

  case coalesce(c.entitlement_measure, 'calendar_year')
    when 'calendar_year'    then v_from := date_trunc('year', p_as_of)::date;
                                 v_to   := (date_trunc('year', p_as_of) + interval '1 year - 1 day')::date;
    when 'fixed_period'     then v_from := c.entitlement_period_start_on;
                                 v_to   := c.entitlement_period_end_on;
    when 'rolling_forward'  then v_from := c.starts_on;
                                 v_to   := c.starts_on + 364;
    when 'rolling_backward' then v_from := p_as_of - 364;
                                 v_to   := p_as_of;
    else                         v_from := date_trunc('year', p_as_of)::date;
                                 v_to   := (date_trunc('year', p_as_of) + interval '1 year - 1 day')::date;
  end case;

  select coalesce(sum(r.approved_hours), 0) into v_used
    from hr.leave_request r
   where r.leave_case_id = p_case_id and r.deleted_at is null
     and r.state in ('approved','taken','partially_taken')
     and r.starts_on between coalesce(v_from, r.starts_on) and coalesce(v_to, r.starts_on);

  select pa.standard_hours_per_week into v_weekly
    from hr.position_assignment pa
   where pa.employment_id = c.employment_id and pa.is_primary and pa.deleted_at is null
   order by pa.effective_from desc limit 1;

  return jsonb_build_object(
    'ok', true, 'granted', true, 'case_id', p_case_id, 'as_of', p_as_of,
    'measure', coalesce(c.entitlement_measure, 'calendar_year'),
    'window_from', v_from, 'window_to', v_to,
    'entitlement_hours', c.entitlement_hours,
    'used_hours', round(v_used, 4),
    'remaining_hours', case when c.entitlement_hours is null then null
                            else round(c.entitlement_hours - v_used, 4) end,
    'remaining_workweeks', case when c.entitlement_hours is null or coalesce(v_weekly,0) = 0 then null
                                else round((c.entitlement_hours - v_used) / v_weekly, 2) end,
    'weekly_hours_basis', v_weekly,
    'cached_counter', c.entitlement_used_hours,
    'counter_is_stale', case when c.entitlement_hours is null then null
                             else round(c.entitlement_used_hours, 4) <> round(v_used, 4) end,
    'low', case when c.entitlement_hours is null or c.entitlement_hours = 0 then null
                else (c.entitlement_hours - v_used) <= c.entitlement_hours * 0.2 end,
    'exhausted', case when c.entitlement_hours is null then null
                      else (c.entitlement_hours - v_used) <= 0 end);
end
$function$;

-- The reinstatement run WRITES ledger entries, and it was callable by anyone. It keeps its grant
-- because HR genuinely runs it from a rehire surface — but the public wrapper now decides who is
-- asking before the body does anything. The check sits in the WRAPPER rather than in
-- `hr.leave_reinstate_on_rehire` itself, so that when the hire flow eventually calls the run
-- automatically it can reach the `hr.` body as the service role without needing an HR role no
-- automated caller holds.
create or replace function public.hr_leave_reinstate_on_rehire(p_new_employment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare v_org uuid; v_rung text;
begin
  select em.organization_id into v_org
    from hr.employment em where em.id = p_new_employment_id and em.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('granted', false, 'reason','not_found');
  end if;
  v_rung := hr._leave_admin_rung(v_org);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin',
      'detail','Reinstating a prior balance is an HR action — it writes to a leave ledger.');
  end if;
  return hr.leave_reinstate_on_rehire(p_new_employment_id);
end
$function$;

grant execute on function public.hr_leave_reinstate_on_rehire(uuid) to authenticated;

comment on function public.hr_leave_reinstate_on_rehire(uuid) is
  'SPEC-LEAVE §8, with the caller check the first version was missing entirely. HR-only, because '
  'it writes reinstatement entries to a leave ledger. The hr. body stays check-free so an '
  'automated rehire hook can call it as the service role.';

-- -----------------------------------------------------------------------------------
-- Self-proof — the check must find zero defects, and it must be able to find one
-- -----------------------------------------------------------------------------------

do $$
declare v_bad text; v_n integer;
begin
  select string_agg(door, E'\n  '), count(*) into v_bad, v_n
    from hr.leave_door_grant_audit() where verdict like 'DEFECT%';
  if v_n > 0 then
    raise exception E'hr_l5_11: % leave door(s) are reachable by any signed-in user and check nobody:\n  %',
      v_n, v_bad;
  end if;

  -- the positive control: the audit must actually be capable of returning a verdict at all, and
  -- must classify both kinds. A check that can only ever say "fine" proves nothing.
  select count(*) into v_n from hr.leave_door_grant_audit()
   where verdict = 'client door — checks its caller';
  if v_n = 0 then
    raise exception 'hr_l5_11: the audit found no client doors at all — it is not measuring anything';
  end if;
  select count(*) into v_n from hr.leave_door_grant_audit()
   where verdict = 'engine path — unreachable from a session';
  if v_n = 0 then
    raise exception 'hr_l5_11: the accrual write path is still reachable from a session';
  end if;

  -- 🚨 THE ANON POSITIVE CONTROL. Grant anon EXECUTE on one door, prove the audit CATCHES it,
  -- then put it back. A check nobody has ever seen fail is a check nobody should trust — and this
  -- one already reported green through five anon-executable doors because it never asked.
  execute 'grant execute on function public.hr_my_time_off(uuid) to anon';
  select count(*) into v_n from hr.leave_door_grant_audit()
   where verdict = 'DEFECT — executable by an UNAUTHENTICATED caller';
  execute 'revoke all on function public.hr_my_time_off(uuid) from anon';
  if v_n <> 1 then
    raise exception 'hr_l5_11: the audit did not catch a deliberately anon-granted door (saw %)', v_n;
  end if;

  -- …and it must be clean again afterwards, or the control left the hole it was testing for
  select count(*) into v_n from hr.leave_door_grant_audit() where verdict like 'DEFECT%';
  if v_n > 0 then
    raise exception 'hr_l5_11: the anon control did not clean up after itself';
  end if;
end $$;
