-- HR domain L1 — migration 5 of 6 (register item HRB-013, lane l1-employees).
--
-- THE ORG HR SETTINGS WRITE PATH (§1b) AND THE ACTIVATION SEEDS.
-- hr_structure_upsert, hr_structure_deactivate, hr_employer_profile_update,
-- hr_establishment_upsert, hr_tax_registration_upsert, hr_pay_group_upsert, hr_calendar_upsert,
-- hr_holiday_upsert, hr_code_upsert, hr_knob_set, hr_knob_clear, hr_activation_seed.
--
-- Authority: SPEC-EMPLOYEES §2.4 (routes 68–72), §10; SPEC-DATA-MODEL §17.5, §19.1;
-- R-L1 items A7, A13, B12. Applied live as `hr_l1_05_settings_writes`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 20 — `hr_activate_employer` SEEDS NOTHING, AND L1 DOES NOT
-- REWRITE SOMEBODY ELSE'S ONE-SHOT.
--
-- R-L1 item A7 and §2.4 both say activation seeds the earning-code set (including D11's three
-- inactive tip codes), the deduction-code set, the §17.5 categories dimensions and the
-- jurisdiction's default holiday calendar. Read live 2026-08-26, `public.hr_activate_employer`
-- (core C3, `hr_c3_04_role_writes_and_activation`) creates the employer profile, the first
-- location, the first department, the nominee's person and spell and the first `hr_owner` — and
-- **seeds none of the four**. An employer activated with no earning codes cannot record an hour,
-- and the first payroll is the worst possible moment to discover it.
--
-- Two ways to close it. Re-`create or replace` C3's function from this lane would mean this file
-- silently owning 120 lines of another lane's audited, one-shot, highest-privilege RPC — and the
-- next agent to touch C3 would clobber it back. Instead L1 ships
-- **`public.hr_activation_seed(p_organization_id)`**: idempotent, separately audited, callable by
-- the wizard as step 4 and re-callable by an admin whose org predates it. `hr_activate_employer`
-- stays exactly as C3 wrote it.
--
-- One of the four turns out to be already done: the **29 `hr_*` categories dimensions are seeded
-- platform-wide** (219 rows across `platform.categories`, live-read), so §17.5's dimensions are
-- not per-org work at all. This function seeds the other three and reports what it actually did —
-- never claiming a seed that did not happen.
--
-- 🚨 RECORDED TECHNICAL DECISION 20b — THE TWO CODE VOCABULARIES ARE CLOSED, AND NOT THE ONES
-- THE SPEC PROSE IMPLIES. Live CHECKs, read 2026-08-26 after a rolled-back seed:
--   `hr.earning_code.hours_category` ∈ worked | paid_leave | unpaid_leave | holiday | on_call |
--                                      premium | bonus | reimbursement
--   `hr.deduction_code.deduction_kind` ∈ pretax | posttax | garnishment | employer_contribution
-- SPEC-EMPLOYEES §2.4 route 72 describes an "hours category" and a deduction "kind" without
-- enumerating either, so a seed written from the prose alone picks plausible values (`unpaid`,
-- `other`, `benefit`, `retirement`) that the database refuses. The seeds below use the live
-- vocabularies. **→ coordinator: §2.4 route 72 owes both enumerations, because every org's
-- first code set is written against that prose.**
--
-- 🚨 RECORDED TECHNICAL DECISION 21 — "CLEAR AN OVERRIDE" REMOVES THE KEY.
-- §2.4 route 67: clearing an override **removes the key, never writes a null**. A null in
-- `iam.organizations.settings->'hr'` is indistinguishable from a deliberate null value, and the
-- ladder would then resolve "overridden to nothing" rather than "inherits". `hr_knob_clear` uses
-- the jsonb `#-` path-delete, and `hr_knob_index` reports `origin` from the KEY'S PRESENCE.
--
-- 🚨 RECORDED TECHNICAL DECISION 22 — A CEILING IS NEVER RAISED BY AN ORG.
-- §10's rule 1: sensitivity tiers, AI postures and the `home_address` field policy override
-- toward MORE restriction only. `hr_knob_set` refuses an override on a platform-locked key and
-- names it, rather than accepting the write and hoping a reader re-checks. The locked set is
-- data (`metadata.platform_locked`), not a hard-coded list, so a later ruling is a knob change.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the settings gate

-- Settings are HR-admin only, with ONE deliberate exception: an org owner/admin can reach them,
-- because they are the only party who can activate the module in the first place and would
-- otherwise be locked out of the surface that assigns the first HR role (SPEC-ACCESS §1.1's
-- bootstrap, adopted from SPEC-EMPLOYEES D-1).
create or replace function hr._l1_settings_gate(p_org uuid, p_token text, p_action text)
returns jsonb
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid(); v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr settings: no authenticated caller' using errcode = '42501';
  end if;
  if hr.capability(v_uid, 'identity.write', null, current_date)
     or hr._l1_org_role(v_uid, p_org) in ('owner','admin') then
    return null;
  end if;
  v_audit := hr._record_access_audit(
    p_organization_id => p_org, p_action => 'denied', p_target_token => p_token,
    p_purpose => 'settings', p_basis => 'refused', p_granted => false,
    p_row_count => 0, p_sensitivity_tier => 'internal',
    p_denial_reason => 'not_hr_admin');
  return jsonb_build_object('ok', false, 'reason', 'forbidden',
    'detail', 'HR settings are HR-admin only.', 'audit_id', v_audit);
end
$fn$;

-- ============================================================ structure (route 69)

create or replace function public.hr_structure_upsert(p_kind text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid := (p_payload ->> 'organization_id')::uuid;
  v_gate jsonb; v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_jur uuid; v_parent uuid;
begin
  if p_kind not in ('department','location','job_title') then
    raise exception 'hr_structure_upsert: % is not a structure kind', p_kind using errcode = '22023';
  end if;
  v_gate := hr._l1_settings_gate(v_org, 'hr_' || p_kind, 'update');
  if v_gate is not null then return v_gate; end if;

  if p_kind = 'location' then
    -- 🚨 §2.4 route 69: a location with NO JURISDICTION cannot be saved, and the form says why —
    -- nothing can be scheduled or stamped against it. This is the single most consequential
    -- required field in the whole settings surface.
    v_jur := nullif(p_payload ->> 'jurisdiction_id','')::uuid;
    if v_jur is null then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'jurisdiction_id',
        'detail', 'A location needs a jurisdiction. Without one nothing can be scheduled or '
               || 'stamped against it — no overtime rule, no sick-leave floor, no final-pay deadline.');
    end if;
    if nullif(p_payload ->> 'tz','') is null then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'tz',
        'detail', 'A location needs an IANA timezone. Every punch and shift is stamped from it.');
    end if;
  end if;

  if p_kind = 'job_title' and nullif(p_payload ->> 'eeo1_job_category','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'eeo1_job_category',
      'detail', 'A job title needs an EEO-1 category. It is denormalized onto every assignment at '
             || 'write, and re-mapping it later does not rewrite history.');
  end if;

  if p_kind = 'department' then
    -- self-FK cycle check: a department cannot be its own ancestor
    v_parent := nullif(p_payload ->> 'parent_department_id','')::uuid;
    if v_id is not null and v_parent is not null then
      if exists (
        with recursive up as (
          select v_parent as id, 1 as depth
          union all
          select d.parent_department_id, up.depth + 1 from hr.department d
            join up on d.id = up.id where d.parent_department_id is not null and up.depth < 50)
        select 1 from up where id = v_id) then
        return jsonb_build_object('ok', false, 'reason', 'validation',
          'field', 'parent_department_id',
          'detail', 'That would make the department its own ancestor.');
      end if;
    end if;
  end if;

  perform hr.arm_write();

  if p_kind = 'department' then
    if v_id is null then
      insert into hr.department (name, code, parent_department_id, head_employment_id, cost_center,
                                 category_id, is_active, organization_id)
      values (p_payload ->> 'name', nullif(p_payload ->> 'code',''), v_parent,
              nullif(p_payload ->> 'head_employment_id','')::uuid,
              nullif(p_payload ->> 'cost_center',''),
              nullif(p_payload ->> 'category_id','')::uuid,
              coalesce((p_payload ->> 'is_active')::boolean, true), v_org)
      returning id into v_id;
    else
      update hr.department set
        name = coalesce(nullif(p_payload ->> 'name',''), name),
        code = case when p_payload ? 'code' then nullif(p_payload ->> 'code','') else code end,
        parent_department_id = case when p_payload ? 'parent_department_id' then v_parent
                                    else parent_department_id end,
        head_employment_id = case when p_payload ? 'head_employment_id'
                                  then nullif(p_payload ->> 'head_employment_id','')::uuid
                                  else head_employment_id end,
        cost_center = case when p_payload ? 'cost_center' then nullif(p_payload ->> 'cost_center','')
                           else cost_center end,
        category_id = coalesce(nullif(p_payload ->> 'category_id','')::uuid, category_id),
        is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active)
      where id = v_id and organization_id = v_org;
    end if;

  elsif p_kind = 'location' then
    if v_id is null then
      insert into hr.location (establishment_id, name, code, address, tz, jurisdiction_id,
                               geo_lat, geo_lng, geofence_radius_m, is_remote, is_active,
                               organization_id)
      values (nullif(p_payload ->> 'establishment_id','')::uuid, p_payload ->> 'name',
              nullif(p_payload ->> 'code',''), coalesce(p_payload -> 'address', '{}'::jsonb),
              p_payload ->> 'tz', v_jur,
              nullif(p_payload ->> 'geo_lat','')::numeric, nullif(p_payload ->> 'geo_lng','')::numeric,
              nullif(p_payload ->> 'geofence_radius_m','')::int,
              coalesce((p_payload ->> 'is_remote')::boolean, false),
              coalesce((p_payload ->> 'is_active')::boolean, true), v_org)
      returning id into v_id;
    else
      update hr.location set
        establishment_id = case when p_payload ? 'establishment_id'
                                then nullif(p_payload ->> 'establishment_id','')::uuid
                                else establishment_id end,
        name = coalesce(nullif(p_payload ->> 'name',''), name),
        code = case when p_payload ? 'code' then nullif(p_payload ->> 'code','') else code end,
        address = coalesce(p_payload -> 'address', address),
        tz = coalesce(nullif(p_payload ->> 'tz',''), tz),
        jurisdiction_id = v_jur,
        geo_lat = coalesce(nullif(p_payload ->> 'geo_lat','')::numeric, geo_lat),
        geo_lng = coalesce(nullif(p_payload ->> 'geo_lng','')::numeric, geo_lng),
        geofence_radius_m = coalesce(nullif(p_payload ->> 'geofence_radius_m','')::int, geofence_radius_m),
        is_remote = coalesce((p_payload ->> 'is_remote')::boolean, is_remote),
        is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active)
      where id = v_id and organization_id = v_org;
    end if;

  else
    if v_id is null then
      insert into hr.job_title (title, code, job_family, job_level, grade, eeo1_job_category,
                                default_flsa_status, default_pay_basis, pay_range_min,
                                pay_range_max, is_supervisor, description, is_active,
                                organization_id)
      values (p_payload ->> 'title', nullif(p_payload ->> 'code',''),
              nullif(p_payload ->> 'job_family',''), nullif(p_payload ->> 'job_level',''),
              nullif(p_payload ->> 'grade',''), p_payload ->> 'eeo1_job_category',
              nullif(p_payload ->> 'default_flsa_status',''),
              nullif(p_payload ->> 'default_pay_basis',''),
              nullif(p_payload ->> 'pay_range_min','')::numeric,
              nullif(p_payload ->> 'pay_range_max','')::numeric,
              coalesce((p_payload ->> 'is_supervisor')::boolean, false),
              nullif(p_payload ->> 'description',''),
              coalesce((p_payload ->> 'is_active')::boolean, true), v_org)
      returning id into v_id;
    else
      update hr.job_title set
        title = coalesce(nullif(p_payload ->> 'title',''), title),
        code = case when p_payload ? 'code' then nullif(p_payload ->> 'code','') else code end,
        job_family = case when p_payload ? 'job_family' then nullif(p_payload ->> 'job_family','')
                          else job_family end,
        job_level = case when p_payload ? 'job_level' then nullif(p_payload ->> 'job_level','')
                         else job_level end,
        grade = case when p_payload ? 'grade' then nullif(p_payload ->> 'grade','') else grade end,
        eeo1_job_category = coalesce(nullif(p_payload ->> 'eeo1_job_category',''), eeo1_job_category),
        default_flsa_status = case when p_payload ? 'default_flsa_status'
                                   then nullif(p_payload ->> 'default_flsa_status','')
                                   else default_flsa_status end,
        default_pay_basis = case when p_payload ? 'default_pay_basis'
                                 then nullif(p_payload ->> 'default_pay_basis','')
                                 else default_pay_basis end,
        pay_range_min = coalesce(nullif(p_payload ->> 'pay_range_min','')::numeric, pay_range_min),
        pay_range_max = coalesce(nullif(p_payload ->> 'pay_range_max','')::numeric, pay_range_max),
        is_supervisor = coalesce((p_payload ->> 'is_supervisor')::boolean, is_supervisor),
        description = case when p_payload ? 'description' then nullif(p_payload ->> 'description','')
                           else description end,
        is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active)
      where id = v_id and organization_id = v_org;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'id', v_id,
    -- §2.4 route 69 edge, surfaced so the panel can say it: re-mapping a title's EEO-1 category
    -- does NOT rewrite history — existing assignments keep the category denormalized at write.
    'history_unchanged', p_kind = 'job_title',
    'audit_id', hr._l1_write_audit(v_org, 'hr_' || p_kind, 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

-- §2.4 route 69: deactivating a row that CURRENT assignments reference is refused, with the count
-- as a DOOR to those people. A silent deactivate is how a department disappears from a form while
-- forty people are still assigned to it.
create or replace function public.hr_structure_deactivate(p_kind text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid; v_gate jsonb; v_count bigint; v_col text;
begin
  if p_kind not in ('department','location','job_title') then
    raise exception 'hr_structure_deactivate: % is not a structure kind', p_kind using errcode = '22023';
  end if;
  execute format('select organization_id from hr.%I where id = $1 and deleted_at is null', p_kind)
    into v_org using p_id;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_settings_gate(v_org, 'hr_' || p_kind, 'update');
  if v_gate is not null then return v_gate; end if;

  v_col := case p_kind when 'department' then 'department_id'
                       when 'location' then 'location_id' else 'job_title_id' end;
  execute format($q$
    select count(*) from hr.position_assignment pa
     where pa.%I = $1 and pa.deleted_at is null
       and (pa.effective_to is null or pa.effective_to >= current_date) $q$, v_col)
    into v_count using p_id;

  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'in_use',
      'assignment_count', v_count,
      'detail', format('%s current assignment(s) still reference this. Move them first.', v_count),
      'door', case p_kind
        when 'department' then '/hr/people?department_id=' || p_id
        when 'location'   then '/hr/people?location_id=' || p_id
        else '/hr/people?job_title_id=' || p_id end);
  end if;

  perform hr.arm_write();
  execute format('update hr.%I set is_active = false where id = $1', p_kind) using p_id;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'id', p_id, 'is_active', false,
    'audit_id', hr._l1_write_audit(v_org, 'hr_' || p_kind, 'deactivate', ARRAY[p_id], null,
                                   'settings'));
end
$fn$;

-- ============================================================ employer profile (route 68)

create or replace function public.hr_employer_profile_update(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb; v_id uuid; v_ein text;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_employer_profile', 'update');
  if v_gate is not null then return v_gate; end if;

  v_ein := nullif(p_payload ->> 'ein','');
  if v_ein is not null and v_ein !~ '^\d{2}-\d{7}$' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'ein',
      'detail', 'An EIN is nine digits written NN-NNNNNNN.');
  end if;

  select ep.id into v_id from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_activated',
      'door', '/hr/settings/employer');
  end if;

  perform hr.arm_write();
  update hr.employer_profile set
    legal_name = coalesce(nullif(p_payload ->> 'legal_name',''), legal_name),
    dba_name = case when p_payload ? 'dba_name' then nullif(p_payload ->> 'dba_name','') else dba_name end,
    ein = coalesce(v_ein, ein),
    entity_form = case when p_payload ? 'entity_form' then nullif(p_payload ->> 'entity_form','')
                       else entity_form end,
    formation_state = case when p_payload ? 'formation_state'
                           then nullif(p_payload ->> 'formation_state','') else formation_state end,
    primary_address = coalesce(p_payload -> 'primary_address', primary_address),
    workers_comp_policy = coalesce(p_payload -> 'workers_comp_policy', workers_comp_policy),
    -- an applicability flag DECLARED by a human overrides the derivation, and who overrode it and
    -- why is recorded on applicability_basis — never silently replaced (§2.4 route 68)
    is_fmla_covered = case when p_payload ? 'is_fmla_covered'
                           then nullif(p_payload ->> 'is_fmla_covered','')::boolean else is_fmla_covered end,
    is_aca_ale = case when p_payload ? 'is_aca_ale'
                      then nullif(p_payload ->> 'is_aca_ale','')::boolean else is_aca_ale end,
    is_eeo1_filer = case when p_payload ? 'is_eeo1_filer'
                         then nullif(p_payload ->> 'is_eeo1_filer','')::boolean else is_eeo1_filer end,
    is_federal_contractor = case when p_payload ? 'is_federal_contractor'
                                 then nullif(p_payload ->> 'is_federal_contractor','')::boolean
                                 else is_federal_contractor end,
    everify_required_states = coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'everify_required_states')),
      everify_required_states),
    applicability_basis = case when p_payload ? 'applicability_override'
      then applicability_basis || jsonb_build_object(
             'declared', p_payload -> 'applicability_override',
             'declared_by', auth.uid(), 'declared_at', now(),
             'reason', p_payload ->> 'applicability_override_reason')
      else applicability_basis end
  where id = v_id;

  return jsonb_build_object('ok', true, 'employer_profile_id', v_id,
    -- §2.4 route 68 edge, surfaced so the panel can say it before saving
    'issued_artifacts_unchanged', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_employer_profile', 'update', ARRAY[v_id], null,
                                   'settings', 'confidential'));
end
$fn$;

create or replace function public.hr_establishment_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
        v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_profile uuid;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_establishment', 'update');
  if v_gate is not null then return v_gate; end if;
  select ep.id into v_profile from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_profile is null then
    return jsonb_build_object('ok', false, 'reason', 'not_activated');
  end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.establishment (employer_profile_id, name, address, jurisdiction_id, naics_code,
                                  eeo1_establishment_id, is_headquarters, osha_establishment_name,
                                  annual_average_employees, total_hours_worked, organization_id)
    values (v_profile, p_payload ->> 'name', coalesce(p_payload -> 'address','{}'::jsonb),
            (p_payload ->> 'jurisdiction_id')::uuid, nullif(p_payload ->> 'naics_code',''),
            nullif(p_payload ->> 'eeo1_establishment_id',''),
            coalesce((p_payload ->> 'is_headquarters')::boolean, false),
            nullif(p_payload ->> 'osha_establishment_name',''),
            nullif(p_payload ->> 'annual_average_employees','')::int,
            nullif(p_payload ->> 'total_hours_worked','')::numeric, v_org)
    returning id into v_id;
  else
    update hr.establishment set
      name = coalesce(nullif(p_payload ->> 'name',''), name),
      address = coalesce(p_payload -> 'address', address),
      jurisdiction_id = coalesce(nullif(p_payload ->> 'jurisdiction_id','')::uuid, jurisdiction_id),
      naics_code = case when p_payload ? 'naics_code' then nullif(p_payload ->> 'naics_code','')
                        else naics_code end,
      eeo1_establishment_id = case when p_payload ? 'eeo1_establishment_id'
                                   then nullif(p_payload ->> 'eeo1_establishment_id','')
                                   else eeo1_establishment_id end,
      is_headquarters = coalesce((p_payload ->> 'is_headquarters')::boolean, is_headquarters),
      osha_establishment_name = case when p_payload ? 'osha_establishment_name'
                                     then nullif(p_payload ->> 'osha_establishment_name','')
                                     else osha_establishment_name end,
      annual_average_employees = coalesce(nullif(p_payload ->> 'annual_average_employees','')::int,
                                          annual_average_employees),
      total_hours_worked = coalesce(nullif(p_payload ->> 'total_hours_worked','')::numeric,
                                    total_hours_worked)
    where id = v_id and organization_id = v_org;
  end if;

  return jsonb_build_object('ok', true, 'establishment_id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_establishment', 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

create or replace function public.hr_tax_registration_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
        v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_profile uuid;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_tax_registration', 'update');
  if v_gate is not null then return v_gate; end if;
  select ep.id into v_profile from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_profile is null then return jsonb_build_object('ok', false, 'reason', 'not_activated'); end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.tax_registration (employer_profile_id, jurisdiction_id, registration_kind,
                                     account_number, registered_on, status, rate, rate_effective_on,
                                     new_hire_report_endpoint, organization_id)
    values (v_profile, (p_payload ->> 'jurisdiction_id')::uuid, p_payload ->> 'registration_kind',
            nullif(p_payload ->> 'account_number',''), nullif(p_payload ->> 'registered_on','')::date,
            coalesce(nullif(p_payload ->> 'status',''), 'active'),
            nullif(p_payload ->> 'rate','')::numeric,
            nullif(p_payload ->> 'rate_effective_on','')::date,
            nullif(p_payload ->> 'new_hire_report_endpoint',''), v_org)
    returning id into v_id;
  else
    update hr.tax_registration set
      account_number = case when p_payload ? 'account_number'
                            then nullif(p_payload ->> 'account_number','') else account_number end,
      registered_on = coalesce(nullif(p_payload ->> 'registered_on','')::date, registered_on),
      status = coalesce(nullif(p_payload ->> 'status',''), status),
      rate = coalesce(nullif(p_payload ->> 'rate','')::numeric, rate),
      rate_effective_on = coalesce(nullif(p_payload ->> 'rate_effective_on','')::date, rate_effective_on),
      new_hire_report_endpoint = case when p_payload ? 'new_hire_report_endpoint'
                                      then nullif(p_payload ->> 'new_hire_report_endpoint','')
                                      else new_hire_report_endpoint end
    where id = v_id and organization_id = v_org;
  end if;

  return jsonb_build_object('ok', true, 'tax_registration_id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_tax_registration', 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

-- ============================================================ pay groups (route 70)

create or replace function public.hr_pay_group_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
  v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_profile uuid;
  v_ww_from date; v_cur_from date; v_cur_dow smallint;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_pay_group', 'update');
  if v_gate is not null then return v_gate; end if;
  select ep.id into v_profile from hr.employer_profile ep
   where ep.organization_id = v_org and ep.deleted_at is null limit 1;
  if v_profile is null then return jsonb_build_object('ok', false, 'reason', 'not_activated'); end if;

  v_ww_from := nullif(p_payload ->> 'workweek_effective_from','')::date;

  if v_id is not null then
    select pg.workweek_effective_from, pg.workweek_start_dow into v_cur_from, v_cur_dow
      from hr.pay_group pg where pg.id = v_id;
    -- 🚨 §2.4 route 70: changing the workweek start requires a FUTURE effective date, and EXISTING
    -- WORKWEEKS ARE NOT RE-CUT. A migration that back-updates them is a defect — every overtime
    -- computation already stamped against the old boundary would silently change.
    if nullif(p_payload ->> 'workweek_start_dow','')::smallint is distinct from null
       and nullif(p_payload ->> 'workweek_start_dow','')::smallint <> v_cur_dow
       and coalesce(v_ww_from, v_cur_from) <= current_date then
      return jsonb_build_object('ok', false, 'reason', 'workweek_change_needs_future_date',
        'field', 'workweek_effective_from', 'current_workweek_start_dow', v_cur_dow,
        'detail', 'Changing the workweek start needs a future effective date. Existing workweeks '
               || 'are not re-cut — every overtime figure already computed against the old '
               || 'boundary stays as it was.');
    end if;
  end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.pay_group (employer_profile_id, name, pay_frequency, first_period_start_on,
                              pay_date_rule, workweek_start_dow, workweek_start_time,
                              workweek_effective_from, holiday_calendar_id, default_earning_code_id,
                              timesheet_required, is_active, organization_id)
    values (v_profile, p_payload ->> 'name', p_payload ->> 'pay_frequency',
            (p_payload ->> 'first_period_start_on')::date,
            coalesce(p_payload -> 'pay_date_rule', '{}'::jsonb),
            coalesce(nullif(p_payload ->> 'workweek_start_dow','')::smallint, 0),
            coalesce(nullif(p_payload ->> 'workweek_start_time','')::time, '00:00'),
            coalesce(v_ww_from, (p_payload ->> 'first_period_start_on')::date),
            nullif(p_payload ->> 'holiday_calendar_id','')::uuid,
            nullif(p_payload ->> 'default_earning_code_id','')::uuid,
            coalesce((p_payload ->> 'timesheet_required')::boolean, true),
            coalesce((p_payload ->> 'is_active')::boolean, true), v_org)
    returning id into v_id;
  else
    update hr.pay_group set
      name = coalesce(nullif(p_payload ->> 'name',''), name),
      pay_frequency = coalesce(nullif(p_payload ->> 'pay_frequency',''), pay_frequency),
      pay_date_rule = coalesce(p_payload -> 'pay_date_rule', pay_date_rule),
      workweek_start_dow = coalesce(nullif(p_payload ->> 'workweek_start_dow','')::smallint,
                                    workweek_start_dow),
      workweek_start_time = coalesce(nullif(p_payload ->> 'workweek_start_time','')::time,
                                     workweek_start_time),
      workweek_effective_from = coalesce(v_ww_from, workweek_effective_from),
      holiday_calendar_id = case when p_payload ? 'holiday_calendar_id'
                                 then nullif(p_payload ->> 'holiday_calendar_id','')::uuid
                                 else holiday_calendar_id end,
      default_earning_code_id = case when p_payload ? 'default_earning_code_id'
                                     then nullif(p_payload ->> 'default_earning_code_id','')::uuid
                                     else default_earning_code_id end,
      timesheet_required = coalesce((p_payload ->> 'timesheet_required')::boolean, timesheet_required),
      is_active = coalesce((p_payload ->> 'is_active')::boolean, is_active)
    where id = v_id and organization_id = v_org;
  end if;

  return jsonb_build_object('ok', true, 'pay_group_id', v_id, 'existing_workweeks_recut', false,
    'audit_id', hr._l1_write_audit(v_org, 'hr_pay_group', 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

-- ============================================================ calendars (route 71)

create or replace function public.hr_calendar_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
        v_id uuid := nullif(p_payload ->> 'id','')::uuid;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_holiday_calendar', 'update');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.holiday_calendar (name, jurisdiction_id, is_default,
                                     holiday_pay_counts_toward_ot, organization_id)
    values (p_payload ->> 'name', nullif(p_payload ->> 'jurisdiction_id','')::uuid,
            coalesce((p_payload ->> 'is_default')::boolean, false),
            -- defaults FALSE and the control carries its FLSA reason (§2.4 route 71 edge)
            coalesce((p_payload ->> 'holiday_pay_counts_toward_ot')::boolean, false), v_org)
    returning id into v_id;
  else
    update hr.holiday_calendar set
      name = coalesce(nullif(p_payload ->> 'name',''), name),
      jurisdiction_id = case when p_payload ? 'jurisdiction_id'
                             then nullif(p_payload ->> 'jurisdiction_id','')::uuid
                             else jurisdiction_id end,
      is_default = coalesce((p_payload ->> 'is_default')::boolean, is_default),
      holiday_pay_counts_toward_ot = coalesce(
        (p_payload ->> 'holiday_pay_counts_toward_ot')::boolean, holiday_pay_counts_toward_ot)
    where id = v_id and organization_id = v_org;
  end if;

  return jsonb_build_object('ok', true, 'holiday_calendar_id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_holiday_calendar', 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

create or replace function public.hr_holiday_upsert(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
        v_id uuid := nullif(p_payload ->> 'id','')::uuid;
begin
  v_gate := hr._l1_settings_gate(v_org, 'hr_holiday', 'update');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  if v_id is null then
    insert into hr.holiday (holiday_calendar_id, name, observed_on, actual_on, is_paid,
                            earning_code_id, applies_to_schedule_class, location_ids, organization_id)
    values ((p_payload ->> 'holiday_calendar_id')::uuid, p_payload ->> 'name',
            (p_payload ->> 'observed_on')::date, nullif(p_payload ->> 'actual_on','')::date,
            coalesce((p_payload ->> 'is_paid')::boolean, true),
            nullif(p_payload ->> 'earning_code_id','')::uuid,
            coalesce((select array_agg(value #>> '{}')
                        from jsonb_array_elements(coalesce(p_payload -> 'applies_to_schedule_class','[]'::jsonb))), '{}'),
            coalesce((select array_agg((value #>> '{}')::uuid)
                        from jsonb_array_elements(coalesce(p_payload -> 'location_ids','[]'::jsonb))), '{}'),
            v_org)
    returning id into v_id;
  else
    update hr.holiday set
      name = coalesce(nullif(p_payload ->> 'name',''), name),
      observed_on = coalesce(nullif(p_payload ->> 'observed_on','')::date, observed_on),
      actual_on = case when p_payload ? 'actual_on' then nullif(p_payload ->> 'actual_on','')::date
                       else actual_on end,
      is_paid = coalesce((p_payload ->> 'is_paid')::boolean, is_paid),
      earning_code_id = case when p_payload ? 'earning_code_id'
                             then nullif(p_payload ->> 'earning_code_id','')::uuid
                             else earning_code_id end
    where id = v_id and organization_id = v_org;
  end if;

  return jsonb_build_object('ok', true, 'holiday_id', v_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_holiday', 'update', ARRAY[v_id], null, 'settings'));
end
$fn$;

-- ============================================================ codes (route 72)

create or replace function public.hr_code_upsert(p_kind text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_org uuid := (p_payload ->> 'organization_id')::uuid; v_gate jsonb;
        v_id uuid := nullif(p_payload ->> 'id','')::uuid; v_seeded boolean; v_active boolean;
begin
  if p_kind not in ('earning','deduction') then
    raise exception 'hr_code_upsert: % is not a code kind', p_kind using errcode = '22023';
  end if;
  v_gate := hr._l1_settings_gate(v_org, 'hr_' || p_kind || '_code', 'update');
  if v_gate is not null then return v_gate; end if;

  v_active := coalesce((p_payload ->> 'is_active')::boolean, true);

  if p_kind = 'earning' then
    if v_id is not null then
      select ec.is_seeded into v_seeded from hr.earning_code ec where ec.id = v_id;
      -- §2.4 route 72: a SEEDED code cannot be deleted, only deactivated. This RPC never deletes
      -- anything, so the rule is structural — but the envelope says so, so the panel can.
    end if;
    perform hr.arm_write();
    if v_id is null then
      insert into hr.earning_code (code, name, hours_category, is_overtime, multiplier, flat_amount,
                                   counts_toward_ot, counts_toward_hours_of_service,
                                   counts_toward_sick_accrual, is_statutory_premium,
                                   jurisdiction_rule_class, external_code_map, is_seeded, is_active,
                                   organization_id)
      values (p_payload ->> 'code', p_payload ->> 'name',
              coalesce(nullif(p_payload ->> 'hours_category',''), 'worked'),
              coalesce((p_payload ->> 'is_overtime')::boolean, false),
              nullif(p_payload ->> 'multiplier','')::numeric,
              nullif(p_payload ->> 'flat_amount','')::numeric,
              coalesce((p_payload ->> 'counts_toward_ot')::boolean, true),
              coalesce((p_payload ->> 'counts_toward_hours_of_service')::boolean, true),
              coalesce((p_payload ->> 'counts_toward_sick_accrual')::boolean, true),
              coalesce((p_payload ->> 'is_statutory_premium')::boolean, false),
              nullif(p_payload ->> 'jurisdiction_rule_class',''),
              coalesce(p_payload -> 'external_code_map','{}'::jsonb),
              false, v_active, v_org)
      returning id into v_id;
    else
      update hr.earning_code set
        name = coalesce(nullif(p_payload ->> 'name',''), name),
        hours_category = coalesce(nullif(p_payload ->> 'hours_category',''), hours_category),
        is_overtime = coalesce((p_payload ->> 'is_overtime')::boolean, is_overtime),
        multiplier = coalesce(nullif(p_payload ->> 'multiplier','')::numeric, multiplier),
        flat_amount = coalesce(nullif(p_payload ->> 'flat_amount','')::numeric, flat_amount),
        -- the three inclusion switches are INDEPENDENT on purpose (§2.4 route 72)
        counts_toward_ot = coalesce((p_payload ->> 'counts_toward_ot')::boolean, counts_toward_ot),
        counts_toward_hours_of_service = coalesce(
          (p_payload ->> 'counts_toward_hours_of_service')::boolean, counts_toward_hours_of_service),
        counts_toward_sick_accrual = coalesce(
          (p_payload ->> 'counts_toward_sick_accrual')::boolean, counts_toward_sick_accrual),
        external_code_map = coalesce(p_payload -> 'external_code_map', external_code_map),
        is_active = v_active
      where id = v_id and organization_id = v_org;
    end if;
  else
    perform hr.arm_write();
    if v_id is null then
      insert into hr.deduction_code (code, name, deduction_kind, provider_ref, external_code_map,
                                     is_active, organization_id)
      values (p_payload ->> 'code', p_payload ->> 'name',
              coalesce(nullif(p_payload ->> 'deduction_kind',''), 'posttax'),
              nullif(p_payload ->> 'provider_ref',''),
              coalesce(p_payload -> 'external_code_map','{}'::jsonb), v_active, v_org)
      returning id into v_id;
    else
      update hr.deduction_code set
        name = coalesce(nullif(p_payload ->> 'name',''), name),
        deduction_kind = coalesce(nullif(p_payload ->> 'deduction_kind',''), deduction_kind),
        provider_ref = case when p_payload ? 'provider_ref' then nullif(p_payload ->> 'provider_ref','')
                            else provider_ref end,
        external_code_map = coalesce(p_payload -> 'external_code_map', external_code_map),
        is_active = v_active
      where id = v_id and organization_id = v_org;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'id', v_id, 'is_seeded', coalesce(v_seeded,false),
    -- §2.4 route 72: the deduction registry COMPUTES NOTHING in v1 and the panel states that.
    'computes_deductions', false,
    'audit_id', hr._l1_write_audit(v_org, 'hr_' || p_kind || '_code', 'update', ARRAY[v_id], null,
                                   'settings'));
end
$fn$;

-- ============================================================ knobs (route 67)

create or replace function public.hr_knob_set(
  p_organization_id uuid, p_feature text, p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_gate jsonb; v_slug text; v_knob record;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  select * into v_knob from platform.feature_knob k where k.feature = p_feature and k.key = p_key;
  if v_knob.feature is null then
    -- D13: a key that is not in the register cannot be overridden. Accepting it would create a
    -- setting nothing reads — the exact shape of a knob that quietly becomes a lie.
    return jsonb_build_object('ok', false, 'reason', 'unknown_knob',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  -- RECORDED DECISION 22: a CEILING is never raised by an org.
  if coalesce((v_knob.metadata ->> 'platform_locked')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'platform_locked',
      'feature', p_feature, 'key', p_key,
      'detail', format('%s.%s is fixed by the platform and cannot be overridden here.',
                       p_feature, p_key),
      'platform_default', coalesce(v_knob.value, v_knob.default_value));
  end if;

  v_slug := split_part(p_feature, '.', 2);

  update iam.organizations
     set settings = jsonb_set(
           coalesce(settings, '{}'::jsonb),
           array['hr', v_slug, p_key],
           p_value, true)
   where id = p_organization_id;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'effective_value', p_value, 'origin', 'org_override',
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update', null, null, 'settings'));
end
$fn$;

create or replace function public.hr_knob_clear(
  p_organization_id uuid, p_feature text, p_key text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_gate jsonb; v_slug text; v_default jsonb;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;
  v_slug := split_part(p_feature, '.', 2);

  -- RECORDED DECISION 21: REMOVE the key. Writing a null would make "overridden to nothing"
  -- indistinguishable from "inherits", and route 67's origin column would start lying.
  update iam.organizations
     set settings = coalesce(settings, '{}'::jsonb) #- array['hr', v_slug, p_key]
   where id = p_organization_id;

  select coalesce(k.value, k.default_value) into v_default
    from platform.feature_knob k where k.feature = p_feature and k.key = p_key;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'effective_value', v_default, 'origin', 'platform_default', 'key_removed', true,
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'clear', null, null, 'settings'));
end
$fn$;

-- ============================================================ hr_activation_seed

-- RECORDED DECISION 20. Idempotent, separately audited, and it reports what it ACTUALLY created.
create or replace function public.hr_activation_seed(p_organization_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_gate jsonb; v_earning int := 0; v_deduction int := 0; v_cal uuid; v_holidays int := 0;
  v_jur uuid; v_year int := extract(year from current_date)::int; r record;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_earning_code', 'seed');
  if v_gate is not null then return v_gate; end if;
  if not exists (select 1 from hr.employer_profile ep
                  where ep.organization_id = p_organization_id and ep.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'not_activated',
      'detail', 'Seeds belong to an employer of record; activate first.');
  end if;

  perform hr.arm_write();

  -- ---------------------------------------------------------------- earning codes
  for r in
    select * from (values
      ('REG','Regular',            'worked',    false, null::numeric, true,  true,  true,  false, true),
      ('OT', 'Overtime',           'worked',    true,  1.5,           false, true,  true,  false, true),
      ('DT', 'Double time',        'worked',    true,  2.0,           false, true,  true,  false, true),
      ('HOL','Holiday pay',        'holiday',   false, null,          false, true,  false, false, true),
      ('PTO','Paid time off',      'paid_leave',false, null,          false, true,  true,  false, true),
      ('SICK','Sick pay',          'paid_leave',false, null,          false, true,  true,  false, true),
      ('BRV','Bereavement',        'paid_leave',false, null,          false, true,  false, false, true),
      ('JURY','Jury duty',         'paid_leave',false, null,          false, true,  false, false, true),
      ('UNPD','Unpaid leave',      'unpaid_leave',false, null,          false, false, false, false, true),
      ('BONUS','Bonus',            'bonus',     false, null,          true,  false, false, false, true),
      ('COMM','Commission',        'bonus',     false, null,          true,  false, false, false, true),
      -- 🚨 D11's three tip codes ship is_active = FALSE. The panel says "seeded, not enabled":
      -- tip credit is a jurisdiction minefield and an org must turn it on deliberately.
      ('TIPD','Tips declared',     'premium',   false, null,          false, false, false, false, false),
      ('TIPC','Tip credit',        'premium',   false, null,          false, false, false, true,  false),
      ('TIPM','Tip makeup',        'premium',   false, null,          true,  false, false, true,  false)
    ) as t(code, name, hours_category, is_ot, multiplier, ct_ot, ct_hos, ct_sick, statutory, active)
  loop
    insert into hr.earning_code (code, name, hours_category, is_overtime, multiplier,
                                 counts_toward_ot, counts_toward_hours_of_service,
                                 counts_toward_sick_accrual, is_statutory_premium,
                                 is_seeded, is_active, organization_id)
    values (r.code, r.name, r.hours_category, r.is_ot, r.multiplier,
            r.ct_ot, r.ct_hos, r.ct_sick, r.statutory, true, r.active, p_organization_id)
    on conflict do nothing;
    if found then v_earning := v_earning + 1; end if;
  end loop;

  -- ---------------------------------------------------------------- deduction codes
  -- REGISTRY ONLY. Nothing computes a deduction in v1 and route 72 states that on the panel.
  for r in
    select * from (values
      ('MED','Medical premium','pretax'),
      ('DEN','Dental premium','pretax'),
      ('VIS','Vision premium','pretax'),
      ('401K','401(k) contribution','pretax'),
      ('GARN','Wage garnishment','garnishment'),
      ('UNION','Union dues','posttax')
    ) as t(code, name, kind)
  loop
    insert into hr.deduction_code (code, name, deduction_kind, is_active, organization_id)
    values (r.code, r.name, r.kind, true, p_organization_id)
    on conflict do nothing;
    if found then v_deduction := v_deduction + 1; end if;
  end loop;

  -- ---------------------------------------------------------------- the default holiday calendar
  select l.jurisdiction_id into v_jur from hr.location l
   where l.organization_id = p_organization_id and l.deleted_at is null
   order by l.created_at limit 1;

  select hc.id into v_cal from hr.holiday_calendar hc
   where hc.organization_id = p_organization_id and hc.is_default and hc.deleted_at is null limit 1;

  if v_cal is null then
    insert into hr.holiday_calendar (name, jurisdiction_id, is_default,
                                     holiday_pay_counts_toward_ot, organization_id)
    values ('US federal holidays', v_jur, true, false, p_organization_id)
    returning id into v_cal;

    for r in
      select * from (values
        ('New Year''s Day',                make_date(v_year, 1, 1)),
        ('Martin Luther King, Jr. Day',    make_date(v_year, 1, 19)),
        ('Presidents'' Day',               make_date(v_year, 2, 16)),
        ('Memorial Day',                   make_date(v_year, 5, 25)),
        ('Juneteenth',                     make_date(v_year, 6, 19)),
        ('Independence Day',               make_date(v_year, 7, 4)),
        ('Labor Day',                      make_date(v_year, 9, 7)),
        ('Columbus Day',                   make_date(v_year, 10, 12)),
        ('Veterans Day',                   make_date(v_year, 11, 11)),
        ('Thanksgiving Day',               make_date(v_year, 11, 26)),
        ('Christmas Day',                  make_date(v_year, 12, 25))
      ) as t(name, on_date)
    loop
      insert into hr.holiday (holiday_calendar_id, name, observed_on, is_paid, organization_id)
      values (v_cal, r.name, r.on_date, true, p_organization_id)
      on conflict do nothing;
      v_holidays := v_holidays + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true,
    'earning_codes_created', v_earning,
    'deduction_codes_created', v_deduction,
    'holiday_calendar_id', v_cal,
    'holidays_created', v_holidays,
    'tip_codes_seeded_not_enabled', jsonb_build_array('TIPD','TIPC','TIPM'),
    -- honest about the one seed that is NOT per-org work: §17.5's dimensions are platform-wide
    'categories_dimensions', 'already seeded platform-wide (29 hr_* dimensions)',
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_employer_profile', 'seed', null, null,
                                   'activation'));
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_structure_upsert(text, jsonb)',
    'public.hr_structure_deactivate(text, uuid)',
    'public.hr_employer_profile_update(jsonb)',
    'public.hr_establishment_upsert(jsonb)',
    'public.hr_tax_registration_upsert(jsonb)',
    'public.hr_pay_group_upsert(jsonb)',
    'public.hr_calendar_upsert(jsonb)',
    'public.hr_holiday_upsert(jsonb)',
    'public.hr_code_upsert(text, jsonb)',
    'public.hr_knob_set(uuid, text, text, jsonb)',
    'public.hr_knob_clear(uuid, text, text)',
    'public.hr_activation_seed(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function hr._l1_settings_gate(uuid, text, text) from public, anon';
  execute 'grant execute on function hr._l1_settings_gate(uuid, text, text) to service_role';
end $$;

-- ============================================================ assertions

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_structure_upsert','hr_structure_deactivate','hr_employer_profile_update',
                       'hr_establishment_upsert','hr_tax_registration_upsert','hr_pay_group_upsert',
                       'hr_calendar_upsert','hr_holiday_upsert','hr_code_upsert','hr_knob_set',
                       'hr_knob_clear','hr_activation_seed');
  if v_bad <> 12 then
    raise exception 'hr_l1_05: expected 12 public settings RPCs, found %', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_structure_upsert','hr_structure_deactivate','hr_employer_profile_update',
                       'hr_establishment_upsert','hr_tax_registration_upsert','hr_pay_group_upsert',
                       'hr_calendar_upsert','hr_holiday_upsert','hr_code_upsert','hr_knob_set',
                       'hr_knob_clear','hr_activation_seed')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_05: % settings RPCs are executable by anon', v_bad;
  end if;

  -- RECORDED DECISION 21: clear REMOVES the key. A jsonb_set writing null would be the defect.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_knob_clear') not like '%#-%' then
    raise exception 'hr_l1_05: hr_knob_clear does not remove the key (§2.4 route 67)';
  end if;

  -- RECORDED DECISION 20: this lane did NOT rewrite core C3's one-shot activation RPC.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_activate_employer') like '%hr_activation_seed%' then
    raise exception 'hr_l1_05: hr_activate_employer has been rewritten — L1 ships a companion, '
                    'not a replacement for another lane''s audited one-shot';
  end if;

  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_05: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;
