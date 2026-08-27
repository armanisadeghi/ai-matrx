-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- THREE READ DOORS THAT WERE SPECIFIED, WIRED, AND NEVER BUILT.
--
-- `features/hr/service.ts` carries three wrappers whose own headers say they are specifications
-- rather than shipped doors: `hr_my_compensation`, `hr_employee_by_party`,
-- `hr_member_employee_links`. Each call returned PGRST202 "function not found", which the client
-- turns into a refusal, and each of the three surfaces renders ABSENT rather than broken — the
-- correct fallback, and the reason nobody noticed. This migration ships the doors to the shapes
-- those wrappers already declare, so the surfaces light up without a single client edit.
--
-- Authority: SPEC-ACCESS §4.2/§4.4 (self always sees own pay; audited confidential reads),
-- SPEC-EMPLOYEES §5 (the pay surface), SPEC-UI-IA §6 (the CRM party seam, MemberManagement).
--
-- Applied live as `hr_l3_42_missing_read_doors`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. `hr_my_compensation` IS SELF-ONLY, AND THAT IS THE WHOLE POINT. It is not
--    `hr_confidential_list('hr_compensation', …)` narrowed down. That door filters by organization,
--    so reading one person's pay through it records a WHOLE-ORG audited list read against the
--    caller — and the subject's own access log would show them apparently reading everybody's pay.
--    This door audits exactly what happened: one self read of one subject, `is_self_access = true`.
-- 2. NOTHING IS SUMMED, HERE OR ANYWHERE. Base, shift differential and each allowance keep their
--    own window and come back as separate rows. A summed figure is not true on any given day and
--    somebody will eventually quote it in a wage claim. `currency` is returned only when the
--    record's rows AGREE on one; where they disagree it is null rather than whichever one sorted
--    first, because a confidently wrong currency is worse than none. It is read across the whole
--    record, not just the components in force today, so somebody whose only row is next month's
--    raise is not shown a pay page with no currency on it.
-- 3. A VOLUNTEER GETS A REFUSAL, NOT AN EMPTY PAY PAGE. No compensation row means the door answers
--    `{granted:false, reason:'no_record'}`, the nav item is absent, and nobody is shown a pay
--    screen with nothing on it and left wondering whether their pay was deleted.
-- 4. THE TWO DIRECTORY-TIER DOORS CARRY NOTHING CONFIDENTIAL. `hr_employee_by_party` exists
--    because the directory door filters by NAME: searching it for a party uuid matches nothing and
--    renders "not an employee" for somebody who is. It answers with directory-tier fields only —
--    a CRM surface never receives an HR confidential field — and it honours `directory_opt_out`
--    and the hire-date / manager knobs exactly as `hr_directory_list` does.
-- 5. `marked_not_employee` HAS NO STORE, AND THIS DOOR DOES NOT INVENT ONE. The declared shape
--    includes it ("true when someone explicitly marked this member as not an employee") but no
--    column, knob or jsonb path in the live database records that decision, and no writer was
--    specified in this batch. It is returned as `false` for every member. The consequence is
--    honest and visible: the seam's "Not an employee" branch is unreachable until a writer ships,
--    so every unlinked member shows "Link to employee". Reported rather than papered over with a
--    convention invented in another domain's table.
-- 6. GATED THROUGH `hr._punch_capability`, NOT `hr._l1_persona`. The persona resolver asks
--    `hr.capability(user, cap, NULL, at)`, which with a NULL subject skips its population check —
--    verified live 2026-08-27, it returns 'hr_admin' for a user whose only HR role is in a
--    DIFFERENT organization. These doors use the org-rung-defended predicate so they cannot
--    inherit that. Membership (`hr._l1_org_role`) still stands on its own for the two
--    directory-tier doors, because org owners and admins are entitled to the directory tier
--    whether or not they hold an HR capability — that is `hr_directory_list`'s own standing test.

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. hr_my_compensation — the subject's own pay, audited as a self read
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function hr.my_compensation(p_employment_id uuid, p_as_of date default null)
returns jsonb
language plpgsql volatile security definer set search_path to 'hr','public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_as_of date := coalesce(p_as_of, current_date);
  v_org uuid; v_is_self boolean; v_ids uuid[];
  v_current jsonb; v_history jsonb; v_currency text; v_audit uuid; v_class text;
begin
  if v_uid is null then
    raise exception 'hr_my_compensation: no authenticated caller' using errcode = '42501';
  end if;

  select em.organization_id, (e.login_user_id = v_uid)
    into v_org, v_is_self
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id and em.deleted_at is null and e.deleted_at is null;

  if v_org is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable',
      'detail', 'That employment record does not exist here.');
  end if;

  -- decision 1: this door is the SELF lane and nothing else. Someone else's pay is read through
  -- the audited confidential door, which records a different thing about a different person.
  if not coalesce(v_is_self, false) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_compensation',
      p_purpose => 'self_service', p_basis => 'refused', p_granted => false, p_row_count => 0,
      p_subject_employment_id => p_employment_id, p_sensitivity_tier => 'confidential',
      p_denial_reason => 'not_the_subject: hr_my_compensation is the self lane only');
    return jsonb_build_object('granted', false, 'reason', 'not_self',
      'detail', 'This door only ever returns your own pay record.', 'audit_id', v_audit);
  end if;

  -- concurrent components in force on v_as_of, each on its own row (decision 2)
  select jsonb_agg(hr._project_row('hr_compensation','hr','compensation', c.id)
                   order by c.component_kind),
         array_agg(c.id)
    into v_current, v_ids
    from hr.compensation_as_of(p_employment_id, v_as_of) c;

  -- every row, newest first, INCLUDING approved-but-future ones (§5: people are told about a
  -- raise before it lands, and the pay page is where they check it)
  select jsonb_agg(hr._project_row('hr_compensation','hr','compensation', c.id)
                   order by c.effective_from desc, c.component_kind)
    into v_history
    from hr.compensation c
   where c.employment_id = p_employment_id and c.deleted_at is null;

  if v_history is null then
    -- decision 3: a volunteer has no pay record; refuse rather than render an empty pay page
    -- `basis` stays 'self', not 'refused': the caller's basis for reaching this record WAS being
    -- the subject, and `hr.access_audit` enforces exactly that (access_audit_self_basis:
    -- is_self_access implies basis = 'self'). What failed is that the record does not exist,
    -- which is what `granted = false` plus the denial reason say.
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_compensation',
      p_purpose => 'self_service', p_basis => 'self', p_granted => false, p_row_count => 0,
      p_subject_employment_id => p_employment_id, p_sensitivity_tier => 'confidential',
      p_is_self_access => true,
      p_denial_reason => 'no_compensation_record for this employment');
    return jsonb_build_object('granted', false, 'reason', 'no_record',
      'detail', 'There is no pay record on this employment.', 'audit_id', v_audit);
  end if;

  -- decision 2: one currency only when the record agrees on one. Taken across the WHOLE record
  -- rather than only the components in force today, because a person whose next raise starts next
  -- month has no component in force and would otherwise be shown a pay page with no currency at
  -- all. Where the rows genuinely disagree it stays null — never whichever one sorted first.
  select case when count(distinct c.currency) = 1 then min(c.currency) end
    into v_currency
    from hr.compensation c
   where c.employment_id = p_employment_id and c.deleted_at is null and c.currency is not null;

  -- the record class comes from the rows themselves, never from a plausible-looking constant:
  -- `hr.access_audit.record_class_key` is a FOREIGN KEY into `hr.record_class`, and the entity
  -- token 'hr_compensation' is not a member of it. Only assert it when the rows agree on one.
  select case when count(distinct c.record_class_key) = 1 then min(c.record_class_key) end
    into v_class
    from hr.compensation c
   where c.employment_id = p_employment_id and c.deleted_at is null;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'read', p_target_token => 'hr_compensation',
    p_purpose => 'self_service', p_basis => 'self', p_granted => true,
    p_target_ids => coalesce(v_ids, '{}'::uuid[]),
    p_row_count => jsonb_array_length(coalesce(v_history, '[]'::jsonb)),
    p_subject_employment_id => p_employment_id, p_sensitivity_tier => 'confidential',
    p_record_class_key => v_class, p_is_self_access => true);

  return jsonb_build_object(
    'granted',  true,
    'as_of',    v_as_of,
    'current',  coalesce(v_current, '[]'::jsonb),
    'history',  v_history,
    'currency', v_currency,
    'audit_id', v_audit);
end
$fn$;

create or replace function public.hr_my_compensation(p_employment_id uuid, p_as_of date default null)
returns jsonb language sql volatile security definer set search_path to 'public','hr'
as $fn$ select hr.my_compensation(p_employment_id, p_as_of); $fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. hr_employee_by_party — is this CRM party an employee here?
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function hr.employee_by_party(p_organization_id uuid, p_party_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_shows_hire boolean; v_shows_mgr boolean; v_is_hr boolean;
  r record;
begin
  if v_uid is null then
    raise exception 'hr_employee_by_party: no authenticated caller' using errcode = '42501';
  end if;

  -- decision 6: hr_directory_list's own standing test — org membership OR an employment here
  if hr._l1_org_role(v_uid, p_organization_id) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id
                        and e.login_user_id = v_uid and e.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'no_standing',
      'detail', 'You have no standing in this employer.');
  end if;

  v_shows_hire := coalesce((hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean, false);
  v_shows_mgr  := coalesce((hr._knob('hr.employees','directory_shows_manager')  #>> '{}')::boolean, false);
  v_is_hr := hr._punch_capability(v_uid, 'identity.write',         null, v_today, p_organization_id)
          or hr._punch_capability(v_uid, 'working_record.write',   null, v_today, p_organization_id);

  select e.id, e.display_name, e.directory_status, e.directory_opt_out, e.login_user_id,
         jt.title as job_title, d.name as department,
         e.current_manager_employee_id as manager_employee_id,
         mgr.display_name as manager_name,
         em.hire_date
    into r
    from hr.employee e
    left join hr.job_title  jt on jt.id = e.current_job_title_id
    left join hr.department d  on d.id  = e.current_department_id
    left join hr.employee   mgr on mgr.id = e.current_manager_employee_id
    left join hr.employment em on em.id = e.current_employment_id and em.deleted_at is null
   where e.organization_id = p_organization_id
     and e.party_id = p_party_id
     and e.deleted_at is null
   limit 1;

  -- Not an employee here — a true answer, not a refusal. Directory opt-out suppresses the row for
  -- peers exactly as it does in the directory, so an opted-out employee reads the same way to a
  -- peer as somebody who was never an employee. That is the directory's own posture, not a new one.
  if r.id is null
     or (coalesce(r.directory_opt_out, false) and not v_is_hr and r.login_user_id is distinct from v_uid) then
    return jsonb_build_object('granted', true,
      'employee_id', null, 'display_name', null, 'directory_status', null,
      'job_title', null, 'department', null,
      'manager_employee_id', null, 'manager_name', null, 'hire_date', null);
  end if;

  -- decision 4: directory tier only. Nothing confidential may reach a CRM surface.
  return jsonb_build_object('granted', true,
    'employee_id',         r.id,
    'display_name',        r.display_name,
    'directory_status',    r.directory_status,
    'job_title',           r.job_title,
    'department',          r.department,
    'manager_employee_id', case when v_shows_mgr  then r.manager_employee_id end,
    'manager_name',        case when v_shows_mgr  then r.manager_name end,
    'hire_date',           case when v_shows_hire then r.hire_date end);
end
$fn$;

create or replace function public.hr_employee_by_party(p_organization_id uuid, p_party_id uuid)
returns jsonb language sql stable security definer set search_path to 'public','hr'
as $fn$ select hr.employee_by_party(p_organization_id, p_party_id); $fn$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. hr_member_employee_links — the org-member ⇄ employee seam
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function hr.member_employee_links(p_organization_id uuid, p_user_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_role text; v_is_hr boolean; v_can_link boolean; v_links jsonb;
begin
  if v_uid is null then
    raise exception 'hr_member_employee_links: no authenticated caller' using errcode = '42501';
  end if;

  -- org-admin gated: this draws a seam across the whole member list, which is an administrative
  -- view of who is who. A plain employee has no business enumerating it.
  v_role  := hr._l1_org_role(v_uid, p_organization_id);
  v_is_hr := hr._punch_capability(v_uid, 'identity.write',       null, v_today, p_organization_id)
          or hr._punch_capability(v_uid, 'working_record.write', null, v_today, p_organization_id);

  if coalesce(v_role, '') not in ('owner','admin') and not v_is_hr then
    return jsonb_build_object('granted', false, 'reason', 'no_standing',
      'detail', 'Only an organization owner, admin, or HR can see the employee seam.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',              u.uid,
           'employee_id',          e.id,
           'display_name',         e.display_name,
           'directory_status',     e.directory_status,
           -- decision 5: no store exists for this decision; it is false for everyone until a
           -- writer ships. It is NOT inferred from a missing or soft-deleted employee row.
           'marked_not_employee',  false)
         order by u.ord), '[]'::jsonb)
    into v_links
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality as u(uid, ord)
    left join hr.employee e
      on e.login_user_id = u.uid
     and e.organization_id = p_organization_id
     and e.deleted_at is null;

  -- creating an employee is an HR write, not a membership power
  v_can_link := hr._punch_capability(v_uid, 'identity.write', null, v_today, p_organization_id);

  return jsonb_build_object('granted', true, 'links', v_links, 'can_link', coalesce(v_can_link, false));
end
$fn$;

create or replace function public.hr_member_employee_links(p_organization_id uuid, p_user_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public','hr'
as $fn$ select hr.member_employee_links(p_organization_id, p_user_ids); $fn$;

-- ── grants: authenticated only, and BOTH revokes are load-bearing. Postgres grants EXECUTE to
--    PUBLIC on every new function, so PUBLIC must be revoked; and this database also carries
--    ALTER DEFAULT PRIVILEGES granting EXECUTE to `anon` on new functions in `public`, so `anon`
--    holds a grant of its OWN that survives the PUBLIC revoke. Revoking either one alone leaves
--    these doors reachable without a session — the assertion below is what caught it.
revoke execute on function public.hr_my_compensation(uuid,date)          from public, anon;
revoke execute on function public.hr_employee_by_party(uuid,uuid)        from public, anon;
revoke execute on function public.hr_member_employee_links(uuid,uuid[])  from public, anon;
revoke execute on function hr.my_compensation(uuid,date)                 from public, anon;
revoke execute on function hr.employee_by_party(uuid,uuid)               from public, anon;
revoke execute on function hr.member_employee_links(uuid,uuid[])         from public, anon;

grant execute on function public.hr_my_compensation(uuid,date)           to authenticated, service_role;
grant execute on function public.hr_employee_by_party(uuid,uuid)         to authenticated, service_role;
grant execute on function public.hr_member_employee_links(uuid,uuid[])   to authenticated, service_role;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- every one of the three is DEFINER, and anon can reach none of them
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_my_compensation','hr_employee_by_party','hr_member_employee_links')
     and (not p.prosecdef or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'hr_l3_42: door is invoker or anon-reachable: %', v_bad;
  end if;

  -- all three exist under the exact names and argument lists the client already calls
  if to_regprocedure('public.hr_my_compensation(uuid,date)')         is null
     or to_regprocedure('public.hr_employee_by_party(uuid,uuid)')    is null
     or to_regprocedure('public.hr_member_employee_links(uuid,uuid[])') is null then
    raise exception 'hr_l3_42: a declared door signature is missing';
  end if;

  -- decision 6: none of the three may reach the cross-org persona resolver
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('my_compensation','employee_by_party','member_employee_links')
     and position('_l1_persona' in p.prosrc) > 0;
  if v_bad is not null then
    raise exception 'hr_l3_42: door imported the cross-org persona resolver: %', v_bad;
  end if;
end
$chk$;
