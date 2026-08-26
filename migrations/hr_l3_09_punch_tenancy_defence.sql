-- HR domain L3 — migration 9 of 9 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 CROSS-ORGANIZATION AUTHORITY LEAK IN `hr.capability`, FOUND BY EXECUTION 2026-08-26.
-- NOT this lane's object and NOT repaired here. This migration defends the punch lane only.
--
-- WHAT IS TRUE, PROVEN LIVE in a rolled-back transaction:
--   `hr.population_contains` returns TRUE unconditionally for `scope_kind = 'org'`, on a stated
--   assumption in its own body: "every caller has already scoped by organization_id; `org` adds no
--   further restriction". `hr.capability` arm 2 is a caller and it does NOT scope by
--   organization_id — it never compares `ra.organization_id` to the subject employment's
--   organization. So an `org`-scoped role assignment in ANY organization confers its capabilities
--   over EVERY employment on the platform.
--
--   Measured: a user whose only role assignment is `hr_owner` (scope `org`) in organization
--   `2643e470-…` returned TRUE for `working_record.write`, `comp.read`, `medical.read` AND
--   `ssn.reveal` over an employment in `5dc930e9-…`, an organization in which they hold no
--   employment at all (`holder_has_ANY_employment_in_subject_org: false`). Downstream, that user
--   successfully voided and replaced an unrelated organization's punch through `hr.punch_correct`
--   before this defence existed.
--
--   The `hr.can_approve` path is NOT affected: it resolves the org from the subject and matches
--   `aa.organization_id = v_org`, so it is correctly tenant-scoped. The hole is the capability arm.
--
-- 🚨 DEFECT OWNER: Core C3 (HRB-005, `hr_c3_03_capability_and_approval.sql`). The real repair is
--   one predicate in `hr.capability` arm 2 — compare `ra.organization_id` against the subject's
--   organization — or make `population_contains`'s `org` arm honour the holder's org. That is a
--   fleet-wide access change over the whole HR domain (every audited-tier RPC in SPEC-ACCESS §4
--   gates on `hr.capability`), so it is explicitly not a build lane's call to make unilaterally.
--   Raised to the coordinator by HRB-015.
--
-- WHAT THIS MIGRATION DOES: adds `hr._punch_capability`, which is `hr.capability` AND an explicit
-- tenancy predicate, and repoints every capability call site in the L3 punch lane at it. It never
-- widens reach — it can only ever return FALSE where `hr.capability` returned TRUE. It is written
-- as a wrapper rather than a copy so that when C3 fixes the predicate this stays correct and
-- becomes redundant, rather than becoming a second, drifting implementation of the same rules.
--
-- VERIFIED LIVE after applying, in a rolled-back transaction:
--   hr.capability(cross-org caller, 'working_record.write', subject)  => true   (the leak)
--   hr._punch_capability(same)                                        => false  (defended)
--   hr.punch_correct  => refused hr_no_punch_edit_authority, 0 punches voided
--   hr.clock_state    => refused hr_no_clock_read_authority
--   hr.punch_register => refused hr_no_register_read_authority
--   and after the caller is given a legitimate employment + hr_admin role in the SUBJECT's org,
--   hr._punch_capability => true. The defence narrows; it does not over-tighten.
--
-- Applied live as `hr_l3_09_punch_tenancy_defence`. Idempotent.

create or replace function hr._punch_capability(
  p_user uuid, p_capability text, p_subject_employment uuid, p_at date,
  p_organization_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $$
declare v_org uuid;
begin
  if p_user is null then return false; end if;

  -- the platform predicate first: this wrapper may only ever NARROW it, never widen it
  if not hr.capability(p_user, p_capability, p_subject_employment, p_at) then
    return false;
  end if;

  -- the tenancy predicate `hr.capability` assumes its caller already applied
  v_org := p_organization_id;
  if v_org is null and p_subject_employment is not null then
    select em.organization_id into v_org from hr.employment em where em.id = p_subject_employment;
  end if;
  if v_org is null then
    -- no organization to check against: refuse rather than inherit the platform-wide TRUE
    return false;
  end if;

  return exists (
    select 1
      from hr.employment em
      join hr.employee e on e.id = em.employee_id
     where e.login_user_id = p_user
       and em.organization_id = v_org
       and em.deleted_at is null
       and em.status <> 'terminated');
end
$$;

comment on function hr._punch_capability(uuid, text, uuid, date, uuid) is
  'L3 tenancy defence: hr.capability AND "the caller holds an employment in the subject organization". '
  'hr.capability arm 2 does not scope by organization and hr.population_contains'' org arm returns true '
  'unconditionally, so an org-scoped role in ANY org reaches EVERY employment. Defect owner: Core C3.';

-- ---------------------------------------------------------------------------------
-- Repoint every capability call site in the L3 punch lane, by rewriting the live
-- definitions in place so nothing else in those bodies can change.
-- ---------------------------------------------------------------------------------
do $outer$
declare
  t          record;
  v_def      text;
  v_new      text;
  v_changed  int := 0;
begin
  for t in
    select * from (values
      ('hr._can_edit_punch(uuid,uuid,date)',
       'hr.capability(p_user, ''working_record.write'', p_employment_id, p_at)',
       'hr._punch_capability(p_user, ''working_record.write'', p_employment_id, p_at)'),
      ('hr.clock_state(uuid)',
       'hr.capability(v_uid, ''working_record.read'', p_employment_id, current_date)',
       'hr._punch_capability(v_uid, ''working_record.read'', p_employment_id, current_date)'),
      ('hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)',
       'hr.capability(v_uid, ''working_record.read'', p_employment_id, v_date)',
       'hr._punch_capability(v_uid, ''working_record.read'', p_employment_id, v_date)'),
      ('hr.punch_register(jsonb,jsonb)',
       'hr.capability(v_uid, ''working_record.read'', null, current_date)',
       'hr._punch_capability(v_uid, ''working_record.read'', null, current_date, v_org)'),
      ('hr.punch_register(jsonb,jsonb)',
       'hr.capability(v_uid, ''working_record.read'', e, current_date)',
       'hr._punch_capability(v_uid, ''working_record.read'', e, current_date)')
    ) x(sig, from_txt, to_txt)
  loop
    select pg_get_functiondef(t.sig::regprocedure) into v_def;
    if position(t.to_txt in v_def) > 0 then
      continue;                                  -- already repointed (idempotent re-run)
    end if;
    if position(t.from_txt in v_def) = 0 then
      raise exception 'hr_l3_09: call site not found in % : %', t.sig, t.from_txt;
    end if;
    v_new := replace(v_def, t.from_txt, t.to_txt);
    execute v_new;
    v_changed := v_changed + 1;
  end loop;
  raise notice 'hr_l3_09: repointed % call site(s)', v_changed;
end $outer$;

do $$
declare v_left text;
begin
  -- No bare hr.capability( may remain anywhere in the L3 punch lane.
  select string_agg(n.nspname||'.'||p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('_can_edit_punch','clock_state','punch_record','punch_register')
     and pg_get_functiondef(p.oid) ~ ('hr\.capability' || '\(');
  if v_left is not null then
    raise exception 'hr_l3_09: a bare hr.capability( call remains in: %', v_left;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='hr' and p.proname='_punch_capability') then
    raise exception 'hr_l3_09: hr._punch_capability did not land';
  end if;
end $$;
