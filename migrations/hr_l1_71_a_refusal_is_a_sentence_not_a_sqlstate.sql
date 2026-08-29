-- hr_l1_71 — A REFUSAL IS A SENTENCE, NOT A SQLSTATE.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE DEFECT, TWICE. This program's standing law is that a refusal is DATA: a named reason, a
-- human sentence, and the machine token behind whatever the sentence points at. Two write doors
-- were letting Postgres answer for them instead, and what reached the person was a constraint
-- dump naming internal tables and columns.
--
--   · `public.hr_employee_create` — a rehire whose hire date overlaps a spell the person still
--     holds hit `employment_no_overlapping_spells` and raised a raw **23P01 exclusion_violation**.
--     Reproduced live: `conflicting key value violates exclusion constraint
--     "employment_no_overlapping_spells"` … `DETAIL: Key (employee_id, daterange(hire_date,
--     termination_date, '[]'))=(…) conflicts with existing key (…)`. Two daterange literals and a
--     uuid, at an HR admin, about a form with a date field on it.
--   · `public.hr_separation_record` — a separation with no `reason_category_id` hit the NOT NULL
--     on `hr.separation.reason_category_id` and raised a raw **23502 not_null_violation**.
--
-- 🎯 THE FIX IS AT THE DOOR, AND THE CONSTRAINT IS NEVER TOUCHED. Both constraints are correct
-- and stay exactly as they are — the door CATCHES, it never disables. `hr_l1_68` set the shape
-- this follows: name the real fact BEFORE the write, and branch on `constraint_name` in a handler
-- so a race that reaches the failing statement still gets a sentence rather than a dump.
--
-- 🚨 THE HANDLER IS PLACED WHERE RETURNING A REFUSAL IS SAFE, AND RE-RAISES WHERE IT IS NOT.
-- A plpgsql exception block rolls back only its own subtransaction. In `hr_employee_create` the
-- employment INSERT is preceded, on the NEW-hire path, by a `crm.party` and an `hr.employee`
-- insert — so quietly returning `ok:false` from there would COMMIT a half-built person. That
-- path cannot raise this exclusion (a brand-new employee holds no spells to overlap), so the
-- handler returns a refusal only on the REHIRE path, where nothing has been written yet in this
-- call, and re-raises otherwise. A raw error that aborts the whole write is strictly better than
-- a polite sentence over an orphaned record.
--
-- 🚨 AND THE SENTENCES ARE THE WHOLE POINT, so they say the actual dates rather than "invalid":
-- which spell, when it started, whether it has ended, and the first date that would work.
--
-- CLIENT: no change was needed and none was made — VERIFIED, not assumed. Both surfaces already
-- render a door's named refusal INLINE where the person is looking, which is the established
-- pattern and the reason this fix lands entirely in SQL:
--   · `features/hr/service.ts` → `isRefusalEnvelope` treats `{ok:false,…}` as a refusal and
--     `callHr` returns it as `kind:"denied"` carrying `reason`, `detail`, `field`, `door` and the
--     whole payload — where a RAISED SQLSTATE instead becomes `kind:"failed"` carrying Postgres's
--     own text, which is exactly how the dumps were reaching people.
--   · Hire — `features/hr/people/new/HrNewEmployee.tsx` normalizes through `writeAck.ts` and
--     falls through to `<RefusalNotice>`, rendered immediately above the submit button and below
--     the rehire panel, printing `refusal.detail` and a "Go fix that" button for `refusal.door`.
--   · Offboard — `features/hr/people/directory/offboarding/OffboardEmployeeDialog.tsx` renders
--     `hrErrorSentence(refusal, …)` — which returns `refusal.detail` verbatim — in a
--     `role="alert"` block at the top of the dialog, which survives the failure. Not a toast.

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — the hire door: an overlapping rehire is a sentence.
-- ──────────────────────────────────────────────────────────────────────────────────────────
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
  v_enrolled integer := 0; v_membership jsonb := '{}'::jsonb;
  v_arch_id uuid; v_arch_at timestamptz; v_arch_number text; v_constraint text;
  v_ov_id uuid; v_ov_spell int; v_ov_from date; v_ov_to date; v_ov_status text;
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
      'door', '/hr/settings/structure?org=' || v_org::text);
  end if;

  select ep.id into v_profile from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_activated',
      'detail', 'This employer has no employer of record yet.',
      'door', '/hr/settings/employer?org=' || v_org::text);
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
          and coalesce(m.status, 'active') in ('active', 'departed')) then
    return jsonb_build_object('ok', false, 'reason', 'link_without_membership',
      'field', 'link_user_id',
      'door', '/hr/people/new?org=' || v_org::text,
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
      'existing', v_prior, 'door', '/hr/people/' || (v_prior ->> 'employee_id') || '?org=' || v_org::text);
  end if;

  -- 🚨 AN ARCHIVED RECORD IS NOT A TAKEN EMPLOYEE NUMBER (hr_l1_68).
  -- employee_party_unique_per_org counts ARCHIVED rows and is TOTAL on purpose: SPEC-EMPLOYEES
  -- §1.1 makes hr.employee 1:1 with crm.party inside an employer, and §4.6 makes a return a
  -- SECOND SPELL, never a second record. A partial key would let one person hold two records
  -- here and split their history with no merge path. v_prior above only sees LIVE rows, so an
  -- archived record used to fall through to the insert and surface as employee_number_taken —
  -- a number sentence about a number that was free everywhere. Say the real fact, and name the
  -- door that actually resolves it.
  select e.id, e.deleted_at, e.employee_number into v_arch_id, v_arch_at, v_arch_number
    from hr.employee e
   where e.organization_id = v_org and e.party_id = v_party and e.deleted_at is not null;
  if v_arch_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'employee_archived',
      'employee_id', v_arch_id, 'archived_at', v_arch_at,
      'archived_employee_number', v_arch_number,
      'detail', 'This person already has an employee record in this employer and it is '
             || 'archived (on ' || to_char(v_arch_at, 'FMMon FMDD, YYYY') || '). A person has '
             || 'ONE record per employer, for life — a return to work is a second spell on it, '
             || 'never a second record — so a new record cannot be created beside it.',
      'remedy', 'Restore the archived record (hr_employee_restore), then hire on it with '
             || 'is_rehire = true.',
      'restorable', true);
  end if;

  -- 🚨 AN OVERLAPPING REHIRE IS A SENTENCE, NOT A 23P01 (hr_l1_71).
  -- `employment_no_overlapping_spells` is an EXCLUDE constraint on
  -- (employee_id =, daterange(hire_date, termination_date, '[]') &&) where deleted_at is null.
  -- It is correct and it stays: one person cannot hold two spells at once with one employer,
  -- and every date-keyed read in this program — employment_as_of, final pay, service dates —
  -- depends on that being true. What was WRONG is that nothing asked the question before the
  -- INSERT, so a rehire dated inside a spell the person still holds answered an HR admin with
  -- "conflicting key value violates exclusion constraint" and two daterange literals.
  --
  -- The upper bound is INCLUSIVE ('[]'), so a still-open spell (termination_date null) extends
  -- to infinity and collides with ANY new hire date, and a closed one collides through its
  -- termination date — which is why the remedy names termination_date + 1 as the first date
  -- that works. Asked BEFORE hr.arm_write() so a refusal writes nothing at all.
  if v_prior is not null then
    select em.id, em.spell_number, em.hire_date, em.termination_date, em.status
      into v_ov_id, v_ov_spell, v_ov_from, v_ov_to, v_ov_status
      from hr.employment em
     where em.employee_id = (v_prior ->> 'employee_id')::uuid
       and em.deleted_at is null
       and daterange(em.hire_date, em.termination_date, '[]')
           && daterange(v_hire, null, '[]')
     order by em.hire_date
     limit 1;
    if v_ov_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'overlapping_spell',
        'field', 'hire_date',
        'employment_id', v_ov_id, 'spell_number', v_ov_spell,
        'existing_hire_date', v_ov_from, 'existing_termination_date', v_ov_to,
        'existing_status', v_ov_status,
        'earliest_available_hire_date', case when v_ov_to is null then null else v_ov_to + 1 end,
        'detail', 'Their existing employment overlaps those dates. Spell ' || v_ov_spell
               || ' started ' || to_char(v_ov_from, 'FMMon FMDD, YYYY') || ' and '
               || case when v_ov_to is null then 'has not ended'
                       else 'runs through ' || to_char(v_ov_to, 'FMMon FMDD, YYYY') end
               || ', and this rehire starts ' || to_char(v_hire, 'FMMon FMDD, YYYY')
               || '. One person cannot hold two employment spells at the same time with the '
               || 'same employer.',
        'remedy', case when v_ov_to is null
               then 'End that employment first — record the separation — or set this hire date '
                 || 'to after their last day.'
               else 'Set this hire date to ' || to_char(v_ov_to + 1, 'FMMon FMDD, YYYY')
                 || ' or later, or correct the earlier spell''s termination date.' end,
        'door', '/hr/people/' || (v_prior ->> 'employee_id') || '/job?org=' || v_org::text);
    end if;
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
        -- WHICH unique key actually fired. Assuming it was the employee number is the defect
        -- hr_l1_68 removed: employee_party_unique_per_org reaches here too (a record archived
        -- between the check above and this insert), and it is not a number problem at all.
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint = 'employee_party_unique_per_org' then
          return jsonb_build_object('ok', false, 'reason', 'employee_archived',
            'detail', 'This person already has an employee record in this employer and it is '
                   || 'archived. A person has ONE record per employer, for life; restore that '
                   || 'record instead of creating a second one beside it.',
            'remedy', 'Restore the archived record (hr_employee_restore), then hire on it '
                   || 'with is_rehire = true.',
            'restorable', true);
        end if;
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

  -- 🚨 THE RACE HANDLER, AND WHY IT RE-RAISES INSTEAD OF ANSWERING NICELY (hr_l1_71).
  -- The pre-check above closes the ordinary path; this catches a spell written between that
  -- read and this INSERT. It may only RETURN on the rehire path (v_prior is not null), where
  -- nothing has been written yet in this call — a plpgsql exception block rolls back only its
  -- own subtransaction, so returning here on the NEW-hire path would commit the crm.party and
  -- hr.employee rows inserted above and leave a person with no employment behind a polite
  -- sentence. That path cannot raise this exclusion anyway (a brand-new employee holds no
  -- spells), so anything else re-raises and aborts the whole write.
  begin
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
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'employment_no_overlapping_spells' and v_prior is not null then
      return jsonb_build_object('ok', false, 'reason', 'overlapping_spell',
        'field', 'hire_date',
        'detail', 'Their existing employment overlaps those dates — it was recorded while this '
               || 'hire was being entered. One person cannot hold two employment spells at the '
               || 'same time with the same employer.',
        'remedy', 'Reopen their record to see the current spell, then end it first or set this '
               || 'hire date to after it ends.',
        'door', '/hr/people/' || v_employee || '/job?org=' || v_org::text);
    end if;
    raise;
  end;

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
  declare v_login uuid; v_mbr uuid; v_mbr_action text := 'none';
  begin
    select login_user_id into v_login from hr.employee where id = v_employee;
    if v_login is not null then
      -- 🚨 THIS DOOR DOES NOT DEMAND A SECOND, UNRELATED PRIVILEGE FROM ITS CALLER (hr_l1_67).
      -- The shared membership helper this used to call raises 42501 'membership manager role
      -- required' for any caller who is not an org owner/admin, BEFORE its own short-circuit — so
      -- it fired even when the membership already existed and nothing was to be written. That
      -- made Arman's carry-the-login-over ruling reachable only by an org admin; a plain HR
      -- admin holding every HR capability got a raw 42501 naming a privilege that has nothing
      -- to do with hiring. The ACT is authorized above by hr._l1_write_gate('identity.write');
      -- the membership write is part of that act and is performed under this door's own
      -- definer authority, audited as the HR act. HR admins get no org-manager rights.
      select m.id into v_mbr from iam.memberships m
       where m.container_type = 'organization' and m.container_id = v_org
         and m.user_id = v_login and m.deleted_at is null;
      if v_mbr is not null then
        -- Nothing to write, and the STATUS is not this door's to move: the employment INSERT
        -- above already ran hr.sync_membership_to_employment through employment_membership_sync,
        -- which is the one lifecycle owner and restores a departed member on rehire
        -- (continued_access_06 / 07). A second writer here is how the two would disagree.
        v_mbr_action := 'existing';
      else
        insert into iam.memberships (container_type, container_id, user_id, organization_id,
                                     role, status, metadata, created_by)
        values ('organization', v_org, v_login, v_org, 'member', 'active',
                jsonb_build_object('granted_by', 'hr_employee_create',
                                   'reason', 'link_at_create_completes_access',
                                   'hr_act', 'hire', 'hr_employee_id', v_employee),
                v_uid)
        on conflict (container_type, container_id, user_id)
        do update set status = 'active', deleted_at = null,
                      metadata = jsonb_build_object('granted_by', 'hr_employee_create',
                                   'reason', 'link_at_create_completes_access',
                                   'hr_act', 'hire', 'hr_employee_id', v_employee,
                                   'restored_from_deleted', true),
                      updated_by = v_uid, updated_at = now()
        returning id into v_mbr;
        v_mbr_action := 'created';
        perform hr._l1_write_audit(v_org, 'iam_membership', 'write', ARRAY[v_mbr],
                                   v_employment, 'hire');
      end if;
      perform hr.derive_grants_bulk(ARRAY[v_employment]::uuid[]);
    end if;
    v_membership := jsonb_build_object('membership_id', v_mbr, 'action', v_mbr_action);
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
    'membership', v_membership,
    'door', '/hr/people/' || v_employee || '/job?org=' || v_org::text);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — the separation door: a separation needs a reason, and says so.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_separation_record(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_sep uuid; v_last date; v_term date; v_employee uuid;
  v_shutoff jsonb; v_positions jsonb;
  v_reason uuid; v_category text; v_initiator text; v_deceased boolean;
  v_constraint text; v_column text;
begin
  select em.organization_id, em.employee_id into v_org, v_employee from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment, 'hr_separation',
                              'update', 'separation');
  if v_gate is not null then return v_gate; end if;

  v_last := nullif(p_payload ->> 'last_day_worked','')::date;
  v_term := nullif(p_payload ->> 'termination_date','')::date;
  if v_last is null or v_term is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'detail', 'Last day worked and termination date are different fields and both are required '
             || '— benefits and final pay key on different ones.');
  end if;
  if v_term < v_last then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'termination_date',
      'detail', 'The termination date cannot be before the last day worked.');
  end if;

  -- 🚨 A SEPARATION NEEDS A REASON, AND THAT IS A SENTENCE, NOT A 23502 (hr_l1_71).
  -- `hr.separation.reason_category_id` is NOT NULL and was written straight from the payload, so
  -- a separation submitted without one answered the person with "null value in column
  -- reason_category_id of relation separation violates not-null constraint" — the table's name,
  -- the column's name, and nothing they could act on. The column stays NOT NULL: an unemployment
  -- claim, a rehire-eligibility decision and every separation report key on the reason, and a
  -- nullable one would let a record exist that none of them can answer for.
  --
  -- Every other value this insert takes straight from the payload is checked here for the same
  -- reason — they are all NOT NULL or CHECK-constrained, so each was its own raw SQLSTATE
  -- waiting for the first caller that omitted or mistyped it.
  v_reason := nullif(p_payload ->> 'reason_category_id','')::uuid;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'reason_category_id',
      'detail', 'A separation needs a reason — pick one.');
  end if;
  if not exists (select 1 from platform.categories c where c.id = v_reason) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'reason_category_id',
      'reason_category_id', v_reason,
      'detail', 'That is not a reason this system knows. Pick one from the list.');
  end if;

  v_category := nullif(p_payload ->> 'separation_category','');
  if v_category is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'separation_category',
      'detail', 'A separation needs a kind — voluntary, involuntary, or other.');
  end if;
  if v_category not in ('voluntary','involuntary','other') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'separation_category',
      'attempted', v_category,
      'detail', 'A separation is voluntary, involuntary, or other.');
  end if;

  v_initiator := coalesce(nullif(p_payload ->> 'initiator',''), 'employer');
  if v_initiator not in ('employee','employer','mutual','third_party') then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'initiator',
      'attempted', v_initiator,
      'detail', 'A separation is initiated by the employee, the employer, both by mutual '
             || 'agreement, or a third party.');
  end if;

  v_deceased := coalesce((p_payload ->> 'is_deceased')::boolean, false);
  if v_deceased and v_initiator <> 'third_party' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'initiator',
      'detail', 'A death in service is recorded as third-party initiated — the person did not '
             || 'resign and the employer did not let them go.');
  end if;

  perform hr.arm_write();

  -- The pre-checks above close every path a form can reach. This handler is the backstop for
  -- anything they do not name — a category or reason removed between the check and the write —
  -- so the person still gets words. Nothing has been written at this point, so returning here
  -- leaves the database exactly as it was found.
  begin
    insert into hr.separation (
      employment_id, separation_category, reason_category_id, initiator,
      initiated_by_employment_id, notice_given_on, last_day_worked, termination_date,
      rehire_eligible, rehire_eligible_note, is_deceased, beneficiary_contact, layoff_batch_id,
      corrective_action_id, organization_id)
    values (
      v_employment, v_category,
      v_reason,
      v_initiator,
      nullif(p_payload ->> 'initiated_by_employment_id','')::uuid,
      nullif(p_payload ->> 'notice_given_on','')::date, v_last, v_term,
      -- nullable ON PURPOSE: "not decided" is a real answer and the rehire flow surfaces it as such
      nullif(p_payload ->> 'rehire_eligible','')::boolean,
      nullif(p_payload ->> 'rehire_eligible_note',''),
      v_deceased,
      coalesce(p_payload -> 'beneficiary_contact', '{}'::jsonb),
      nullif(p_payload ->> 'layoff_batch_id','')::uuid,
      nullif(p_payload ->> 'corrective_action_id','')::uuid,
      v_org)
    returning id into v_sep;
  exception when not_null_violation or check_violation or foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name, v_column = column_name;
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'field', nullif(v_column, ''), 'constraint', nullif(v_constraint, ''),
      'detail', 'This separation could not be recorded because '
             || case when nullif(v_column, '') is not null
                     then 'it is missing a required value (' || v_column || ')'
                     else 'one of its values is not one this record accepts' end
             || '. Check the form and try again — nothing was changed.');
  end;

  update hr.employment set
    status = case when v_term > current_date then status else 'terminated' end,
    scheduled_last_day = v_last,
    last_day_worked = case when v_last <= current_date then v_last else last_day_worked end,
    termination_date = v_term,
    separation_id = v_sep
  where id = v_employment;

  -- retention clocks start at the separation (§4.5 N); the sweep itself is the governance lane's
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'stamp_retention_triggers') then
    perform hr.stamp_retention_triggers(v_employment);
  end if;

  -- 🚨 ACCESS SHUTOFF IS A RESULT, NOT AN EVENT (§4.5 L1). The door returns what actually
  -- happened to the membership — including "nothing yet, this termination is in the future" and
  -- "this person has no login" — because `handoff_event` alone is what left every terminated
  -- person holding their grants until continued_access_06.
  v_shutoff := hr.sync_membership_to_employment(v_employee, v_uid, v_sep);

  -- 🚨 THE JOB ENDS WHEN THE SPELL ENDS (hr_l1_69). Nothing used to end-date the position,
  -- so a terminated spell's history read "— present" forever and effective_range @> today
  -- stayed true for a job nobody holds. hr.sync_positions_to_employment is the ONE owner of
  -- that window (it is also bound to a trigger on hr.employment, so a termination written by
  -- any other path is covered too); this call is here so the RESULT is in the ack rather than
  -- assumed, exactly as continued_access_06 did for the access shutoff.
  v_positions := hr.sync_positions_to_employment(v_employment);

  return jsonb_build_object('ok', true, 'separation_id', v_sep, 'employment_id', v_employment,
    'employee_id', v_employee,
    'is_future_dated', v_term > current_date,
    'handoff_event', 'hr.separation_recorded',
    'access_shutoff', v_shutoff,
    'position_close', v_positions,
    'audit_id', hr._l1_write_audit(v_org, 'hr_separation', 'update', ARRAY[v_sep], v_employment,
                                   'separation', 'confidential'));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — the pins. The door catches; it never disables, and it never falls silent.
-- ──────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employee_create','hr_l1_71_a_refusal_is_a_sentence_not_a_sqlstate.sql',
       array['''reason'', ''overlapping_spell''',
             'when exclusion_violation then',
             'employment_no_overlapping_spells'],
       array[]::text[],
       'A rehire dated inside a spell the person still holds raised a raw 23P01 at an HR admin — '
       || 'two daterange literals and a uuid, about a form with a date field on it. The EXCLUDE '
       || 'constraint is correct and must stay: employment_as_of, final pay and service dates all '
       || 'depend on one person holding one spell at a time. The door asks BEFORE hr.arm_write() '
       || 'so a refusal writes nothing, and the handler branches on constraint_name for the race. '
       || 'The handler may only RETURN on the rehire path — on the new-hire path a plpgsql '
       || 'subtransaction rollback would leave the crm.party and hr.employee rows committed '
       || 'behind a polite sentence, so it re-raises instead.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_create'
                     and c.home_migration = 'hr_l1_71_a_refusal_is_a_sentence_not_a_sqlstate.sql');

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_separation_record','hr_l1_71_a_refusal_is_a_sentence_not_a_sqlstate.sql',
       array['A separation needs a reason — pick one.',
             'when not_null_violation or check_violation or foreign_key_violation then'],
       array[]::text[],
       'reason_category_id is NOT NULL and was written straight from the payload, so a separation '
       || 'with no reason answered the person with the table name, the column name and a SQLSTATE. '
       || 'The column stays NOT NULL — unemployment claims, rehire eligibility and every '
       || 'separation report key on the reason. Every other payload value this insert takes is '
       || 'NOT NULL or CHECK-constrained and is checked here for the same cause; the handler is '
       || 'the backstop for a category or reason removed between the check and the write. '
       || 'Removing either the named checks or the handler puts raw SQLSTATEs back in front of '
       || 'people.', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_separation_record'
                     and c.home_migration = 'hr_l1_71_a_refusal_is_a_sentence_not_a_sqlstate.sql');

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 4 — the guard: the contracts hold AND both constraints are still enforcing.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_employee_create','public.hr_separation_record');
  if v_broken > 0 then
    raise exception 'hr_l1_71: % contract clause(s) broken', v_broken;
  end if;

  -- The door catches; it never disables. Both constraints must still exist and be validated.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'hr.employment'::regclass
                    and conname = 'employment_no_overlapping_spells'
                    and contype = 'x' and convalidated) then
    raise exception 'hr_l1_71: the overlapping-spells exclusion constraint is gone or not valid';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'hr' and table_name = 'separation'
                and column_name = 'reason_category_id' and is_nullable = 'YES') then
    raise exception 'hr_l1_71: hr.separation.reason_category_id was made nullable';
  end if;
end
$chk$;
