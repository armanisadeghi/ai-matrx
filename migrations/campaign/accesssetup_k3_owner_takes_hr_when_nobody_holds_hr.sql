-- chair-step: hr.hr_owner_takes_hr_role also works for an organization owner with no employment in an organization where HR was activated but nobody holds HR now.
-- lane: access-setup
-- lock: hr
-- based-on: hr.hr_owner_takes_hr_role(uuid) 31dc3fe93198fb9b6c52e93748a69ce6c889100f942990da0dc252e61028299a
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §5b, §5c.
-- Inverse: migrations/inverse/accesssetup_k3_owner_takes_hr_when_nobody_holds_hr_down.sql

CREATE OR REPLACE FUNCTION hr.hr_owner_takes_hr_role(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_emp uuid; v_prof uuid; v_party uuid; v_eid uuid; v_r jsonb; v_loc uuid; v_dept uuid; v_name text;
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
    v_name := iam._access_setup_person(v_uid) ->> 'name';
    v_r := public.hr_activate_employer(jsonb_build_object('organization_id', p_organization_id, 'display_name', v_name,
      'legal_first_name', coalesce(nullif(split_part(v_name, ' ', 1), ''), v_name),
      'legal_last_name', coalesce(nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''), v_name)));
    if coalesce((v_r ->> 'ok')::boolean, true) = false then return v_r; end if;
    return jsonb_build_object('ok', true, 'via', 'activate_employer');
  end if;
  v_emp := hr._l1_self_employment(v_uid, p_organization_id, current_date);
  if v_emp is null and not hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
    -- HR was activated but nobody holds HR now: no door admits the owner to hire themselves (hr_employee_create needs
    -- identity.write), so the owner's own record is made the way hr_activate_employer makes the nominee's: the party in
    -- this organization, the employee, the spell. The caller was proved to be an active organization owner above.
    select ep.id into v_prof from hr.employer_profile ep where ep.organization_id = p_organization_id and ep.deleted_at is null limit 1;
    if v_prof is null then return jsonb_build_object('ok', false, 'reason', 'not_activated'); end if;
    select l.id into v_loc from hr.location l where l.organization_id = p_organization_id and l.deleted_at is null order by l.created_at limit 1;
    v_name := iam._access_setup_person(v_uid, p_organization_id) ->> 'name';
    select pt.id into v_party from crm.party pt
     where pt.organization_id = p_organization_id and pt.claimed_by = v_uid and pt.deleted_at is null and pt.canonical_id is null limit 1;
    if v_party is null then
      insert into crm.party (organization_id, party_kind, display_name, record_class, claimed_by, claimed_at, source, source_detail)
      values (p_organization_id, 'person', v_name, 'contact', v_uid, now(), 'user_registration', 'hr_owner_takes_hr_role')
      returning id into v_party;
    end if;
    perform hr.arm_write();
    select e.id into v_eid from hr.employee e where e.organization_id = p_organization_id and e.party_id = v_party;
    if v_eid is null then
      insert into hr.employee (organization_id, party_id, employee_number, legal_first_name, legal_last_name, display_name, login_user_id, primary_location_id)
      values (p_organization_id, v_party, hr._l1_next_employee_number(p_organization_id, 0),
              coalesce(nullif(split_part(v_name, ' ', 1), ''), v_name),
              coalesce(nullif(btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''), v_name),
              v_name, v_uid, v_loc)
      returning id into v_eid;
    end if;
    insert into hr.employment (organization_id, employee_id, employer_profile_id, hire_date, status, created_by)
    values (p_organization_id, v_eid, v_prof, current_date, 'active', v_uid)
    returning id into v_emp;
  end if;
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
