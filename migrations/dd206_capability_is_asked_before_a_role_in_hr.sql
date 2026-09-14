-- dd206_capability_is_asked_before_a_role_in_hr
--   IN HR, A CAPABILITY IS AN AUTHORITY IN ITS OWN RIGHT — AND IT IS ASKED FIRST
-- (DD-206, the chair's ruling. db-rules §0/§6d/§9. Functions only; no policies — iam.apply_rls
--  owns those. No grants re-issued: CREATE OR REPLACE preserves the ACL of every door below.)
--
-- ═══ WHAT WAS MEASURED ═════════════════════════════════════════════════════════════════════════
-- `hr.capability`'s source of truth is an EMPLOYMENT: `hr.employments_of` (an `hr.employee` row
-- whose `login_user_id` is the caller) → `hr.role_assignment` → `hr.access_role.capabilities`,
-- tenant-bounded by `ra.organization_id`. It never reads `iam.memberships`. So a capability holder
-- who is NOT an organization member is constructible — V-61 and V-67 constructed one and measured
-- them admitted by `hr_knob_index` and refused by `hr_structure_list` and `hr_directory_list`, in
-- the same identity, the same organization, the same rolled-back probe run.
--
-- B-98 re-measured it 2026-09-14 and widened the census to every HR door. The same constructed
-- holder (employee 782e1d1e-…, organization 2643e470-…, `login_user_id` repointed at
-- test@test.com inside `begin … rollback`; `hr.capability(...,'identity.write',...)` TRUE,
-- `iam.memberships` count 0, `hr._l1_org_role(...)` NULL):
--
--   hr_knob_index      → ADMITTED (215 keys)
--   hr_org_summary     → ADMITTED (its gate is role OR employment)
--   hr_relations_list  → ADMITTED (same)
--   hr_structure_list  → 42501 "hr_structure_list: no standing in this employer"
--   hr_directory_list  → 42501 "hr_directory_list: no standing in this employer"
--   hr_org_chart       → 42501 "hr_org_chart: no standing in this employer"
--   hr_my_context      → ADMITTED, and the employer IS NOT IN THE LIST — worse than a refusal,
--                        because nothing on the screen says why.
--
-- That is one HR system answering the same person two different ways about the same employer.
--
-- ═══ THE RULING THIS FILE EXECUTES ═════════════════════════════════════════════════════════════
-- DD-206: every HR door tests CAPABILITY first, then ROLE, in that order. A membership is one
-- authority and a capability is another; neither is a precondition of the other.
--
-- ═══ THE SHAPE OF RECORD (DD-199 residue, V-61 §8) ═════════════════════════════════════════════
-- TWO STATEMENTS, never one boolean expression:
--
--     if <capability reader> then null;
--     elsif <role test> then raise …;
--     end if;
--
-- Postgres may evaluate either operand of `and`/`or` first and is free to reorder by cost, so a
-- combined expression makes "capability first" a fact about today's plan rather than a rule. An
-- `elsif` branch is reached only when the branch above it was false. That is a language guarantee.
--
-- The capability reader is `cardinality(hr._l1_capabilities(user, org, at)) > 0` — "does this
-- person hold ANY HR capability in THIS employer", which is the standing question these three
-- doors are actually asking. It is `hr.capability`'s own engine (same `role_assignment` join, same
-- tenant bound), so it can admit nobody `hr.capability` would refuse.
--
-- ═══ THE SENTENCES DO NOT CHANGE, AND THEY STAY TRUE ═══════════════════════════════════════════
-- All three refusals already say "no standing in this employer". After this file a refusal means
-- neither a membership NOR a single HR capability here — which is, in plain words, no standing.
-- `features/hr/service.ts` keys the no-standing lane off SQLSTATE 42501, not off the wording, so
-- the sentences are left byte-identical on purpose.
--
-- ═══ DOORS DELIBERATELY LEFT ROLE-ONLY, AND WHY ════════════════════════════════════════════════
--   public.hr_activate_employer   ORG BOOTSTRAP. It mints the FIRST `hr_owner` role assignment in
--                                 an employer, so no capability can exist yet to gate it;
--                                 organization ownership is the only authority in the room
--                                 (SPEC-ACCESS §1.1). Asking a capability first would be asking a
--                                 question whose answer is false by construction.
--   public.hr_module_set_enabled  ORG BOOTSTRAP. Switching HR on or off for an ORGANIZATION is an
--                                 act of organization governance, not of HR administration; it is
--                                 also how a freshly created employer gets its first HR anything.
--                                 DD-199 made this one strict on purpose.
--
-- ═══ THE GUARD ════════════════════════════════════════════════════════════════════════════════
-- `pnpm check:impl-doors` gains D12: a function that reads BOTH a capability and an organization
-- membership role, and REFUSES or RETURNS on the role before the capability is ever consulted, is
-- a finding. Proven failing-then-passing against a rolled-back restore of the pre-fix
-- `public.hr_structure_list` body, with the shipped query bytes read out of the check script.

CREATE OR REPLACE FUNCTION public.hr_structure_list(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_admin boolean;
begin
  if v_uid is null then
    raise exception 'hr_structure_list: no authenticated caller' using errcode = '42501';
  end if;
  -- 🚨 DD-206. A CAPABILITY IS AN AUTHORITY IN ITS OWN RIGHT, AND IT IS ASKED FIRST.
  -- Until now this door refused on `role is null` BEFORE it ever looked at a capability, so an
  -- HR admin whose standing is an EMPLOYMENT and not an `iam.memberships` row — the only kind
  -- `hr.capability` knows how to make — was told "no standing in this employer" by the very
  -- employer whose identity records they administer. Measured live 2026-09-14 on a constructed
  -- capability holder (rolled back): admitted by hr_knob_index, refused here. Two statements, so
  -- the order is a language guarantee and not a cost estimate (DD-199 residue, V-61 §8).
  -- The sentence stays true for BOTH authorities: after this, a refusal means neither a
  -- membership nor a single HR capability in this employer — no standing, in plain words.
  if cardinality(hr._l1_capabilities(v_uid, p_organization_id, current_date)) > 0 then
    null;
  elsif hr._l1_org_role(v_uid, p_organization_id, false) is null then
    raise exception 'hr_structure_list: no standing in this employer' using errcode = '42501';
  end if;
  v_admin := hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id)
             or coalesce(hr._l1_org_role(v_uid, p_organization_id, false) in ('owner','admin'), false);

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
        'pay_range_min', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date,p_organization_id)
                              then t.pay_range_min end,
        'pay_range_max', case when v_admin or hr.capability(v_uid,'comp.read',null,current_date,p_organization_id)
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
$function$
;


CREATE OR REPLACE FUNCTION public.hr_org_chart(p_organization_id uuid, p_on date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_on date := coalesce(p_on, current_date);
  v_persona text; v_history boolean; v_nodes jsonb; v_unplaced jsonb; v_dotted jsonb;
  v_earliest date; v_cycles jsonb;
  v_disc jsonb; v_stmt text; v_shows jsonb;
begin
  if v_uid is null then
    raise exception 'hr_org_chart: no authenticated caller' using errcode = '42501';
  end if;
  -- 🚨 DD-206. THE CAPABILITY IS ASKED FIRST. This door had no capability arm at all: standing
  -- here was an `iam.memberships` row and nothing else, so an HR admin holding the org chart's
  -- own capabilities through an employment was refused by name. Measured live 2026-09-14 on a
  -- constructed capability holder (rolled back): 42501 "no standing in this employer".
  -- Two statements — an `elsif` is reached only when the branch above it was false.
  if cardinality(hr._l1_capabilities(v_uid, p_organization_id, current_date)) > 0 then
    null;
  elsif hr._l1_org_role(v_uid, p_organization_id, false) is null then
    raise exception 'hr_org_chart: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, current_date);
  v_history := coalesce((hr._knob('hr.employees','org_chart_history_enabled') #>> '{}')::boolean, true);

  -- hr_l3_63 decision 3: §4.2''s deliberate-disclosure exception is CONFIGURATION. The worded
  -- statement and the fields a suppressed node may still show both come from the org''s own
  -- knob; empty by default, because a statement nobody wrote is not a statement.
  v_disc  := hr._hr_knob('hr.employees', 'disclosure_existence_statements',
                         p_organization_id, '{}'::jsonb) -> 'org_chart_opted_out';
  v_stmt  := v_disc ->> 'statement';
  v_shows := coalesce(v_disc -> 'shows', '[]'::jsonb);

  -- history is HR/manager only by default (§5.2 edges); an employee asking for a past date gets
  -- today, and the envelope says so rather than pretending.
  if v_on <> current_date and (not v_history or v_persona = 'employee') then
    v_on := current_date;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'employment_id', c.employment_id, 'employee_id', c.employee_id,
           -- hr_l3_63: the NAME is suppressed, never the node. Same helper as the directory
           -- and the audit reads (decision 1); HR and the subject still see it.
           'display_name', sup.nm,
           -- decision 2: the person''s preference, not this viewer''s outcome
           'opted_out', coalesce(e.directory_opt_out, false),
           'disclosure_statement', case when coalesce(e.directory_opt_out, false) then v_stmt end,
           'job_title_id', c.job_title_id,
           -- decision 3: on a suppressed node these render only if the org wrote them in
           'job_title', case when sup.nm is not null
                              or v_shows ? 'job_title' then jt.title end,
           'department_id', c.department_id,
           'department', case when sup.nm is not null
                               or v_shows ? 'department' then d.name end,
           'location_id', c.location_id,
           'location', case when sup.nm is not null
                             or v_shows ? 'location' then l.name end,
           'manager_employment_id', c.manager_employment_id, 'fte', c.fte,
           'worker_class', pa.worker_class,
           'photo_file_id', case when sup.nm is not null
                                  then e.photo_file_id end) order by c.display_name), '[]'::jsonb)
    into v_nodes
    from hr.org_chart_as_of(p_organization_id, v_on) c
    left join hr.job_title  jt on jt.id = c.job_title_id
    left join hr.department d  on d.id = c.department_id
    left join hr.location   l  on l.id = c.location_id
    left join hr.employee   e  on e.id = c.employee_id
    left join lateral (select hr._subject_display_name(c.employment_id, v_uid) nm) sup on true
    left join hr.position_assignment pa on pa.employment_id = c.employment_id
         and pa.is_primary and pa.deleted_at is null
         and pa.effective_from <= v_on and (pa.effective_to is null or pa.effective_to >= v_on);

  -- everyone employed on the date who is not a node, or who is a node with no manager
  select coalesce(jsonb_agg(jsonb_build_object(
           -- decision 4: unplaced people are people. The same rule, one array over.
           'employment_id', em.id, 'employee_id', e.id,
           'display_name', hr._subject_display_name(em.id, v_uid),
           'opted_out', coalesce(e.directory_opt_out, false),
           'disclosure_statement', case when coalesce(e.directory_opt_out, false) then v_stmt end,
           'reason', case when pa.id is null then 'no_primary_assignment' else 'no_manager' end)
         order by e.display_name), '[]'::jsonb)
    into v_unplaced
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
    left join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
         and pa.deleted_at is null and pa.effective_from <= v_on
         and (pa.effective_to is null or pa.effective_to >= v_on)
   where em.organization_id = p_organization_id and em.deleted_at is null
     and em.hire_date <= v_on
     and (em.termination_date is null or em.termination_date >= v_on)
     and (pa.id is null or pa.manager_employment_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'employment_id', rl.employment_id, 'manager_employment_id', rl.manager_employment_id,
           'line_kind', rl.line_kind, 'scope_note', rl.scope_note) order by rl.line_kind), '[]'::jsonb)
    into v_dotted
    from hr.reporting_line rl
   where rl.organization_id = p_organization_id and rl.deleted_at is null
     and rl.effective_from <= v_on and (rl.effective_to is null or rl.effective_to >= v_on);

  select min(em.hire_date) into v_earliest from hr.employment em
   where em.organization_id = p_organization_id and em.deleted_at is null;

  -- A→B→A is reachable through concurrent secondary assignments. Name it; never loop.
  with recursive edges as (
    select (n ->> 'employment_id')::uuid as child, (n ->> 'manager_employment_id')::uuid as parent
      from jsonb_array_elements(v_nodes) n
     where n ->> 'manager_employment_id' is not null),
  walk as (
    select child as root, parent as at, 1 as depth from edges
    union all
    select w.root, e.parent, w.depth + 1 from walk w join edges e on e.child = w.at
     where w.depth < 25)
  select coalesce(jsonb_agg(distinct to_jsonb(root)), '[]'::jsonb) into v_cycles
    from walk where at = root;

  return jsonb_build_object(
    'as_of', v_on, 'requested_on', coalesce(p_on, current_date),
    'history_available', v_history and v_persona <> 'employee',
    'earliest_known_on', v_earliest,
    'nodes', v_nodes, 'unplaced', v_unplaced, 'dotted_lines', v_dotted,
    'cycles', v_cycles, 'persona', v_persona);
end
$function$
;


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
  v_org_role text; v_tier text; v_worker_class text;
  v_allowed text[]; v_default text[]; v_requested text[]; v_refused text[];
  v_strip text[];
begin
  if v_uid is null then
    raise exception 'hr_directory_list: no authenticated caller' using errcode = '42501';
  end if;
  -- 🚨 DD-206. THE CAPABILITY IS ASKED FIRST — it is an authority in its own right.
  -- The old gate asked for an `iam.memberships` row, or for an employment JOINED TO ONE, so both
  -- arms ended at a membership and an HR admin whose standing is an employment was refused by
  -- name. The capability set this door already resolves two lines later is exactly the right
  -- question, so it is resolved HERE and the refusal is an `elsif` beneath it. Measured live
  -- 2026-09-14 on a constructed capability holder (rolled back): 42501 before, admitted after.
  -- The sentence is unchanged and stays true for both authorities: no membership AND no HR
  -- capability in this employer is, in plain words, no standing in it.
  v_caps := hr._l1_capabilities(v_uid, p_organization_id, v_today);
  if cardinality(v_caps) > 0 then
    null;
  elsif hr._l1_org_role(v_uid, p_organization_id, false) is null
     and not exists (select 1 from hr.employee e
                      join iam.organization_member om
                        on om.organization_id = e.organization_id and om.user_id = e.login_user_id
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then
    raise exception 'hr_directory_list: no standing in this employer' using errcode = '42501';
  end if;
  v_org_role := hr._l1_org_role(v_uid, p_organization_id, false);

  v_persona := hr._l1_persona(v_uid, p_organization_id, v_today);
  v_mine    := hr.employments_of(v_uid, v_today);

  -- ── THE VIEWER'S TIER (SPEC-ACCESS §3.2's hr_employment row = working_record.read) ──
  -- The same shape hr_employee_profile uses to decide its tab list: reach comes from a
  -- CAPABILITY, never from the persona string. Resolved ONCE and applied to every row of the
  -- answer, so no column is ragged — a ragged column would itself disclose which of these
  -- people the viewer has a lane onto.
  v_tier := case
    when v_persona = 'hr_admin'
      or 'working_record.read' = any(v_caps)
      or coalesce(v_org_role, '') in ('owner', 'admin')            then 'full'
    when v_persona = 'manager'
      and nullif(p_filter ->> 'my_team', '') is not null           then 'team'
    else                                                                'directory'
  end;

  v_shows_hire := (hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean;
  v_shows_mgr  := (hr._knob('hr.employees','directory_shows_manager') #>> '{}')::boolean;
  v_contractors := coalesce((hr._knob('hr.employees','contractor_directory_visible') #>> '{}')::boolean, true);

  v_search   := nullif(trim(coalesce(p_filter ->> 'search','')), '');
  v_manager  := nullif(p_filter ->> 'manager_employee_id','')::uuid;
  v_worker_class := nullif(p_filter ->> 'worker_class','');

  -- ── WHICH STATUSES ARE THIS VIEWER'S (route 10 Role variations) ───────────────────
  -- HR admin: "full, plus status filters that include terminated and prehire". Everyone
  -- else: the two statuses that describe somebody who is here now.
  v_allowed := case when v_tier = 'full'
                    then array['active','on_leave','prehire','terminated']
                    else array['active','on_leave'] end;
  v_default := case when v_tier = 'full'
                    then array['active','on_leave','prehire']
                    else array['active','on_leave'] end;

  select coalesce(array_agg(value #>> '{}'), '{}'::text[]) into v_requested
    from jsonb_array_elements(coalesce(p_filter -> 'status', '[]'::jsonb));

  if cardinality(v_requested) = 0 then
    -- No status key at all: route 10's default view. Terminated people are excluded here
    -- and reachable through the filter — which is a DIFFERENT request from "all".
    v_statuses := v_default;
  elsif 'all' = any(v_requested) then
    -- "All" means every status this viewer may see. Never "the default set".
    v_statuses := v_allowed;
  else
    select coalesce(array_agg(s), '{}'::text[]) into v_refused
      from unnest(v_requested) s where s <> all(v_allowed);
    if cardinality(v_refused) > 0 then
      raise exception 'hr_directory_list: the % status filter is not yours in this directory',
        array_to_string(v_refused, ', ') using errcode = '42501';
    end if;
    v_statuses := v_requested;
  end if;

  -- Worker class is a hr.position_assignment fact. Offering the filter without the column
  -- would let a directory-tier viewer probe one person at a time for the answer the
  -- projection below withholds.
  if v_worker_class is not null and v_tier = 'directory' then
    raise exception 'hr_directory_list: the worker-class filter is not yours in this directory'
      using errcode = '42501';
  end if;

  -- Sorting by a column this viewer does not receive is that column, said as an ordering.
  v_sort := case when p_sort in ('display_name','directory_status','employee_number')
                 then p_sort
                 when p_sort = 'hire_date' and v_tier <> 'directory'
                 then 'hire_date'
                 else 'display_name' end;
  v_dir  := case when lower(coalesce(p_direction,'asc')) = 'desc' then 'desc' else 'asc' end;

  -- ── THE PROJECTION, PER TIER. ABSENT, NEVER MASKED (SPEC-ACCESS §3.1) ─────────────
  -- Every key here is a hr.employment / hr.position_assignment fact, and `Org member` is
  -- `—` for that table in §3.2's matrix. `'{}'` for the other two tiers makes the strip the
  -- identity operation, which is what keeps an HR admin's row byte-identical.
  v_strip := case when v_tier = 'directory'
                  then array['employment_id','worker_class','flsa_status','schedule_class',
                             'fte','hire_date','row_basis']
                  else '{}'::text[] end;

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
      -- 🚨 A CLOSED ASSIGNMENT IS STILL THE JOB THEY HELD (hr_l1_69). Once a terminated
      -- spell end-dates its positions, current_position_assignment_id is correctly NULL and
      -- this fallback -- which demanded a still-OPEN window -- found nothing, so every
      -- terminated row in the HR status filter came back with a null title, department and
      -- location. STRICTLY ADDITIVE: the two original winners keep their exact precedence
      -- and their original order (open rows, earliest first); the last key answers only
      -- where there was NO answer at all -- the last primary assignment this person held.
      left join lateral (
        select pa2.* from hr.position_assignment pa2
         where pa2.deleted_at is null
           and (pa2.id = e.current_position_assignment_id
                or (e.current_position_assignment_id is null and pa2.employment_id = em.id
                    and pa2.is_primary))
         order by (pa2.id = e.current_position_assignment_id) desc,
                  (pa2.effective_to is null or pa2.effective_to >= v_today) desc,
                  case when (pa2.effective_to is null or pa2.effective_to >= v_today)
                       then pa2.effective_from end asc,
                  pa2.effective_from desc
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
       and (v_worker_class is null or pa.worker_class = v_worker_class)
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
         coalesce((select jsonb_agg((to_jsonb(r) - 'rn') - v_strip order by r.rn) from ranked r
                    where r.rn >  greatest(coalesce(p_offset,0),0)
                      and r.rn <= greatest(coalesce(p_offset,0),0)
                                  + greatest(coalesce(p_limit,50),1)), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total,
    'limit', greatest(coalesce(p_limit,50),1), 'offset', greatest(coalesce(p_offset,0),0),
    'persona', v_persona, 'capabilities', to_jsonb(v_caps),
    -- `columns` is the door's own statement of which optional columns exist for THIS viewer.
    -- The client renders from it, so a field the payload no longer carries cannot render as a
    -- blank cell. `hire_date` and `manager` keep their exact prior meaning for `full`.
    'columns', jsonb_build_object(
      'hire_date',         v_shows_hire and v_tier <> 'directory',
      'manager',           v_shows_mgr,
      'worker_class',      v_tier <> 'directory',
      'employment_detail', v_tier <> 'directory'),
    -- Which statuses this viewer may ask for, and what they get when they ask for nothing.
    -- The client offers exactly `allowed` and shows `default` as an explicit selection, so
    -- "All" is never the unlabelled state that quietly means something narrower.
    'statuses', jsonb_build_object(
      'allowed', to_jsonb(v_allowed),
      'default', to_jsonb(v_default)),
    'tier', v_tier,
    'as_of', v_today);
end
$function$
;


CREATE OR REPLACE FUNCTION hr._l1_settings_gate(p_org uuid, p_token text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr settings: no authenticated caller' using errcode = '42501';
  end if;
  -- 🚨 DD-206 / V-61 §8. ONE `or` EXPRESSION IS NOT AN ORDER. Postgres may evaluate either
  -- operand of `or` first and is free to reorder by cost, so "capability first" was a fact about
  -- today's plan, not a rule. Two statements make it a language guarantee, and they put the
  -- capability where the doctrine puts it: first.
  if hr.capability(v_uid, 'identity.write', null, current_date, p_org) then
    return null;
  elsif coalesce(hr._l1_org_role(v_uid, p_org, false) in ('owner','admin'), false) then
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
$function$
;


CREATE OR REPLACE FUNCTION public.hr_my_context(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_today date := current_date; v_orgs jsonb; v_active jsonb; v_org uuid;
        v_standing uuid[];
begin
  if v_uid is null then
    raise exception 'hr_my_context: no authenticated caller' using errcode = '42501';
  end if;

  -- 🚨 DD-206. THE EMPLOYERS THIS PERSON HAS STANDING IN, ASKED BEFORE MEMBERSHIP.
  -- This list was scoped to `iam.memberships` alone, so an HR admin whose standing is an
  -- employment saw NO employer here at all — every other HR door could admit them and they
  -- still had no way to reach it, which is a dead end, not a refusal. An employment is the
  -- substrate `hr.capability` itself rests on (`hr.employments_of` → `hr.role_assignment`),
  -- so resolving it here asks the capability question at its root, once, for the whole list.
  select coalesce(array_agg(distinct em.organization_id), '{}'::uuid[])
    into v_standing
    from hr.employment em
   where em.id = any(hr.employments_of(v_uid, v_today));

  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_orgs from (
    select jsonb_build_object(
             'organization_id', o.id, 'name', o.name, 'slug', o.slug,
             'module_enabled', hr._l1_module_enabled(o.id),
             'is_activated', exists (select 1 from hr.employer_profile ep
                                      where ep.organization_id = o.id and ep.deleted_at is null),
             'org_role', hr._l1_org_role(v_uid, o.id, false),
             'persona', hr._l1_persona(v_uid, o.id, v_today)) as x
      from iam.organizations o
     where (o.id = any(v_standing)                               -- DD-206: capability's own root
            or exists (select 1 from iam.memberships m
                        where m.user_id = v_uid and m.organization_id = o.id
                          and m.container_type = 'organization' and m.deleted_at is null
                          and coalesce(m.status,'active') = 'active'))
       -- An owner/admin sees an org whose module is OFF, because they are the one person who
       -- can turn it on — R-L1 §D: "/hr?org=<thatOrg> renders a single enable-door for
       -- owner/admin and a plain not-enabled page for everyone else." Filtering them out here
       -- is how a freshly created org becomes unreachable and unactivatable.
       and (hr._l1_module_enabled(o.id)
            or coalesce(hr._l1_org_role(v_uid, o.id, false) in ('owner','admin'), false)
            or exists (select 1 from hr.employee e
                        where e.organization_id = o.id and e.login_user_id = v_uid
                          and e.deleted_at is null))
  ) s;

  v_org := p_organization_id;
  if v_org is null and jsonb_array_length(v_orgs) = 1 then
    v_org := (v_orgs -> 0 ->> 'organization_id')::uuid;
  end if;
  -- 🚨 DEFAULT TO THE EMPLOYER WHERE HR IS ACTUALLY ON. A person with one real HR
  -- workplace plus their own (module-off) workspace has two employers but one HR
  -- context; leaving active null hands every surface an empty capability set and hides
  -- every control from a full admin. Exactly one module-enabled employer is unambiguous;
  -- zero or many stays null and the picker decides.
  if v_org is null then
    with enabled as (
      select (e ->> 'organization_id')::uuid as oid
        from jsonb_array_elements(v_orgs) e
       where coalesce((e -> 'module_enabled')::boolean, false))
    select oid into v_org from enabled
     where (select count(*) from enabled) = 1;
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
      'org_role', hr._l1_org_role(v_uid, v_org, false),
      'persona', hr._l1_persona(v_uid, v_org, v_today),
      'capabilities', to_jsonb(hr._l1_capabilities(v_uid, v_org, v_today)),
      'employee_id', (select e.id from hr.employee e
                       where e.organization_id = v_org and e.login_user_id = v_uid
                         and e.deleted_at is null limit 1),
      'employment_id', hr._l1_self_employment(v_uid, v_org, v_today),
      -- 🚨 NAV CANNOT BE HONEST ABOUT A WORKER CLASS IT CANNOT SEE.
      -- The shell builds the self-service nav from this payload, and it had no worker
      -- class in it — so a contractor was offered a Time entry whose destination the
      -- server then correctly refuses, and the profile drops the matching tab. The nav
      -- and the tab bar disagreed about the same person because only one of them had
      -- been told what she is. This is the caller's own class, on their own employment,
      -- in the org they are looking at: it is not somebody else's sensitive field, and
      -- withholding it does not protect anyone — it just makes the menu lie.
      'worker_class', (select pa.worker_class
                         from hr.position_assignment pa
                         join hr.employment em on em.id = pa.employment_id
                        where em.id = hr._l1_self_employment(v_uid, v_org, v_today)
                          and pa.is_primary and pa.deleted_at is null
                          and pa.effective_from <= v_today
                          and (pa.effective_to is null or pa.effective_to >= v_today)
                        order by pa.effective_from desc limit 1),
      -- 🚨 NAV VISIBILITY FOR LEAVE IS AN ENROLMENT FACT, NOT A CLASS FACT (hr_l5_30).
      -- A static per-class list cannot express a per-person exception, and §2.8's override
      -- door creates exactly that person: a contractor with a legitimate, reasoned leave
      -- enrolment. She could hold a balance, file a request and have it approved, and still
      -- not find the page. Same justification as 'worker_class' directly above: the
      -- caller's own fact, about themselves, in the org they are looking at.
      'has_active_leave_enrolment', exists (
        select 1 from hr.leave_enrollment le
          join hr.leave_policy lp on lp.id = le.leave_policy_id
                                 and lp.deleted_at is null and lp.is_active
         where le.employment_id = hr._l1_self_employment(v_uid, v_org, v_today)
           and le.deleted_at is null
           and le.effective_from <= v_today
           and (le.effective_to is null or le.effective_to >= v_today)),
      'employee_count', (select count(*) from hr.employee e
                          where e.organization_id = v_org and e.deleted_at is null),
      'can_activate', coalesce(hr._l1_org_role(v_uid, v_org, false) in ('owner','admin'), false)
                      and not exists (select 1 from hr.role_assignment ra
                                       where ra.organization_id = v_org and ra.role_key = 'hr_owner'),
      -- RECORDED DECISION 28: every settings surface needs this and nothing returned it.
      'employer_profile_id', (select ep.id from hr.employer_profile ep
                               where ep.organization_id = v_org and ep.deleted_at is null limit 1));
  end if;

  return jsonb_build_object('employers', v_orgs, 'active', v_active, 'as_of', v_today);
end
$function$
;
