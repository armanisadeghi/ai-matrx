-- chair-step: lane HR-REVIEWS wave 2. Adds two nullable columns to hr.review (calibrated_by, calibrated_at); sets the platform performance_review definition's reminder cadence to the knob default (48 h) with an UPDATE; creates helpers (hr._rev_knob, hr._rev_template_problems, hr._rev_mean_rating, hr._rev_ensure_cadence) and five NEW doors (hr.hr_review_template_list/_save/_archive, hr.hr_review_calibration, hr.hr_review_calibrate) with their platform.client_callable_door rows and GRANT EXECUTE to `authenticated`; and replaces five hr_rev_02 bodies (declared below) so they read the standard_review_* knobs. No DROP, no REVOKE, no data row changed except the one definition's cadence.
-- lane: HR-REVIEWS
-- based-on: hr._rev_response_visible(text, uuid, uuid, uuid) 89fcc7537d5d95fad12aef06a071bb5af5a910a256e21facdb962e8374499a78
-- based-on: hr.hr_review_cycle_create(jsonb) 03dc7aaf57e48e1ee718507acd5c1e8b68173ee766596c24ca366c6def3394ab
-- based-on: hr.hr_review_cycle_launch(uuid, jsonb) 5f43a09f11376069c651cf804c84343cfbc92f5e75e8c9f818e5c7fee3e821f9
-- based-on: hr.hr_review_share(uuid) efba42b420428c448edc14c96602d1a921f0ebdf962b4f79504694e7789f8988
-- based-on: hr.hr_review_acknowledge(uuid, text) f23140d458f69a22edb15c869f8f9b2465a4b1e9934fa1453464f102e0ea7f99
--
-- hr_rev_05 — STANDARD REVIEWS WAVE 2: knobs read by the doors, templates, calibration.
--   knobs (hr_rev_04): self/manager days default a cycle's due dates; the reminder cadence is put on
--   an organization-owned copy of the published definition when it differs from the platform's
--   (the engine reads cadence from the definition at hr.wf_tick, never per instance);
--   manager_sees_self widens the blind rule only to 'after_employee_submits'; calibration_required
--   holds share until HR calibrates; ack_comment can switch the employee's comment off.
--   templates: list / save (typed __kind shape validated) / archive; cycles keep their snapshot.
--   calibration: per-cycle rows with means of the submitted ratings (never answer text) and the
--   distribution by rating and by manager; calibrate keeps the manager's rating beside HR's.

alter table hr.review add column calibrated_by uuid;
alter table hr.review add column calibrated_at timestamptz;

do $$
begin
  perform hr.arm_write();
  update hr.workflow_definition set reminder_cadence_hours = 48
   where flow_key = 'performance_review' and status = 'published'
     and organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
end $$;

create function hr._rev_knob(p_org uuid, p_key text, p_default jsonb)
 returns jsonb language sql stable set search_path to 'hr', 'public'
as $function$
  select coalesce(hr._hr_knob('hr.performance', p_key, p_org, p_default), p_default);
$function$;

create function hr._rev_mean_rating(p_answers jsonb)
 returns numeric language sql immutable set search_path to 'hr', 'public'
as $function$
  select round(avg((v #>> '{}')::numeric), 2)
    from jsonb_each(coalesce(p_answers -> 'ratings', '{}'::jsonb)) e(k, v)
   where jsonb_typeof(v) = 'number';
$function$;

-- What is wrong with a template's typed shape. Keys and words only — never free text.
create function hr._rev_template_problems(p_sections jsonb, p_scale jsonb)
 returns jsonb language plpgsql immutable set search_path to 'hr', 'public'
as $function$
declare sec jsonb; q jsonb; it jsonb; p jsonb; v_out jsonb := '[]'::jsonb; v_keys text[] := '{}';
        v_vals numeric[] := '{}';
begin
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    return jsonb_build_array(jsonb_build_object('at', 'sections', 'problem', 'empty'));
  end if;
  for sec in select e from jsonb_array_elements(p_sections) e loop
    if (sec ->> '__kind') is distinct from 'performance_review_template_section' then
      v_out := v_out || jsonb_build_object('at', coalesce(sec ->> 'key', 'section'), 'problem', 'section_kind'); continue;
    end if;
    if coalesce(btrim(sec ->> 'key'), '') = '' or coalesce(btrim(sec ->> 'title'), '') = '' then
      v_out := v_out || jsonb_build_object('at', 'section', 'problem', 'key_and_title_required'); continue;
    end if;
    if jsonb_typeof(sec -> 'questions') is distinct from 'array' or jsonb_array_length(sec -> 'questions') = 0 then
      v_out := v_out || jsonb_build_object('at', sec ->> 'key', 'problem', 'no_questions'); continue;
    end if;
    for q in select e from jsonb_array_elements(sec -> 'questions') e loop
      if (q ->> '__kind') is distinct from 'performance_review_question' then
        v_out := v_out || jsonb_build_object('at', coalesce(q ->> 'key', sec ->> 'key'), 'problem', 'question_kind'); continue;
      end if;
      if coalesce(btrim(q ->> 'key'), '') = '' or coalesce(btrim(q ->> 'label'), '') = '' then
        v_out := v_out || jsonb_build_object('at', sec ->> 'key', 'problem', 'question_key_and_label_required'); continue;
      end if;
      if (q ->> 'key') = any(v_keys) then
        v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'duplicate_question_key');
      end if;
      v_keys := v_keys || (q ->> 'key');
      if coalesce(q ->> 'type', '') not in ('rating', 'text', 'narrative_list', 'responsibilities') then
        v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'question_type',
                   'permitted', '["rating","text","narrative_list","responsibilities"]'::jsonb);
      elsif q ->> 'type' in ('narrative_list', 'responsibilities') then
        if q ? 'min_items' and (jsonb_typeof(q -> 'min_items') <> 'number' or (q ->> 'min_items')::numeric < 0) then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'min_items');
        elsif q ? 'max_items' and (jsonb_typeof(q -> 'max_items') <> 'number'
              or (q ->> 'max_items')::numeric < greatest(1, coalesce((q ->> 'min_items')::numeric, 0))) then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'max_items');
        end if;
      elsif q ->> 'type' = 'rating' then
        if jsonb_typeof(q -> 'items') is distinct from 'array' or jsonb_array_length(q -> 'items') = 0 then
          v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'no_rating_items');
        else
          for it in select e from jsonb_array_elements(q -> 'items') e loop
            if (it ->> '__kind') is distinct from 'performance_review_rating_item'
               or coalesce(btrim(it ->> 'key'), '') = '' or coalesce(btrim(it ->> 'label'), '') = '' then
              v_out := v_out || jsonb_build_object('at', q ->> 'key', 'problem', 'rating_item'); exit;
            end if;
          end loop;
        end if;
      end if;
    end loop;
  end loop;
  if p_scale is null or (p_scale ->> '__kind') is distinct from 'performance_review_rating_scale'
     or jsonb_typeof(p_scale -> 'points') is distinct from 'array' or jsonb_array_length(p_scale -> 'points') < 2 then
    v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'scale_needs_two_points');
  else
    for p in select e from jsonb_array_elements(p_scale -> 'points') e loop
      if (p ->> '__kind') is distinct from 'performance_review_rating_point' or jsonb_typeof(p -> 'value') <> 'number'
         or coalesce(btrim(p ->> 'key'), '') = '' or coalesce(btrim(p ->> 'label'), '') = '' then
        v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'point_needs_value_key_label'); exit;
      end if;
      if (p ->> 'value')::numeric = any(v_vals) then
        v_out := v_out || jsonb_build_object('at', 'rating_scale', 'problem', 'duplicate_point_value'); exit;
      end if;
      v_vals := v_vals || (p ->> 'value')::numeric;
    end loop;
  end if;
  return v_out;
end
$function$;

-- The engine reads reminder cadence from the definition at hr.wf_tick. An organization whose knob
-- differs from the platform definition gets its own published copy (nearest-wins in hr.wf_request);
-- one that already has a copy gets the cadence kept current. Returns the cadence in force.
create function hr._rev_ensure_cadence(p_org uuid)
 returns jsonb language plpgsql security definer set search_path to 'hr', 'public'
as $function$
declare
  v_sys constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_cad integer := (hr._rev_knob(p_org, 'standard_review_reminder_cadence_hours', '48'::jsonb) #>> '{}')::integer;
  pd hr.workflow_definition%rowtype; v_org_def uuid; v_new uuid;
begin
  select * into pd from hr.workflow_definition
   where flow_key = 'performance_review' and status = 'published' and organization_id = v_sys and deleted_at is null;
  select id into v_org_def from hr.workflow_definition
   where flow_key = 'performance_review' and status = 'published' and organization_id = p_org and deleted_at is null;
  perform hr.arm_write();
  if v_org_def is not null then
    update hr.workflow_definition set reminder_cadence_hours = v_cad
     where id = v_org_def and reminder_cadence_hours is distinct from v_cad;
    return jsonb_build_object('reminder_cadence_hours', v_cad, 'definition_id', v_org_def);
  end if;
  if pd.id is null or pd.reminder_cadence_hours is not distinct from v_cad then
    return jsonb_build_object('reminder_cadence_hours', coalesce(pd.reminder_cadence_hours, v_cad), 'definition_id', pd.id);
  end if;
  insert into hr.workflow_definition
    (flow_key, name, definition_version, status, effective_from, published_at, notes, sla_hours,
     reminder_cadence_hours, reminder_max, on_expiry, skip_absent_approver, allow_bulk_decide,
     organization_id, metadata)
  values (pd.flow_key, pd.name || ' (organization cadence)', 1, 'published', current_date, now(),
          'Copy of the platform definition carrying this organization''s standard_review_reminder_cadence_hours knob (hr_rev_05).',
          pd.sla_hours, v_cad, pd.reminder_max, pd.on_expiry, pd.skip_absent_approver, pd.allow_bulk_decide,
          p_org, jsonb_build_object('copied_from', pd.id))
  returning id into v_new;
  insert into hr.workflow_step_definition
    (workflow_definition_id, step_key, label, step_order, parallel_group, quorum_kind, quorum_n, condition,
     is_optional, allows_self, requires_reason, resolver_kind, authority_action, resolver_config,
     fallback_chain, sla_hours, reminder_cadence_hours, escalate_after_hours, escalation_resolver_kind,
     escalation_config, autonomy_mode, auto_decide_rule, timeout_action, result_window_hours, organization_id, metadata)
  select v_new, sd.step_key, sd.label, sd.step_order, sd.parallel_group, sd.quorum_kind, sd.quorum_n, sd.condition,
         sd.is_optional, sd.allows_self, sd.requires_reason, sd.resolver_kind, sd.authority_action, sd.resolver_config,
         sd.fallback_chain, sd.sla_hours, sd.reminder_cadence_hours, sd.escalate_after_hours, sd.escalation_resolver_kind,
         sd.escalation_config, sd.autonomy_mode, sd.auto_decide_rule, sd.timeout_action, sd.result_window_hours, p_org, sd.metadata
    from hr.workflow_step_definition sd where sd.workflow_definition_id = pd.id and sd.deleted_at is null;
  return jsonb_build_object('reminder_cadence_hours', v_cad, 'definition_id', v_new, 'created', true);
end
$function$;

-- ============================================================ knob-reading bodies (replaced)
create or replace function hr._rev_response_visible(p_seat text, p_uid uuid, p_review_id uuid, p_response_id uuid)
 returns boolean language plpgsql stable security definer set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; x hr.review_response%rowtype; v_both boolean;
begin
  select * into r from hr.review where id = p_review_id;
  select * into x from hr.review_response where id = p_response_id and review_id = p_review_id;
  if r.id is null or x.id is null or p_seat is null then return false; end if;
  if x.respondent_user_id is not null and x.respondent_user_id = p_uid then return true; end if;
  v_both := r.self_submitted_at is not null and r.manager_submitted_at is not null;
  return case p_seat
    when 'hr'         then true
    when 'employee'   then x.role = 'self' or (x.role = 'manager' and r.shared_at is not null)
    when 'manager'    then x.role = 'manager' or (x.role = 'self' and x.status = 'submitted'
                           and (v_both or hr._rev_knob(r.organization_id, 'standard_review_manager_sees_self',
                                                       '"after_both_submit"'::jsonb) #>> '{}' = 'after_employee_submits'))
    when 'skip_level' then x.status = 'submitted' and v_both
    else false end;
end
$function$;

create or replace function hr.hr_review_cycle_create(p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_name text; v_tpl uuid; t hr.review_template%rowtype;
  v_ps date; v_pe date; v_sd date; v_md date; v_hd date; v_id uuid; v_ens jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  v_org := nullif(p_payload ->> 'organization_id', '')::uuid;
  if not hr._rev_can_manage(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  v_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'name');
  end if;
  begin
    v_ps := (p_payload ->> 'period_start')::date;  v_pe := (p_payload ->> 'period_end')::date;
    v_sd := nullif(p_payload ->> 'self_due_on', '')::date;
    v_md := nullif(p_payload ->> 'manager_due_on', '')::date;
    v_hd := nullif(p_payload ->> 'share_due_on', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'dates');
  end;
  -- unnamed due dates default from the organization's knobs (hr_rev_05)
  v_sd := coalesce(v_sd, current_date + (hr._rev_knob(v_org, 'standard_review_self_days', '14'::jsonb) #>> '{}')::integer);
  v_md := coalesce(v_md, current_date + (hr._rev_knob(v_org, 'standard_review_manager_days', '21'::jsonb) #>> '{}')::integer);
  if v_ps is null or v_pe is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period');
  end if;
  if v_ps > v_pe then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'period_end');
  end if;
  v_tpl := nullif(p_payload ->> 'template_id', '')::uuid;
  if v_tpl is null then
    v_ens := hr.hr_review_template_ensure_default(v_org);
    v_tpl := (v_ens ->> 'template_id')::uuid;
  end if;
  select * into t from hr.review_template
   where id = v_tpl and organization_id = v_org and deleted_at is null;
  if t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'template_id');
  end if;
  insert into hr.review_cycle (name, period_start, period_end, self_due_on, manager_due_on, share_due_on,
                               template_id, template_snapshot, status, organization_id)
  values (v_name, v_ps, v_pe, v_sd, v_md, v_hd, t.id,
          jsonb_build_object('__kind', 'performance_review_template_snapshot', 'template_id', t.id,
                             'name', t.name, 'sections', t.sections, 'rating_scale', t.rating_scale,
                             'frozen_at', now()),
          'draft', v_org)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'cycle_id', v_id, 'status', 'draft', 'template_id', t.id,
                            'self_due_on', v_sd, 'manager_due_on', v_md, 'share_due_on', v_hd);
end
$function$;

create or replace function hr.hr_review_cycle_launch(p_cycle_id uuid, p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
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

create or replace function hr.hr_review_share(p_review_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, 'manager');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_manager'); end if;
  select * into r from hr.review where id = p_review_id for update;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status <> 'both_submitted' then
    return jsonb_build_object('ok', false, 'reason', 'not_both_submitted', 'review_status', r.status);
  end if;
  if r.overall_rating is null then
    return jsonb_build_object('ok', false, 'reason', 'overall_rating_missing');
  end if;
  if coalesce((hr._rev_knob(r.organization_id, 'standard_review_calibration_required', 'false'::jsonb) #>> '{}')::boolean, false)
     and r.calibrated_rating is null then
    return jsonb_build_object('ok', false, 'reason', 'calibration_required');
  end if;
  update hr.review set shared_at = now(), shared_by = v_uid, status = 'shared' where id = r.id;
  v_wf := hr._rev_close_step(r.id, 'share', 'approved', v_uid, v_lane);
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', 'shared',
                            'shared_at', (select shared_at from hr.review where id = r.id), 'workflow', v_wf);
end
$function$;

create or replace function hr.hr_review_acknowledge(p_review_id uuid, p_comment text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype; v_lane text; v_wf jsonb;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), ''); v_after hr.review%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if hr._rev_seat(v_uid, p_review_id) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_lane := hr._rev_lane(v_uid, p_review_id, 'self');
  if v_lane is null then return jsonb_build_object('ok', false, 'reason', 'not_the_employee'); end if;
  if v_lane = 'recorder' and v_comment is not null then
    return jsonb_build_object('ok', false, 'reason', 'comment_is_the_employees_own');
  end if;
  select * into r from hr.review where id = p_review_id for update;
  if v_comment is not null
     and not coalesce((hr._rev_knob(r.organization_id, 'standard_review_ack_comment', 'true'::jsonb) #>> '{}')::boolean, true) then
    return jsonb_build_object('ok', false, 'reason', 'comment_not_enabled');
  end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status <> 'shared' then
    return jsonb_build_object('ok', false, 'reason', 'not_shared', 'review_status', r.status);
  end if;
  if not exists (select 1 from hr.workflow_step where workflow_instance_id = r.workflow_instance_id
                   and step_key = 'acknowledge' and state = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'no_acknowledgement_step');
  end if;
  -- the facts go on the INSTANCE, because the instance is what the one writer reads
  perform hr.arm_write();
  update hr.workflow_instance
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
           'acknowledgment_comment', v_comment,
           'acknowledged_by_user_id', v_uid,
           'recorded_off_platform', v_lane = 'recorder'))
   where id = r.workflow_instance_id;
  v_wf := hr._rev_close_step(r.id, 'acknowledge', 'acknowledged', v_uid, v_lane);
  select * into v_after from hr.review where id = r.id;
  if v_after.acknowledged_at is null then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_wf ->> 'reason', 'acknowledgement_not_applied'),
                              'workflow', v_wf);
  end if;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'review_status', v_after.status,
    'acknowledged_at', v_after.acknowledged_at, 'acknowledgment_comment', v_after.acknowledgment_comment,
    'recorded_by_hr', v_lane = 'recorder', 'workflow', v_wf);
end
$function$;
-- ============================================================ templates
create function hr.hr_review_template_list(p_organization_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if not hr._rev_can_manage(v_uid, p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  return jsonb_build_object('ok', true, 'templates', coalesce((
    select jsonb_agg(jsonb_build_object(
      'template_id', t.id, 'name', t.name, 'description', t.description, 'is_default', t.is_default,
      'section_count', jsonb_array_length(t.sections),
      'question_count', (select count(*) from jsonb_array_elements(t.sections) s, jsonb_array_elements(coalesce(s -> 'questions', '[]'::jsonb)) q),
      'version', t.version, 'updated_at', t.updated_at,
      'cycle_count', (select count(*) from hr.review_cycle c where c.template_id = t.id and c.deleted_at is null))
      order by t.is_default desc, t.name)
      from hr.review_template t where t.organization_id = p_organization_id and t.deleted_at is null), '[]'::jsonb));
end
$function$;

create function hr.hr_review_template_save(p_payload jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_org uuid := nullif(p_payload ->> 'organization_id', '')::uuid;
  v_id uuid := nullif(p_payload ->> 'template_id', '')::uuid; t hr.review_template%rowtype;
  v_name text := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  v_sections jsonb := p_payload -> 'sections'; v_scale jsonb := p_payload -> 'rating_scale';
  v_default boolean := coalesce((p_payload ->> 'is_default')::boolean, false); v_problems jsonb; v_ver integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if v_id is not null then
    select * into t from hr.review_template where id = v_id and deleted_at is null;
    if t.id is null or not hr._rev_can_manage(v_uid, t.organization_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_reachable');
    end if;
    v_org := t.organization_id;
    v_name := coalesce(v_name, t.name);
    v_sections := coalesce(v_sections, t.sections);
    v_scale := coalesce(v_scale, t.rating_scale);
  elsif not hr._rev_can_manage(v_uid, v_org) then
    return jsonb_build_object('ok', false, 'reason', 'not_permitted');
  end if;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'name'); end if;
  v_problems := hr._rev_template_problems(v_sections, v_scale);
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'template_invalid', 'problems', v_problems);
  end if;
  if v_default then
    update hr.review_template set is_default = false
     where organization_id = v_org and is_default and deleted_at is null and id is distinct from v_id;
  end if;
  if v_id is null then
    insert into hr.review_template (name, description, sections, rating_scale, is_default, organization_id)
    values (v_name, nullif(btrim(coalesce(p_payload ->> 'description', '')), ''), v_sections, v_scale, v_default, v_org)
    returning id, version into v_id, v_ver;
    return jsonb_build_object('ok', true, 'template_id', v_id, 'created', true, 'version', v_ver);
  end if;
  update hr.review_template
     set name = v_name,
         description = case when p_payload ? 'description' then nullif(btrim(coalesce(p_payload ->> 'description', '')), '') else description end,
         sections = v_sections, rating_scale = v_scale,
         is_default = case when p_payload ? 'is_default' then v_default else is_default end
   where id = v_id
  returning version into v_ver;
  return jsonb_build_object('ok', true, 'template_id', v_id, 'created', false, 'version', v_ver);
end
$function$;

create function hr.hr_review_template_archive(p_template_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); t hr.review_template%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into t from hr.review_template where id = p_template_id and deleted_at is null;
  if t.id is null or not hr._rev_can_manage(v_uid, t.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  -- archived, never destroyed; every cycle keeps its own frozen snapshot
  update hr.review_template set deleted_at = now(), is_default = false where id = t.id;
  return jsonb_build_object('ok', true, 'template_id', t.id, 'archived_at', now(), 'was_default', t.is_default);
end
$function$;

-- ============================================================ calibration
create function hr.hr_review_calibration(p_cycle_id uuid, p_filter jsonb default '{}'::jsonb)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; v_rows jsonb;
        v_mgr uuid := nullif(p_filter ->> 'manager_employment_id', '')::uuid;
        v_dept uuid := nullif(p_filter ->> 'department_id', '')::uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  with base as (
    select r.*, (hr.primary_position_as_of(r.employment_id, current_date)).department_id dept_id
      from hr.review r where r.cycle_id = c.id and r.deleted_at is null and r.status <> 'cancelled'
  ), rows as (
    select b.id, b.status, b.overall_rating, b.calibrated_rating, b.calibration_note, b.calibrated_at,
           b.manager_employment_id, hr._rev_person_name(b.employment_id) employee_name,
           hr._rev_person_name(b.manager_employment_id) manager_name, d.name department,
           (select hr._rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
              and x.role = 'self' and x.status = 'submitted' and x.deleted_at is null limit 1) self_overall,
           (select hr._rev_mean_rating(x.answers) from hr.review_response x where x.review_id = b.id
              and x.role = 'manager' and x.status = 'submitted' and x.deleted_at is null limit 1) manager_overall
      from base b left join hr.department d on d.id = b.dept_id
     where (v_mgr is null or b.manager_employment_id = v_mgr) and (v_dept is null or b.dept_id = v_dept)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object('review_id', id, 'employee_name', employee_name,
              'manager_name', manager_name, 'manager_employment_id', manager_employment_id, 'department', department,
              'self_overall', self_overall, 'manager_overall', manager_overall,
              'overall_rating', overall_rating, 'calibrated_rating', calibrated_rating,
              'calibration_note', calibration_note, 'calibrated_at', calibrated_at, 'status', status)
              order by manager_name, employee_name), '[]'::jsonb),
    'by_rating', coalesce((select jsonb_object_agg(k, n) from (select coalesce(calibrated_rating, overall_rating, 'unrated') k, count(*) n from rows group by 1) q), '{}'::jsonb),
    'by_manager', coalesce((select jsonb_agg(jsonb_build_object('manager_name', m, 'manager_employment_id', me, 'count', n, 'by_rating', br)) from (
        select manager_name m, manager_employment_id me, sum(cnt) n, jsonb_object_agg(k, cnt) br from (
          select manager_name, manager_employment_id, coalesce(calibrated_rating, overall_rating, 'unrated') k, count(*) cnt
            from rows group by 1, 2, 3) z group by 1, 2) q), '[]'::jsonb))
    into v_rows from rows;
  return jsonb_build_object('ok', true, 'cycle_id', c.id,
    'rating_scale', c.template_snapshot -> 'rating_scale',
    'rows', v_rows -> 'rows',
    'distribution', jsonb_build_object('by_rating', v_rows -> 'by_rating', 'by_manager', v_rows -> 'by_manager'));
end
$function$;

create function hr.hr_review_calibrate(p_review_id uuid, p_rating text, p_note text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); r hr.review%rowtype; c hr.review_cycle%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into r from hr.review where id = p_review_id and deleted_at is null for update;
  if r.id is null or not hr._rev_can_manage(v_uid, r.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  select * into c from hr.review_cycle where id = r.cycle_id;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'reason', 'cycle_not_open', 'cycle_status', c.status); end if;
  if r.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'review_cancelled'); end if;
  if p_rating is not null and not exists (
       select 1 from jsonb_array_elements(coalesce(c.template_snapshot #> '{rating_scale,points}', '[]'::jsonb)) p
        where p ->> 'key' = p_rating) then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'rating');
  end if;
  -- the manager's overall_rating is kept; HR's calibrated rating sits beside it
  update hr.review set calibrated_rating = p_rating,
                       calibration_note = nullif(btrim(coalesce(p_note, '')), ''),
                       calibrated_by = v_uid, calibrated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true, 'review_id', r.id, 'overall_rating', r.overall_rating,
                            'calibrated_rating', p_rating, 'calibrated_at', now());
end
$function$;

-- ============================================================ register, then grant
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane,
   signed_in_callers, anonymous_callers)
values
  ('hr', '_rev_ensure_cadence', 'p_org uuid', array['uuid'::regtype]::oid[],
   'Keeps an organization-owned copy of the performance_review definition carrying its reminder-cadence knob; checked against nothing a caller supplies because no client calls it.',
   'matrx-frontend/migrations/campaign/hr_rev_05_standard_review_wave2.sql (HR-REVIEWS)',
   'server_only: called only from hr.hr_review_cycle_launch after it has checked performance.manage in that organization; no client role holds EXECUTE.',
   false, false);

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, argument_rules)
values
  ('hr','hr_review_template_list','p_organization_id uuid',array['uuid'::regtype]::oid[],'hr_rev_05',
   'Standard performance reviews: the organization''s review templates. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_05', 'arguments', jsonb_build_object('p_organization_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'hr._rev_can_manage(caller, this organization) decides before anything is read; another organization answers not_permitted.'))))),
  ('hr','hr_review_template_save','p_payload jsonb',array['jsonb'::regtype]::oid[],'hr_rev_05',
   'Standard performance reviews: creates or edits a template, validating its typed __kind shape. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_05', 'arguments', jsonb_build_object('p_payload', jsonb_build_object('type', 'jsonb', 'check', 'data; an existing template_id is reached only through hr._rev_can_manage on the template''s own organization, a new one only on the payload''s organization_id.')))),
  ('hr','hr_review_template_archive','p_template_id uuid',array['uuid'::regtype]::oid[],'hr_rev_05',
   'Standard performance reviews: archives a template (cycles keep their snapshot). Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_05', 'arguments', jsonb_build_object('p_template_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The template''s organization is read from its row and hr._rev_can_manage decides; a foreign or invented id answers not_reachable identically.'))))),
  ('hr','hr_review_calibration','p_cycle_id uuid, p_filter jsonb',array['uuid'::regtype, 'jsonb'::regtype]::oid[],'hr_rev_05',
   'Standard performance reviews: calibration rows (rating means, never answer text) and distribution for one cycle. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_05', 'arguments', jsonb_build_object('p_cycle_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The cycle''s organization is read from its row and hr._rev_can_manage decides; a foreign or invented id answers not_reachable identically.')), 'p_filter', jsonb_build_object('type', 'jsonb', 'check', 'filters only narrow rows of the cycle already admitted.')))),
  ('hr','hr_review_calibrate','p_review_id uuid, p_rating text, p_note text',array['uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],'hr_rev_05',
   'Standard performance reviews: HR records a calibrated rating beside the manager''s. Gated by performance.manage.',
   jsonb_build_object('version', 1, 'declared_by', 'hr_rev_05', 'arguments', jsonb_build_object('p_review_id', jsonb_build_object('type', 'uuid', 'foreign', jsonb_build_object('bounded', true, 'note', 'The review''s organization is read from its row and hr._rev_can_manage decides; a foreign or invented id answers not_reachable identically.')))))
on conflict do nothing;

grant execute on function hr.hr_review_template_list(uuid) to authenticated;
grant execute on function hr.hr_review_template_save(jsonb) to authenticated;
grant execute on function hr.hr_review_template_archive(uuid) to authenticated;
grant execute on function hr.hr_review_calibration(uuid, jsonb) to authenticated;
grant execute on function hr.hr_review_calibrate(uuid, text, text) to authenticated;
