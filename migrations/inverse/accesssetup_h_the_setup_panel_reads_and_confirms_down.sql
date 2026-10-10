-- chair-step: inverse of accesssetup_h — drops the setup panel's doors (iam.record_access_setup, iam.record_seat_clear, iam.record_setup_confirm, hr.hr_review_cycle_access_setup, hr.hr_owner_takes_hr_role) and helpers (iam._access_setup_person, iam._access_setup_needs_confirm) with their platform.client_callable_door rows, removes the knob access/setup_panel_every_time (and any override rows of it), and restores hr.hr_review_cycle_launch without access_setup in its answer.
-- lane: access-setup
-- lock: iam,hr
-- based-on: hr.hr_review_cycle_launch(uuid, jsonb) 2635147acbc589c3d2ba3258f1ab50ac8cbef8d052470d3d7899c789d068cc26

CREATE OR REPLACE FUNCTION hr.hr_review_cycle_launch(p_cycle_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; t hr.review_template%rowtype;
  v_targets uuid[]; v_emp uuid; em record; v_rid uuid; v_wf jsonb; v_inst uuid;
  v_created jsonb := '[]'::jsonb; v_cad jsonb; v_refused jsonb := '[]'::jsonb; v_mgr_login uuid; v_mgr_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if c.status not in ('draft', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status);
  end if;

  if nullif(p_payload ->> 'manager_employment_id', '') is not null then
    select coalesce(array_agg(em2.id), '{}') into v_targets from hr.employment em2
     where em2.current_manager_employment_id = (p_payload ->> 'manager_employment_id')::uuid
       and em2.organization_id = c.organization_id and em2.deleted_at is null;
  elsif nullif(p_payload ->> 'department_id', '') is not null then
    select coalesce(array_agg(em2.id), '{}') into v_targets from hr.employment em2
     where em2.organization_id = c.organization_id and em2.deleted_at is null and em2.status = 'active'
       and (hr.primary_position_as_of(em2.id, current_date)).department_id
           = (p_payload ->> 'department_id')::uuid;
  elsif jsonb_typeof(p_payload -> 'employment_ids') = 'array' then
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_targets
      from jsonb_array_elements(p_payload -> 'employment_ids') x;
  else
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'population',
      'detail', 'Name a manager_employment_id, a department_id or employment_ids.');
  end if;
  if cardinality(v_targets) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nobody_to_review');
  end if;

  -- the first launch freezes the template as it reads now
  if c.status = 'draft' then
    select * into t from hr.review_template where id = c.template_id and deleted_at is null;
    if t.id is not null then
      update hr.review_cycle
         set template_snapshot = jsonb_build_object('__kind', 'performance_review_template_snapshot',
               'template_id', t.id, 'name', t.name, 'sections', t.sections,
               'rating_scale', t.rating_scale, 'frozen_at', now())
       where id = c.id;
    end if;
  end if;

  -- the organization's reminder cadence (knob) is carried by the definition the engine reads at tick
  v_cad := hr._rev_ensure_cadence(c.organization_id);

  foreach v_emp in array v_targets loop
    select em2.id, em2.organization_id, em2.status, em2.employee_id, em2.current_manager_employment_id,
           e.login_user_id
      into em
      from hr.employment em2 join hr.employee e on e.id = em2.employee_id
     where em2.id = v_emp and em2.deleted_at is null;
    if em.id is null or em.organization_id <> c.organization_id then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp, 'reason', 'not_in_organization');
      continue;
    end if;
    if em.status <> 'active' then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp),
        'reason', case when em.status in ('terminated','separated') then 'terminated' else 'not_active' end,
        'employment_status', em.status);
      continue;
    end if;
    if em.current_manager_employment_id is null then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'no_manager');
      continue;
    end if;
    select em3.status, e3.login_user_id into v_mgr_status, v_mgr_login
      from hr.employment em3 join hr.employee e3 on e3.id = em3.employee_id
     where em3.id = em.current_manager_employment_id and em3.deleted_at is null;
    if v_mgr_status is distinct from 'active' then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'manager_not_active');
      continue;
    end if;
    if exists (select 1 from hr.review where cycle_id = c.id and employment_id = v_emp and deleted_at is null) then
      v_refused := v_refused || jsonb_build_object('employment_id', v_emp,
        'employee_name', hr._rev_person_name(v_emp), 'reason', 'already_in_cycle');
      continue;
    end if;

    insert into hr.review (cycle_id, employment_id, employee_id, employee_user_id, manager_employment_id,
                           manager_user_id, status, organization_id)
    values (c.id, v_emp, em.employee_id, em.login_user_id, em.current_manager_employment_id,
            v_mgr_login, 'not_started', c.organization_id)
    returning id into v_rid;

    v_wf := hr.wf_request('performance_review', 'hr_review', v_rid, c.organization_id,
                          jsonb_build_object('cycle_id', c.id, 'reopened', false),
                          v_emp, false, 'performance_review:' || v_rid::text);
    v_inst := nullif(v_wf ->> 'instance_id', '')::uuid;
    if v_inst is not null then
      update hr.review set workflow_instance_id = v_inst where id = v_rid;
      perform hr._rev_set_due(v_inst, 'self', c.self_due_on);
      perform hr._rev_set_due(v_inst, 'manager', c.manager_due_on);
    end if;
    v_created := v_created || jsonb_build_object('review_id', v_rid, 'employment_id', v_emp,
      'employee_name', hr._rev_person_name(v_emp),
      'manager_name', hr._rev_person_name(em.current_manager_employment_id),
      'employee_has_login', em.login_user_id is not null,
      'workflow_instance_id', v_inst,
      'workflow', jsonb_build_object('launched', v_inst is not null,
                                     'reason', case when v_inst is null then coalesce(v_wf ->> 'reason', 'wf_request_failed') end));
  end loop;

  update hr.review_cycle
     set status = 'open', launched_at = coalesce(launched_at, now()), launched_by = coalesce(launched_by, v_uid)
   where id = c.id and jsonb_array_length(v_created) > 0;

  return jsonb_build_object('ok', true, 'cycle_id', c.id,
    'cycle_status', (select status from hr.review_cycle where id = c.id),
    'reminder_cadence_hours', (v_cad ->> 'reminder_cadence_hours')::integer,
    'created', v_created, 'refused', v_refused);
end
$function$;

drop function if exists iam.record_access_setup(text, uuid);
drop function if exists iam.record_seat_clear(text, uuid, text, uuid);
drop function if exists iam.record_setup_confirm(text, uuid[]);
drop function if exists hr.hr_review_cycle_access_setup(uuid);
drop function if exists hr.hr_owner_takes_hr_role(uuid);
drop function if exists iam._access_setup_needs_confirm(text, uuid, uuid, uuid[]);
drop function if exists iam._access_setup_person(uuid);
delete from platform.client_callable_door
 where (schema_name, function_name) in (('iam','record_access_setup'),('iam','record_seat_clear'),('iam','record_setup_confirm'),
        ('hr','hr_review_cycle_access_setup'),('hr','hr_owner_takes_hr_role'),('iam','_access_setup_needs_confirm'),('iam','_access_setup_person'));
delete from platform.knob_override where feature = 'access' and key = 'setup_panel_every_time';
delete from platform.feature_knob where feature = 'access' and key = 'setup_panel_every_time';
