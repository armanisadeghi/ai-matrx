-- chair-step: inverse of accesssetup_k3: restores the previous body of hr.hr_owner_takes_hr_role.
-- lane: access-setup
-- lock: hr
-- based-on: hr.hr_owner_takes_hr_role(uuid) 1d26fd52348f4b41451e68b4b08002734d403d47bed3ef3db6167885671a9a16

CREATE OR REPLACE FUNCTION hr.hr_owner_takes_hr_role(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_emp uuid; v_r jsonb; v_loc uuid; v_dept uuid; v_name text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if p_organization_id is null or not exists (
       select 1 from iam.memberships m where m.organization_id = p_organization_id and m.user_id = v_uid
          and m.container_type = 'organization' and m.role = 'owner' and m.status = 'active' and m.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  if v_uid = any(coalesce(hr._review_org_capable(p_organization_id, 'performance.manage'), '{}')) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if not exists (select 1 from hr.role_assignment ra where ra.organization_id = p_organization_id and ra.role_key = 'hr_owner') then
    v_r := public.hr_activate_employer(jsonb_build_object('organization_id', p_organization_id));
    if coalesce((v_r ->> 'ok')::boolean, true) = false then return v_r; end if;
    return jsonb_build_object('ok', true, 'via', 'activate_employer');
  end if;
  v_emp := hr._l1_self_employment(v_uid, p_organization_id, current_date);
  if v_emp is null then
    select l.id into v_loc from hr.location l where l.organization_id = p_organization_id and l.deleted_at is null order by l.created_at limit 1;
    select d.id into v_dept from hr.department d where d.organization_id = p_organization_id and d.deleted_at is null order by d.created_at limit 1;
    v_name := iam._access_setup_person(v_uid) ->> 'name';
    v_r := public.hr_employee_create(jsonb_build_object(
      'organization_id', p_organization_id, 'hire_date', current_date, 'location_id', v_loc, 'department_id', v_dept,
      'link_user_id', v_uid, 'display_name', v_name,
      'legal_first_name', coalesce(nullif(split_part(v_name, ' ', 1), ''), v_name),
      'legal_last_name', coalesce(nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''), v_name)));
    if coalesce((v_r ->> 'ok')::boolean, true) = false then return v_r; end if;
    v_emp := hr._l1_self_employment(v_uid, p_organization_id, current_date);
    if v_emp is null then return jsonb_build_object('ok', false, 'reason', 'employment_not_created'); end if;
  end if;
  v_r := public.hr_role_assign(v_emp, 'hr_admin', 'org', null, '{}'::uuid[], current_date, null,
                               'People involved: the organization owner takes HR for every review');
  if coalesce((v_r ->> 'granted')::boolean, false) is not true then
    return coalesce(v_r, '{}'::jsonb) || jsonb_build_object('ok', false, 'reason', coalesce(v_r ->> 'reason', 'role_not_assigned'));
  end if;
  return jsonb_build_object('ok', true, 'via', 'role_assign', 'assignment_id', v_r -> 'assignment_id');
end
$function$;
