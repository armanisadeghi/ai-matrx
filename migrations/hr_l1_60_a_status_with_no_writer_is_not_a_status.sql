-- hr_l1_60 — A STATUS WITH NO WRITER IS NOT A STATUS (D4)
--
-- The staff directory captioned a TERMINATED person "Active", and the headcount
-- counted them. `hr.employee.directory_status` was `DEFAULT 'active'`, not
-- generated, and the only writer in the whole database was
-- `public.hr_employee_create` — so across every organization there were ZERO
-- rows reading 'terminated' while three employments in one employer were
-- terminated (2026-08-20, -20, -25), one of them offboarded through the product
-- itself. `HrStatusChip.tsx` asserted in a comment that the column was
-- "trigger-maintained"; no such trigger has ever existed.
--
-- This migration deletes the column and derives the fact instead. See the
-- comment on `hr.employee_directory_status` for why a trigger would only have
-- reintroduced the same defect one day at a time.
--
-- Lane L1 (Employees) · SPEC-EMPLOYEES §1.2 / §1.3 route 1 / route 10 · D4.



-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE DERIVATION. Whether a person is a prehire, here, away or gone is a
-- fact about their EMPLOYMENT SPELLS on a DATE — never a stored flag.
--
-- 🚨 WHY THE COLUMN THIS REPLACES HAD TO GO (D4, 2026-08-29). `hr.employee.
-- directory_status` was `DEFAULT 'active'`, not generated, and the ONLY writer in
-- the entire database was `public.hr_employee_create`. No trigger on
-- `hr.employment` touched it — `_derive_on_employment` derives GRANTS and nothing
-- else — so separation, rehire and leave never moved it. Live, that meant ZERO
-- rows read 'terminated' anywhere in the database while three employments in one
-- employer were terminated, the staff directory captioned an offboarded person
-- "Active", and `hr_org_summary` counted them into headcount.
--
-- A TRIGGER WOULD NOT HAVE BEEN ENOUGH, and that is the part worth keeping:
-- this status is a function of TODAY. A prehire whose hire date is tomorrow
-- becomes active with no row changing; a future-dated separation lands the same
-- way. A stored column can only ever be right at write time, so the fix that
-- looks cheapest — add the missing trigger — reintroduces the same defect with a
-- longer fuse. SPEC-EMPLOYEES route 10 says the status filter "states the as-of
-- semantics (terminated on or before today)"; only a derivation can honour that.
--
-- The engine contract (SPEC-EMPLOYEES §1.2) sanctioned the column "only so the
-- directory list and the profile header avoid a lateral join per row". The
-- profile header never used it (it resolves through `hr.employment_as_of`), and
-- the directory already does two lateral joins per row after RECORDED DECISION
-- 3b, so the exemption was paying for nothing.
--
-- Resolution order is deliberately NOT `hr.employment_as_of`'s: that resolver
-- answers "which spell is live on this date" and correctly returns NOTHING for
-- somebody who has left, which is exactly the population this function exists to
-- describe. It prefers a spell that is live (or still to come) on `p_on`, and
-- falls back to the most recent ended one, so a rehire reads from the new spell
-- and a leaver reads from the old.
create or replace function hr.employee_directory_status(p_employee_id uuid, p_on date)
returns text
language sql
stable
as $fn$
  select case
    when p_employee_id is null then null
    else coalesce((
      select case
        -- A spell whose status says terminated, or whose termination date has
        -- passed. `hr_separation_record` leaves `status` alone for a FUTURE-dated
        -- separation, so the date is checked as well as the word.
        when em.status = 'terminated'
          or (em.termination_date is not null and em.termination_date < p_on) then 'terminated'
        -- Hired, but not yet. `pending` and a future hire date are the same fact
        -- said twice; either one is enough.
        when em.hire_date > p_on or em.status = 'pending'                     then 'prehire'
        when em.status in ('on_leave','suspended')                            then 'on_leave'
        else 'active'
      end
      from (
        select em2.*
          from hr.employment em2
         where em2.employee_id = p_employee_id
           and em2.deleted_at is null
         order by (em2.status <> 'terminated'
                   and (em2.termination_date is null or em2.termination_date >= p_on)) desc,
                  em2.hire_date desc,
                  em2.spell_number desc
         limit 1
      ) em),
      -- On the roster with no spell at all. They have not started, which is what
      -- `prehire` says; `active` would claim they are working here today.
      'prehire')
  end
$fn$;

comment on function hr.employee_directory_status(uuid, date) is
  'SPEC-EMPLOYEES route 10 / D4. The ONE derivation of a person''s directory status from their employment spells as of a date. Replaces hr.employee.directory_status, which had no writer past creation.';

revoke all on function hr.employee_directory_status(uuid, date) from public;
grant execute on function hr.employee_directory_status(uuid, date) to authenticated, service_role;


-- ── public.hr_employee_create(jsonb) ────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_employee_create(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_org uuid := nullif(p_payload ->> 'organization_id','')::uuid;
  v_gate jsonb; v_party uuid; v_employee uuid; v_employment uuid; v_position uuid;
  v_comp uuid; v_private uuid; v_profile uuid; v_number text; v_hire date;
  v_worker text; v_status text; v_prior jsonb; v_attempt int := 0;
  v_loc uuid; v_jur uuid; v_audit uuid; v_display text; v_spell int;
  v_enrolled integer := 0;
begin
  v_gate := hr._l1_write_gate(v_org, 'identity.write', null, 'hr_employee', 'create', 'hire');
  if v_gate is not null then return v_gate; end if;

  -- ---------------------------------------------------------------- validation (§4.1)
  v_hire := nullif(p_payload ->> 'hire_date','')::date;
  if v_hire is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'field', 'hire_date', 'detail', 'A hire date is required — every spell is dated.');
  end if;

  v_worker := coalesce(nullif(p_payload ->> 'worker_class',''), 'employee');

  if coalesce(p_payload ->> 'flsa_status','nonexempt') = 'exempt'
     and nullif(p_payload ->> 'flsa_exemption_basis','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'field', 'flsa_exemption_basis',
      'detail', 'An exempt classification needs the basis it rests on.');
  end if;

  if coalesce((p_payload ->> 'fte')::numeric, 1.0) <= 0
     or coalesce((p_payload ->> 'fte')::numeric, 1.0) > 2.0 then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'fte',
      'detail', 'FTE must be greater than 0 and no more than 2.0.');
  end if;

  v_loc := nullif(p_payload ->> 'location_id','')::uuid;
  if v_loc is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'location_id',
      'detail', 'A position needs a location.');
  end if;

  -- 🚨 A POSITION NEEDS A DEPARTMENT TOO, AND SAYING SO IS THIS DOOR'S JOB.
  -- `hr.position_assignment.department_id` is NOT NULL, but only the location was
  -- validated here — so a hire with no department got a raw 23502 constraint dump
  -- naming an internal table and every column of the failing row, instead of the one
  -- sentence that tells an HR admin what to fill in. §4.1: the door names the refusal;
  -- a Postgres error reaching a person is the door failing to do its job, and it is the
  -- same class as the crm source that raised through this function untouched.
  if nullif(p_payload ->> 'department_id','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'department_id',
      'detail', 'A position needs a department.');
  end if;
  select l.jurisdiction_id into v_jur from hr.location l where l.id = v_loc and l.deleted_at is null;
  if v_jur is null then
    -- a door, not a dead end (§4.1 node I2)
    return jsonb_build_object('ok', false, 'reason', 'location_without_jurisdiction',
      'field', 'location_id', 'location_id', v_loc,
      'detail', 'That location has no jurisdiction, so nothing can be scheduled or stamped '
                || 'against it. Set one before hiring into it.',
      'door', '/hr/settings/structure');
  end if;

  select ep.id into v_profile from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_activated',
      'detail', 'This employer has no employer of record yet.',
      'door', '/hr/settings/employer');
  end if;

  -- ---------------------------------------------------------------- party resolution (§4.1 E)
  v_party := nullif(p_payload ->> 'party_id','')::uuid;
  v_display := coalesce(
    nullif(trim(coalesce(p_payload ->> 'display_name','')), ''),
    trim(concat_ws(' ',
      coalesce(nullif(p_payload ->> 'preferred_first_name',''), p_payload ->> 'legal_first_name'),
      coalesce(nullif(p_payload ->> 'preferred_last_name',''),  p_payload ->> 'legal_last_name'))));

  -- 🚨 NO PATH MAY CREATE AN UNREACHABLE PERSON.
  -- This door writes `login_user_id` — the access key — straight from `link_user_id`, and
  -- writes NO org membership. `hr_my_context` lists an employer only for a MEMBER, so the
  -- result was somebody who can sign in, is on the roster, and cannot reach HR at all;
  -- `hr_employee_invite` then refuses them ("already signs in here"), leaving no door open
  -- to fix it. Reproduced live before this guard: the employer did not appear in their
  -- employer list, and `active` came back null.
  --
  -- WHAT THE SPEC SETTLES, AND WHAT IT DOES NOT. SPEC-ACCESS §1.1 is categorical — "Org
  -- membership otherwise confers the directory tier only... Nothing else confers HR
  -- standing" — and SPEC-EMPLOYEES §4.1's flow sets `login_user_id` in exactly two ways:
  -- it stays NULL (kiosk-only staff are first class), or the invite-acceptance trigger
  -- sets it. So linking must not, by itself, hand out access. But the spec ALSO names
  -- "Link org member" and "Link CRM party" as first-class create-time entry modes, so
  -- refusing linking outright would contradict it too.
  --
  -- The overlap the spec left silent — whether a picked member's EXISTING login carries
  -- over at create — was RULED by Arman on 2026-08-28: CARRY IT OVER. The completion
  -- block near the end of this function does exactly that for a member-with-login. This
  -- guard keeps settling only the absolute part: a link to a NON-member (which cannot
  -- confer access on its own — SPEC-ACCESS 1.1) is refused BY NAME and pointed at the
  -- invite flow that does grant access.
  if nullif(p_payload ->> 'link_user_id','') is not null
     and not exists (
       select 1 from iam.memberships m
        where m.user_id = (p_payload ->> 'link_user_id')::uuid
          and m.organization_id = v_org
          and m.container_type = 'organization'
          and m.deleted_at is null
          and coalesce(m.status, 'active') = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'link_without_membership',
      'field', 'link_user_id',
      'door', '/hr/people/new',
      'detail', 'That person can sign in, but they are not a member of this employer yet — '
             || 'linking them here would put them on the roster with no way to reach HR. '
             || 'Create the record without a login and invite them, which is what grants '
             || 'access.',
      'remedy', 'Leave the login empty and send a platform invite; accepting it links the '
             || 'account and grants access in one act.');
  end if;

  if v_party is null and nullif(p_payload ->> 'link_user_id','') is not null then
    v_party := crm.ensure_user_party((p_payload ->> 'link_user_id')::uuid, 'hr.employee_create');
  end if;

  if v_party is null then
    -- 🚨 `crm.party.legal_name` IS AN ORGANIZATION FACET, not a person's legal name — the live
    -- CHECK `party_org_facet` forbids it (with primary_domain / tax_id / registration_number) on
    -- any party_kind other than 'organization'. The person's legal name block belongs on
    -- `hr.employee` (legal_first/middle/last/suffix), which is where §2.3.2 renders it and where
    -- §4.10 pushes the outgoing one into `former_names`. Writing it here fails the CHECK, and
    -- would have duplicated the record of legal identity into a second table if it had not.
    insert into crm.party (party_kind, display_name, first_name, middle_name, last_name,
                           preferred_name, name_suffix, pronouns,
                           organization_id, created_by, updated_by, source, source_detail)
    values ('person', v_display,
            p_payload ->> 'legal_first_name', nullif(p_payload ->> 'legal_middle_name',''),
            p_payload ->> 'legal_last_name',
            nullif(p_payload ->> 'preferred_first_name',''),
            nullif(p_payload ->> 'legal_name_suffix',''),
            nullif(p_payload ->> 'pronouns',''),
            v_org, v_uid, v_uid, 'hr', 'employee_create')
    returning id into v_party;
  end if;

  -- ---------------------------------------------------------------- RECORDED DECISION 6: rehire
  select jsonb_build_object(
           'employee_id', e.id, 'display_name', e.display_name,
           'spells', (select coalesce(jsonb_agg(jsonb_build_object(
                 'employment_id', em.id, 'spell_number', em.spell_number,
                 'hire_date', em.hire_date, 'termination_date', em.termination_date,
                 'status', em.status,
                 'rehire_eligible', (select s.rehire_eligible from hr.separation s
                                      where s.id = em.separation_id),
                 'rehire_eligible_note', (select s.rehire_eligible_note from hr.separation s
                                           where s.id = em.separation_id))
               order by em.spell_number desc), '[]'::jsonb)
             from hr.employment em where em.employee_id = e.id and em.deleted_at is null))
    into v_prior
    from hr.employee e
   where e.organization_id = v_org and e.party_id = v_party and e.deleted_at is null;

  if v_prior is not null and not coalesce((p_payload ->> 'is_rehire')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'rehire_required',
      'detail', 'This person already has an employee record in this employer. '
                || 'A rehire is a second spell, never a second record.',
      'existing', v_prior, 'door', '/hr/people/' || (v_prior ->> 'employee_id'));
  end if;

  perform hr.arm_write();

  -- ---------------------------------------------------------------- the employee row
  if v_prior is not null then
    v_employee := (v_prior ->> 'employee_id')::uuid;
    select coalesce(max(em.spell_number), 0) + 1 into v_spell
      from hr.employment em where em.employee_id = v_employee and em.deleted_at is null;
  else
    v_spell := 1;
    loop
      begin
        v_number := coalesce(nullif(p_payload ->> 'employee_number',''),
                             hr._l1_next_employee_number(v_org, v_attempt));
        insert into hr.employee (
          party_id, login_user_id, employee_number,
          legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix,
          preferred_first_name, preferred_last_name, display_name, pronouns,
          work_email, work_phone, photo_file_id, directory_opt_out, primary_location_id,
          organization_id, created_by, updated_by)
        values (
          v_party, nullif(p_payload ->> 'link_user_id','')::uuid, v_number,
          p_payload ->> 'legal_first_name', nullif(p_payload ->> 'legal_middle_name',''),
          p_payload ->> 'legal_last_name', nullif(p_payload ->> 'legal_name_suffix',''),
          nullif(p_payload ->> 'preferred_first_name',''),
          nullif(p_payload ->> 'preferred_last_name',''),
          v_display, nullif(p_payload ->> 'pronouns',''),
          nullif(p_payload ->> 'work_email',''), nullif(p_payload ->> 'work_phone',''),
          nullif(p_payload ->> 'photo_file_id','')::uuid,
          coalesce((p_payload ->> 'directory_opt_out')::boolean, false),
          v_loc,
          v_org, v_uid, v_uid)
        returning id into v_employee;
        exit;
      exception when unique_violation then
        -- §4.1: a duplicate employee_number re-generates from the format knob and retries ONCE,
        -- then asks. A silent third attempt is how two people end up sharing a number.
        v_attempt := v_attempt + 1;
        if v_attempt > 1 or nullif(p_payload ->> 'employee_number','') is not null then
          return jsonb_build_object('ok', false, 'reason', 'employee_number_taken',
            'field', 'employee_number', 'attempted', v_number,
            'detail', 'That employee number is already in use in this employer.');
        end if;
        perform hr.arm_write();
      end;
    end loop;
  end if;

  -- ---------------------------------------------------------------- the spell
  v_status := case when v_hire > current_date then 'pending' else 'active' end;
  -- 🚨 NO `directory_status` IS WRITTEN HERE ANY MORE, and that is the D4 fix.
  -- This door was the ONLY writer the column ever had: it stamped a value at
  -- birth that separation, rehire and leave then never moved, and the second
  -- spell of a rehire never touched it at all. The ack below reports the
  -- DERIVED status instead, so what this door claims and what the directory
  -- shows are one answer.

  insert into hr.employment (
    employee_id, employer_profile_id, pay_group_id, spell_number, hire_date,
    adjusted_service_date, original_hire_date, probation_end_date, status,
    is_rehire, prior_employment_id, organization_id, created_by, updated_by)
  values (
    v_employee, v_profile, nullif(p_payload ->> 'pay_group_id','')::uuid, v_spell, v_hire,
    nullif(p_payload ->> 'adjusted_service_date','')::date,
    coalesce(nullif(p_payload ->> 'original_hire_date','')::date,
             (select min(em.hire_date) from hr.employment em
               where em.employee_id = v_employee and em.deleted_at is null), v_hire),
    nullif(p_payload ->> 'probation_end_date','')::date,
    v_status,
    v_spell > 1, nullif(p_payload ->> 'prior_employment_id','')::uuid,
    v_org, v_uid, v_uid)
  returning id into v_employment;

  -- ---------------------------------------------------------------- the position
  insert into hr.position_assignment (
    employment_id, job_title_id, department_id, location_id, manager_employment_id,
    is_primary, worker_class, flsa_status, flsa_exemption_basis, pay_basis, schedule_class,
    fte, standard_hours_per_week, is_supervisor, cost_center, eeo1_job_category,
    effective_from, change_reason_category_id, organization_id, created_by, updated_by)
  values (
    v_employment,
    (p_payload ->> 'job_title_id')::uuid, (p_payload ->> 'department_id')::uuid, v_loc,
    nullif(p_payload ->> 'manager_employment_id','')::uuid,
    true, v_worker,
    coalesce(nullif(p_payload ->> 'flsa_status',''), 'nonexempt'),
    nullif(p_payload ->> 'flsa_exemption_basis',''),
    coalesce(nullif(p_payload ->> 'pay_basis',''), 'hourly'),
    coalesce(nullif(p_payload ->> 'schedule_class',''), 'full_time'),
    coalesce((p_payload ->> 'fte')::numeric, 1.0),
    nullif(p_payload ->> 'standard_hours_per_week','')::numeric,
    coalesce((p_payload ->> 'is_supervisor')::boolean, false),
    nullif(p_payload ->> 'cost_center',''),
    -- EEO-1 category is DENORMALIZED AT WRITE from the title, and re-mapping the title later
    -- never rewrites history (§2.4 route 69 edge).
    (select jt.eeo1_job_category from hr.job_title jt where jt.id = (p_payload ->> 'job_title_id')::uuid),
    v_hire, nullif(p_payload ->> 'change_reason_category_id','')::uuid,
    v_org, v_uid, v_uid)
  returning id into v_position;

  -- ---------------------------------------------------------------- compensation (contractor branch)
  -- §1.4: a contractor's rate is a `contract_rate` component; the employee-only base component is
  -- ABSENT for a volunteer with no pay at all, not zeroed.
  if nullif(p_payload ->> 'compensation_amount','') is not null then
    insert into hr.compensation (
      employment_id, position_assignment_id, component_kind, pay_basis, amount, currency,
      per_unit, fte, earning_code_id, effective_from, change_reason_category_id,
      organization_id, created_by, updated_by)
    values (
      v_employment, v_position,
      case when v_worker = 'contractor' then 'contract_rate' else 'base' end,
      coalesce(nullif(p_payload ->> 'pay_basis',''), 'hourly'),
      (p_payload ->> 'compensation_amount')::numeric,
      coalesce(nullif(p_payload ->> 'currency',''), 'USD'),
      nullif(p_payload ->> 'per_unit',''),
      coalesce((p_payload ->> 'fte')::numeric, 1.0),
      nullif(p_payload ->> 'earning_code_id','')::uuid,
      v_hire, nullif(p_payload ->> 'change_reason_category_id','')::uuid,
      v_org, v_uid, v_uid)
    returning id into v_comp;
  end if;

  -- ---------------------------------------------------------------- the private shell
  -- Created EMPTY on purpose so the Personal tab can say "Not collected" with an add door rather
  -- than render blank fields that look like empty values (§2.3.2 edge).
  if not exists (select 1 from hr.employee_private ep
                  where ep.employee_id = v_employee and ep.deleted_at is null) then
    insert into hr.employee_private (employee_id, home_address, mailing_address,
                                     personal_email, personal_phone,
                                     organization_id, created_by, updated_by)
    values (v_employee, coalesce(p_payload -> 'home_address', '{}'::jsonb),
            coalesce(p_payload -> 'mailing_address', '{}'::jsonb),
            nullif(p_payload ->> 'personal_email',''),
            nullif(p_payload ->> 'personal_phone',''),
            v_org, v_uid, v_uid)
    returning id into v_private;
  end if;

  -- ---------------------------------------------------------------- contractor engagement (§4.7)
  if v_worker = 'contractor' then
    insert into hr.engagement (employment_id, platform_of_record, platform_external_id,
                               platform_url, engagement_terms, starts_on, ends_on, auto_renew,
                               status, organization_id, created_by, updated_by)
    values (v_employment,
            coalesce(nullif(p_payload ->> 'platform_of_record',''), 'direct'),
            nullif(p_payload ->> 'platform_external_id',''),
            nullif(p_payload ->> 'platform_url',''),
            coalesce(p_payload -> 'engagement_terms', '{}'::jsonb),
            v_hire, nullif(p_payload ->> 'engagement_ends_on','')::date,
            coalesce((p_payload ->> 'auto_renew')::boolean, false),
            'active', v_org, v_uid, v_uid);

    if nullif(p_payload ->> 'platform_external_id','') is not null
       and coalesce(nullif(p_payload ->> 'platform_of_record',''), 'direct') <> 'direct' then
      insert into hr.external_identity (employee_id, system_key, external_id, external_url,
                                        organization_id, created_by, updated_by)
      values (v_employee, p_payload ->> 'platform_of_record',
              p_payload ->> 'platform_external_id', nullif(p_payload ->> 'platform_url',''),
              v_org, v_uid, v_uid)
      on conflict do nothing;
    end if;
  end if;

  -- hr_l3_53: THE THIRD ENROLMENT DIRECTION. Hiring into an already-generated pay group left
  -- the person with no hr.pay_period_employment row at all -- no timecard, no attestation, no
  -- line on the approval grid for a period they worked. Same shared writer as the other two;
  -- it owns the effective-dating and terminal-period rules and they are unchanged.
  v_enrolled := hr._enroll_pay_period_rows(null, v_employment);

  -- 🚨 LINK-AT-CREATE COMPLETES ACCESS IN THE SAME ACT (Arman's ruling 2026-08-28).
  -- Read the login off the settled employee row (covers a fresh link AND a
  -- login-bearing rehire). For a login-bearing employee, make the completion EXPLICIT
  -- rather than emergent: ensure the membership row exists (idempotent — a linked
  -- member already has one), and derive grants through hr.derive_grants_bulk, the SAME
  -- function the invite-accept trigger (hr._derive_on_employee_login) funnels to. The
  -- create path already derives via the employment/position INSERT triggers, but those
  -- are DIFFERENT functions; deriving here guarantees link-at-create lands exactly
  -- where invite-acceptance lands. A non-member link was refused above; a kiosk-only
  -- hire has no login and nothing to complete.
  declare v_login uuid;
  begin
    select login_user_id into v_login from hr.employee where id = v_employee;
    if v_login is not null then
      perform public.mbr_add('organization', v_org, v_login, v_org,
                             'member', 'active',
                             jsonb_build_object('granted_by', 'hr_employee_create',
                                               'reason', 'link_at_create_completes_access'));
      perform hr.derive_grants_bulk(ARRAY[v_employment]::uuid[]);
    end if;
  end;

  v_audit := hr._l1_write_audit(v_org, 'hr_employee', 'create', ARRAY[v_employee],
                                v_employment, 'hire');

  return jsonb_build_object(
    'ok', true, 'employee_id', v_employee, 'employment_id', v_employment,
    'position_assignment_id', v_position, 'compensation_id', v_comp, 'party_id', v_party,
    'employee_number', coalesce(v_number, (select employee_number from hr.employee where id = v_employee)),
    'spell_number', v_spell,
    'directory_status', hr.employee_directory_status(v_employee, current_date),
    'status', v_status,
    'is_prehire', v_hire > current_date, 'audit_id', v_audit,
    'enrolled_pay_period_rows', v_enrolled,
    'door', '/hr/people/' || v_employee || '/job');
end
$function$
;


-- ── public.hr_directory_list(uuid,jsonb,integer,integer,text,text) 
CREATE OR REPLACE FUNCTION public.hr_directory_list(p_organization_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort text DEFAULT 'display_name'::text, p_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_persona text; v_caps text[]; v_mine uuid[]; v_total bigint; v_rows jsonb;
  v_search text; v_statuses text[]; v_manager uuid; v_sort text; v_dir text;
  v_shows_hire boolean; v_shows_mgr boolean; v_contractors boolean;
begin
  if v_uid is null then
    raise exception 'hr_directory_list: no authenticated caller' using errcode = '42501';
  end if;
  if hr._l1_org_role(v_uid, p_organization_id) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then
    raise exception 'hr_directory_list: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, v_today);
  v_caps    := hr._l1_capabilities(v_uid, p_organization_id, v_today);
  v_mine    := hr.employments_of(v_uid, v_today);

  v_shows_hire := (hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean;
  v_shows_mgr  := (hr._knob('hr.employees','directory_shows_manager') #>> '{}')::boolean;
  v_contractors := coalesce((hr._knob('hr.employees','contractor_directory_visible') #>> '{}')::boolean, true);

  v_search   := nullif(trim(coalesce(p_filter ->> 'search','')), '');
  v_manager  := nullif(p_filter ->> 'manager_employee_id','')::uuid;
  select coalesce(array_agg(value #>> '{}'), array['active','on_leave','prehire'])
    into v_statuses from jsonb_array_elements(coalesce(p_filter -> 'status', '[]'::jsonb))
   where jsonb_array_length(coalesce(p_filter -> 'status','[]'::jsonb)) > 0;
  if v_statuses is null then v_statuses := array['active','on_leave','prehire']; end if;

  v_sort := case when p_sort in ('display_name','hire_date','directory_status','employee_number')
                 then p_sort else 'display_name' end;
  v_dir  := case when lower(coalesce(p_direction,'asc')) = 'desc' then 'desc' else 'asc' end;

  -- ONE query: the scan is counted and paged from the same CTE, so `total` is the size of the
  -- FULL result set and never "showing first 100" (§5.1 rule 1). The sort is a CASE ladder over
  -- four clamped literal column names rather than dynamic SQL — a static plan a reviewer reads.
  with scoped as (
    select e.id                                as employee_id,
           coalesce(e.current_employment_id, em.id)              as employment_id,
           e.display_name, e.employee_number, e.work_email, e.work_phone,
           e.photo_file_id, ds.status as directory_status,
           coalesce(pa.job_title_id, e.current_job_title_id)     as job_title_id,
           jt.title                                              as job_title,
           coalesce(pa.department_id, e.current_department_id)   as department_id,
           d.name                                                as department,
           coalesce(pa.location_id, e.primary_location_id)       as location_id,
           l.name                                                as location,
           l.tz                                                  as timezone,
           coalesce(e.current_manager_employee_id, mgr.id)       as manager_employee_id,
           case when v_shows_mgr then hr._employee_display_name(mgr.id, v_uid) end as manager_name,
           pa.worker_class, pa.flsa_status, pa.schedule_class, pa.fte,
           case when v_shows_hire then em.hire_date end          as hire_date,
           case when e.current_employment_id is not null then 'current'
                when em.id is null then 'no_spell'
                when em.hire_date > v_today then 'upcoming'
                else 'no_primary_assignment' end                 as row_basis,
           e.custom
      from hr.employee e
      -- 🚨 THE STATUS IS DERIVED, NEVER STORED (D4). The dropped column was
      -- written once at creation and by nothing else ever again: every
      -- terminated person in this list read "Active" and was counted as one. It is also a fact about
      -- TODAY — route 10's status filter promises "terminated on or before
      -- today" — which no stored value can keep across a day boundary.
      left join lateral (select hr.employee_directory_status(e.id, v_today) as status) ds on true
      -- current first (§1.2), then the fallback of RECORDED DECISION 3b
      left join lateral (
        select em2.* from hr.employment em2
         where em2.deleted_at is null
           and (em2.id = e.current_employment_id
                or (e.current_employment_id is null and em2.employee_id = e.id
                    and (em2.termination_date is null or em2.termination_date >= v_today)))
         order by (em2.id = e.current_employment_id) desc, em2.hire_date asc
         limit 1) em on true
      left join lateral (
        select pa2.* from hr.position_assignment pa2
         where pa2.deleted_at is null
           and (pa2.id = e.current_position_assignment_id
                or (e.current_position_assignment_id is null and pa2.employment_id = em.id
                    and pa2.is_primary
                    and (pa2.effective_to is null or pa2.effective_to >= v_today)))
         order by (pa2.id = e.current_position_assignment_id) desc, pa2.effective_from asc
         limit 1) pa on true
      left join hr.job_title jt on jt.id = coalesce(pa.job_title_id, e.current_job_title_id)
      left join hr.department d on d.id = coalesce(pa.department_id, e.current_department_id)
      left join hr.location  l on l.id = coalesce(pa.location_id, e.primary_location_id)
      left join hr.employment mem on mem.id = pa.manager_employment_id and mem.deleted_at is null
      left join hr.employee mgr on mgr.id = coalesce(e.current_manager_employee_id, mem.employee_id)
     where e.organization_id = p_organization_id
       and e.deleted_at is null
       and ds.status = any(v_statuses)
       and (v_contractors or coalesce(pa.worker_class,'employee') <> 'contractor')
       -- directory_opt_out suppresses the ROW for peers and never for HR or the subject
       and (not e.directory_opt_out or v_persona = 'hr_admin' or e.login_user_id = v_uid)
       and (v_search is null
            or e.display_name ilike '%' || v_search || '%'
            or coalesce(e.work_email,'') ilike '%' || v_search || '%'
            or coalesce(e.employee_number,'') ilike '%' || v_search || '%')
       and (v_manager is null or e.current_manager_employee_id = v_manager)
       and (nullif(p_filter ->> 'department_id','') is null
            or coalesce(pa.department_id, e.current_department_id) = (p_filter ->> 'department_id')::uuid)
       and (nullif(p_filter ->> 'location_id','') is null
            or coalesce(pa.location_id, e.primary_location_id) = (p_filter ->> 'location_id')::uuid)
       and (nullif(p_filter ->> 'job_title_id','') is null
            or coalesce(pa.job_title_id, e.current_job_title_id) = (p_filter ->> 'job_title_id')::uuid)
       and (nullif(p_filter ->> 'worker_class','') is null
            or pa.worker_class = p_filter ->> 'worker_class')
       and (nullif(p_filter ->> 'my_team','') is null
            or e.current_manager_employee_id in (
                 select em2.employee_id from hr.employment em2 where em2.id = any(v_mine)))
  ), ranked as (
    select s.*, row_number() over (
             order by
               case when v_dir = 'asc' then
                 case v_sort when 'display_name'     then s.display_name
                             when 'directory_status' then s.directory_status
                             when 'employee_number'  then s.employee_number end end asc nulls last,
               case when v_dir = 'desc' then
                 case v_sort when 'display_name'     then s.display_name
                             when 'directory_status' then s.directory_status
                             when 'employee_number'  then s.employee_number end end desc nulls last,
               case when v_sort = 'hire_date' and v_dir = 'asc'  then s.hire_date end asc  nulls last,
               case when v_sort = 'hire_date' and v_dir = 'desc' then s.hire_date end desc nulls last,
               s.display_name asc) as rn
      from scoped s)
  select (select count(*) from scoped),
         coalesce((select jsonb_agg(to_jsonb(r) - 'rn' order by r.rn) from ranked r
                    where r.rn >  greatest(coalesce(p_offset,0),0)
                      and r.rn <= greatest(coalesce(p_offset,0),0)
                                  + greatest(coalesce(p_limit,50),1)), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total,
    'limit', greatest(coalesce(p_limit,50),1), 'offset', greatest(coalesce(p_offset,0),0),
    'persona', v_persona, 'capabilities', to_jsonb(v_caps),
    'columns', jsonb_build_object('hire_date', v_shows_hire, 'manager', v_shows_mgr),
    'as_of', v_today);
end
$function$
;


-- ── public.hr_org_summary(uuid) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_org_summary(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_role text; v_enabled boolean; v_activated boolean;
  v_is_employee boolean;
begin
  if v_uid is null then
    raise exception 'hr_org_summary: no authenticated caller' using errcode = '42501';
  end if;

  v_role := hr._l1_org_role(v_uid, p_organization_id);
  v_is_employee := exists (select 1 from hr.employee e
                            where e.organization_id = p_organization_id
                              and e.login_user_id = v_uid and e.deleted_at is null);

  -- No standing at all → a REFUSAL, which every consumer renders as ABSENT. Never a card that
  -- says HR is unavailable, which is a sentence about something this viewer may have no business
  -- knowing (SPEC-UI-IA §6).
  if v_role is null and not v_is_employee then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  v_enabled   := hr._l1_module_enabled(p_organization_id);
  v_activated := exists (select 1 from hr.employer_profile ep
                          where ep.organization_id = p_organization_id and ep.deleted_at is null);

  -- Module off and not an owner/admin → absent too. The exception is the one person who can act.
  if not v_enabled and v_role not in ('owner','admin') then
    return jsonb_build_object('granted', false, 'reason', 'module_off');
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'module_enabled', v_enabled,
    'is_activated', v_activated,
    -- 🚨 HEADCOUNT RESOLVES FROM `hr.employment` AS OF TODAY, NEVER FROM A STORED
    -- FLAG (SPEC-EMPLOYEES §1.3 route 1, and D4: this card counted three
    -- offboarded people because `directory_status` had no writer past creation).
    -- Somebody on leave or suspended is still employed and still counted;
    -- prehire spells are excluded, exactly as route 1 requires.
    'headcount', (select count(*) from hr.employee e
                   where e.organization_id = p_organization_id and e.deleted_at is null
                     and hr.employee_directory_status(e.id, current_date) in ('active','on_leave')),
    'prehire_count', (select count(*) from hr.employee e
                       where e.organization_id = p_organization_id and e.deleted_at is null
                         and hr.employee_directory_status(e.id, current_date) = 'prehire'),
    'pending_approvals', (select count(*) from hr.workflow_instance wi
                           where wi.organization_id = p_organization_id
                             and wi.deleted_at is null
                             and wi.state in ('submitted','in_review','conflict')),
    'can_enable', coalesce(v_role in ('owner','admin'), false));
end
$function$
;


-- ── hr.employee_by_party(uuid,uuid) ─────────────────────────────
CREATE OR REPLACE FUNCTION hr.employee_by_party(p_organization_id uuid, p_party_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_shows_hire boolean; v_shows_mgr boolean; v_name text;
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
  select e.id, e.employee_number, e.display_name,
         hr.employee_directory_status(e.id, current_date) as directory_status,
         e.directory_opt_out, e.login_user_id,
         jt.title as job_title, d.name as department,
         e.current_manager_employee_id as manager_employee_id,
         hr._employee_display_name(mgr.id, v_uid) as manager_name,
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
  v_name := hr._employee_display_name(r.id, v_uid);
  if r.id is null or v_name is null then
    return jsonb_build_object('granted', true,
      'employee_id', null, 'employee_number', null, 'display_name', null,
      'directory_status', null,
      'job_title', null, 'department', null,
      'manager_employee_id', null, 'manager_name', null, 'hire_date', null);
  end if;

  -- decision 4: directory tier only. Nothing confidential may reach a CRM surface.
  return jsonb_build_object('granted', true,
    'employee_id',         r.id,
    -- directory tier: the same identifier the directory card and the profile
    -- header already show to anyone who can see this person at all.
    'employee_number',      r.employee_number,
    'display_name',        v_name,
    'directory_status',    r.directory_status,
    'job_title',           r.job_title,
    'department',          r.department,
    'manager_employee_id', case when v_shows_mgr  then r.manager_employee_id end,
    'manager_name',        case when v_shows_mgr  then r.manager_name end,
    'hire_date',           case when v_shows_hire then r.hire_date end);
end
$function$
;


-- ── hr.member_employee_links(uuid,uuid[]) ───────────────────────
CREATE OR REPLACE FUNCTION hr.member_employee_links(p_organization_id uuid, p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
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
           -- derived, never stored (D4); null when this member is not an employee here
           'directory_status',     hr.employee_directory_status(e.id, v_today),
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
$function$
;


-- ── public.hr_duplicate_scan(uuid,jsonb) ────────────────────────
CREATE OR REPLACE FUNCTION public.hr_duplicate_scan(p_organization_id uuid, p_probe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_legs text[] := '{}'; v_skipped text[] := '{}';
  v_fields text[]; v_name text; v_work text; v_personal text; v_hmac bytea; v_matches jsonb;
begin
  if v_uid is null then
    raise exception 'hr_duplicate_scan: no authenticated caller' using errcode = '42501';
  end if;
  if not hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(array_agg(value #>> '{}'), '{}')
    into v_fields
    from jsonb_array_elements(hr._knob('hr.employees','duplicate_scan_fields'));

  v_name     := nullif(trim(coalesce(p_probe ->> 'display_name', '')), '');
  v_work     := lower(nullif(trim(coalesce(p_probe ->> 'work_email', '')), ''));
  v_personal := lower(nullif(trim(coalesce(p_probe ->> 'personal_email', '')), ''));
  v_hmac     := case when nullif(p_probe ->> 'ssn_hmac_hex','') is not null
                     then decode(p_probe ->> 'ssn_hmac_hex', 'hex') end;

  -- 🚨 `array_append`, NEVER `v_legs || 'literal'`. PL/pgSQL resolves the untyped literal on the
  -- right of `||` against the array on the left, so `'name_trgm'` is read as an ARRAY LITERAL and
  -- raises 22P02. That one operator blocked every hire through every one of the four entry routes,
  -- because the scan gates the write and the client is right to refuse on a failed scan.
  if 'name_trgm' = any(v_fields) then
    if v_name is not null then v_legs := array_append(v_legs, 'name_trgm');
    else v_skipped := array_append(v_skipped, 'name_trgm'); end if;
  end if;
  if 'work_email' = any(v_fields) then
    if v_work is not null then v_legs := array_append(v_legs, 'work_email');
    else v_skipped := array_append(v_skipped, 'work_email'); end if;
  end if;
  if 'personal_email' = any(v_fields) then
    if v_personal is not null then v_legs := array_append(v_legs, 'personal_email');
    else v_skipped := array_append(v_skipped, 'personal_email'); end if;
  end if;
  if 'ssn_hmac' = any(v_fields) then
    if v_hmac is not null then v_legs := array_append(v_legs, 'ssn_hmac');
    -- aidream is the ONLY party that can compute this: the HMAC key never enters the database
    -- (SPEC-ACCESS §4.5). Absent is honest; pretending the scan was complete is not.
    else v_skipped := array_append(v_skipped, 'ssn_hmac'); end if;
  end if;

  select coalesce(jsonb_agg(distinct m), '[]'::jsonb) into v_matches from (
    select jsonb_build_object(
             'employee_id', e.id, 'display_name', e.display_name,
             'employee_number', e.employee_number, 'work_email', e.work_email,
             'directory_status', hr.employee_directory_status(e.id, current_date),
             'party_id', e.party_id,
             'matched_on', case
                when v_work is not null and lower(e.work_email) = v_work then 'work_email'
                when v_personal is not null and exists (
                       select 1 from hr.employee_private ep
                        where ep.employee_id = e.id and ep.deleted_at is null
                          and lower(ep.personal_email) = v_personal) then 'personal_email'
                when v_hmac is not null and exists (
                       select 1 from hr.employee_private ep
                        where ep.employee_id = e.id and ep.deleted_at is null
                          and ep.ssn_hmac = v_hmac) then 'ssn_hmac'
                else 'name' end) as m
      from hr.employee e
     where e.organization_id = p_organization_id and e.deleted_at is null
       and (
            ('work_email' = any(v_legs) and v_work is not null and lower(e.work_email) = v_work)
         or ('name_trgm' = any(v_legs) and v_name is not null
             and e.display_name ilike '%' || v_name || '%')
         or ('personal_email' = any(v_legs) and v_personal is not null and exists (
               select 1 from hr.employee_private ep
                where ep.employee_id = e.id and ep.deleted_at is null
                  and lower(ep.personal_email) = v_personal))
         or ('ssn_hmac' = any(v_legs) and v_hmac is not null and exists (
               select 1 from hr.employee_private ep
                where ep.employee_id = e.id and ep.deleted_at is null
                  and ep.ssn_hmac = v_hmac)))
     limit 25) s;

  return jsonb_build_object(
    'ok', true, 'legs_run', to_jsonb(v_legs), 'legs_skipped', to_jsonb(v_skipped),
    'matches', v_matches,
    'party_match', case when nullif(p_probe ->> 'party_id','') is not null then (
      select jsonb_build_object(
               'employee_id', e.id, 'display_name', e.display_name,
               'directory_status', hr.employee_directory_status(e.id, current_date),
               'has_terminated_spell', exists (select 1 from hr.employment em
                                                where em.employee_id = e.id
                                                  and em.status = 'terminated'
                                                  and em.deleted_at is null))
        from hr.employee e
       where e.organization_id = p_organization_id
         and e.party_id = (p_probe ->> 'party_id')::uuid
         and e.deleted_at is null) end);
end
$function$
;


-- ── public.hr_employee_profile(uuid,date) ───────────────────────
CREATE OR REPLACE FUNCTION public.hr_employee_profile(p_employee_id uuid, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_on date := coalesce(p_as_of, current_date);
  v_v jsonb; v_kind text; v_org uuid; v_emp uuid; v_e hr.employee%rowtype;
  v_em hr.employment%rowtype; v_pa hr.position_assignment%rowtype;
  v_tabs text[] := '{}'; v_header jsonb; v_personal jsonb; v_worker_class text;
  v_comp_mgr text; v_pending int; v_priv jsonb; v_priv_id uuid;
begin
  if v_uid is null then
    raise exception 'hr_employee_profile: no authenticated caller' using errcode = '42501';
  end if;

  v_v := hr._l1_viewer(v_uid, p_employee_id, v_on);
  if v_v is null then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;
  v_kind := v_v ->> 'kind';
  v_org  := (v_v ->> 'organization_id')::uuid;
  v_emp  := nullif(v_v ->> 'subject_employment_id','')::uuid;

  if v_kind = 'none' then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_employee',
      p_purpose => 'profile', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_employee_id], p_row_count => 0,
      p_sensitivity_tier => 'internal', p_subject_employment_id => v_emp,
      p_denial_reason => 'no_lane');
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  select * into v_e from hr.employee where id = p_employee_id;
  select * into v_em from hr.employment_as_of(p_employee_id, v_on);
  if v_em.id is not null then
    select * into v_pa from hr.primary_position_as_of(v_em.id, v_on);
  end if;
  v_worker_class := v_pa.worker_class;

  -- A DEFAULT THAT DECIDES A RULE IS NOT A DEFAULT. coalesce(v_worker_class,'employee')
  -- gates the Time Off tab (4.7), and for a prehire BOTH employment_as_of and
  -- primary_position_as_of are null - so the guard answered 'employee' for exactly the
  -- population it exists to catch, and a contractor got a Time Off tab (UPW-77421).
  -- Resolved the way hr_directory_list already resolves it (RECORDED DECISION 3b).
  if v_worker_class is null then
    select pa2.worker_class into v_worker_class
      from hr.employment em2
      join hr.position_assignment pa2 on pa2.employment_id = em2.id
       and pa2.is_primary and pa2.deleted_at is null
     where em2.employee_id = p_employee_id and em2.deleted_at is null
     order by pa2.effective_from asc
     limit 1;
  end if;

  -- An engagement is itself the answer when no position exists yet: 4.7's branch is
  -- ABOUT engagements.
  if v_worker_class is null and exists (
       select 1 from hr.engagement en
        join hr.employment em3 on em3.id = en.employment_id
       where em3.employee_id = p_employee_id
         and em3.deleted_at is null and en.deleted_at is null) then
    v_worker_class := 'contractor';
  end if;

  v_tabs := array_append(v_tabs, 'personal');
  -- 🚨 THE JOB TAB IS NOT A PEER'S. `hr_employment_history` refuses `peer` outright, so
  -- offering the tab would render an empty panel — the exact thing §1.3 forbids ("a tab
  -- whose every field is inaccessible is not in the tab bar"), and a disclosure besides:
  -- an empty Job tab tells a colleague a job record exists and that somebody else can
  -- read it. Personal stays, because what a peer gets there is the directory tier they
  -- can already read on route 10.
  if v_kind <> 'peer' then
    v_tabs := array_append(v_tabs, 'job');
  end if;

  if v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on, v_org) then
    v_tabs := array_append(v_tabs, 'compensation');
  elsif v_kind = 'manager' then
    v_comp_mgr := hr._knob('hr.access','comp_visibility_for_managers') #>> '{}';
    if v_comp_mgr = 'band_only' then v_tabs := array_append(v_tabs, 'compensation'); end if;
  end if;

  if v_kind in ('self','manager','hr_admin','org_admin') then
    if coalesce(v_worker_class,'employee') <> 'contractor' then
      v_tabs := array_append(v_tabs, 'time-off');
    end if;
    v_tabs := array_append(v_tabs, 'time');
    v_tabs := array_append(v_tabs, 'training');
  end if;
  if v_kind in ('self','manager','hr_admin') then
    v_tabs := array_append(v_tabs, 'performance');
  end if;

  if v_kind in ('self','hr_admin') then
    v_tabs := array_append(v_tabs, 'emergency');
    v_tabs := array_append(v_tabs, 'documents');
  end if;
  if v_kind in ('manager','hr_admin') then
    v_tabs := array_append(v_tabs, 'notes');
  end if;
  if hr.capability(v_uid, 'incident.read', v_emp, v_on, v_org)
     or hr.capability(v_uid, 'corrective_action.issue', v_emp, v_on, v_org) then
    v_tabs := array_append(v_tabs, 'relations');
  end if;

  select count(*) into v_pending from (
    select 1 from hr.position_assignment pa where pa.employment_id = v_em.id
       and pa.deleted_at is null and pa.effective_from > v_on
    union all
    select 1 from hr.compensation c where c.employment_id = v_em.id
       and c.deleted_at is null and c.effective_from > v_on
       and (v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on, v_org))
    union all
    select 1 from hr.reporting_line rl where rl.employment_id = v_em.id
       and rl.deleted_at is null and rl.effective_from > v_on) p;

  v_header := jsonb_build_object(
    'employee_id', v_e.id, 'employment_id', v_em.id,
    'display_name', v_e.display_name,

    'pronouns', v_e.pronouns,
    'photo_file_id', v_e.photo_file_id,
    'employee_number', v_e.employee_number,
    'party_id', v_e.party_id,

    -- 🚨 THE HEADER MUST NOT GO SILENT ON SOMEBODY WHO HAS LEFT (D4).
    -- `hr.employment_as_of` correctly returns NOTHING for a terminated person
    -- and for a prehire, so `v_em.status` was null and the header rendered NO
    -- status chip at all — the directory said one thing and the record said
    -- nothing. The as-of answer still wins wherever it exists; this only fills
    -- the silence, through the SAME derivation the directory reads, so the two
    -- surfaces cannot disagree about who is here.
    'status', coalesce(v_em.status, hr.employee_directory_status(p_employee_id, v_on)),
    'spell_number', v_em.spell_number,
    'hire_date', v_em.hire_date,
    'worker_class', v_worker_class,
    'job_title_id', v_pa.job_title_id,
    'job_title', (select title from hr.job_title where id = v_pa.job_title_id),
    'department_id', v_pa.department_id,
    'department', (select name from hr.department where id = v_pa.department_id),
    'location_id', v_pa.location_id,
    'location', (select name from hr.location where id = v_pa.location_id),
    'manager_employment_id', v_pa.manager_employment_id,
    'manager_employee_id', (select em2.employee_id from hr.employment em2
                             where em2.id = v_pa.manager_employment_id),
    'manager_name', (select e2.display_name from hr.employment em2
                       join hr.employee e2 on e2.id = em2.employee_id
                      where em2.id = v_pa.manager_employment_id),
    'direct_report_count', (select count(*) from hr.position_assignment pa2
                             where pa2.manager_employment_id = v_em.id and pa2.is_primary
                               and pa2.deleted_at is null and pa2.effective_from <= v_on
                               and (pa2.effective_to is null or pa2.effective_to >= v_on)),
    'pending_change_count', v_pending)
    -- 🚨 ABSENT, NOT NULL (§1.3). These two keys are permission-gated, so they are MERGED IN for a
    -- permitted viewer rather than emitted with a null value — `jsonb_build_object` keeps a NULL
    -- key, and a present-but-null `legal_name` renders as "Not provided", which tells a colleague
    -- the person HAS no legal name. Every other null in this payload means "empty" and is left
    -- exactly as it is; the distinction is permission, never null-ness.
    || case when v_kind in ('self','hr_admin') then jsonb_build_object(
         'legal_name', trim(concat_ws(' ', v_e.legal_first_name, v_e.legal_middle_name,
                                            v_e.legal_last_name, v_e.legal_name_suffix)),
         'login_user_id', v_e.login_user_id)
       else '{}'::jsonb end;

  v_personal := jsonb_build_object(
    'preferred_first_name', v_e.preferred_first_name,
    'preferred_last_name', v_e.preferred_last_name,
    'pronouns', v_e.pronouns,
    'work_email', v_e.work_email,
    'work_phone', v_e.work_phone,
    'directory_opt_out', v_e.directory_opt_out,
    'photo_file_id', v_e.photo_file_id,
    'custom', case when v_kind in ('self','hr_admin') then v_e.custom else null end);

  if v_kind in ('self','hr_admin') then
    v_personal := v_personal || jsonb_build_object(
      'legal_first_name', v_e.legal_first_name,
      'legal_middle_name', v_e.legal_middle_name,
      'legal_last_name', v_e.legal_last_name,
      'legal_name_suffix', v_e.legal_name_suffix,
      'former_names', v_e.former_names);

    select ep.id into v_priv_id
      from hr.employee_private ep
     where ep.employee_id = p_employee_id and ep.deleted_at is null
     limit 1;

    if v_priv_id is null then
      v_personal := v_personal || jsonb_build_object(
        'private', null,
        'private_state', 'not_collected');
    else
      select hr._door_get('hr_employee_private', v_priv_id,
                          'profile', null, false, 'confidential')
        into v_priv;
      if coalesce((v_priv ->> 'granted')::boolean, false) then
        v_personal := v_personal || jsonb_build_object(
          'private', (v_priv -> 'row') - 'ssn_ciphertext' - 'ssn_key_id' - 'ssn_hmac'
                                       - 'national_id_ciphertext',
          'private_audit_id', v_priv ->> 'audit_id');
      else
        v_personal := v_personal || jsonb_build_object(
          'private', null,
          'private_state', 'not_reachable');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'granted', true,
    'as_of', v_on,
    'viewer', v_kind,
    'capabilities', v_v -> 'caps',
    'organization_id', v_org,
    'tabs', to_jsonb(v_tabs),
    'header', v_header,
    'personal', v_personal,
    'comp_visibility', coalesce(v_comp_mgr,
      case when v_kind = 'self' or hr.capability(v_uid,'comp.read', v_emp, v_on, v_org)
           then 'full' else 'none' end),
    'worker_class_machinery', jsonb_build_object(
      'i9',        coalesce(v_worker_class,'employee') <> 'contractor',
      'w4',        coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'pto',       coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'overtime',  coalesce(v_worker_class,'employee') not in ('contractor','volunteer')
                   and coalesce(v_pa.flsa_status,'nonexempt') = 'nonexempt',
      'payroll',   coalesce(v_worker_class,'employee') not in ('contractor','volunteer')));
end
$function$
;


-- ─────────────────────────────────────────────────────────────────────────────
-- AND NOW THE COLUMN ITSELF. Nothing reads it any more (verified by scanning
-- every prosrc in the database and every .ts/.tsx/.py in the three repos that
-- reach this schema — the frontend only ever read `directory_status` off these
-- doors' JSON, which still carries it, now true). Leaving it in place would
-- leave a `DEFAULT 'active'` column that looks maintained, which is how the next
-- reader gets it wrong. `employee_org_status_idx` is dropped with it.
alter table hr.employee drop column if exists directory_status;

-- The contract rows. `hr.function_contracts_broken()` enforces these on every
-- later migration, so the derivation cannot be quietly reverted to a column read.
delete from hr.function_contract
 where home_migration = 'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain,
   must_be_definer, reason)
values
  ('hr', 'employee_directory_status',
   'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql',
   array['em.status = ''terminated''', 'em.termination_date < p_on', 'order by (em2.status <> ''terminated'''],
   array[]::text[], false,
   'D4: the ONE derivation of directory status. A terminated spell must be detected BY DATE as well as by word, because hr_separation_record leaves status alone for a future-dated separation. The resolution order must prefer a live/future spell over an ended one, or a rehire reads as terminated.'),
  ('public', 'hr_directory_list',
   'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql',
   array['hr.employee_directory_status(e.id, v_today)', 'ds.status = any(v_statuses)'],
   array['e.directory_status'], true,
   'D4: the directory''s status and its status FILTER both resolve as of today through the one derivation. Reading a stored e.directory_status is what showed a terminated person as Active and counted them in the total.'),
  ('public', 'hr_org_summary',
   'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql',
   array['hr.employee_directory_status(e.id, current_date)'],
   array['e.directory_status'], true,
   'SPEC-EMPLOYEES route 1: headcount resolves from hr.employment as of today, never from a stored flag, and excludes prehire spells.'),
  ('public', 'hr_employee_create',
   'hr_l1_60_a_status_with_no_writer_is_not_a_status.sql',
   array['hr.employee_directory_status(v_employee, current_date)'],
   array['directory_status, organization_id'], true,
   'D4: this door was the column''s only writer. It must never stamp a status again — it reports the derived one, so the ack and the directory are one answer.');
