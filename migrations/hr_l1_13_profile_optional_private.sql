-- HR domain L1 — profile rows without confidential details are valid.
--
-- `hr_employee_profile` previously called the audited `hr_employee_private` door with a NULL id
-- when no private row had ever been collected. The audited-door contract correctly raises P0002
-- for a missing subject, but the profile contract explicitly distinguishes `not_collected` from
-- `not_reachable`. Resolve the optional id first and call the audited door only when it exists.

set local statement_timeout = '600s';
set local lock_timeout = '20s';

create or replace function public.hr_employee_profile(
  p_employee_id uuid, p_as_of date default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, hr
as $fn$
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

  v_tabs := array_append(v_tabs, 'personal');
  v_tabs := array_append(v_tabs, 'job');

  if v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on) then
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
  if hr.capability(v_uid, 'incident.read', v_emp, v_on)
     or hr.capability(v_uid, 'corrective_action.issue', v_emp, v_on) then
    v_tabs := array_append(v_tabs, 'relations');
  end if;

  select count(*) into v_pending from (
    select 1 from hr.position_assignment pa where pa.employment_id = v_em.id
       and pa.deleted_at is null and pa.effective_from > v_on
    union all
    select 1 from hr.compensation c where c.employment_id = v_em.id
       and c.deleted_at is null and c.effective_from > v_on
       and (v_kind = 'self' or hr.capability(v_uid, 'comp.read', v_emp, v_on))
    union all
    select 1 from hr.reporting_line rl where rl.employment_id = v_em.id
       and rl.deleted_at is null and rl.effective_from > v_on) p;

  v_header := jsonb_build_object(
    'employee_id', v_e.id, 'employment_id', v_em.id,
    'display_name', v_e.display_name,
    'legal_name', case when v_kind in ('self','hr_admin')
                       then trim(concat_ws(' ', v_e.legal_first_name, v_e.legal_middle_name,
                                                v_e.legal_last_name, v_e.legal_name_suffix)) end,
    'pronouns', v_e.pronouns,
    'photo_file_id', v_e.photo_file_id,
    'employee_number', v_e.employee_number,
    'party_id', v_e.party_id,
    'login_user_id', case when v_kind in ('self','hr_admin') then v_e.login_user_id end,
    'status', v_em.status,
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
    'pending_change_count', v_pending);

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
      case when v_kind = 'self' or hr.capability(v_uid,'comp.read', v_emp, v_on)
           then 'full' else 'none' end),
    'worker_class_machinery', jsonb_build_object(
      'i9',        coalesce(v_worker_class,'employee') <> 'contractor',
      'w4',        coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'pto',       coalesce(v_worker_class,'employee') not in ('contractor','volunteer'),
      'overtime',  coalesce(v_worker_class,'employee') not in ('contractor','volunteer')
                   and coalesce(v_pa.flsa_status,'nonexempt') = 'nonexempt',
      'payroll',   coalesce(v_worker_class,'employee') not in ('contractor','volunteer')));
end
$fn$;

comment on function public.hr_employee_profile(uuid, date) is
  'Audited employee profile envelope. An absent hr.employee_private row is valid and returns '
  'personal.private_state=not_collected; the audited confidential door is called only for a real row.';

do $$
declare v_volatility "char"; v_definition text;
begin
  select p.provolatile, pg_get_functiondef(p.oid)
    into v_volatility, v_definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_profile'
     and pg_get_function_identity_arguments(p.oid) = 'p_employee_id uuid, p_as_of date';

  if v_volatility <> 'v' then
    raise exception 'hr_l1_13: hr_employee_profile must stay VOLATILE because it writes an audit';
  end if;
  if v_definition not like '%if v_priv_id is null then%' then
    raise exception 'hr_l1_13: optional private-row branch is missing';
  end if;
end $$;
