-- continued_access_06 — THE SEPARATION ACTUALLY ENDS THE MEMBERSHIP.
--
-- RECORD of a live change applied via the Supabase MCP on 2026-08-29.
--
-- 🚨 THE GAP THIS CLOSES. `continued_access_04` built the departed state and its doors, and
-- SPEC-EMPLOYEES §2.1 says in words that a terminated person's membership "moves to
-- status='departed'" and "every HR surface goes dark for them". Nothing connected the two:
-- `public.hr_separation_record` wrote `hr.separation`, flipped `hr.employment.status`, stamped the
-- retention clocks and returned `handoff_event = 'hr.separation_recorded'` -- and NOTHING consumed
-- that event. Measured live before this file: 466 memberships `active`, exactly 1 `departed`, and
-- that one was staged by hand during the continued-access build. Every person ever terminated
-- through the product still held every org-lane grant they had on their last day.
--
-- 🚨 ONE MECHANISM, THREE CALL SITES -- never three half-mechanisms. The whole decision lives in
-- `hr.sync_membership_to_employment`, which asks one question ("does this person have an
-- employment in this organization that is effective today?") and makes the membership agree.
-- It is called by the separation door (so the door can return a VERIFIED RESULT rather than an
-- event), by an AFTER INSERT trigger on `hr.employment` (so a REHIRE restores access the instant
-- spell 2 exists), and by an hourly sweep (so a FUTURE-DATED termination matures on its own date
-- and nothing depends on a human being logged in that morning).
--
-- 🚨 THE DATE RULE IS `hr.employee_directory_status`'s RULE, not a second opinion. hr_l1_63 ruled
-- that the status derives from DATES: `termination_date < as_of` is terminated, so the termination
-- date itself is still a working day. Access follows the same line -- which is exactly the
-- product promise "access gone the NEXT day" -- except under `hr.onboarding.access_shutoff_mode`
-- = 'immediate' (the shipped default), where the org has said it wants the grant gone the moment
-- the record is written. The other two modes ('end_of_day', 'scheduled') hand the person to the
-- sweep. That knob already existed and was read by nothing; it is an org's opinion and stays one.
--
-- 🚨 THE OWNER RAIL. An organization's `owner` membership is never departed, whatever HR records
-- about their employment: an org whose owner is locked out has no one who can turn the portal on,
-- restore the membership, or run the business. The refusal is LOUD -- a warning in the log, a
-- named result on the door -- never a silent skip.
--
-- Every function is CREATE OR REPLACE and every insert is guarded, so the file is idempotent.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The mechanism, split out of the door that used to own it.
--    `public.continued_access_depart` keeps its org-admin gate and now delegates. HR's separation
--    door cannot use that gate: an HR admin holding `working_record.write` is very often NOT an
--    org owner/admin, and inventing a second copy of the departure logic for them is how two
--    implementations of one rule start drifting.

create or replace function platform.continued_access_depart_apply(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_actor uuid,
  p_access_cutoff_at timestamptz default null,
  p_origin text default null,
  p_origin_id uuid default null,
  p_contact_email text default null,
  p_contact_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- END a membership and BEGIN the departed state, atomically. No caller authorization happens
-- here -- this is the mechanism, and every door above it does its own gating.
--
-- 🚨 THE GRANT REMOVAL IS THE STATUS FLIP. `iam.organization_member` -- the view behind
-- has_org_access_for / is_org_admin_for / my_orgs -- filters status='active'.
--
-- 🚨 AND THE SUB-CONTAINERS GO WITH IT, soft-deleted rather than status-flipped because every
-- existing reader already filters `deleted_at`. Their ids are RECORDED on the departure row, so a
-- return (a rehire) can put back exactly what this took away and nothing else.
declare v_mid uuid; v_role text; v_status text; v_id uuid; v_subs jsonb;
begin
  if p_organization_id is null or p_subject_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'field', case when p_organization_id is null then 'p_organization_id' else 'p_subject_user_id' end);
  end if;

  select m.id, m.role, m.status into v_mid, v_role, v_status
    from iam.memberships m
   where m.container_type = 'organization' and m.container_id = p_organization_id
     and m.user_id = p_subject_user_id and m.deleted_at is null;

  if v_mid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_membership',
      'detail', 'This person holds no organization membership here, so there is nothing to end.');
  end if;

  if v_role = 'owner' then
    raise warning 'continued_access: REFUSED to depart the OWNER of organization % (user %). An organization whose owner is locked out cannot restore anyone.',
      p_organization_id, p_subject_user_id;
    return jsonb_build_object('ok', false, 'reason', 'owner_not_departed', 'membership_id', v_mid,
      'detail', 'The owner of an organization is never departed automatically — an owner locked '
             || 'out of their own organization can no longer restore anybody, including themselves.');
  end if;

  update iam.memberships
     set status = 'departed', updated_at = now(), updated_by = p_actor
   where id = v_mid and status = 'active';

  with closed as (
    update iam.memberships m
       set deleted_at = now(), updated_at = now(), updated_by = p_actor
     where m.organization_id = p_organization_id
       and m.user_id = p_subject_user_id
       and m.container_type <> 'organization'
       and m.deleted_at is null
    returning m.id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_subs from closed;

  insert into platform.continued_access
    (organization_id, subject_user_id, membership_id, departed_at, access_cutoff_at,
     origin, origin_id, contact_email, contact_phone, created_by, updated_by, metadata)
  values
    (p_organization_id, p_subject_user_id, v_mid, now(), p_access_cutoff_at,
     p_origin, p_origin_id, p_contact_email, p_contact_phone, p_actor, p_actor,
     jsonb_build_object('closed_sub_membership_ids', v_subs))
  on conflict (organization_id, subject_user_id) where deleted_at is null
  do update set access_cutoff_at = excluded.access_cutoff_at,
                origin = coalesce(excluded.origin, platform.continued_access.origin),
                origin_id = coalesce(excluded.origin_id, platform.continued_access.origin_id),
                contact_email = coalesce(excluded.contact_email, platform.continued_access.contact_email),
                contact_phone = coalesce(excluded.contact_phone, platform.continued_access.contact_phone),
                metadata = platform.continued_access.metadata
                           || jsonb_build_object('closed_sub_membership_ids', v_subs),
                revoked_at = null, revoked_by = null, revoke_reason = null,
                updated_at = now(), updated_by = p_actor
  returning id into v_id;

  return jsonb_build_object('ok', true, 'continued_access_id', v_id, 'membership_id', v_mid,
    'sub_container_memberships_closed', jsonb_array_length(v_subs),
    -- READ BACK, never assumed: the spec asks for a verified RESULT, not an event.
    'membership_status', (select m.status from iam.memberships m where m.id = v_mid),
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$fn$;

comment on function platform.continued_access_depart_apply(uuid,uuid,uuid,timestamptz,text,uuid,text,text) is
  'The departure MECHANISM: flip the org membership to departed, soft-delete the sub-container memberships and record their ids, write the platform.continued_access row. Ungated on purpose — every door above it gates its own caller. Never departs an owner.';

-- The client-callable door keeps its gate and stops carrying a second copy of the logic.
create or replace function public.continued_access_depart(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_access_cutoff_at timestamptz default null,
  p_origin text default null,
  p_origin_id uuid default null,
  p_contact_email text default null,
  p_contact_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;
  if not (public.is_org_admin_for(v_uid, p_organization_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Only an owner or admin of this organization can end a membership.');
  end if;
  return platform.continued_access_depart_apply(p_organization_id, p_subject_user_id, v_uid,
    p_access_cutoff_at, p_origin, p_origin_id, p_contact_email, p_contact_phone);
end
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The return. A rehire is not an undo — but it must give back exactly what departure took.

create or replace function platform.continued_access_return_apply(
  p_organization_id uuid,
  p_subject_user_id uuid,
  p_actor uuid,
  p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, platform, iam, pg_temp
as $fn$
-- The person is a member again. Restore the org membership, restore the sub-container
-- memberships THIS feature closed (by their recorded ids — never every soft-deleted row, which
-- would resurrect memberships someone removed on purpose), and close the departure record.
declare v_mid uuid; v_row platform.continued_access%rowtype; v_ids uuid[]; v_back int := 0;
begin
  select m.id into v_mid from iam.memberships m
   where m.container_type = 'organization' and m.container_id = p_organization_id
     and m.user_id = p_subject_user_id and m.deleted_at is null;
  if v_mid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_membership');
  end if;

  update iam.memberships
     set status = 'active', updated_at = now(), updated_by = p_actor
   where id = v_mid and status = 'departed';

  select * into v_row from platform.continued_access c
   where c.organization_id = p_organization_id and c.subject_user_id = p_subject_user_id
     and c.deleted_at is null;

  if found then
    select array_agg((e ->> 0)::uuid) into v_ids
      from jsonb_array_elements_text(coalesce(v_row.metadata -> 'closed_sub_membership_ids', '[]'::jsonb)) e;
    if v_ids is not null then
      with back as (
        update iam.memberships m set deleted_at = null, updated_at = now(), updated_by = p_actor
         where m.id = any(v_ids) and m.deleted_at is not null
        returning 1)
      select count(*) into v_back from back;
    end if;

    update platform.continued_access
       set deleted_at = now(), updated_at = now(), updated_by = p_actor,
           metadata = metadata || jsonb_build_object('returned_at', now(),
                                                     'returned_reason', coalesce(p_reason, 'membership restored'))
     where id = v_row.id;
  end if;

  return jsonb_build_object('ok', true, 'membership_id', v_mid,
    'sub_container_memberships_restored', v_back,
    'membership_status', (select m.status from iam.memberships m where m.id = v_mid),
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$fn$;

comment on function platform.continued_access_return_apply(uuid,uuid,uuid,text) is
  'The inverse of continued_access_depart_apply: the person is a member again (a rehire, or a rescinded termination). Restores the org membership and exactly the sub-container memberships the departure closed, then closes the departure record.';

revoke execute on function platform.continued_access_depart_apply(uuid,uuid,uuid,timestamptz,text,uuid,text,text) from public;
revoke execute on function platform.continued_access_return_apply(uuid,uuid,uuid,text) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HR's one decision: make the membership agree with the employment record.

create or replace function hr.sync_membership_to_employment(
  p_employee_id uuid,
  p_actor uuid default null,
  p_origin_id uuid default null,
  p_force_immediate boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public, hr, platform, iam, pg_temp
as $fn$
-- ONE question, asked the same way everywhere: does this person hold an employment in this
-- organization that is effective TODAY? If yes their membership must be active; if no — and they
-- have actually left, rather than simply not started — it must be departed.
--
-- 🚨 EMPLOYER-SCOPED BY CONSTRUCTION. Every spell considered is the ones inside this
-- organization, so a person who leaves employer A but still works for employer B in the SAME
-- organization keeps their membership. Nothing here touches any other organization, and a
-- personal org is never in scope: `hr.employee.organization_id` is the employer's.
declare
  v_org uuid; v_user uuid; v_mode text; v_immediate boolean;
  v_effective boolean; v_ever_left boolean; v_status text; v_email text; v_phone text;
begin
  select e.organization_id, e.login_user_id into v_org, v_user
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  if v_user is null then
    -- Not a defect: most employee records have no platform login at all. Say so out loud rather
    -- than reporting a shutoff that never happened.
    return jsonb_build_object('ok', true, 'shutoff', 'no_login',
      'detail', 'This person has no platform login, so there is no membership to end.');
  end if;

  v_mode := coalesce(platform.knob_resolve('hr.onboarding','access_shutoff_mode', v_org, null, null) #>> '{}',
                     'immediate');
  v_immediate := coalesce(p_force_immediate, v_mode = 'immediate');

  -- The date rule of hr.employee_directory_status (hr_l1_63), with the one knob-driven variation:
  -- 'immediate' ends access ON the termination date; the deferred modes leave it until the day
  -- after, which the hourly sweep picks up.
  select exists (
    select 1 from hr.employment em
     where em.employee_id = p_employee_id and em.deleted_at is null
       and em.hire_date <= current_date
       and (em.termination_date is null
            or (case when v_immediate then em.termination_date > current_date
                                      else em.termination_date >= current_date end))
       and not (em.status = 'terminated' and em.termination_date is null)),
    exists (
    select 1 from hr.employment em
     where em.employee_id = p_employee_id and em.deleted_at is null
       and (em.termination_date is not null or em.status = 'terminated'))
  into v_effective, v_ever_left;

  select m.status into v_status from iam.memberships m
   where m.container_type = 'organization' and m.container_id = v_org
     and m.user_id = v_user and m.deleted_at is null;

  if v_status is null then
    return jsonb_build_object('ok', true, 'shutoff', 'no_membership',
      'detail', 'This person has a login but no membership in the employer organization.');
  end if;

  if v_effective and v_status = 'departed' then
    return jsonb_build_object('ok', true, 'action', 'restored', 'mode', v_mode,
      'result', platform.continued_access_return_apply(v_org, v_user, p_actor,
                  'an effective employment spell exists again'));
  end if;

  if (not v_effective) and v_ever_left and v_status = 'active' then
    select ep.personal_email, ep.personal_phone into v_email, v_phone
      from hr.employee_private ep where ep.employee_id = p_employee_id;
    return jsonb_build_object('ok', true, 'action', 'departed', 'mode', v_mode,
      'result', platform.continued_access_depart_apply(v_org, v_user, p_actor,
                  null, 'hr.separation', p_origin_id, v_email, v_phone));
  end if;

  return jsonb_build_object('ok', true, 'action', 'none', 'mode', v_mode,
    'membership_status', v_status, 'has_effective_spell', v_effective);
end
$fn$;

comment on function hr.sync_membership_to_employment(uuid,uuid,uuid,boolean) is
  'Makes the platform membership agree with the employment record: departed when no spell is effective today and the person has left, active again when a spell is effective (a rehire). The one place that decision is made; called by hr_separation_record, by the hr.employment insert trigger, and by the hourly sweep.';

revoke execute on function hr.sync_membership_to_employment(uuid,uuid,uuid,boolean) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Call site A — the separation door returns a VERIFIED RESULT, not an event.

create or replace function public.hr_separation_record(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_sep uuid; v_last date; v_term date; v_employee uuid;
  v_shutoff jsonb;
begin
  select em.organization_id, em.employee_id into v_org, v_employee from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment, 'hr_separation',
                              'update', 'separation');
  if v_gate is not null then return v_gate; end if;

  v_last := nullif(p_payload ->> 'last_day_worked','')::date;
  v_term := nullif(p_payload ->> 'termination_date','')::date;
  if v_last is null or v_term is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'detail', 'Last day worked and termination date are different fields and both are required '
             || '— benefits and final pay key on different ones.');
  end if;
  if v_term < v_last then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'termination_date',
      'detail', 'The termination date cannot be before the last day worked.');
  end if;

  perform hr.arm_write();

  insert into hr.separation (
    employment_id, separation_category, reason_category_id, initiator,
    initiated_by_employment_id, notice_given_on, last_day_worked, termination_date,
    rehire_eligible, rehire_eligible_note, is_deceased, beneficiary_contact, layoff_batch_id,
    corrective_action_id, organization_id)
  values (
    v_employment, p_payload ->> 'separation_category',
    (p_payload ->> 'reason_category_id')::uuid,
    coalesce(nullif(p_payload ->> 'initiator',''), 'employer'),
    nullif(p_payload ->> 'initiated_by_employment_id','')::uuid,
    nullif(p_payload ->> 'notice_given_on','')::date, v_last, v_term,
    -- nullable ON PURPOSE: "not decided" is a real answer and the rehire flow surfaces it as such
    nullif(p_payload ->> 'rehire_eligible','')::boolean,
    nullif(p_payload ->> 'rehire_eligible_note',''),
    coalesce((p_payload ->> 'is_deceased')::boolean, false),
    coalesce(p_payload -> 'beneficiary_contact', '{}'::jsonb),
    nullif(p_payload ->> 'layoff_batch_id','')::uuid,
    nullif(p_payload ->> 'corrective_action_id','')::uuid,
    v_org)
  returning id into v_sep;

  update hr.employment set
    status = case when v_term > current_date then status else 'terminated' end,
    scheduled_last_day = v_last,
    last_day_worked = case when v_last <= current_date then v_last else last_day_worked end,
    termination_date = v_term,
    separation_id = v_sep
  where id = v_employment;

  -- retention clocks start at the separation (§4.5 N); the sweep itself is the governance lane's
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = 'stamp_retention_triggers') then
    perform hr.stamp_retention_triggers(v_employment);
  end if;

  -- 🚨 ACCESS SHUTOFF IS A RESULT, NOT AN EVENT (§4.5 L1). The door returns what actually
  -- happened to the membership — including "nothing yet, this termination is in the future" and
  -- "this person has no login" — because `handoff_event` alone is what left every terminated
  -- person holding their grants until continued_access_06.
  v_shutoff := hr.sync_membership_to_employment(v_employee, v_uid, v_sep);

  return jsonb_build_object('ok', true, 'separation_id', v_sep, 'employment_id', v_employment,
    'employee_id', v_employee,
    'is_future_dated', v_term > current_date,
    'handoff_event', 'hr.separation_recorded',
    'access_shutoff', v_shutoff,
    'audit_id', hr._l1_write_audit(v_org, 'hr_separation', 'update', ARRAY[v_sep], v_employment,
                                   'separation', 'confidential'));
end
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Call site B — a new spell restores access the moment it exists.
--    A trigger rather than an edit to hr_employee_create, because a rehire is a new employment
--    row however it was written, and the rule should not depend on which door wrote it.

create or replace function hr._employment_membership_sync_tg()
returns trigger
language plpgsql
security definer
set search_path = public, hr, platform, iam, pg_temp
as $fn$
begin
  perform hr.sync_membership_to_employment(new.employee_id, new.created_by, null);
  return null;
end
$fn$;

drop trigger if exists employment_membership_sync on hr.employment;
create trigger employment_membership_sync
  after insert on hr.employment
  for each row execute function hr._employment_membership_sync_tg();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Call site C — the sweep, so a date can arrive without a human being present.

create or replace function hr.membership_access_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public, hr, platform, iam, pg_temp
as $fn$
-- Departures whose date has now arrived, and returns whose spell has now started. Narrow by
-- design: it only looks at people who hold a login AND a membership in their employer, and it
-- calls the same decision function every other path calls.
declare r record; v_departed int := 0; v_restored int := 0; v_res jsonb;
begin
  for r in
    select distinct e.id as employee_id
      from hr.employee e
      join iam.memberships m
        on m.container_type = 'organization' and m.container_id = e.organization_id
       and m.user_id = e.login_user_id and m.deleted_at is null
     where e.deleted_at is null and e.login_user_id is not null
       and exists (select 1 from hr.employment em
                    where em.employee_id = e.id and em.deleted_at is null)
  loop
    v_res := hr.sync_membership_to_employment(r.employee_id, null, null);
    if v_res ->> 'action' = 'departed' then v_departed := v_departed + 1; end if;
    if v_res ->> 'action' = 'restored' then v_restored := v_restored + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'departed', v_departed, 'restored', v_restored,
                            'ran_at', now());
end
$fn$;

revoke execute on function hr.membership_access_sweep() from public;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('hr-membership-access-sweep')
      where exists (select 1 from cron.job where jobname = 'hr-membership-access-sweep');
    perform cron.schedule('hr-membership-access-sweep', '12 * * * *',
                          'select hr.membership_access_sweep();');
  end if;
end
$cron$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Contract pins. The separation door losing its shutoff call again must be a failing check,
--    not a discovery three rounds later.

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select v.schema_name, v.function_name, v.home_migration, v.must_contain, v.must_not_contain,
       v.reason, v.must_be_definer
from (values
 ('public','hr_separation_record','continued_access_06_the_separation_ends_the_membership.sql',
  array['sync_membership_to_employment','access_shutoff'], array[]::text[],
  'SPEC-EMPLOYEES §2.1/§4.5: a terminated person''s membership moves to departed and access '
  || 'shutoff is a VERIFIED RESULT, never event-fired-equals-done. Before continued_access_06 this '
  || 'door emitted hr.separation_recorded and nothing consumed it, so every person terminated '
  || 'through the product kept every org-lane grant they had.', true),
 ('hr','sync_membership_to_employment','continued_access_06_the_separation_ends_the_membership.sql',
  array['continued_access_depart_apply','continued_access_return_apply'], array[]::text[],
  'The one place the membership/employment agreement is decided. If it stops calling either half '
  || 'of the mechanism, a termination stops ending access or a rehire stops restoring it.', true)
) as v(schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
where not exists (
  select 1 from hr.function_contract c
   where c.schema_name = v.schema_name and c.function_name = v.function_name
     and c.home_migration = v.home_migration);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Self-verification. A migration that cannot fail is not a check.
do $chk$
declare
  v_src text;
  v_broken int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_separation_record';
  if v_src is null or position('sync_membership_to_employment' in v_src) = 0 then
    raise exception 'continued_access_06: the separation door does not call the shutoff';
  end if;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'hr' and c.relname = 'employment'
                   and t.tgname = 'employment_membership_sync' and not t.tgisinternal) then
    raise exception 'continued_access_06: the rehire restore trigger is missing';
  end if;

  if not exists (select 1 from cron.job where jobname = 'hr-membership-access-sweep' and active) then
    raise exception 'continued_access_06: the hourly sweep is not scheduled';
  end if;

  -- The two internal helpers must not be reachable by a client.
  if exists (select 1 from information_schema.routine_privileges
              where specific_schema = 'platform'
                and routine_name in ('continued_access_depart_apply','continued_access_return_apply')
                and grantee in ('authenticated','anon','PUBLIC')) then
    raise exception 'continued_access_06: an internal departure helper is client-callable';
  end if;

  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_separation_record' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'continued_access_06: authenticated lost EXECUTE on the separation door';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken()
   where qname in ('public.hr_separation_record','hr.sync_membership_to_employment');
  if v_broken > 0 then
    raise exception 'continued_access_06: % contract clause(s) broken: %', v_broken,
      (select string_agg(clause || ' ' || missing_or_present, '; ')
         from hr.function_contracts_broken()
        where qname in ('public.hr_separation_record','hr.sync_membership_to_employment'));
  end if;

  raise notice 'continued_access_06: separation ends the membership; rehire restores it; sweep armed';
end
$chk$;
