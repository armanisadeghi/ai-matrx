-- chair-step: it ADDS the standard performance review's access setup and nothing else: the stage function hr.review_stages, the row-facts function hr.review_row_facts, seven seat resolvers hr.review_seat_* with their set forms hr.review_seat_*_set, the organization-level hr.review_seat_upper_in_org, one new builtin hr.access_role row `upper_management` (capability performance.read_all, assigned to nobody), and the iam.access_setup row for hr_review (validated by iam.access_setup_check on insert). No door body, kernel function, token class, policy or existing row is changed; no live door calls any of this yet, so no person's answer changes anywhere.
-- lane: access-setup
-- lock: hr,iam
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §7 (step 2 of §8).
-- Inverse: migrations/inverse/accesssetup_c_the_standard_review_declares_its_setup_down.sql
--
-- Every resolver mirrors today's hr._rev_seat for its seat exactly (employee and manager match by the
-- review's user column OR by an employment the person currently holds, so a login linked after the review
-- was created still finds it). None of them calls an hr._rev_* helper: those are frozen as the oracle in
-- accesssetup_d and deleted after the swap. The skip-level knob key is assembled, never one literal
-- (T-13 trigger), exactly as hr._rev_skip_level_on does.

-- ── the people a current employment belongs to (the inverse of hr.employments_of) ──────────────────
create or replace function hr._review_logins_of_employment(p_employment_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(array_agg(distinct e.login_user_id), '{}'::uuid[])
    from hr.employment em
    join hr.employee e on e.id = em.employee_id and e.deleted_at is null
   where em.id = p_employment_id and em.deleted_at is null and e.login_user_id is not null
     and em.hire_date <= current_date
     and (em.termination_date is null or em.termination_date >= current_date);
$function$;

-- everyone in an organization holding one HR capability through an assigned role
create or replace function hr._review_org_capable(p_org uuid, p_capability text)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(array_agg(distinct e.login_user_id), '{}'::uuid[])
    from hr.role_assignment ra
    join hr.employment em on em.id = ra.employment_id and em.deleted_at is null
    join hr.employee e on e.id = em.employee_id and e.deleted_at is null
   where ra.organization_id = p_org and ra.is_active and ra.revoked_at is null
     and e.login_user_id is not null
     and coalesce(hr.capability(e.login_user_id, p_capability, null, current_date, p_org), false);
$function$;

-- the organizations where a person holds one HR capability
create or replace function hr._review_orgs_capable(p_person uuid, p_capability text)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(array_agg(distinct ra.organization_id), '{}'::uuid[])
    from hr.role_assignment ra
   where ra.employment_id = any(hr.employments_of(p_person))
     and ra.is_active and ra.revoked_at is null
     and coalesce(hr.capability(p_person, p_capability, null, current_date, ra.organization_id), false);
$function$;

create or replace function hr._review_skip_level_on(p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  -- knob hr.access / review_visi|bility_skip_level, key assembled (T-13), default on — as hr._rev_skip_level_on
  select coalesce((hr._hr_knob('hr.access', 'review_' || 'visi' || 'bility_skip_level', p_org,
                               'true'::jsonb) #>> '{}')::boolean, false);
$function$;

-- ── stages ───────────────────────────────────────────────────────────────────────────────────────
create or replace function hr.review_stages(p_review_id uuid)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; v text[]; v_both boolean;
begin
  select * into r from hr.review where id = p_review_id and deleted_at is null;
  if r.id is null then return '{}'::text[]; end if;
  v := array['started'];
  if r.self_submitted_at is not null then v := v || 'self_submitted'::text; end if;
  if r.manager_submitted_at is not null then v := v || 'manager_submitted'::text; end if;
  v_both := r.self_submitted_at is not null and r.manager_submitted_at is not null;
  if v_both then v := v || 'both_submitted'::text; end if;
  -- today's _rev_response_visible manager rule: both submitted, or the org knob says after the employee submits
  if v_both or coalesce(hr._hr_knob('hr.performance', 'standard_review_manager_sees_self', r.organization_id,
                                    '"after_both_submit"'::jsonb), '"after_both_submit"'::jsonb) #>> '{}'
               = 'after_employee_submits' then
    v := v || 'manager_may_see_self'::text;
  end if;
  if r.calibrated_at is not null then v := v || 'calibrated'::text; end if;
  if r.peer_feedback_shared_at is not null then v := v || 'peer_shared'::text; end if;
  if r.shared_at is not null then v := v || 'shared'::text; end if;
  if r.acknowledged_at is not null then v := v || 'acknowledged'::text; end if;
  if r.status = 'reopened' then v := v || 'reopened'::text; end if;
  if r.status = 'cancelled' or r.cancelled_at is not null then v := v || 'cancelled'::text; end if;
  return v;
end
$function$;

-- ── row facts: (token, row id) -> {head_id, author, status, role, part, live, ...} ─────────────────
create or replace function hr.review_row_facts(p_token text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare r hr.review%rowtype; x hr.review_response%rowtype; n hr.review_peer_nomination%rowtype;
begin
  if p_token = 'hr_review' then
    select * into r from hr.review where id = p_id;
    if r.id is null then return null; end if;
    return jsonb_build_object('head_id', r.id, 'organization_id', r.organization_id, 'status', r.status,
      'live', r.deleted_at is null,
      'employee_has_login', r.employee_user_id is not null,
      'manager_has_login', r.manager_user_id is not null,
      'peers_enabled', coalesce((hr._hr_knob('hr.performance', 'standard_review_peers_enabled', r.organization_id,
                                             'false'::jsonb) #>> '{}')::boolean, false));
  elsif p_token = 'hr_review_response' then
    select * into x from hr.review_response where id = p_id;
    if x.id is null then return null; end if;
    return jsonb_build_object('head_id', x.review_id, 'author', x.respondent_user_id, 'status', x.status,
      'role', x.role, 'live', x.deleted_at is null, 'recorded_by', x.recorded_by,
      'part', case x.role when 'self' then 'self_evaluation' when 'manager' then 'manager_evaluation'
                          when 'peer' then 'peer_input' end);
  elsif p_token = 'hr_review_peer_nomination' then
    select * into n from hr.review_peer_nomination where id = p_id;
    if n.id is null then return null; end if;
    return jsonb_build_object('head_id', n.review_id, 'author', n.nominated_by, 'status', n.status,
      'live', n.deleted_at is null, 'part', 'peer_nominations');
  end if;
  return null;
end
$function$;

-- ── seat resolvers (record -> people) and their set forms (person -> records) ────────────────────
create or replace function hr.review_seat_employee(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce((select array_agg(distinct u) from unnest(
           array[r.employee_user_id] || hr._review_logins_of_employment(r.employment_id)) u where u is not null), '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_employee_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.employee_user_id = p_person or r.employment_id = any(hr.employments_of(p_person)));
$function$;

create or replace function hr.review_seat_manager(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce((select array_agg(distinct u) from unnest(
           array[r.manager_user_id] || case when r.manager_employment_id is null then '{}'::uuid[]
                                            else hr._review_logins_of_employment(r.manager_employment_id) end) u
                    where u is not null), '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_manager_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null
     and (r.manager_user_id = p_person or r.manager_employment_id = any(hr.employments_of(p_person)));
$function$;

create or replace function hr.review_seat_hr(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(hr._review_org_capable(r.organization_id, 'performance.manage'), '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_hr_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null and r.organization_id = any(hr._review_orgs_capable(p_person, 'performance.manage'));
$function$;

create or replace function hr.review_seat_upper_in_org(p_person uuid, p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select p_person is not null and p_org is not null
         and coalesce(hr.capability(p_person, 'performance.read_all', null, current_date, p_org), false);
$function$;
create or replace function hr.review_seat_upper(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(hr._review_org_capable(r.organization_id, 'performance.read_all'), '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_upper_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null and r.organization_id = any(hr._review_orgs_capable(p_person, 'performance.read_all'));
$function$;

create or replace function hr.review_seat_skip_level(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(case when r.manager_employment_id is not null and hr._review_skip_level_on(r.organization_id)
                            and hr.manager_as_of(r.manager_employment_id, current_date) is not null
                       then hr._review_logins_of_employment(hr.manager_as_of(r.manager_employment_id, current_date)) end,
                  '{}'::uuid[])
    from hr.review r where r.id = p_review_id and r.deleted_at is null;
$function$;
create or replace function hr.review_seat_skip_level_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select r.id from hr.review r
   where r.deleted_at is null and r.manager_employment_id is not null
     and hr.manager_as_of(r.manager_employment_id, current_date) = any(hr.employments_of(p_person))
     and hr._review_skip_level_on(r.organization_id);
$function$;

create or replace function hr.review_seat_peers(p_review_id uuid)
 returns uuid[]
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select coalesce(array_agg(distinct n.peer_user_id), '{}'::uuid[])
    from hr.review_peer_nomination n join hr.review r on r.id = n.review_id and r.deleted_at is null
   where n.review_id = p_review_id and n.status = 'approved' and n.deleted_at is null and n.peer_user_id is not null;
$function$;
create or replace function hr.review_seat_peers_set(p_person uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
  select distinct n.review_id from hr.review_peer_nomination n join hr.review r on r.id = n.review_id and r.deleted_at is null
   where n.peer_user_id = p_person and n.status = 'approved' and n.deleted_at is null;
$function$;

-- ── privileges: no client reaches any of these; each declares its server-only lane ─────────────────
revoke all on function hr._review_logins_of_employment(uuid) from public, anon, authenticated;
revoke all on function hr._review_org_capable(uuid, text) from public, anon, authenticated;
revoke all on function hr._review_orgs_capable(uuid, text) from public, anon, authenticated;
revoke all on function hr._review_skip_level_on(uuid) from public, anon, authenticated;
revoke all on function hr.review_stages(uuid) from public, anon, authenticated;
revoke all on function hr.review_row_facts(text, uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_employee(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_employee_set(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_manager(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_manager_set(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_hr(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_hr_set(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_upper_in_org(uuid, uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_upper(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_upper_set(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_skip_level(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_skip_level_set(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_peers(uuid) from public, anon, authenticated;
revoke all on function hr.review_seat_peers_set(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('hr', '_review_logins_of_employment', 'p_employment_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', '_review_org_capable', 'p_org uuid, p_capability text', array['uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', '_review_orgs_capable', 'p_person uuid, p_capability text', array['uuid'::regtype::oid, 'text'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', '_review_skip_level_on', 'p_org uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_stages', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_row_facts', 'p_token text, p_id uuid', array['text'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_employee', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_employee_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_manager', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_manager_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_hr', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_hr_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_upper_in_org', 'p_person uuid, p_org uuid', array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_upper', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_upper_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_skip_level', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_skip_level_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_peers', 'p_review_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false),
  ('hr', 'review_seat_peers_set', 'p_person uuid', array['uuid'::regtype::oid],
   'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql (lane access-setup)',
   'ACCESS-SETUP §7: part of the standard review''s access setup; answers who sits where on a review and what stage it reached.',
   'server_only: called by the iam access-setup functions (iam.seats_of, iam.records_where_seated, iam.part_level) through the hr_review declaration; it names people and records, so no client calls it directly', false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
  set non_client_lane = excluded.non_client_lane, signed_in_callers = false, anonymous_callers = false,
      reason = excluded.reason, declared_by = excluded.declared_by;

-- ── the upper management HR role: reads every review in the organization, changes nothing ─────────
select hr.arm_write();   -- the hr write guard's statement-scoped token (SPEC-ACCESS law 2)
insert into hr.access_role (role_key, label, description, capabilities, default_scope_kind, is_builtin,
                            is_assignable, break_glass_allowed, is_active, organization_id)
select 'upper_management', 'Upper management',
       'Reads every performance review in the organization, calibration included; changes nothing.',
       array['performance.read_all'], 'org', true, true, false, true, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
 where not exists (select 1 from hr.access_role ar where ar.role_key = 'upper_management'
                     and ar.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and ar.deleted_at is null);

-- ── the declaration (validated by iam.access_setup_check in its insert trigger) ──────────────────
insert into iam.access_setup (entity_type, declared_by, setup) values ('hr_review',
  'migrations/campaign/accesssetup_c_the_standard_review_declares_its_setup.sql', $setup$
{
  "entity_type": "hr_review",
  "subject_seat": "employee",
  "admin_seats": ["hr"],
  "share_seat": "shared_with",
  "stages_fn": "hr.review_stages(uuid)",
  "rows_fn": "hr.review_row_facts(text,uuid)",
  "stages": ["started", "self_submitted", "manager_submitted", "both_submitted", "manager_may_see_self",
             "calibrated", "peer_shared", "shared", "acknowledged", "reopened", "cancelled"],
  "parts": [ {"key": "self_evaluation"}, {"key": "manager_evaluation"}, {"key": "peer_input"},
             {"key": "peer_nominations"}, {"key": "calibration"}, {"key": "final_summary"}, {"key": "discussion"} ],
  "attached_part": "discussion",
  "columns": {
    "overall_rating": "final_summary", "shared_at": "final_summary", "acknowledgment_comment": "final_summary",
    "calibrated_rating": "calibration", "calibration_note": "calibration", "calibrated_by": "calibration",
    "calibrated_at": "calibration",
    "reopen_history": {"part": "discussion", "min_level": "editor", "else_keep_keys": ["at", "reason"]}
  },
  "members": [
    {"token": "hr_review_response", "head_column": "review_id",
     "part_from": {"fact": "role", "map": {"self": "self_evaluation", "manager": "manager_evaluation", "peer": "peer_input"}}},
    {"token": "hr_review_peer_nomination", "head_column": "review_id", "part": "peer_nominations"}
  ],
  "seats": [
    {"key": "employee", "required": true,
     "resolver": {"kind": "function", "fn": "hr.review_seat_employee(uuid)", "set_fn": "hr.review_seat_employee_set(uuid)"}},
    {"key": "manager", "required": true, "fallback": "org_owners_admins",
     "resolver": {"kind": "function", "fn": "hr.review_seat_manager(uuid)", "set_fn": "hr.review_seat_manager_set(uuid)"}},
    {"key": "hr", "many": true, "required": true, "fallback": "org_owners_admins", "assignable_by": ["hr"],
     "resolver": {"kind": "function", "fn": "hr.review_seat_hr(uuid)", "set_fn": "hr.review_seat_hr_set(uuid)"}},
    {"key": "upper_management", "many": true, "assignable_by": ["hr"],
     "resolver": {"kind": "function", "fn": "hr.review_seat_upper(uuid)", "set_fn": "hr.review_seat_upper_set(uuid)"}},
    {"key": "skip_level",
     "resolver": {"kind": "function", "fn": "hr.review_seat_skip_level(uuid)", "set_fn": "hr.review_seat_skip_level_set(uuid)"}},
    {"key": "peer", "many": true, "assignable_by": ["employee", "manager"],
     "resolver": {"kind": "function", "fn": "hr.review_seat_peers(uuid)", "set_fn": "hr.review_seat_peers_set(uuid)"}},
    {"key": "shared_with", "many": true, "resolver": {"kind": "grants"}}
  ],
  "grid": {
    "employee": {
      "self_evaluation":    {"level": "editor", "rows": "all"},
      "manager_evaluation": {"level": "viewer", "from_stage": "shared", "rows": "all"},
      "peer_input":         {"level": "viewer", "from_stage": "peer_shared", "rows": "submitted",
                             "names": "knob:hr.performance/standard_review_peer_anonymous"},
      "peer_nominations":   {"level": "viewer", "rows": "all", "names": "shown"},
      "final_summary":      {"level": "viewer", "from_stage": ["shared", "acknowledged"]},
      "discussion":         {"level": "viewer", "from_stage": "shared"}
    },
    "manager": {
      "self_evaluation":    {"level": "viewer", "from_stage": "manager_may_see_self", "rows": "submitted"},
      "manager_evaluation": {"level": "editor", "rows": "all"},
      "peer_input":         {"level": "viewer", "rows": "submitted"},
      "peer_nominations":   {"level": "editor"},
      "final_summary":      {"level": "editor"},
      "discussion":         {"level": "editor"}
    },
    "hr": {
      "self_evaluation":    {"level": "viewer", "rows": "all"},
      "manager_evaluation": {"level": "viewer", "rows": "all"},
      "peer_input":         {"level": "viewer", "rows": "all"},
      "peer_nominations":   {"level": "viewer"},
      "calibration":        {"level": "editor"},
      "final_summary":      {"level": "viewer"},
      "discussion":         {"level": "editor"}
    },
    "skip_level": {
      "self_evaluation":    {"level": "viewer", "from_stage": "both_submitted", "rows": "submitted"},
      "manager_evaluation": {"level": "viewer", "from_stage": "both_submitted", "rows": "submitted"},
      "final_summary":      {"level": "viewer"},
      "discussion":         {"level": "viewer"}
    },
    "upper_management": {
      "self_evaluation":    {"level": "viewer", "rows": "all"},
      "manager_evaluation": {"level": "viewer", "rows": "all"},
      "peer_input":         {"level": "viewer", "rows": "all"},
      "peer_nominations":   {"level": "viewer"},
      "calibration":        {"level": "viewer"},
      "final_summary":      {"level": "viewer"},
      "discussion":         {"level": "viewer"}
    },
    "peer": {
      "peer_input":         {"level": "editor", "rows": "own"}
    },
    "shared_with": {
      "final_summary":      {"level": "viewer", "from_stage": "shared"}
    }
  },
  "actions": {
    "start":               {"seats": ["manager", "hr"]},
    "release_to_employee": {"seats": ["manager"], "stages": ["both_submitted"], "not_stages": ["shared", "acknowledged", "cancelled"]},
    "acknowledge":         {"seats": ["employee"], "stages": ["shared"], "not_stages": ["acknowledged", "cancelled"]},
    "set_overall":         {"seats": ["manager"], "not_stages": ["shared", "acknowledged", "cancelled"]},
    "calibrate":           {"seats": ["hr"], "not_stages": ["cancelled"]},
    "cancel":              {"seats": ["hr"], "not_stages": ["cancelled", "acknowledged"]},
    "reopen":              {"seats": ["manager", "hr"], "stages": ["shared", "acknowledged"], "not_stages": ["cancelled"]},
    "replace_manager":     {"seats": ["hr"], "not_stages": ["cancelled", "acknowledged", "shared"]},
    "peer_nominate":       {"seats": ["employee", "manager"], "when_fact": {"peers_enabled": true}, "not_stages": ["cancelled"]},
    "peer_approve":        {"seats": ["manager"], "not_stages": ["cancelled"]},
    "peer_share":          {"seats": ["manager"], "not_stages": ["cancelled"]}
  },
  "recorders": [
    {"for_seat": "employee", "when_fact": {"employee_has_login": false}, "lend_to": "admin_seats"},
    {"for_seat": "manager",  "when_fact": {"manager_has_login": false},  "lend_to": "admin_seats"}
  ],
  "blind_wins": { "self_evaluation": ["manager"] }
}
$setup$::jsonb);
