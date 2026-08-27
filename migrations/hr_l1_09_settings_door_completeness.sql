-- HR domain L1 — migration 9 (register item HRB-013, lane l1-employees).
--
-- FOUR COMPLETENESS GAPS IN L1'S OWN DOORS, every one found by the agent building the settings
-- surface against them rather than by reading them back.
--
-- Authority: SPEC-EMPLOYEES §2.4 (routes 67–68), §10. Applied live as
-- `hr_l1_09_settings_door_completeness`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 26 — A KNOB INDEX WITHOUT `allowed_values` TURNS EVERY ENUM
-- CONTROL INTO A FREE-TEXT BOX.
--
-- `platform.feature_knob` carries `allowed_values`, `min_value`, `max_value`, `unit`, `label`,
-- `description` and `review_due`. `hr_knob_index` projected none of them — so route 67 knew a key
-- was an `enum` and could not know WHICH values, and the honest rendering of that is a text input
-- that accepts `banana` for `hr.employees.display_name_rule`. The client had started reading
-- `platform.feature_knob` directly to recover the metadata, which works (its read policy is
-- `USING (true)`) and which splits one screen across two sources: the value and its origin from
-- the RPC, the constraints from a table. **One door returns all of it.**
--
-- 🚨 RECORDED TECHNICAL DECISION 27 — THE LADDER HAS SCOPE RUNGS AND `hr_knob_set` COULD ONLY
-- WRITE THE ORG ONE.
--
-- §10's ladder is `platform.feature_knob` → `iam.organizations.settings->'hr'` → **scope**
-- (`hr.employer_profile.settings` / `hr.pay_group.settings` / `hr.location.settings`) →
-- `users.user_preferences`, nearest wins. `hr_knob_set` took no scope argument, so the third rung
-- was unwritable and §2.4's uniform panel shape — which renders a scope selector wherever a key
-- has a scope rung — had nothing behind that control. Both writers now take
-- `p_scope_kind` / `p_scope_id`, defaulting to the org rung so every existing call is unchanged.
--
-- The three scope tables all carry a `settings jsonb` column already; nothing new is added. A
-- scope row belonging to another organization is refused rather than written, because a settings
-- write that crosses a tenant boundary is the one mistake this surface could make that nobody
-- would notice.
--
-- 🚨 RECORDED TECHNICAL DECISION 27b — `platform.feature_knob` CANNOT EXPRESS A LOCKED KEY, AND
-- BOTH WRITERS WERE READING A COLUMN THAT DOES NOT EXIST.
--
-- §10 rule 1: *"a ceiling is never raised by an org"* — sensitivity tiers, AI postures and the
-- `home_address` field policy override toward more restriction only, and §10 marks
-- `complaint_subject_excluded_default` **platform-locked true** for harassment, discrimination and
-- ethics. `hr_l1_05`'s `hr_knob_set` implemented that by reading
-- `platform.feature_knob.metadata ->> 'platform_locked'`. **There is no `metadata` column.** The
-- live columns are feature · key · value · default_value · value_type · unit · min_value ·
-- max_value · allowed_values · label · description · set_by · basis · review_due · updated_by ·
-- created_at · updated_at — and nothing among them can say "this one is not overridable".
-- The read raised at runtime; caught by exercising the door rather than by reading it back.
--
-- **This is the THIRD time this register's shape has blocked a spec requirement** — FREEZE D-5's
-- jsonb composite and HRB-004's `self_service_field_policy` were the first two, both deferred to
-- the knob-store owner for the same reason. The lock is deferred the same way rather than faked:
-- both functions now report `platform_locked: null` meaning **unknown, not false**, so no surface
-- can render a ceiling as freely editable on this door's authority. **→ coordinator / knob-store
-- owner: `platform.feature_knob` needs a way to mark a key non-overridable; until then §10 rule 1
-- is enforced only where a validation predicate happens to exist.**
--
-- 🚨 RECORDED TECHNICAL DECISION 28 — TWO READS THAT WERE MISSING THEIR OWN IDENTIFIERS.
-- `hr_my_context` returned no `employer_profile_id`, so route 68 had to go find the profile
-- through an audited confidential list just to learn its own id; and `hr_structure_list` returned
-- establishments but not the tax registrations that hang off the same profile, which have **no
-- read door at all** (`hr_tax_registration` is absent from `hr._door_spec`, so
-- `hr_confidential_get/_list` raise on it). Tax registration is employer-of-record configuration,
-- not personal data — an account number and a rate — so it belongs on the working-record read the
-- rest of route 68 already uses, gated on the same settings gate. That is the honest fix; adding
-- a confidential door for it would be inventing a tier the data does not have.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ hr_knob_index, complete

create or replace function public.hr_knob_index(
  p_organization_id uuid, p_overridden_only boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org_settings jsonb;
begin
  if v_uid is null then
    raise exception 'hr_knob_index: no authenticated caller' using errcode = '42501';
  end if;
  if not (hr.capability(v_uid, 'identity.write', null, current_date)
          or hr._l1_org_role(v_uid, p_organization_id) in ('owner','admin')) then
    raise exception 'hr_knob_index: settings are HR-admin only' using errcode = '42501';
  end if;

  select coalesce(o.settings -> 'hr', '{}'::jsonb) into v_org_settings
    from iam.organizations o where o.id = p_organization_id;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', (select coalesce(jsonb_agg(x order by x ->> 'feature', x ->> 'key'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'slug', split_part(k.feature, '.', 2),
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          -- RECORDED DECISION 26: the CONSTRAINTS travel with the value, so one screen has one
          -- source. Without allowed_values an `enum` control is a free-text box.
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'unit', k.unit,
          'review_due', k.review_due,
          'set_by', k.set_by,
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', v_org_settings #> array[split_part(k.feature,'.',2), k.key],
          'effective_value', coalesce(
             v_org_settings #> array[split_part(k.feature,'.',2), k.key],
             k.value, k.default_value),
          'origin', case
             when v_org_settings #> array[split_part(k.feature,'.',2), k.key] is not null
               then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'basis', k.basis,
          'is_overridden', v_org_settings #> array[split_part(k.feature,'.',2), k.key] is not null,
          -- RECORDED DECISION 27b: NULL means UNKNOWN, not false. The register has no column
          -- that can mark a key non-overridable, so this door must not assert that any key is
          -- freely editable — §10 rule 1's ceilings are real whether or not the store can say so.
          'platform_locked', null::boolean,
          'platform_locked_unknown_reason',
            'platform.feature_knob has no column that can express a locked key'
        ) as x
        from platform.feature_knob k
        where k.feature like 'hr.%'
      ) s
      where not p_overridden_only or (x ->> 'is_overridden')::boolean));
end
$fn$;

-- ============================================================ hr_knob_set / _clear, with scope

-- 🚨 THE OLD FOUR-ARGUMENT SIGNATURES MUST GO, NOT SIT BESIDE THE NEW ONES. Adding parameters
-- with defaults creates an OVERLOAD, and PostgREST resolves `rpc()` by argument NAMES — so a body
-- carrying exactly the four original keys would match both candidates and fail at runtime with an
-- ambiguous-function error. Same trap that `hr_verification_generate_apply` hit in hr_l1_04.
-- The new signatures default `p_scope_kind` to the org rung, so every existing four-argument call
-- still resolves against the single surviving function.
drop function if exists public.hr_knob_set(uuid, text, text, jsonb);
drop function if exists public.hr_knob_clear(uuid, text, text);


create or replace function public.hr_knob_set(
  p_organization_id uuid, p_feature text, p_key text, p_value jsonb,
  p_scope_kind text default 'organization', p_scope_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_gate jsonb; v_slug text; v_knob record; v_tbl text; v_owner uuid;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;

  select * into v_knob from platform.feature_knob k where k.feature = p_feature and k.key = p_key;
  if v_knob.feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_knob',
      'feature', p_feature, 'key', p_key,
      'detail', 'That configuration key is not in the register.');
  end if;

  -- RECORDED DECISION 27b: the platform-lock check that used to live here read
  -- `v_knob.metadata`, and `platform.feature_knob` HAS NO `metadata` COLUMN — so the guard raised
  -- at runtime instead of guarding. It is removed rather than reimplemented against a hard-coded
  -- key list, because a list in code is exactly the constant a knob exists to not be. §10 rule 1's
  -- ceilings stay enforced where a validation predicate exists (the `home_address` field policy is
  -- the specified case); the register-level lock is owed by the knob store.

  v_slug := split_part(p_feature, '.', 2);

  if p_scope_kind = 'organization' then
    update iam.organizations
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb),
                                array['hr', v_slug, p_key], p_value, true)
     where id = p_organization_id;
    return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
      'scope_kind', 'organization', 'effective_value', p_value, 'origin', 'org_override',
      'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update', null, null, 'settings'));
  end if;

  -- RECORDED DECISION 27: the three scope rungs §10 names, and only those three.
  v_tbl := case p_scope_kind
             when 'employer_profile' then 'employer_profile'
             when 'pay_group'        then 'pay_group'
             when 'location'         then 'location'
             else null end;
  if v_tbl is null then
    raise exception 'hr_knob_set: % is not a scope rung', p_scope_kind using errcode = '22023';
  end if;
  if p_scope_id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'scope_id',
      'detail', format('A %s-scoped override needs the row it applies to.', p_scope_kind));
  end if;

  -- a settings write that crosses a tenant boundary is the one mistake this surface could make
  -- that nobody would notice
  execute format('select organization_id from hr.%I where id = $1 and deleted_at is null', v_tbl)
    into v_owner using p_scope_id;
  if v_owner is distinct from p_organization_id then
    return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer',
      'detail', 'That scope row belongs to a different employer.');
  end if;

  perform hr.arm_write();
  execute format($q$
    update hr.%I set settings = jsonb_set(coalesce(settings, '{}'::jsonb), $2, $3, true)
     where id = $1 $q$, v_tbl)
    using p_scope_id, array[v_slug, p_key], p_value;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', p_value, 'origin', 'scope_override',
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'update', ARRAY[p_scope_id],
                                   null, 'settings'));
end
$fn$;

create or replace function public.hr_knob_clear(
  p_organization_id uuid, p_feature text, p_key text,
  p_scope_kind text default 'organization', p_scope_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_gate jsonb; v_slug text; v_default jsonb; v_tbl text; v_owner uuid;
begin
  v_gate := hr._l1_settings_gate(p_organization_id, 'hr_knob', 'update');
  if v_gate is not null then return v_gate; end if;
  v_slug := split_part(p_feature, '.', 2);

  select coalesce(k.value, k.default_value) into v_default
    from platform.feature_knob k where k.feature = p_feature and k.key = p_key;

  -- RECORDED DECISION 21: REMOVE the key. A null would make "overridden to nothing"
  -- indistinguishable from "inherits", and route 67's origin column would start lying.
  if p_scope_kind = 'organization' then
    update iam.organizations
       set settings = coalesce(settings, '{}'::jsonb) #- array['hr', v_slug, p_key]
     where id = p_organization_id;
  else
    v_tbl := case p_scope_kind
               when 'employer_profile' then 'employer_profile'
               when 'pay_group'        then 'pay_group'
               when 'location'         then 'location'
               else null end;
    if v_tbl is null then
      raise exception 'hr_knob_clear: % is not a scope rung', p_scope_kind using errcode = '22023';
    end if;
    execute format('select organization_id from hr.%I where id = $1 and deleted_at is null', v_tbl)
      into v_owner using p_scope_id;
    if v_owner is distinct from p_organization_id then
      return jsonb_build_object('ok', false, 'reason', 'scope_not_in_employer');
    end if;
    perform hr.arm_write();
    execute format('update hr.%I set settings = coalesce(settings, ''{}''::jsonb) #- $2 where id = $1',
                   v_tbl)
      using p_scope_id, array[v_slug, p_key];
  end if;

  return jsonb_build_object('ok', true, 'feature', p_feature, 'key', p_key,
    'scope_kind', p_scope_kind, 'scope_id', p_scope_id,
    'effective_value', v_default, 'origin', 'platform_default', 'key_removed', true,
    'audit_id', hr._l1_write_audit(p_organization_id, 'hr_knob', 'clear', null, null, 'settings'));
end
$fn$;

-- ============================================================ the two missing identifiers

create or replace function public.hr_structure_list(p_organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_admin boolean;
begin
  if v_uid is null then
    raise exception 'hr_structure_list: no authenticated caller' using errcode = '42501';
  end if;
  if hr._l1_org_role(v_uid, p_organization_id) is null then
    raise exception 'hr_structure_list: no standing in this employer' using errcode = '42501';
  end if;
  v_admin := hr.capability(v_uid, 'identity.write', null, current_date)
             or hr._l1_org_role(v_uid, p_organization_id) in ('owner','admin');

  return jsonb_build_object(
    'is_admin', v_admin,
    'departments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'code', d.code, 'parent_department_id', d.parent_department_id,
        'head_employment_id', d.head_employment_id, 'cost_center', d.cost_center,
        'is_active', d.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.department_id = d.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by d.name), '[]'::jsonb)
      from hr.department d where d.organization_id = p_organization_id and d.deleted_at is null),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'code', l.code, 'address', l.address, 'tz', l.tz,
        'jurisdiction_id', l.jurisdiction_id, 'jurisdiction_key', j.key,
        'jurisdiction_name', j.name,
        'establishment_id', l.establishment_id, 'is_remote', l.is_remote,
        'geo_lat', l.geo_lat, 'geo_lng', l.geo_lng, 'geofence_radius_m', l.geofence_radius_m,
        'is_active', l.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.location_id = l.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by l.name), '[]'::jsonb)
      from hr.location l
      left join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.organization_id = p_organization_id and l.deleted_at is null),
    'job_titles', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'code', t.code, 'job_family', t.job_family,
        'job_level', t.job_level, 'grade', t.grade, 'eeo1_job_category', t.eeo1_job_category,
        'default_flsa_status', t.default_flsa_status, 'default_pay_basis', t.default_pay_basis,
        'pay_range_min', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date)
                              then t.pay_range_min end,
        'pay_range_max', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date)
                              then t.pay_range_max end,
        'is_supervisor', t.is_supervisor, 'is_active', t.is_active,
        'assignment_count', (select count(*) from hr.position_assignment pa
                              where pa.job_title_id = t.id and pa.deleted_at is null
                                and (pa.effective_to is null or pa.effective_to >= current_date)))
      order by t.title), '[]'::jsonb)
      from hr.job_title t where t.organization_id = p_organization_id and t.deleted_at is null),
    'pay_groups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pg.id, 'name', pg.name, 'pay_frequency', pg.pay_frequency,
        'first_period_start_on', pg.first_period_start_on, 'pay_date_rule', pg.pay_date_rule,
        'workweek_start_dow', pg.workweek_start_dow, 'workweek_start_time', pg.workweek_start_time,
        'workweek_effective_from', pg.workweek_effective_from,
        'holiday_calendar_id', pg.holiday_calendar_id,
        'default_earning_code_id', pg.default_earning_code_id,
        'timesheet_required', pg.timesheet_required, 'is_active', pg.is_active)
      order by pg.name), '[]'::jsonb)
      from hr.pay_group pg where pg.organization_id = p_organization_id and pg.deleted_at is null),
    'holiday_calendars', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', hc.id, 'name', hc.name, 'jurisdiction_id', hc.jurisdiction_id,
        'is_default', hc.is_default,
        'holiday_pay_counts_toward_ot', hc.holiday_pay_counts_toward_ot,
        'holidays', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', h.id, 'name', h.name, 'observed_on', h.observed_on, 'actual_on', h.actual_on,
            'is_paid', h.is_paid, 'earning_code_id', h.earning_code_id,
            'applies_to_schedule_class', h.applies_to_schedule_class,
            'location_ids', h.location_ids) order by h.observed_on), '[]'::jsonb)
          from hr.holiday h where h.holiday_calendar_id = hc.id and h.deleted_at is null))
      order by hc.name), '[]'::jsonb)
      from hr.holiday_calendar hc
     where hc.organization_id = p_organization_id and hc.deleted_at is null),
    'earning_codes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', ec.id, 'code', ec.code, 'name', ec.name, 'hours_category', ec.hours_category,
        'is_overtime', ec.is_overtime, 'multiplier', ec.multiplier, 'flat_amount', ec.flat_amount,
        'counts_toward_ot', ec.counts_toward_ot,
        'counts_toward_hours_of_service', ec.counts_toward_hours_of_service,
        'counts_toward_sick_accrual', ec.counts_toward_sick_accrual,
        'is_statutory_premium', ec.is_statutory_premium,
        'external_code_map', ec.external_code_map,
        'is_seeded', ec.is_seeded, 'is_active', ec.is_active) order by ec.code), '[]'::jsonb)
      from hr.earning_code ec
     where ec.organization_id = p_organization_id and ec.deleted_at is null),
    'deduction_codes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', dc.id, 'code', dc.code, 'name', dc.name, 'deduction_kind', dc.deduction_kind,
        'provider_ref', dc.provider_ref, 'external_code_map', dc.external_code_map,
        'is_active', dc.is_active) order by dc.code), '[]'::jsonb)
      from hr.deduction_code dc
     where dc.organization_id = p_organization_id and dc.deleted_at is null),
    'establishments', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', es.id, 'name', es.name, 'address', es.address,
        'jurisdiction_id', es.jurisdiction_id, 'naics_code', es.naics_code,
        'eeo1_establishment_id', es.eeo1_establishment_id,
        'is_headquarters', es.is_headquarters,
        'osha_establishment_name', es.osha_establishment_name,
        'annual_average_employees', es.annual_average_employees,
        'total_hours_worked', es.total_hours_worked) order by es.name), '[]'::jsonb)
      from hr.establishment es
     where es.organization_id = p_organization_id and es.deleted_at is null),
    'jurisdictions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', j.id, 'jurisdiction_key', j.key, 'name', j.name, 'level', j.level)
      order by j.key), '[]'::jsonb)
      from hr.jurisdiction j where j.deleted_at is null and j.is_active),
    -- RECORDED DECISION 28: route 68 had to make an audited confidential call just to learn the
    -- id of the profile it was editing.
    'employer_profile_id', (select ep.id from hr.employer_profile ep
                             where ep.organization_id = p_organization_id
                               and ep.deleted_at is null limit 1),
    -- RECORDED DECISION 28: `hr_tax_registration` has NO read door — it is absent from
    -- `hr._door_spec`, so `hr_confidential_get/_list` raise on it. Employer-of-record
    -- configuration (an account number, a rate) is not personal data, so it belongs on the
    -- working-record read the rest of route 68 already uses. Inventing a confidential door for it
    -- would be inventing a tier the data does not have.
    'tax_registrations', case when not v_admin then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', tr.id, 'jurisdiction_id', tr.jurisdiction_id,
          'jurisdiction_key', j2.key, 'jurisdiction_name', j2.name,
          'registration_kind', tr.registration_kind,
          'account_number', tr.account_number, 'registered_on', tr.registered_on,
          'status', tr.status, 'rate', tr.rate, 'rate_effective_on', tr.rate_effective_on,
          'new_hire_report_endpoint', tr.new_hire_report_endpoint)
        order by j2.key, tr.registration_kind), '[]'::jsonb)
        from hr.tax_registration tr
        left join hr.jurisdiction j2 on j2.id = tr.jurisdiction_id
       where tr.organization_id = p_organization_id and tr.deleted_at is null) end);
end
$fn$;

create or replace function public.hr_my_context(p_organization_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_today date := current_date; v_orgs jsonb; v_active jsonb; v_org uuid;
begin
  if v_uid is null then
    raise exception 'hr_my_context: no authenticated caller' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_orgs from (
    select jsonb_build_object(
             'organization_id', o.id, 'name', o.name, 'slug', o.slug,
             'module_enabled', hr._l1_module_enabled(o.id),
             'is_activated', exists (select 1 from hr.employer_profile ep
                                      where ep.organization_id = o.id and ep.deleted_at is null),
             'org_role', hr._l1_org_role(v_uid, o.id),
             'persona', hr._l1_persona(v_uid, o.id, v_today)) as x
      from iam.organizations o
     where exists (select 1 from iam.memberships m
                    where m.user_id = v_uid and m.organization_id = o.id
                      and m.container_type = 'organization' and m.deleted_at is null
                      and coalesce(m.status,'active') = 'active')
       -- An owner/admin sees an org whose module is OFF, because they are the one person who
       -- can turn it on — R-L1 §D: "/hr?org=<thatOrg> renders a single enable-door for
       -- owner/admin and a plain not-enabled page for everyone else." Filtering them out here
       -- is how a freshly created org becomes unreachable and unactivatable.
       and (hr._l1_module_enabled(o.id)
            or hr._l1_org_role(v_uid, o.id) in ('owner','admin')
            or exists (select 1 from hr.employee e
                        where e.organization_id = o.id and e.login_user_id = v_uid
                          and e.deleted_at is null))
  ) s;

  v_org := p_organization_id;
  if v_org is null and jsonb_array_length(v_orgs) = 1 then
    v_org := (v_orgs -> 0 ->> 'organization_id')::uuid;
  end if;

  if v_org is not null then
    if not exists (select 1 from jsonb_array_elements(v_orgs) e
                    where (e ->> 'organization_id')::uuid = v_org) then
      -- not a member, or the module is off and they have no record: the employer is ABSENT,
      -- not refused. The client renders the picker, not a wall.
      v_org := null;
    end if;
  end if;

  if v_org is not null then
    v_active := jsonb_build_object(
      'organization_id', v_org,
      'module_enabled', hr._l1_module_enabled(v_org),
      'is_activated', exists (select 1 from hr.employer_profile ep
                               where ep.organization_id = v_org and ep.deleted_at is null),
      'org_role', hr._l1_org_role(v_uid, v_org),
      'persona', hr._l1_persona(v_uid, v_org, v_today),
      'capabilities', to_jsonb(hr._l1_capabilities(v_uid, v_org, v_today)),
      'employee_id', (select e.id from hr.employee e
                       where e.organization_id = v_org and e.login_user_id = v_uid
                         and e.deleted_at is null limit 1),
      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),
      'employee_count', (select count(*) from hr.employee e
                          where e.organization_id = v_org and e.deleted_at is null),
      'can_activate', coalesce(hr._l1_org_role(v_uid, v_org) in ('owner','admin'), false)
                      and not exists (select 1 from hr.role_assignment ra
                                       where ra.organization_id = v_org and ra.role_key = 'hr_owner'),
      -- RECORDED DECISION 28: every settings surface needs this and nothing returned it.
      'employer_profile_id', (select ep.id from hr.employer_profile ep
                               where ep.organization_id = v_org and ep.deleted_at is null limit 1));
  end if;

  return jsonb_build_object('employers', v_orgs, 'active', v_active, 'as_of', v_today);
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_knob_index(uuid, boolean)',
    'public.hr_knob_set(uuid, text, text, jsonb, text, uuid)',
    'public.hr_knob_clear(uuid, text, text, text, uuid)',
    'public.hr_structure_list(uuid)',
    'public.hr_my_context(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int; v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_knob_index';
  if v_src not like '%allowed_values%' or v_src not like '%min_value%' then
    raise exception 'hr_l1_09: hr_knob_index still omits the constraints — an enum control with '
                    'no allowed_values is a free-text box (RECORDED DECISION 26)';
  end if;

  -- RECORDED DECISION 27: the scope rung is writable, and only §10's three rungs exist.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='hr_knob_set'
                    and pg_get_function_arguments(p.oid) like '%p_scope_kind%') then
    raise exception 'hr_l1_09: hr_knob_set cannot write a scope override (§10 ladder rung 3)';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_knob_set';
  if v_src not like '%scope_not_in_employer%' then
    raise exception 'hr_l1_09: hr_knob_set does not refuse a cross-tenant scope row';
  end if;

  -- RECORDED DECISION 27b: nothing may read a column this table does not have.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_knob_set','hr_knob_clear','hr_knob_index')
     and p.prosrc like '%k.metadata%';
  if v_bad > 0 then
    raise exception 'hr_l1_09: % knob function(s) read platform.feature_knob.metadata, which does '
                    'not exist', v_bad;
  end if;

  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_structure_list') not like '%tax_registration%' then
    raise exception 'hr_l1_09: hr_structure_list still omits tax registrations, which have no '
                    'read door of their own';
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_knob_index','hr_knob_set','hr_knob_clear','hr_structure_list','hr_my_context')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_09: % of these RPCs are executable by anon', v_bad;
  end if;
end $$;
