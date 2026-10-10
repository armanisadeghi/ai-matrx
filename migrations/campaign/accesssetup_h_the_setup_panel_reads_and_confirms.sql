-- chair-step: it ADDS the setup panel's doors — iam.record_access_setup (the panel's one read: seats, who fills each and why, the parts each seat sees and from which stage), iam.record_seat_clear (undo one per-record add or exclude), iam.record_setup_confirm (writes one iam.access_audit seat_confirm row), hr.hr_review_cycle_access_setup (the cycle-level panel: organization-wide seats and stage knobs for every review in a cycle) and hr.hr_owner_takes_hr_role (a small company's owner takes the HR role through the existing HR doors) — each declared in platform.client_callable_door before its GRANT; ADDS the knob access/setup_panel_every_time (default off); and REPLACES hr.hr_review_cycle_launch only to add access_setup {head_type, ids, cycle_id, needs_confirm} to its answer. No seat, part, kernel or review-door answer changes.
-- lane: access-setup
-- lock: iam,hr
-- based-on: hr.hr_review_cycle_launch(uuid, jsonb) 007d3e89e55a0032ccaae1e26b35257d1376d650c8f110fd734aaf709f4e0051
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §5b, §5c (step 6 of §8).
-- Inverse: migrations/inverse/accesssetup_h_the_setup_panel_reads_and_confirms_down.sql

-- ── the knob: open the panel at every creation, even once the organization confirmed the type ──
insert into platform.feature_knob
  (feature, key, label, description, value_type, value, default_value, basis, review_due,
   overridable_by, set_by, propagation, delegable, override_direction, public_read, ui)
values
  ('access', 'setup_panel_every_time', 'People involved at every creation',
   'When on, the People involved panel opens every time a sensitive record is created, not only the first time.',
   'boolean', 'false'::jsonb, 'false'::jsonb,
   'Off by default: access is already correct at creation (live resolvers and fallbacks), so the panel opens only until an organization confirms the type or when something on the record is unusual (access-setup PLAN §5b, 2026-10-10).',
   (current_date + 45), array['organization','user'], 'agent', 'next_load', true, 'any', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ── a person as the panel shows them ──
create or replace function iam._access_setup_person(p_user uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
    'user_id', u.id,
    'name', coalesce(nullif(btrim(p.display_name), ''),
                     nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                     nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                     u.email::text),
    'email', u.email::text,
    'avatar_url', p.avatar_url)
    from auth.users u left join users.profiles p on p.id = u.id
   where u.id = p_user;
$function$;

-- ── does this creation need the panel's confirm? ──
-- true when the knob says every time, when the organization never confirmed this type, or when any of the
-- records has a seat filled only by the fallback (something unusual the creator should see)
create or replace function iam._access_setup_needs_confirm(p_type text, p_org uuid, p_user uuid, p_ids uuid[])
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare v_every boolean;
begin
  if p_org is null or coalesce(cardinality(p_ids), 0) = 0 then return false; end if;
  v_every := coalesce((platform.knob_resolve('access', 'setup_panel_every_time', p_org, p_user) #>> '{}')::boolean, false);
  if v_every then return true; end if;
  if not exists (select 1 from iam.access_audit a
                  where a.organization_id = p_org and a.target_token = p_type
                    and a.action = 'seat_confirm' and a.deleted_at is null) then
    return true;
  end if;
  return exists (select 1 from unnest(p_ids) x(id), iam._seat_table(p_type, x.id) t where t.source = 'fallback');
end
$function$;

-- ── the panel's one read ──
create or replace function iam.record_access_setup(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_org uuid; v_mine text[];
  v_admin text[]; v_stages text[]; v_seats jsonb := '[]'::jsonb; v_seat jsonb; v_key text; v_may boolean;
  v_any_may boolean := false; v_holders jsonb; v_excluded jsonb; v_cells jsonb; v_role text; v_confirm jsonb;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(iam.seats_of(v_caller, p_type, p_id), '{}');
  if cardinality(v_mine) = 0 then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_admin := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(s -> 'admin_seats', '[]'::jsonb)) x), '{}');
  v_stages := coalesce(iam._access_setup_stages(s, p_id), '{}');
  select m.role into v_role from iam.memberships m
   where m.organization_id = v_org and m.user_id = v_caller and m.container_type = 'organization'
     and m.status = 'active' and m.deleted_at is null limit 1;

  for v_seat in select e from jsonb_array_elements(s -> 'seats') e loop
    v_key := v_seat ->> 'key';
    if coalesce((v_seat ->> 'opens_record')::boolean, true) = false then continue; end if;
    v_may := v_key is distinct from (s ->> 'subject_seat')
             and coalesce(v_seat #>> '{resolver,kind}', '') <> 'grants'
             and v_mine && (coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_seat -> 'assignable_by', '[]'::jsonb)) x), '{}') || v_admin);
    v_any_may := v_any_may or v_may;
    select coalesce(jsonb_agg(iam._access_setup_person(t.user_id)
                              || jsonb_build_object('source', t.source, 'removable', t.removable)
                              order by t.source, t.user_id), '[]'::jsonb)
      into v_holders from iam._seat_table(p_type, p_id) t where t.seat = v_key;
    select coalesce(jsonb_agg(iam._access_setup_person(c.user_id)
                              || jsonb_build_object('changed_at', c.changed_at, 'reason', c.reason)
                              order by c.changed_at desc), '[]'::jsonb)
      into v_excluded from iam.record_seat_change c
     where c.entity_type = p_type and c.record_id = p_id and c.seat_key = v_key
       and c.change = 'exclude' and c.deleted_at is null;
    select coalesce(jsonb_agg(jsonb_build_object(
             'part', pe ->> 'key',
             'level', s #>> array['grid', v_key, pe ->> 'key', 'level'],
             'rows', s #>> array['grid', v_key, pe ->> 'key', 'rows'],
             'from_stage', s #> array['grid', v_key, pe ->> 'key', 'from_stage'],
             'reached', case when s #> array['grid', v_key, pe ->> 'key', 'from_stage'] is null then true
                             else iam._access_setup_stage_reached(s #> array['grid', v_key, pe ->> 'key', 'from_stage'], v_stages) end)
             order by pe_ord), '[]'::jsonb)
      into v_cells
      from jsonb_array_elements(s -> 'parts') with ordinality p(pe, pe_ord)
     where s #> array['grid', v_key, pe ->> 'key'] is not null;
    v_seats := v_seats || jsonb_build_object(
      'key', v_key,
      'required', coalesce((v_seat ->> 'required')::boolean, false),
      'many', coalesce((v_seat ->> 'many')::boolean, false),
      'resolver', v_seat #>> '{resolver,kind}',
      'may_change', v_may,
      'fallback_only', jsonb_array_length(v_holders) > 0
                       and not exists (select 1 from jsonb_array_elements(v_holders) h where h ->> 'source' <> 'fallback'),
      'holders', v_holders,
      'excluded', v_excluded,
      'cells', v_cells);
  end loop;

  select jsonb_build_object('at', a.occurred_at) || coalesce(jsonb_build_object('by', iam._access_setup_person(a.actor_user_id)), '{}'::jsonb)
    into v_confirm from iam.access_audit a
   where a.organization_id = v_org and a.target_token = p_type and a.action = 'seat_confirm'
     and p_id = any(a.target_ids) and a.deleted_at is null
   order by a.occurred_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'entity_type', p_type,
    'record_id', p_id,
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from iam.organizations o where o.id = v_org),
    'my_seats', to_jsonb(v_mine),
    'my_org_role', v_role,
    'stages_reached', to_jsonb(v_stages),
    'seats', v_seats,
    'confirmed', v_confirm,
    'needs_confirm', iam._access_setup_needs_confirm(p_type, v_org, v_caller, array[p_id]),
    'candidates', case when v_any_may then (
        select coalesce(jsonb_agg(iam._access_setup_person(m.user_id)), '[]'::jsonb)
          from (select distinct m2.user_id from iam.memberships m2
                 where m2.organization_id = v_org and m2.container_type = 'organization'
                   and m2.status = 'active' and m2.deleted_at is null limit 500) m)
      else '[]'::jsonb end);
end
$function$;

-- ── undo one per-record add or exclude (same gate as iam.record_seat_set) ──
create or replace function iam.record_seat_clear(p_type text, p_id uuid, p_seat text, p_user uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_seat jsonb; v_org uuid;
  v_mine text[]; v_may text[]; v_change text; v_audit uuid;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  select e into v_seat from jsonb_array_elements(s -> 'seats') e where e ->> 'key' = p_seat;
  if v_seat is null then return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'seat'); end if;
  v_org := iam._access_setup_head_org(p_type, p_id);
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_mine := coalesce(iam.seats_of(v_caller, p_type, p_id), '{}');
  if cardinality(v_mine) = 0 then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_may := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_seat -> 'assignable_by', '[]'::jsonb)
                                                                        || coalesce(s -> 'admin_seats', '[]'::jsonb)) x), '{}');
  if not (v_mine && v_may) then return jsonb_build_object('ok', false, 'reason', 'not_permitted'); end if;
  update iam.record_seat_change c set deleted_at = now(), archived_by = v_caller
   where c.entity_type = p_type and c.record_id = p_id and c.seat_key = p_seat and c.user_id = p_user and c.deleted_at is null
  returning c.change into v_change;
  if v_change is null then return jsonb_build_object('ok', false, 'reason', 'nothing_to_undo'); end if;
  v_audit := iam._record_access_audit(
    p_organization_id => v_org, p_action => 'seat_change', p_target_token => p_type,
    p_data_class => coalesce(iam.class_gate_class(p_type), 'organization'), p_purpose => 'access_setup',
    p_basis => coalesce(v_seat #>> '{resolver,kind}', 'record_seat_change'), p_granted => true,
    p_target_ids => array[p_id], p_row_count => 1, p_subject_user_id => p_user,
    p_justification => format('undo %s %s seat', v_change, p_seat), p_is_emergency_door => false,
    p_actor_user_id => v_caller, p_granted_to_user_id => p_user);
  return jsonb_build_object('ok', true, 'undone', v_change, 'audit_id', v_audit);
end
$function$;

-- ── confirm: one access-log row for the records the panel showed ──
create or replace function iam.record_setup_confirm(p_type text, p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_caller uuid := auth.uid(); s jsonb := iam._access_setup_of(p_type); v_org uuid; v_id uuid; v_o uuid; v_audit uuid;
begin
  if v_caller is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  if s is null then return jsonb_build_object('ok', false, 'reason', 'no_setup'); end if;
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'ids');
  end if;
  foreach v_id in array p_ids loop
    v_o := iam._access_setup_head_org(p_type, v_id);
    if v_o is null or cardinality(coalesce(iam.seats_of(v_caller, p_type, v_id), '{}')) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'not_reachable');
    end if;
    if v_org is not null and v_o <> v_org then
      return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'ids');
    end if;
    v_org := v_o;
  end loop;
  v_audit := iam._record_access_audit(
    p_organization_id => v_org, p_action => 'seat_confirm', p_target_token => p_type,
    p_data_class => coalesce(iam.class_gate_class(p_type), 'organization'), p_purpose => 'access_setup',
    p_basis => 'access_setup', p_granted => true, p_target_ids => p_ids, p_row_count => cardinality(p_ids),
    p_justification => 'people involved confirmed', p_is_emergency_door => false, p_actor_user_id => v_caller);
  return jsonb_build_object('ok', true, 'audit_id', v_audit);
end
$function$;

-- ── the cycle-level panel: organization-wide seats + stage knobs for every review in a cycle ──
create or replace function hr.hr_review_cycle_access_setup(p_cycle_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare
  v_uid uuid := auth.uid(); c hr.review_cycle%rowtype; v_hr uuid[]; v_upper uuid[]; v_fb uuid[];
  v_ids uuid[]; v_role text; v_knobs jsonb := '[]'::jsonb; v_k text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_caller'); end if;
  select * into c from hr.review_cycle where id = p_cycle_id and deleted_at is null;
  if c.id is null or not hr._rev_can_manage(v_uid, c.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_hr := coalesce(hr._review_org_capable(c.organization_id, 'performance.manage'), '{}');
  v_upper := coalesce(hr._review_org_capable(c.organization_id, 'performance.read_all'), '{}');
  v_upper := coalesce((select array_agg(x) from unnest(v_upper) x where not x = any(v_hr)), '{}');
  if cardinality(v_hr) = 0 then
    v_fb := coalesce((select array_agg(distinct m.user_id) from iam.memberships m
                       where m.organization_id = c.organization_id and m.container_type = 'organization'
                         and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null), '{}');
  else v_fb := '{}';
  end if;
  select coalesce(array_agg(r.id order by r.created_at), '{}') into v_ids
    from hr.review r where r.cycle_id = c.id and r.deleted_at is null;
  select m.role into v_role from iam.memberships m
   where m.organization_id = c.organization_id and m.user_id = v_uid and m.container_type = 'organization'
     and m.status = 'active' and m.deleted_at is null limit 1;
  foreach v_k in array array['standard_review_manager_sees_self', 'standard_review_calibration_required',
                             'standard_review_peers_enabled', 'standard_review_peer_anonymous',
                             'standard_review_ack_comment'] loop
    v_knobs := v_knobs || jsonb_build_object('key', v_k,
      'value', platform.knob_resolve('hr.performance', v_k, c.organization_id, null));
  end loop;
  return jsonb_build_object(
    'ok', true,
    'cycle', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name) from iam.organizations o where o.id = c.organization_id),
    'my_org_role', v_role,
    'seats', jsonb_build_array(
      jsonb_build_object('key', 'hr', 'holders',
        (select coalesce(jsonb_agg(iam._access_setup_person(x) || jsonb_build_object('source', 'role')), '[]'::jsonb) from unnest(v_hr) x)
        || (select coalesce(jsonb_agg(iam._access_setup_person(x) || jsonb_build_object('source', 'fallback')), '[]'::jsonb) from unnest(v_fb) x),
        'fallback_only', cardinality(v_hr) = 0 and cardinality(v_fb) > 0),
      jsonb_build_object('key', 'upper_management', 'holders',
        (select coalesce(jsonb_agg(iam._access_setup_person(x) || jsonb_build_object('source', 'role')), '[]'::jsonb) from unnest(v_upper) x),
        'fallback_only', false)),
    'knobs', v_knobs,
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
                  'review_id', r.id,
                  'employee_name', hr._rev_person_name(r.employment_id),
                  'manager_name', hr._rev_person_name(r.manager_employment_id),
                  'unusual', exists (select 1 from iam._seat_table('hr_review', r.id) t where t.source = 'fallback'))
                  order by r.created_at), '[]'::jsonb)
                  from hr.review r where r.cycle_id = c.id and r.deleted_at is null),
    'needs_confirm', iam._access_setup_needs_confirm('hr_review', c.organization_id, v_uid, v_ids));
end
$function$;

-- ── a small company's owner takes the HR role, through the existing HR doors ──
-- never hand-inserts: an organization HR was never switched on for goes through hr_activate_employer (which
-- makes the owner's employment and hr_owner role); otherwise the owner's employment comes from
-- hr_employee_create when they have none, then hr_role_assign grants hr_admin (performance.manage).
create or replace function hr.hr_owner_takes_hr_role(p_organization_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'hr', 'public'
as $function$
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

-- ── cycle launch answers with the access setup it opens ──
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
  v_ids uuid[] := '{}';
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
    v_ids := v_ids || v_rid;

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

  -- access-setup §5b: a bulk creation opens ONE panel for the cycle (null when nothing was created)
  return jsonb_build_object('ok', true, 'cycle_id', c.id,
    'cycle_status', (select status from hr.review_cycle where id = c.id),
    'reminder_cadence_hours', (v_cad ->> 'reminder_cadence_hours')::integer,
    'created', v_created, 'refused', v_refused,
    'access_setup', case when cardinality(v_ids) > 0 then jsonb_build_object(
        'head_type', 'hr_review', 'ids', to_jsonb(v_ids), 'cycle_id', c.id,
        'needs_confirm', iam._access_setup_needs_confirm('hr_review', c.organization_id, v_uid, v_ids)) end);
end
$function$;


-- ── every SECURITY DEFINER function declares its access decision in data ──
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_access_setup_person', 'p_user uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP: internal; a person''s name and email as the panel shows them.',
   'server_only: takes any user id; only the panel doors call it, for people the caller may already see on the record', false, false),
  ('iam', '_access_setup_needs_confirm', 'p_type text, p_org uuid, p_user uuid, p_ids uuid[]',
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'uuid'::regtype::oid, 'uuid[]'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP: internal; whether a creation needs the panel''s confirm.',
   'server_only: takes the organization and person as arguments; only doors call it', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, reason = excluded.reason, declared_by = excluded.declared_by,
      signed_in_callers = false, anonymous_callers = false;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, argument_rules)
values
  ('iam', 'record_access_setup', 'p_type text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP §5b: SECURITY DEFINER. Answers no_caller without auth.uid(), no_setup for a type with no access setup, and not_reachable for a record the caller holds no seat on (the same answer as a missing one). Returns the record''s seats, who fills each and why, the parts each seat sees and from which stage, the caller''s own seats and which seats they may change, the last confirm, and — only when they may change a seat — the active members of the record''s own organization to pick from.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_type', jsonb_build_object('type', 'text', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'A record the caller holds no seat on answers not_reachable, the same as a missing one.'))))),
  ('iam', 'record_seat_clear', 'p_type text, p_id uuid, p_seat text, p_user uuid',
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP §3: SECURITY DEFINER. Same gate as iam.record_seat_set (a seat on the record and a seat in the seat''s assignable_by or the admin seats). Archives the one active add or exclude for that person and seat and writes one iam.access_audit seat_change row; nothing_to_undo when there is none.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_type', jsonb_build_object('type', 'text', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'A record the caller holds no seat on answers not_reachable, the same as a missing one.')),
     'p_seat', jsonb_build_object('type', 'text', 'position', 3, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_user', jsonb_build_object('type', 'uuid', 'position', 4, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'Only archives an existing change row on a record the caller may change; an unrelated id finds nothing to undo.'))))),
  ('iam', 'record_setup_confirm', 'p_type text, p_ids uuid[]', array['text'::regtype::oid, 'uuid[]'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP §5c: SECURITY DEFINER. Every record named must be one the caller holds a seat on, all in one organization, at most 500. Writes one iam.access_audit seat_confirm row under that organization; changes no access.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_type', jsonb_build_object('type', 'text', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('not_an_id', true)),
     'p_ids', jsonb_build_object('type', 'uuid[]', 'position', 2, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'Every id must be a record the caller holds a seat on, in one organization; otherwise not_reachable before any write.'))))),
  ('hr', 'hr_review_cycle_access_setup', 'p_cycle_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP §5b: SECURITY DEFINER. Gated by hr._rev_can_manage on the cycle''s organization (HR there), the same gate as the other cycle doors; not_reachable otherwise. Returns the organization-wide HR and upper-management holders, the stage knobs and the cycle''s reviews.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_cycle_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'A cycle outside an organization where the caller is HR answers not_reachable.'))))),
  ('hr', 'hr_owner_takes_hr_role', 'p_organization_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_h_the_setup_panel_reads_and_confirms.sql (lane access-setup)',
   'ACCESS-SETUP §5b: SECURITY DEFINER. Only an active owner of the organization. Calls the existing HR doors (hr_activate_employer, else hr_employee_create when the owner has no employment, then hr_role_assign hr_admin), each of which runs its own gate and audit; passes their refusals through.',
   false, true,
   jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false, 'foreign', jsonb_build_object('bounded', true, 'note', 'Only an active owner of that organization; the HR doors it calls run their own gates.')))))
on conflict (schema_name, function_name, identity_argtypes) do update
  set argument_rules = excluded.argument_rules, signed_in_callers = excluded.signed_in_callers, anonymous_callers = excluded.anonymous_callers,
      non_client_lane = null, reason = excluded.reason, declared_by = excluded.declared_by;

grant execute on function iam.record_access_setup(text, uuid) to authenticated;
grant execute on function iam.record_seat_clear(text, uuid, text, uuid) to authenticated;
grant execute on function iam.record_setup_confirm(text, uuid[]) to authenticated;
grant execute on function hr.hr_review_cycle_access_setup(uuid) to authenticated;
grant execute on function hr.hr_owner_takes_hr_role(uuid) to authenticated;
