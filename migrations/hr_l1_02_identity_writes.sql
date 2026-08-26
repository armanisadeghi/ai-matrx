-- HR domain L1 — migration 2 of 6 (register item HRB-013, lane l1-employees).
--
-- THE IDENTITY WRITE FAMILY. hr_employee_create (the ONE transaction of §4.1), hr_employee_update,
-- hr_duplicate_scan, hr_self_update, hr_emergency_contact_upsert/_remove,
-- hr_external_identity_upsert/_remove, hr_engagement_upsert.
--
-- Authority: SPEC-EMPLOYEES §4.1, §4.6, §4.7, §4.10, §7.1–§7.3; SPEC-ACCESS §0 law 2, §1.4, §8;
-- R-L1 items A1, A2, A3, A8. Applied live as `hr_l1_02_identity_writes`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 4 — THE WRITE-RPC FAMILY HAD NO NAME, SO L1 NAMED IT.
--
-- SPEC-ACCESS law 2 requires every `hr.*` write to pass a SECURITY DEFINER RPC that arms
-- `hr._guard_hr_write`, and names the READ doors, `hr_self_update`, `hr_activate_employer` and
-- `hr_offboard_finalize` — but no create/update path for the identity triad, compensation,
-- relations or settings exists in any frozen document (R-L1 U3). This lane declares the family as
-- `public.hr_<object>_<verb>`, snake, no dots, matching the shipped `hr_role_assign` /
-- `hr_self_update` shape, each with the uniform body order:
--
--     auth.uid()  →  hr.capability()  →  veto where applicable  →  hr.arm_write()  →  write
--                 →  hr.access_audit  →  envelope
--
-- **→ coordinator: publish the convention so L2–L14 do not each invent one.**
--
-- 🚨 THE REFUSAL-ENVELOPE LAW, inherited from hr_c3_06 without exception. Postgres has no
-- autonomous transactions, so an audit row written and then followed by a RAISE is rolled back
-- with the exception — a denial log that records only the denials that did not happen reads as
-- evidence and is worse than no log. Every write below RETURNS `{ok:false, reason, detail,
-- audit_id}`. A RAISE is still correct for a PROGRAMMING error (an unknown token, a malformed
-- argument): nothing was audited and nothing is being refused.
--
-- 🚨 RECORDED TECHNICAL DECISION 5 — `ssn_hmac` EXISTS, AND THE SCAN USES IT.
-- R-L1 U4 recorded that `hr.employee_private.ssn_hmac` was required by the duplicate scan and
-- declared by no spec. Verified live 2026-08-26: the column IS present on `hr.employee_private`
-- (bytea, alongside `ssn_ciphertext` / `ssn_key_id`), so the amendment U4 asked for has already
-- landed. `hr_duplicate_scan` therefore takes an OPTIONAL caller-supplied HMAC — aidream is the
-- only party that can compute it, because the key never enters the database (SPEC-ACCESS §4.5) —
-- and simply skips that leg when it is absent rather than pretending the scan was complete. The
-- envelope says which legs ran.
--
-- 🚨 RECORDED TECHNICAL DECISION 6b — §7.1's POLICY VOCABULARY IS NOT THE LIVE ONE.
-- SPEC-EMPLOYEES §7.1 names three policies plus one: `free` · `request_approval` · `hr_only`
-- (+ `read_only`). The 39 seeded `hr.field_policy` rows use **`self_free`** and
-- **`self_request_approval`** for the first two (live-read 2026-08-26); `hr_only` and
-- `read_only` match. `hr_self_update` accepts BOTH spellings so a later seed correction cannot
-- break the self lane in either direction, and a column with NO policy row is fail-closed —
-- not self-writable, reported as an unknown key rather than silently ignored.
-- **→ coordinator: SPEC-EMPLOYEES §7.1 owes the two prefixed names, or the seed owes a rename.**
--
-- 🚨 RECORDED TECHNICAL DECISION 6 — REHIRE IS DETECTED HERE AND REFUSED HERE.
-- §4.1: a second `hr.employee` row for the same `(organization_id, party_id)` is impossible by
-- constraint and must never be worked around. `hr_employee_create` detects the prior spell and
-- returns `{ok:false, reason:'rehire_required', employee_id, prior_spells:[...]}` so the UI opens
-- §4.6's rehire panel — it does not raise a constraint error at the user, and it does not
-- silently create the spell either, because `rehire_eligible = false` is a real answer that
-- needs an override with a recorded reason.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the shared write preamble

-- ONE gate helper so the body order above cannot drift per function. Returns NULL when the write
-- may proceed, or a refusal envelope (with its audit row already written) when it may not.
create or replace function hr._l1_write_gate(
  p_org uuid, p_capability text, p_subject_employment uuid, p_token text, p_action text,
  p_purpose text default 'operational')
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr write: no authenticated caller' using errcode = '42501';
  end if;
  if p_org is null then
    raise exception 'hr write: organization_id is required' using errcode = '22023';
  end if;

  if hr.capability(v_uid, p_capability, p_subject_employment, current_date) then
    return null;
  end if;

  v_audit := hr._record_access_audit(
    p_organization_id => p_org, p_action => 'denied', p_target_token => p_token,
    p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
    p_row_count => 0, p_sensitivity_tier => 'internal',
    p_subject_employment_id => p_subject_employment,
    p_denial_reason => 'missing_capability:' || p_capability);

  return jsonb_build_object('ok', false, 'reason', 'forbidden',
    'detail', 'This action needs the ' || p_capability || ' capability in this employer.',
    'capability', p_capability, 'audit_id', v_audit);
end
$fn$;

-- The granted-write audit twin, so no writer forgets it.
--
-- 🚨 `hr.access_audit.action` IS A CLOSED VOCABULARY OF EIGHT and `create` is not one of them:
-- the live CHECK admits read · list · export · reveal_field · bulk_read · print · write · denied.
-- Every mutation is therefore `write`, and the finer verb (create / update / delete) rides in
-- `request_context.verb` where it is queryable without widening a constraint that four other
-- lanes already read. Verified live 2026-08-26 — this cost one rolled-back transaction to learn.
-- **Note for every lane: SPEC-EMPLOYEES §1.3 and SPEC-ACCESS §4.5 both write `action='reveal'`
-- for the SSN door; the live value is `reveal_field`.**
create or replace function hr._l1_write_audit(
  p_org uuid, p_token text, p_action text, p_ids uuid[], p_subject_employment uuid,
  p_purpose text default 'operational', p_tier text default 'internal',
  p_self boolean default false)
returns uuid
language sql security definer set search_path = hr, public
as $fn$
  select hr._record_access_audit(
    p_organization_id => p_org,
    p_action => case when p_action in ('read','list','export','reveal_field','bulk_read',
                                       'print','write','denied')
                     then p_action else 'write' end,
    p_target_token => p_token,
    p_purpose => p_purpose, p_basis => 'capability', p_granted => true,
    p_target_ids => p_ids, p_row_count => coalesce(cardinality(p_ids), 0),
    p_sensitivity_tier => p_tier, p_subject_employment_id => p_subject_employment,
    p_is_self_access => p_self,
    p_request_context => jsonb_build_object('verb', p_action));
$fn$;

-- Next employee number from the org's format knob. `EMP-{seq:05}` by default; the sequence is the
-- count of live employees + 1, retried by the caller once on collision (§4.1 failure behaviour).
create or replace function hr._l1_next_employee_number(p_org uuid, p_attempt int default 0)
returns text
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_fmt text; v_seq int; v_pad int; v_body text;
begin
  v_fmt := hr._knob('hr.employees','employee_number_format') #>> '{}';
  select count(*) + 1 + p_attempt into v_seq from hr.employee
   where organization_id = p_org and deleted_at is null;

  -- {seq:NN} → zero-padded; {seq} → bare. Anything else is returned verbatim with {seq} replaced,
  -- because an org that overrides the format owns the shape of its own numbers.
  v_pad := nullif(substring(v_fmt from '\{seq:(\d+)\}'), '')::int;
  if v_pad is not null then
    v_body := regexp_replace(v_fmt, '\{seq:\d+\}', lpad(v_seq::text, v_pad, '0'));
  else
    v_body := replace(v_fmt, '{seq}', v_seq::text);
  end if;
  return v_body;
end
$fn$;

-- ============================================================ hr_duplicate_scan

-- §4.1's scan, driven by `hr.employees.duplicate_scan_fields`. Name trigram, work email, personal
-- email, and the SSN HMAC when the caller can supply one. The envelope names the legs that RAN,
-- so a UI can never say "no duplicates" about a scan that skipped its strongest leg.
create or replace function public.hr_duplicate_scan(
  p_organization_id uuid, p_probe jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_legs text[] := '{}'; v_skipped text[] := '{}';
  v_fields text[]; v_name text; v_work text; v_personal text; v_hmac bytea; v_matches jsonb;
begin
  if v_uid is null then
    raise exception 'hr_duplicate_scan: no authenticated caller' using errcode = '42501';
  end if;
  if not hr.capability(v_uid, 'identity.write', null, current_date) then
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

  if 'name_trgm' = any(v_fields) then
    if v_name is not null then v_legs := v_legs || 'name_trgm';
    else v_skipped := v_skipped || 'name_trgm'; end if;
  end if;
  if 'work_email' = any(v_fields) then
    if v_work is not null then v_legs := v_legs || 'work_email';
    else v_skipped := v_skipped || 'work_email'; end if;
  end if;
  if 'personal_email' = any(v_fields) then
    if v_personal is not null then v_legs := v_legs || 'personal_email';
    else v_skipped := v_skipped || 'personal_email'; end if;
  end if;
  if 'ssn_hmac' = any(v_fields) then
    if v_hmac is not null then v_legs := v_legs || 'ssn_hmac';
    -- aidream is the ONLY party that can compute this: the HMAC key never enters the database
    -- (SPEC-ACCESS §4.5). Absent is honest; pretending the scan was complete is not.
    else v_skipped := v_skipped || 'ssn_hmac'; end if;
  end if;

  select coalesce(jsonb_agg(distinct m), '[]'::jsonb) into v_matches from (
    select jsonb_build_object(
             'employee_id', e.id, 'display_name', e.display_name,
             'employee_number', e.employee_number, 'work_email', e.work_email,
             'directory_status', e.directory_status, 'party_id', e.party_id,
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

  -- a party already linked to a live employee, and a party with a TERMINATED spell (§4.6 rehire)
  return jsonb_build_object(
    'ok', true, 'legs_run', to_jsonb(v_legs), 'legs_skipped', to_jsonb(v_skipped),
    'matches', v_matches,
    'party_match', case when nullif(p_probe ->> 'party_id','') is not null then (
      select jsonb_build_object(
               'employee_id', e.id, 'display_name', e.display_name,
               'directory_status', e.directory_status,
               'has_terminated_spell', exists (select 1 from hr.employment em
                                                where em.employee_id = e.id
                                                  and em.status = 'terminated'
                                                  and em.deleted_at is null))
        from hr.employee e
       where e.organization_id = p_organization_id
         and e.party_id = (p_probe ->> 'party_id')::uuid
         and e.deleted_at is null) end);
end
$fn$;

-- ============================================================ hr_employee_create

-- §4.1's ONE transaction: party resolve-or-create → hr.employee → hr.employment →
-- hr.position_assignment → hr.compensation (skipped on the contractor branch) →
-- hr.employee_private shell. The org-audience viewer grant and every derived grant are the
-- TRIGGERS' job (hr._derive_on_employment / _derive_on_position), verified live — this function
-- does not re-derive them by hand, because two writers of the same grant is how they drift.
create or replace function public.hr_employee_create(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid := nullif(p_payload ->> 'organization_id','')::uuid;
  v_gate jsonb; v_party uuid; v_employee uuid; v_employment uuid; v_position uuid;
  v_comp uuid; v_private uuid; v_profile uuid; v_number text; v_hire date;
  v_worker text; v_status text; v_dir text; v_prior jsonb; v_attempt int := 0;
  v_loc uuid; v_jur uuid; v_audit uuid; v_display text; v_spell int;
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
          directory_status, organization_id, created_by, updated_by)
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
          case when v_hire > current_date then 'prehire' else 'active' end,
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
  v_dir    := case when v_hire > current_date then 'prehire' else 'active' end;

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

  v_audit := hr._l1_write_audit(v_org, 'hr_employee', 'create', ARRAY[v_employee],
                                v_employment, 'hire');

  return jsonb_build_object(
    'ok', true, 'employee_id', v_employee, 'employment_id', v_employment,
    'position_assignment_id', v_position, 'compensation_id', v_comp, 'party_id', v_party,
    'employee_number', coalesce(v_number, (select employee_number from hr.employee where id = v_employee)),
    'spell_number', v_spell, 'directory_status', v_dir, 'status', v_status,
    'is_prehire', v_hire > current_date, 'audit_id', v_audit,
    'door', '/hr/people/' || v_employee || '/job');
end
$fn$;

-- ============================================================ hr_employee_update

-- The HR-admin write to the directory half of the record. The Confidential half
-- (`hr.employee_private`) moves through `hr_self_update` for the subject and through this
-- function's `private` block for HR — and an address change ALWAYS writes a new effective-dated
-- version with `home_address_effective_from`, for every role including HR admin, because
-- downstream jurisdiction stamps depend on it (§2.3.2).
create or replace function public.hr_employee_update(
  p_employee_id uuid, p_patch jsonb, p_expected_version int default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_emp uuid; v_gate jsonb; v_audit uuid;
  v_e hr.employee%rowtype; v_moved boolean := false; v_priv_id uuid;
begin
  select * into v_e from hr.employee where id = p_employee_id and deleted_at is null;
  if v_e.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_org := v_e.organization_id;
  v_emp := (hr.employment_as_of(p_employee_id, current_date)).id;

  v_gate := hr._l1_write_gate(v_org, 'identity.write', v_emp, 'hr_employee', 'update');
  if v_gate is not null then return v_gate; end if;

  if p_expected_version is not null and v_e.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict',
      'current_version', v_e.version,
      'detail', 'Somebody else changed this record while you were editing it.');
  end if;

  perform hr.arm_write();

  update hr.employee set
    legal_first_name     = coalesce(nullif(p_patch ->> 'legal_first_name',''), legal_first_name),
    legal_middle_name    = case when p_patch ? 'legal_middle_name'
                                then nullif(p_patch ->> 'legal_middle_name','') else legal_middle_name end,
    legal_last_name      = coalesce(nullif(p_patch ->> 'legal_last_name',''), legal_last_name),
    legal_name_suffix    = case when p_patch ? 'legal_name_suffix'
                                then nullif(p_patch ->> 'legal_name_suffix','') else legal_name_suffix end,
    preferred_first_name = case when p_patch ? 'preferred_first_name'
                                then nullif(p_patch ->> 'preferred_first_name','') else preferred_first_name end,
    preferred_last_name  = case when p_patch ? 'preferred_last_name'
                                then nullif(p_patch ->> 'preferred_last_name','') else preferred_last_name end,
    pronouns             = case when p_patch ? 'pronouns'
                                then nullif(p_patch ->> 'pronouns','') else pronouns end,
    work_email           = case when p_patch ? 'work_email'
                                then nullif(p_patch ->> 'work_email','') else work_email end,
    work_phone           = case when p_patch ? 'work_phone'
                                then nullif(p_patch ->> 'work_phone','') else work_phone end,
    photo_file_id        = case when p_patch ? 'photo_file_id'
                                then nullif(p_patch ->> 'photo_file_id','')::uuid else photo_file_id end,
    directory_opt_out    = coalesce((p_patch ->> 'directory_opt_out')::boolean, directory_opt_out),
    custom               = coalesce(p_patch -> 'custom', custom),
    -- §4.10: display_name recomputes from the org's display rule; a preferred name overrides.
    display_name = case
      when (hr._knob('hr.employees','display_name_rule') #>> '{}') = 'legal_full'
        then trim(concat_ws(' ',
               coalesce(nullif(p_patch ->> 'legal_first_name',''), legal_first_name),
               coalesce(nullif(p_patch ->> 'legal_last_name',''),  legal_last_name)))
      when (hr._knob('hr.employees','display_name_rule') #>> '{}') = 'preferred_full'
        then trim(concat_ws(' ',
               coalesce(nullif(p_patch ->> 'preferred_first_name',''), preferred_first_name,
                        nullif(p_patch ->> 'legal_first_name',''), legal_first_name),
               coalesce(nullif(p_patch ->> 'preferred_last_name',''), preferred_last_name,
                        nullif(p_patch ->> 'legal_last_name',''), legal_last_name)))
      else trim(concat_ws(' ',
               coalesce(nullif(p_patch ->> 'preferred_first_name',''), preferred_first_name,
                        nullif(p_patch ->> 'legal_first_name',''), legal_first_name),
               coalesce(nullif(p_patch ->> 'legal_last_name',''), legal_last_name))) end,
    -- §4.10 F1: the OUTGOING legal name is pushed into former_names with `until` and a reason.
    former_names = case
      when nullif(p_patch ->> 'legal_last_name','') is distinct from null
           and nullif(p_patch ->> 'legal_last_name','') <> legal_last_name
        then former_names || jsonb_build_array(jsonb_build_object(
               'legal_first_name', legal_first_name, 'legal_middle_name', legal_middle_name,
               'legal_last_name', legal_last_name, 'legal_name_suffix', legal_name_suffix,
               'until', current_date, 'reason', coalesce(p_patch ->> 'name_change_reason','legal_name_change')))
      else former_names end,
    updated_by = v_uid
  where id = p_employee_id;

  -- ---------------------------------------------------------------- the Confidential half
  if p_patch ? 'private' then
    select ep.id into v_priv_id from hr.employee_private ep
     where ep.employee_id = p_employee_id and ep.deleted_at is null limit 1;

    v_moved := (p_patch -> 'private') ? 'home_address'
               and (p_patch -> 'private' -> 'home_address') is distinct from
                   (select ep.home_address from hr.employee_private ep where ep.id = v_priv_id);

    if v_priv_id is null then
      insert into hr.employee_private (employee_id, home_address, mailing_address,
                                       organization_id, created_by, updated_by)
      values (p_employee_id, coalesce(p_patch -> 'private' -> 'home_address', '{}'::jsonb),
              coalesce(p_patch -> 'private' -> 'mailing_address', '{}'::jsonb),
              v_org, v_uid, v_uid)
      returning id into v_priv_id;
    end if;

    update hr.employee_private set
      date_of_birth   = case when (p_patch -> 'private') ? 'date_of_birth'
                             then nullif(p_patch -> 'private' ->> 'date_of_birth','')::date
                             else date_of_birth end,
      home_address    = coalesce(p_patch -> 'private' -> 'home_address', home_address),
      -- an address change is a JURISDICTION change, so it is always dated (§7.3)
      home_address_effective_from = case when v_moved
        then coalesce(nullif(p_patch -> 'private' ->> 'home_address_effective_from','')::date,
                      current_date)
        else home_address_effective_from end,
      mailing_address = coalesce(p_patch -> 'private' -> 'mailing_address', mailing_address),
      personal_email  = case when (p_patch -> 'private') ? 'personal_email'
                             then nullif(p_patch -> 'private' ->> 'personal_email','')
                             else personal_email end,
      personal_phone  = case when (p_patch -> 'private') ? 'personal_phone'
                             then nullif(p_patch -> 'private' ->> 'personal_phone','')
                             else personal_phone end,
      work_authorization_kind = case when (p_patch -> 'private') ? 'work_authorization_kind'
                             then nullif(p_patch -> 'private' ->> 'work_authorization_kind','')
                             else work_authorization_kind end,
      work_authorization_expires_on = case when (p_patch -> 'private') ? 'work_authorization_expires_on'
                             then nullif(p_patch -> 'private' ->> 'work_authorization_expires_on','')::date
                             else work_authorization_expires_on end,
      national_id_kind = case when (p_patch -> 'private') ? 'national_id_kind'
                             then nullif(p_patch -> 'private' ->> 'national_id_kind','')
                             else national_id_kind end,
      updated_by = v_uid
    where id = v_priv_id;

    perform hr._l1_write_audit(v_org, 'hr_employee_private', 'update', ARRAY[v_priv_id],
                               v_emp, 'update', 'confidential');
  end if;

  v_audit := hr._l1_write_audit(v_org, 'hr_employee', 'update', ARRAY[p_employee_id], v_emp);

  return jsonb_build_object('ok', true, 'employee_id', p_employee_id,
    'jurisdiction_may_have_changed', v_moved, 'audit_id', v_audit);
end
$fn$;

-- ============================================================ hr_self_update

-- §7.1's SINGLE write path for the subject, and the whole of the field-policy split. The client's
-- three renderings are UX only; THIS is the boundary. `free` applies immediately;
-- `request_approval` creates ONE workflow request per `approver_action_type` and applies
-- NOTHING; `hr_only` / `read_only` are REJECTED NAMING EACH OFFENDING FIELD; an unknown key is
-- rejected, never ignored.
create or replace function public.hr_self_update(
  p_token text, p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_employee uuid; v_emp uuid;
  v_free jsonb := '{}'::jsonb; v_req jsonb := '{}'::jsonb;
  v_rejected jsonb := '[]'::jsonb; v_unknown jsonb := '[]'::jsonb;
  v_key text; v_policy text; v_action text; v_actions jsonb := '{}'::jsonb;
  v_instances jsonb := '[]'::jsonb; v_inst jsonb; v_audit uuid; v_priv_id uuid;
begin
  if v_uid is null then
    raise exception 'hr_self_update: no authenticated caller' using errcode = '42501';
  end if;
  if p_token not in ('hr_employee','hr_employee_private','hr_emergency_contact') then
    raise exception 'hr_self_update: % is not a self-service target', p_token
      using errcode = '22023';
  end if;

  -- resolve the subject and PROVE it is the caller. This is the self lane; there is no other.
  select e.id, e.organization_id into v_employee, v_org from hr.employee e
   where e.deleted_at is null
     and e.id = case when p_token = 'hr_employee' then p_id
                     when p_token = 'hr_employee_private'
                       then (select ep.employee_id from hr.employee_private ep where ep.id = p_id)
                     else (select ec.employee_id from hr.emergency_contact ec where ec.id = p_id) end;

  if v_employee is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if not exists (select 1 from hr.employee e
                  where e.id = v_employee and e.login_user_id = v_uid) then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => 'self_service', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_row_count => 0, p_sensitivity_tier => 'confidential',
      p_denial_reason => 'not_the_subject');
    return jsonb_build_object('ok', false, 'reason', 'not_the_subject');
  end if;
  v_emp := hr._l1_self_employment(v_uid, v_org, current_date);

  -- ---------------------------------------------------------------- the split
  for v_key in select jsonb_object_keys(p_patch) loop
    select fp.policy, fp.approver_action_type into v_policy, v_action
      from hr.field_policy fp
     where fp.target_token = p_token and fp.column_name = v_key
       and fp.is_active and fp.deleted_at is null
       and fp.organization_id in (v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
     order by (fp.organization_id = v_org) desc limit 1;

    if v_policy is null then
      -- fail-closed: a column with no policy row is NOT self-writable. An unknown key is rejected,
      -- never ignored (§7.1 rule 2).
      v_unknown := v_unknown || to_jsonb(v_key);
    elsif v_policy in ('free','self_free') then
      v_free := v_free || jsonb_build_object(v_key, p_patch -> v_key);
    elsif v_policy in ('request_approval','self_request_approval') then
      v_req := v_req || jsonb_build_object(v_key, p_patch -> v_key);
      v_actions := v_actions || jsonb_build_object(
        coalesce(v_action, 'profile_change_approve'),
        coalesce(v_actions -> coalesce(v_action,'profile_change_approve'), '{}'::jsonb)
          || jsonb_build_object(v_key, p_patch -> v_key));
    else
      v_rejected := v_rejected || jsonb_build_object('field', v_key, 'policy', v_policy);
    end if;
  end loop;

  if jsonb_array_length(v_rejected) > 0 or jsonb_array_length(v_unknown) > 0 then
    -- NAMES EACH OFFENDING FIELD. "Some fields could not be saved" is the defect this replaces.
    return jsonb_build_object('ok', false, 'reason', 'fields_not_self_writable',
      'rejected', v_rejected, 'unknown', v_unknown,
      'detail', 'These fields are held by HR and cannot be changed here.');
  end if;

  perform hr.arm_write();

  -- ---------------------------------------------------------------- `free` applies now
  if v_free <> '{}'::jsonb then
    if p_token = 'hr_employee' then
      update hr.employee set
        preferred_first_name = case when v_free ? 'preferred_first_name'
                                    then nullif(v_free ->> 'preferred_first_name','') else preferred_first_name end,
        preferred_last_name  = case when v_free ? 'preferred_last_name'
                                    then nullif(v_free ->> 'preferred_last_name','') else preferred_last_name end,
        pronouns             = case when v_free ? 'pronouns'
                                    then nullif(v_free ->> 'pronouns','') else pronouns end,
        photo_file_id        = case when v_free ? 'photo_file_id'
                                    then nullif(v_free ->> 'photo_file_id','')::uuid else photo_file_id end,
        directory_opt_out    = coalesce((v_free ->> 'directory_opt_out')::boolean, directory_opt_out),
        display_name = trim(concat_ws(' ',
          coalesce(nullif(v_free ->> 'preferred_first_name',''), preferred_first_name, legal_first_name),
          coalesce(nullif(v_free ->> 'preferred_last_name',''), preferred_last_name, legal_last_name))),
        updated_by = v_uid
      where id = v_employee;
    elsif p_token = 'hr_employee_private' then
      update hr.employee_private set
        personal_email = case when v_free ? 'personal_email'
                              then nullif(v_free ->> 'personal_email','') else personal_email end,
        personal_phone = case when v_free ? 'personal_phone'
                              then nullif(v_free ->> 'personal_phone','') else personal_phone end,
        updated_by = v_uid
      where id = p_id;
    elsif p_token = 'hr_emergency_contact' then
      update hr.emergency_contact set
        full_name = coalesce(nullif(v_free ->> 'full_name',''), full_name),
        phone     = case when v_free ? 'phone' then nullif(v_free ->> 'phone','') else phone end,
        alt_phone = case when v_free ? 'alt_phone' then nullif(v_free ->> 'alt_phone','') else alt_phone end,
        email     = case when v_free ? 'email' then nullif(v_free ->> 'email','') else email end,
        address   = coalesce(v_free -> 'address', address),
        is_primary = coalesce((v_free ->> 'is_primary')::boolean, is_primary),
        position  = coalesce((v_free ->> 'position')::int, position),
        updated_by = v_uid
      where id = p_id;
    end if;
  end if;

  -- ---------------------------------------------------------------- `request_approval` applies NOTHING
  -- ONE request per approver_action_type (§7.1 rule 2), through the workflow engine — this
  -- function stores no "approver" of its own and writes no pending value onto the record.
  for v_key in select jsonb_object_keys(v_actions) loop
    v_inst := hr.wf_request(
      p_flow_key => case when v_key = 'address_change_approve' then 'address_change'
                         else 'profile_edit_request' end,
      p_target_token => 'hr_employee',
      p_target_id => v_employee,
      p_organization_id => v_org,
      p_payload => jsonb_build_object('token', p_token, 'row_id', p_id,
                                      'patch', v_actions -> v_key,
                                      'approver_action_type', v_key),
      p_subject_employment_id => v_emp,
      p_as_draft => false);
    v_instances := v_instances || jsonb_build_object('action_type', v_key, 'instance', v_inst);
  end loop;

  v_audit := hr._l1_write_audit(v_org, p_token, 'update', ARRAY[p_id], v_emp,
                                'self_service', 'confidential', true);

  return jsonb_build_object('ok', true,
    'applied', v_free, 'requested', v_req, 'requests', v_instances, 'audit_id', v_audit);
end
$fn$;

-- ============================================================ the small upserts

create or replace function public.hr_emergency_contact_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employee uuid := (p_payload ->> 'employee_id')::uuid;
  v_org uuid; v_emp uuid; v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_self boolean;
  v_gate jsonb;
begin
  select e.organization_id, e.login_user_id = v_uid into v_org, v_self
    from hr.employee e where e.id = v_employee and e.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_emp := (hr.employment_as_of(v_employee, current_date)).id;

  -- §2.3.5: this is the one Confidential-tier class with a `self_free` policy — the subject holds
  -- editor on their own rows. A manager is ABSENT here, break-glass only.
  if not coalesce(v_self, false) then
    v_gate := hr._l1_write_gate(v_org, 'identity.write', v_emp, 'hr_emergency_contact', 'update');
    if v_gate is not null then return v_gate; end if;
  end if;

  perform hr.arm_write();

  if v_id is null then
    insert into hr.emergency_contact (employee_id, relationship_category_id, full_name, phone,
                                      alt_phone, email, address, is_primary, position,
                                      organization_id, created_by, updated_by)
    values (v_employee, nullif(p_payload ->> 'relationship_category_id','')::uuid,
            p_payload ->> 'full_name', nullif(p_payload ->> 'phone',''),
            nullif(p_payload ->> 'alt_phone',''), nullif(p_payload ->> 'email',''),
            coalesce(p_payload -> 'address', '{}'::jsonb),
            coalesce((p_payload ->> 'is_primary')::boolean, false),
            (p_payload ->> 'position')::int, v_org, v_uid, v_uid)
    returning id into v_id;
  else
    update hr.emergency_contact set
      relationship_category_id = coalesce(nullif(p_payload ->> 'relationship_category_id','')::uuid,
                                          relationship_category_id),
      full_name = coalesce(nullif(p_payload ->> 'full_name',''), full_name),
      phone     = case when p_payload ? 'phone' then nullif(p_payload ->> 'phone','') else phone end,
      alt_phone = case when p_payload ? 'alt_phone' then nullif(p_payload ->> 'alt_phone','') else alt_phone end,
      email     = case when p_payload ? 'email' then nullif(p_payload ->> 'email','') else email end,
      address   = coalesce(p_payload -> 'address', address),
      is_primary = coalesce((p_payload ->> 'is_primary')::boolean, is_primary),
      position   = coalesce((p_payload ->> 'position')::int, position),
      updated_by = v_uid
    where id = v_id and employee_id = v_employee;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_emergency_contact', 'update', ARRAY[v_id],
                                   v_emp, 'update', 'confidential', coalesce(v_self,false)));
end
$fn$;

create or replace function public.hr_emergency_contact_remove(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employee uuid; v_self boolean; v_gate jsonb;
begin
  select ec.organization_id, ec.employee_id into v_org, v_employee
    from hr.emergency_contact ec where ec.id = p_id and ec.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  select e.login_user_id = v_uid into v_self from hr.employee e where e.id = v_employee;
  if not coalesce(v_self, false) then
    v_gate := hr._l1_write_gate(v_org, 'identity.write', null, 'hr_emergency_contact', 'delete');
    if v_gate is not null then return v_gate; end if;
  end if;
  perform hr.arm_write();
  update hr.emergency_contact set deleted_at = now(), updated_by = v_uid where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_emergency_contact', 'delete', ARRAY[p_id],
                                   null, 'delete', 'confidential', coalesce(v_self,false)));
end
$fn$;

create or replace function public.hr_external_identity_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employee uuid := (p_payload ->> 'employee_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid;
begin
  select e.organization_id into v_org from hr.employee e
   where e.id = v_employee and e.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'identity.write', null, 'hr_external_identity', 'update');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  insert into hr.external_identity (employee_id, system_key, external_id, external_url,
                                    payload, organization_id, created_by, updated_by)
  values (v_employee, p_payload ->> 'system_key', p_payload ->> 'external_id',
          nullif(p_payload ->> 'external_url',''),
          coalesce(p_payload -> 'payload', '{}'::jsonb), v_org, v_uid, v_uid)
  on conflict (employee_id, system_key)
  do update set external_id = excluded.external_id, external_url = excluded.external_url,
                payload = excluded.payload, updated_by = v_uid
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_external_identity', 'update', ARRAY[v_id], null));
end
$fn$;

create or replace function public.hr_engagement_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_class text;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment, 'hr_engagement', 'update');
  if v_gate is not null then return v_gate; end if;

  select pa.worker_class into v_class from hr.primary_position_as_of(v_employment, current_date) pa;
  if coalesce(v_class,'employee') <> 'contractor' then
    -- §1.4: engagements belong to the contractor branch. Offering one on an employee record is a
    -- caller mistake, not a refusal — and silently creating it would misclassify a person.
    return jsonb_build_object('ok', false, 'reason', 'not_a_contractor',
      'worker_class', v_class,
      'detail', 'An engagement belongs to a contractor assignment.');
  end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.engagement (employment_id, platform_of_record, platform_external_id,
                               platform_url, engagement_terms, starts_on, ends_on, auto_renew,
                               status, sow_file_id, w9_file_id, agreement_file_id,
                               organization_id, created_by, updated_by)
    values (v_employment, coalesce(nullif(p_payload ->> 'platform_of_record',''), 'direct'),
            nullif(p_payload ->> 'platform_external_id',''), nullif(p_payload ->> 'platform_url',''),
            coalesce(p_payload -> 'engagement_terms', '{}'::jsonb),
            nullif(p_payload ->> 'starts_on','')::date, nullif(p_payload ->> 'ends_on','')::date,
            coalesce((p_payload ->> 'auto_renew')::boolean, false),
            coalesce(nullif(p_payload ->> 'status',''), 'draft'),
            nullif(p_payload ->> 'sow_file_id','')::uuid,
            nullif(p_payload ->> 'w9_file_id','')::uuid,
            nullif(p_payload ->> 'agreement_file_id','')::uuid,
            v_org, v_uid, v_uid)
    returning id into v_id;
  else
    update hr.engagement set
      platform_of_record   = coalesce(nullif(p_payload ->> 'platform_of_record',''), platform_of_record),
      platform_external_id = case when p_payload ? 'platform_external_id'
                                  then nullif(p_payload ->> 'platform_external_id','') else platform_external_id end,
      platform_url         = case when p_payload ? 'platform_url'
                                  then nullif(p_payload ->> 'platform_url','') else platform_url end,
      -- §4.7: a scope or term change is a NEW terms version; the prior terms are RETAINED.
      engagement_terms     = case when p_payload ? 'engagement_terms'
                                  then jsonb_build_object(
                                         'current', p_payload -> 'engagement_terms',
                                         'history', coalesce(engagement_terms -> 'history','[]'::jsonb)
                                                    || jsonb_build_array(jsonb_build_object(
                                                         'terms', coalesce(engagement_terms -> 'current', engagement_terms),
                                                         'superseded_at', now())))
                                  else engagement_terms end,
      starts_on  = coalesce(nullif(p_payload ->> 'starts_on','')::date, starts_on),
      ends_on    = case when p_payload ? 'ends_on' then nullif(p_payload ->> 'ends_on','')::date else ends_on end,
      auto_renew = coalesce((p_payload ->> 'auto_renew')::boolean, auto_renew),
      status     = coalesce(nullif(p_payload ->> 'status',''), status),
      sow_file_id       = case when p_payload ? 'sow_file_id' then nullif(p_payload ->> 'sow_file_id','')::uuid else sow_file_id end,
      w9_file_id        = case when p_payload ? 'w9_file_id' then nullif(p_payload ->> 'w9_file_id','')::uuid else w9_file_id end,
      agreement_file_id = case when p_payload ? 'agreement_file_id' then nullif(p_payload ->> 'agreement_file_id','')::uuid else agreement_file_id end,
      updated_by = v_uid
    where id = v_id and employment_id = v_employment;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_engagement', 'update', ARRAY[v_id], v_employment));
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_duplicate_scan(uuid, jsonb)',
    'public.hr_employee_create(jsonb)',
    'public.hr_employee_update(uuid, jsonb, int)',
    'public.hr_self_update(text, uuid, jsonb)',
    'public.hr_emergency_contact_upsert(jsonb)',
    'public.hr_emergency_contact_remove(uuid)',
    'public.hr_external_identity_upsert(jsonb)',
    'public.hr_engagement_upsert(jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array ARRAY[
    'hr._l1_write_gate(uuid, text, uuid, text, text, text)',
    'hr._l1_write_audit(uuid, text, text, uuid[], uuid, text, text, boolean)',
    'hr._l1_next_employee_number(uuid, int)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_duplicate_scan','hr_employee_create','hr_employee_update',
                       'hr_self_update','hr_emergency_contact_upsert','hr_emergency_contact_remove',
                       'hr_external_identity_upsert','hr_engagement_upsert');
  if v_bad <> 8 then
    raise exception 'hr_l1_02: expected 8 public identity-write RPCs, found %', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_duplicate_scan','hr_employee_create','hr_employee_update',
                       'hr_self_update','hr_emergency_contact_upsert','hr_emergency_contact_remove',
                       'hr_external_identity_upsert','hr_engagement_upsert')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_02: % identity-write RPCs are executable by anon', v_bad;
  end if;

  -- SPEC-ACCESS law 2: every writer arms the guard. A writer that forgets it fails at runtime on
  -- the first insert, which is a bad place to find out.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_employee_create','hr_employee_update','hr_self_update',
                       'hr_emergency_contact_upsert','hr_emergency_contact_remove',
                       'hr_external_identity_upsert','hr_engagement_upsert')
     and p.prosrc not like '%hr.arm_write()%';
  if v_bad > 0 then
    raise exception 'hr_l1_02: % write RPC(s) never arm hr._guard_hr_write (SPEC-ACCESS law 2)', v_bad;
  end if;

  -- §7.1: the self path must name each offending field, not refuse in the aggregate.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_self_update') not like '%fields_not_self_writable%' then
    raise exception 'hr_l1_02: hr_self_update does not name its rejected fields (§7.1 rule 2)';
  end if;

  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_02: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;
