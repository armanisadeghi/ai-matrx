-- dd199_role_helpers_refuse_non_members — NO ROLE HELPER LETS A STRANGER PAST A NULL
-- (DD-199. SECURITY P0. db-rules §0/§6d/§9. Functions only: no DDL on tables, no policies.)
--
-- ═══ THE DEFECT, MEASURED LIVE 2026-09-13 ══════════════════════════════════════════════════════
-- `hr._l1_org_role(p_user, p_org)` is the HR module's membership-role helper: a plain
-- `select m.role from iam.memberships …`, which for a NON-MEMBER returns NULL. Two of its
-- fourteen callers decided privilege from that NULL with a bare `in` / `not in`:
--
--   public.hr_module_set_enabled:  v_role := hr._l1_org_role(...);  if v_role not in ('owner','admin') then ...
--   public.hr_knob_index:          if not (hr.capability(...) or hr._l1_org_role(...) in ('owner','admin')) then ...
--
-- `NULL not in (…)` is NULL, `not (false or NULL)` is NULL, the `if` never fires, and the refusal
-- is dead code for exactly the population it exists to stop. Both proven live as `test@test.com`
-- (4060701e-706a-4c76-b3ca-0bbc69fa5a14), a member of NEITHER victim organization:
--
--   public.hr_module_set_enabled('5dc930e9-… AI Matrx', true)  → {"ok": true, "module_enabled": true}
--                                    — a stranger switched another organization's HR module ON
--                                    (proved in a rolled-back transaction; 0 rows persisted)
--   POST /rest/v1/rpc/hr_knob_index {"p_organization_id":"5dc930e9-…"}  → HTTP 200, the full knob
--                                    index of an organization this caller does not belong to,
--                                    from a door whose own sentence says "settings are HR-admin only"
--
-- This is the DD-191 class, one helper family over. B-85 closed it for `iam._container_authz`
-- (a strict helper that raises 42501 first, every caller's comparison coalesce-wrapped, guard D8).
-- V-54 found this family still open. DD-199 closes it the same way, and generalises the guard.
--
-- ═══ THE FIX ═══════════════════════════════════════════════════════════════════════════════════
-- 1. `hr._l1_org_role` gains `p_require_role boolean default true` and becomes plpgsql. With the
--    default it RAISES 42501 — "You are not a member of this organization, so you can't manage it.
--    Ask one of its owners or admins." — before the caller can compare anything. `service_role` is
--    exempt, exactly as `iam._container_authz` exempts it.
-- 2. Callers that legitimately need to SEE absence — visibility predicates, worded refusals of
--    their own, audit-recording denials, viewer classification — pass `p_require_role => false`
--    EXPLICITLY. They are listed in the DD-199 report with the reason for each.
-- 3. Every comparison of a role that a NULL can reach is coalesce-wrapped, in every caller, in
--    both families: the `hr._l1_org_role` callers AND the functions that read a role out of
--    `iam.memberships` / the `iam.organization_member` view with `select … role into …`
--    (`iam.emergency_door_approve`/`_deny`, `public.auth_is_org_admin`/`_owner`, `mbr_remove`,
--    `mbr_update_role`, `org_admin_remove_member`). Belt and braces: the guard is an ABSOLUTE.
-- 4. `public.auth_is_org_admin` / `public.auth_is_org_owner` returned NULL (not false) for a
--    non-member — a boolean predicate that a `not (...)` caller walks straight through. They now
--    return a real boolean. They have zero consumers today; the leak was waiting for the first one.
--
-- WHY THE TWO LEAKING DOORS TEST CAPABILITY AND ROLE IN SEQUENCE, NEVER IN ONE `OR`:
-- Postgres does not guarantee short-circuit evaluation of `OR`. A strict role call placed inside
-- `hr.capability(...) or hr._l1_org_role(...) in (...)` could raise for a capability-holding
-- NON-MEMBER — an HR admin whose standing comes from an employment, not a membership. So the
-- capability is tested first, alone, and only a caller without it reaches the strict role call.
--
-- ═══ WHAT IS DELIBERATELY UNCHANGED ════════════════════════════════════════════════════════════
-- `hr.capability` and every path through it. Every worded refusal already in these doors. Every
-- grant (CREATE OR REPLACE preserves them; the one dropped function is re-granted below).

-- ── 1. THE HELPER ──────────────────────────────────────────────────────────────────────────────
-- Dropped and recreated because the signature gains a parameter; nothing depends on it (no view,
-- no policy, no SQL-language function references it), and its ACL + owner are restored below.
drop function if exists hr._l1_org_role(uuid, uuid);

create function hr._l1_org_role(
  p_user uuid,
  p_org uuid,
  p_require_role boolean default true
) returns text
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $dd199$
declare
  v_role    text;
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  select m.role
    into v_role
    from iam.memberships m
   where m.user_id = p_user
     and m.organization_id = p_org
     and m.container_type = 'organization'
     and m.deleted_at is null
     and coalesce(m.status, 'active') = 'active'
   order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
   limit 1;

  -- DD-199. THE REFUSAL IS HERE, not in the caller. A caller that decides privilege from this
  -- value can no longer receive a NULL and compare it to a list.
  if v_role is null and p_require_role and not v_service then
    raise exception
      'You are not a member of this organization, so you can''t manage it. Ask one of its owners or admins.'
      using errcode = '42501';
  end if;

  return v_role;
end;
$dd199$;

alter function hr._l1_org_role(uuid, uuid, boolean) owner to postgres;
revoke all on function hr._l1_org_role(uuid, uuid, boolean) from public;
revoke all on function hr._l1_org_role(uuid, uuid, boolean) from anon;
revoke all on function hr._l1_org_role(uuid, uuid, boolean) from authenticated;
grant execute on function hr._l1_org_role(uuid, uuid, boolean) to postgres;
grant execute on function hr._l1_org_role(uuid, uuid, boolean) to service_role;

comment on function hr._l1_org_role(uuid, uuid, boolean) is
  'The HR module''s organization-membership role for a (user, organization) pair. DD-199: with '
  'p_require_role (the DEFAULT) a user holding NO active organization membership is refused here '
  'with 42501 and a human sentence — before any caller can compare a NULL role and fall through '
  'its own guard. Pass p_require_role => false only where absence is a legitimate answer '
  '(visibility predicates, a caller''s own worded refusal, viewer classification, audit-recording '
  'denials); service_role is exempt.';

-- ── 2. THE CALLERS ─────────────────────────────────────────────────────────────────────────────
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
  if hr.capability(v_uid, 'identity.write', null, current_date, p_org)
     or coalesce(hr._l1_org_role(v_uid, p_org, false) in ('owner','admin'), false) then
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
$function$;


CREATE OR REPLACE FUNCTION hr._l1_viewer(p_user uuid, p_employee_id uuid, p_at date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_org uuid; v_login uuid; v_emp uuid; v_kind text; v_org_role text;
begin
  select e.organization_id, e.login_user_id into v_org, v_login
    from hr.employee e where e.id = p_employee_id and e.deleted_at is null;
  if v_org is null then return null; end if;

  -- 🚨 THE TENANT GUARD BINDS WITHOUT AN EMPLOYMENT. v_emp is NULL for a prehire and for a
  -- terminated ex-employee, so every capability question below passes v_org EXPLICITLY.
  -- hr.capability gates both of its tenant predicates on its
  -- arguments, so a NULL subject with an unpassed org makes them vacuously true and asks
  -- only "does this user hold the capability ANYWHERE" — which let any org's HR admin read
  -- any other org's not-yet-started hires (P0, hr_l1_59). Do not drop the fifth argument.
  v_emp := hr.subject_employment_as_of(p_employee_id, p_at, v_org);
  -- 🚨 AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP. Handing NULL to hr.capability does
  -- not just unbind the tenant (hr_l1_59) — it skips the population check outright, so a
  -- DEPARTMENT- or LOCATION-scoped admin reached every prehire and every ex-employee in
  -- the org, including people who were never theirs. Nobody is employed TODAY here, but
  -- the record still says WHICH JOB: the earliest FUTURE spell is the one a prehire is
  -- about to start, the latest PAST spell is the one an ex-employee last held. Resolving
  -- it gives hr.capability a real subject to scope against instead of a blank cheque.
  -- 🚨 THE FALLBACK ITSELF NOW LIVES IN hr.subject_employment_as_of (hr_l1_64), because it
  -- was inlined HERE and nowhere else — which is why ten write doors kept handing
  -- hr.capability a NULL subject and skipping population_contains entirely for months
  -- after hr_l1_61 "closed" it. One rule, one implementation, every door.
  v_org_role := hr._l1_org_role(p_user, v_org, false);

  if v_login is not null and v_login = p_user then
    v_kind := 'self';
  -- 🚨 AN UNRESOLVABLE SUBJECT REFUSES, IT DOES NOT FALL THROUGH (hr_l1_64, latent (a)).
  elsif v_emp is not null
        and (hr.capability(p_user, 'identity.read', v_emp, p_at, v_org)
             or hr.capability(p_user, 'working_record.write', v_emp, p_at, v_org)) then
    v_kind := 'hr_admin';
  elsif hr._l1_is_manager_of(p_user, v_emp, p_at) then
    v_kind := 'manager';
  elsif coalesce(v_org_role, 'none') in ('owner','admin') then
    -- SPEC-ACCESS §9 / EXECUTION §6 item 4, stated so nobody "fixes" it later: an org
    -- owner/admin CAN read the working employee record (directory + jobs). Never comp,
    -- never medical, never relations.
    v_kind := 'org_admin';
  elsif (v_emp is not null and hr.capability(p_user, 'directory.read', v_emp, p_at, v_org))
        or v_org_role is not null then
    v_kind := 'peer';
  else
    v_kind := 'none';
  end if;

  return jsonb_build_object(
    'kind', v_kind, 'organization_id', v_org, 'subject_employment_id', v_emp,
    'subject_login_user_id', v_login,
    'caps', to_jsonb(hr._l1_capabilities(p_user, v_org, p_at)));
end
$function$;


CREATE OR REPLACE FUNCTION hr.employee_by_party(p_organization_id uuid, p_party_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_shows_hire boolean; v_shows_mgr boolean; v_name text;
  r record;
begin
  if v_uid is null then
    raise exception 'hr_employee_by_party: no authenticated caller' using errcode = '42501';
  end if;

  -- decision 6: hr_directory_list's own standing test — org membership OR an employment here
  if hr._l1_org_role(v_uid, p_organization_id, false) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id
                        and e.login_user_id = v_uid and e.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'no_standing',
      'detail', 'You have no standing in this employer.');
  end if;

  v_shows_hire := coalesce((hr._knob('hr.employees','directory_shows_hire_date') #>> '{}')::boolean, false);
  v_shows_mgr  := coalesce((hr._knob('hr.employees','directory_shows_manager')  #>> '{}')::boolean, false);
  select e.id, e.employee_number, e.display_name,
         hr.employee_directory_status(e.id, current_date) as directory_status,
         e.directory_opt_out, e.login_user_id,
         jt.title as job_title, d.name as department,
         e.current_manager_employee_id as manager_employee_id,
         hr._employee_display_name(mgr.id, v_uid) as manager_name,
         em.hire_date
    into r
    from hr.employee e
    left join hr.job_title  jt on jt.id = e.current_job_title_id
    left join hr.department d  on d.id  = e.current_department_id
    left join hr.employee   mgr on mgr.id = e.current_manager_employee_id
    left join hr.employment em on em.id = e.current_employment_id and em.deleted_at is null
   where e.organization_id = p_organization_id
     and e.party_id = p_party_id
     and e.deleted_at is null
   limit 1;

  -- Not an employee here — a true answer, not a refusal. Directory opt-out suppresses the row for
  -- peers exactly as it does in the directory, so an opted-out employee reads the same way to a
  -- peer as somebody who was never an employee. That is the directory's own posture, not a new one.
  v_name := hr._employee_display_name(r.id, v_uid);
  if r.id is null or v_name is null then
    return jsonb_build_object('granted', true,
      'employee_id', null, 'employee_number', null, 'display_name', null,
      'directory_status', null,
      'job_title', null, 'department', null,
      'manager_employee_id', null, 'manager_name', null, 'hire_date', null);
  end if;

  -- decision 4: directory tier only. Nothing confidential may reach a CRM surface.
  return jsonb_build_object('granted', true,
    'employee_id',         r.id,
    -- directory tier: the same identifier the directory card and the profile
    -- header already show to anyone who can see this person at all.
    'employee_number',      r.employee_number,
    'display_name',        v_name,
    'directory_status',    r.directory_status,
    'job_title',           r.job_title,
    'department',          r.department,
    'manager_employee_id', case when v_shows_mgr  then r.manager_employee_id end,
    'manager_name',        case when v_shows_mgr  then r.manager_name end,
    'hire_date',           case when v_shows_hire then r.hire_date end);
end
$function$;


CREATE OR REPLACE FUNCTION hr.member_employee_links(p_organization_id uuid, p_user_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_today date := current_date;
  v_role text; v_is_hr boolean; v_can_link boolean; v_links jsonb;
begin
  if v_uid is null then
    raise exception 'hr_member_employee_links: no authenticated caller' using errcode = '42501';
  end if;

  -- org-admin gated: this draws a seam across the whole member list, which is an administrative
  -- view of who is who. A plain employee has no business enumerating it.
  v_role  := hr._l1_org_role(v_uid, p_organization_id, false);
  v_is_hr := hr._punch_capability(v_uid, 'identity.write',       null, v_today, p_organization_id)
          or hr._punch_capability(v_uid, 'working_record.write', null, v_today, p_organization_id);

  if coalesce(v_role, '') not in ('owner','admin') and not v_is_hr then
    return jsonb_build_object('granted', false, 'reason', 'no_standing',
      'detail', 'Only an organization owner, admin, or HR can see the employee seam.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id',              u.uid,
           'employee_id',          e.id,
           'display_name',         e.display_name,
           -- derived, never stored (D4); null when this member is not an employee here
           'directory_status',     hr.employee_directory_status(e.id, v_today),
           -- 🚨 THE SECOND RECORD IS REPORTED, NOT HIDDEN (hr_l1_70). See the lateral below:
           -- this list answers ONE row per member, so where a login carries more than one
           -- employee record only one can be named. Saying nothing about the others would
           -- trade a visible duplicate for an invisible omission, which is worse on an
           -- administrative seam whose entire job is who-is-who. This is the true count of
           -- live employee records on that login in this employer — 1 for everyone, 2 for
           -- the one member who has it.
           'linked_employee_count', coalesce(e.linked_count, 0),
           -- decision 5: no store exists for this decision; it is false for everyone until a
           -- writer ships. It is NOT inferred from a missing or soft-deleted employee row.
           'marked_not_employee',  false)
         order by u.ord), '[]'::jsonb)
    into v_links
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality as u(uid, ord)
    -- 🚨 ONE LINK PER MEMBER — AND THIS ONE WAS WRONG IN PRODUCTION (hr_l1_70).
    -- As an ordinary equi-join from the requested user id to the employee's login (the old
    -- expression is NOT quoted here — this function's contract bans that text, and a pin cannot
    -- tell a call from a comment), a login carrying
    -- two un-archived employee rows in this employer put TWO objects into `links` for ONE
    -- requested `user_id`. Measured live in org 2643e470…: the same member came back once as
    -- "G2V-Priya Raman" / active and once as "Zzz Linkprobe" / prehire, so the seam
    -- contradicted itself and a caller keyed on `user_id` kept whichever arrived last.
    -- LATERAL … LIMIT 1 makes one-row-per-member structural. Unlike a byline, the row picked
    -- here IS the answer, so the preference is stated: an employee who actually holds an
    -- employment outranks one who does not, then the oldest record, then id. `count(*) over ()`
    -- is evaluated over the full match set BEFORE the limit, so the count stays honest.
    left join lateral (
      select x.id, x.display_name, (count(*) over ())::int as linked_count
        from hr.employee x
       where x.login_user_id = u.uid
         and x.organization_id = p_organization_id
         and x.deleted_at is null
       order by (x.current_employment_id is not null) desc, x.created_at, x.id
       limit 1) e on true;

  -- creating an employee is an HR write, not a membership power
  v_can_link := hr._punch_capability(v_uid, 'identity.write', null, v_today, p_organization_id);

  return jsonb_build_object('granted', true, 'links', v_links, 'can_link', coalesce(v_can_link, false));
end
$function$;


CREATE OR REPLACE FUNCTION hr.resolve_rules_display(p_organization_id uuid, p_jurisdiction_key text, p_as_of date, p_classes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_resolve_rules: no authenticated caller' using errcode = '42501';
  end if;

  -- the directory's own standing test: a member of the org, or an employee of it
  if hr._l1_org_role(v_uid, p_organization_id, false) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id
                        and e.login_user_id = v_uid and e.deleted_at is null) then
    raise exception 'hr_resolve_rules: no standing in this employer' using errcode = '42501';
  end if;

  if p_as_of is null then
    raise exception 'as_of_required' using errcode = '22004',
      hint = 'SPEC-JURISDICTION 2.2 / 7.5: pass the WORK or EVENT date the card is describing. Never now().';
  end if;
  if p_jurisdiction_key is null then
    raise exception 'jurisdiction_key_required' using errcode = '22004',
      hint = 'This display door resolves for a PLACE and a DATE, never for a person (decision 2).';
  end if;

  -- no subject: the engine's own no-subject path, which is why decision 2 holds
  return hr.resolve_rules(null::text, null::uuid, p_as_of, p_classes,
                          '{}'::jsonb, p_organization_id, p_jurisdiction_key);
end
$function$;


CREATE OR REPLACE FUNCTION iam.emergency_door_approve(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  q iam.emergency_door_request%rowtype;
  v_t record; v_class text; v_entity_schema text; v_entity_table text;
  v_requester_role text; v_approver_role text;
  v_ttl integer; v_perm uuid; v_audit uuid; v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'emergency_door_approve: no authenticated caller' using errcode = '42501';
  end if;

  -- The lock is the claim. A second decider waits, then observes the completed status and emits
  -- no second permission/audit/notification.
  select * into q
    from iam.emergency_door_request
   where id = p_request_id
   for update;
  if not found then
    raise exception 'emergency_door_approve: no request %', p_request_id using errcode = 'P0002';
  end if;

  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;

  -- An elapsed request is no longer pending work. It transitions once under the claim, without
  -- creating a grant, an access audit, or a subject notification for an obsolete request.
  if q.request_expires_at <= now() then
    update iam.emergency_door_request
       set status = 'expired', updated_at = now()
     where id = q.id and status = 'pending';
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.');
  end if;

  -- Hold the entity-type row before resolving class/table. Reclassification or a table remap now
  -- waits until this decision commits.
  select et.schema_name, et.table_name into v_entity_schema, v_entity_table
    from platform.entity_types et
   where et.token = q.target_token
   for share;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a registered record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- `_door_target_lock` locks the actual row using the entity mapping now held above. Resolve the
  -- canonical facts only AFTER the row lock: a concurrent update before the lock is observed, and
  -- one after it waits for this transaction.
  if not iam._door_target_lock(q.target_token, q.target_id) then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;
  v_class := iam.emergency_door_class(q.target_token);
  select * into v_t from iam._door_target(q.target_token, q.target_id);
  if v_t.o_org is null
     or v_t.o_org is distinct from q.organization_id
     or v_t.o_subject is distinct from q.subject_user_id
     or v_class is distinct from q.data_class
     or v_class is distinct from 'private' then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches the current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- The eventual grantee must still be a current organization admin/owner — the same standing
  -- that was required to ask for the private door in the first place. FOR SHARE prevents removal
  -- or a role change between this decision and the grant.
  select om.role into v_requester_role
    from iam.organization_member om
   where om.user_id = q.requested_by and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_requester_role::text, 'none') not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency grant, so it cannot be approved.');
  end if;

  select om.role into v_approver_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;

  if not found or coalesce(v_approver_role::text, 'none') <> 'owner' then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'only an organization OWNER can approve a private-class emergency request', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose, 'note', 'the approver was not an organization owner',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can approve emergency access to private data.',
      'audit_id', v_audit);
  end if;

  if q.requested_by = v_uid then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'the person who asked cannot also be the person who approves', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose,
                         'note', 'the person who asked tried to approve their own request',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'same_person',
      'message', 'You asked for this access, so you cannot also approve it. Another owner has to.',
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (q.target_token, q.target_id, q.requested_by, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set permission_level = excluded.permission_level,
         expires_at = excluded.expires_at,
         status = 'active'
  returning id into v_perm;

  update iam.emergency_door_request
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         permission_id = v_perm, grant_expires_at = v_expires, updated_at = now()
   where id = q.id and status = 'pending';
  if not found then
    -- The claim means this is unreachable unless a new writer violates the row-lock protocol.
    -- Raise so PostgreSQL rolls back the permission rather than leaving a grant without its request.
    raise exception 'emergency_door_approve: claimed request % was no longer pending', q.id
      using errcode = '40001';
  end if;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'approved', q.target_token, v_class, q.purpose, 'emergency_door', true,
    ARRAY[q.target_id], 1, v_t.o_subject, q.justification, null, q.id, v_perm, v_expires,
    true, null, q.requested_by);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened',
    v_t.o_subject,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'opened_by', q.requested_by, 'approved_by', v_uid, 'purpose', q.purpose,
                       'justification', q.justification, 'expires_at', v_expires,
                       'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log',
    'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires,
    'message', format('Approved, read-only, until %s. The person whose data it is has been told.',
                      to_char(v_expires, 'HH24:MI')));
end $function$;


CREATE OR REPLACE FUNCTION iam.emergency_door_deny(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  q iam.emergency_door_request%rowtype;
  v_t record; v_class text; v_entity_schema text; v_entity_table text;
  v_requester_role text; v_decider_role text; v_audit uuid;
begin
  if v_uid is null then
    raise exception 'emergency_door_deny: no authenticated caller' using errcode = '42501';
  end if;

  select * into q
    from iam.emergency_door_request
   where id = p_request_id
   for update;
  if not found then
    raise exception 'emergency_door_deny: no request %', p_request_id using errcode = 'P0002';
  end if;
  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;
  if q.request_expires_at <= now() then
    update iam.emergency_door_request
       set status = 'expired', updated_at = now()
     where id = q.id and status = 'pending';
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.');
  end if;

  select et.schema_name, et.table_name into v_entity_schema, v_entity_table
    from platform.entity_types et
   where et.token = q.target_token
   for share;
  if not found or not iam._door_target_lock(q.target_token, q.target_id) then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a current record, so it cannot be denied.');
  end if;

  v_class := iam.emergency_door_class(q.target_token);
  select * into v_t from iam._door_target(q.target_token, q.target_id);
  if v_t.o_org is null
     or v_t.o_org is distinct from q.organization_id
     or v_t.o_subject is distinct from q.subject_user_id
     or v_class is distinct from q.data_class
     or v_class is distinct from 'private' then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches the current record, so it cannot be denied.');
  end if;

  select om.role into v_requester_role
    from iam.organization_member om
   where om.user_id = q.requested_by and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_requester_role::text, 'none') not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency request, so it cannot be denied.');
  end if;

  select om.role into v_decider_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_decider_role::text, 'none') <> 'owner' then
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can answer an emergency access request.');
  end if;

  update iam.emergency_door_request
     set status = 'denied', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         updated_at = now()
   where id = q.id and status = 'pending';
  if not found then
    raise exception 'emergency_door_deny: claimed request % was no longer pending', q.id
      using errcode = '40001';
  end if;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
    ARRAY[q.target_id], null, v_t.o_subject, q.justification,
    coalesce(p_note, 'the organization owner refused the request'), q.id,
    null, null, true, null, q.requested_by);
  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
    v_t.o_subject,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'requested_by', q.requested_by, 'denied_by', v_uid, 'purpose', q.purpose,
                       'note', p_note, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);

  return jsonb_build_object('granted', false, 'reason', 'denied', 'audit_id', v_audit,
    'message', 'Refused, and recorded. The person whose data it is has been told it was asked for and refused.');
end $function$;


CREATE OR REPLACE FUNCTION public.auth_is_org_admin(user_id uuid, org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE user_role org_role;
BEGIN
  SELECT role INTO user_role FROM iam.organization_member
  WHERE organization_member.organization_id = org_id AND organization_member.user_id = $1;
  RETURN coalesce(user_role::text, 'none') IN ('admin', 'owner');
END;
$function$;


CREATE OR REPLACE FUNCTION public.auth_is_org_owner(user_id uuid, org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE user_role org_role;
BEGIN
  SELECT role INTO user_role FROM iam.organization_member
  WHERE organization_member.organization_id = org_id AND organization_member.user_id = $1;
  RETURN coalesce(user_role::text, 'none') = 'owner';
END;
$function$;


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
  v_org_role := hr._l1_org_role(v_uid, p_organization_id, false);
  if v_org_role is null
     and not exists (select 1 from hr.employee e
                      join iam.organization_member om
                        on om.organization_id = e.organization_id and om.user_id = e.login_user_id
                      where e.organization_id = p_organization_id and e.login_user_id = v_uid
                        and e.deleted_at is null) then
    raise exception 'hr_directory_list: no standing in this employer' using errcode = '42501';
  end if;

  v_persona := hr._l1_persona(v_uid, p_organization_id, v_today);
  v_caps    := hr._l1_capabilities(v_uid, p_organization_id, v_today);
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
$function$;


CREATE OR REPLACE FUNCTION public.hr_employee_grant_missing_membership(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'iam'
AS $function$
declare v_uid uuid := auth.uid(); v_e hr.employee%rowtype; v_has boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_caller',
      'detail', 'Repairing access needs an authenticated caller.');
  end if;

  select * into v_e from hr.employee where id = p_employee_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'field', 'employee_id',
      'detail', 'There is no such employee here.');
  end if;

  -- DD-199: the two authorities are tested IN SEQUENCE, never inside one OR. Postgres does not
  -- guarantee short-circuit evaluation of OR, so a strict role call inside it could refuse a
  -- capability-holding non-member. Capability first; only then the STRICT role call, which raises
  -- 42501 with the membership sentence before a NULL can be compared to anything.
  if not hr.capability(v_uid, 'role.assign', null, current_date, v_e.organization_id)
     and coalesce(hr._l1_org_role(v_uid, v_e.organization_id), 'none') not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'no_standing',
      'detail', 'Repairing somebody''s access to this employer needs owner, admin or '
             || 'role-assignment standing.');
  end if;

  if v_e.login_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login', 'field', 'login_user_id',
      'detail', 'This person has no platform login, so there is nothing to repair — a '
             || 'kiosk-only employee is a first-class record. Invite them if they need one.');
  end if;

  select exists (
    select 1 from iam.memberships m
     where m.user_id = v_e.login_user_id and m.organization_id = v_e.organization_id
       and m.container_type = 'organization' and m.deleted_at is null
       and coalesce(m.status,'active') = 'active') into v_has;

  if v_has then
    return jsonb_build_object('ok', true, 'repaired', false, 'reason', 'already_reachable',
      'detail', 'This person is already a member of this employer; nothing needed repairing.');
  end if;

  perform public.mbr_add('organization', v_e.organization_id, v_e.login_user_id,
                         v_e.organization_id, 'member', 'active',
                         jsonb_build_object('granted_by', 'hr_employee_grant_missing_membership',
                                            'reason', 'link_at_create_wrote_no_membership'));

  return jsonb_build_object('ok', true, 'repaired', true,
    'employee_id', v_e.id, 'organization_id', v_e.organization_id,
    'detail', 'Access repaired — they are a member of this employer now and can reach '
           || 'their own HR record.');
end $function$;


CREATE OR REPLACE FUNCTION public.hr_knob_index(p_organization_id uuid, p_overridden_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_knob_index: no authenticated caller' using errcode = '42501';
  end if;
  -- DD-199: SEQUENCE, not one OR. Postgres does not guarantee short-circuit evaluation of OR, so
  -- a strict role call inside it could refuse a capability-holding non-member. Capability first;
  -- only then the STRICT role call, which raises 42501 with the membership sentence for a stranger
  -- before any comparison. A plain member still gets this door's own HR-admin sentence.
  if not hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id)
     and coalesce(hr._l1_org_role(v_uid, p_organization_id), 'none') not in ('owner','admin') then
    raise exception 'hr_knob_index: settings are HR-admin only' using errcode = '42501';
  end if;

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
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'unit', k.unit,
          'review_due', k.review_due,
          'set_by', k.set_by,
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', o.value,
          'effective_value', coalesce(o.value, k.value, k.default_value),
          'origin', case
             when o.value is not null then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'basis', k.basis,
          'is_overridden', o.value is not null,
          'platform_locked', (k.overridable_by = '{}'::text[])
        ) as x
        from platform.feature_knob k
        left join platform.knob_override o
          on o.feature = k.feature and o.key = k.key
         and o.organization_id = p_organization_id
         and o.scope_kind = 'organization'
         and 'organization' = any (k.overridable_by)
        where k.feature like 'hr.%'
      ) s
      where not p_overridden_only or (x ->> 'is_overridden')::boolean));
end;
$function$;


CREATE OR REPLACE FUNCTION public.hr_module_set_enabled(p_organization_id uuid, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare v_uid uuid := auth.uid(); v_role text; v_after boolean;
begin
  if v_uid is null then
    raise exception 'hr_module_set_enabled: no authenticated caller' using errcode = '42501';
  end if;
  -- DD-199: the STRICT form (the default). A caller with NO membership in this organization is
  -- refused right here with 42501 and a sentence; `v_role` below can only be a real role.
  v_role := hr._l1_org_role(v_uid, p_organization_id);
  if coalesce(v_role, 'none') not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_org_owner_or_admin',
      'detail', 'Only an owner or an administrator of this organization can switch HR on or off.');
  end if;

  -- `||` merges and CREATES the parent; `jsonb_set` would not (see the header).
  update iam.organizations
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('hr',
                         coalesce(settings -> 'hr', '{}'::jsonb)
                         || jsonb_build_object('module_enabled', p_enabled))
   where id = p_organization_id;

  -- 🚨 READ IT BACK. The previous version built its envelope from its INPUT and reported success
  -- on a write that never landed. A writer that does not verify can silently do nothing.
  select (o.settings #>> '{hr,module_enabled}')::boolean into v_after
    from iam.organizations o where o.id = p_organization_id;

  if v_after is distinct from p_enabled then
    return jsonb_build_object('ok', false, 'reason', 'write_did_not_land',
      'detail', 'The change was not saved. Nothing has been altered — please try again.',
      'requested', p_enabled, 'observed', v_after);
  end if;

  return jsonb_build_object('ok', true,
    'organization_id', p_organization_id,
    'module_enabled', v_after,
    'is_activated', exists (select 1 from hr.employer_profile ep
                             where ep.organization_id = p_organization_id
                               and ep.deleted_at is null),
    -- §1.3's absent-not-disabled applies to modules: switching off retains every record.
    'records_retained', true,
    'next', case when v_after then 'activation_wizard' else 'module_off' end);
end
$function$;


CREATE OR REPLACE FUNCTION public.hr_my_context(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
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
             'org_role', hr._l1_org_role(v_uid, o.id, false),
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
$function$;


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
  if hr._l1_org_role(v_uid, p_organization_id, false) is null then
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
$function$;


CREATE OR REPLACE FUNCTION public.hr_org_summary(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_role text; v_enabled boolean; v_activated boolean;
  v_is_employee boolean;
begin
  if v_uid is null then
    raise exception 'hr_org_summary: no authenticated caller' using errcode = '42501';
  end if;

  v_role := hr._l1_org_role(v_uid, p_organization_id, false);
  v_is_employee := exists (select 1 from hr.employee e
                            where e.organization_id = p_organization_id
                              and e.login_user_id = v_uid and e.deleted_at is null);

  -- No standing at all → a REFUSAL, which every consumer renders as ABSENT. Never a card that
  -- says HR is unavailable, which is a sentence about something this viewer may have no business
  -- knowing (SPEC-UI-IA §6).
  if v_role is null and not v_is_employee then
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  v_enabled   := hr._l1_module_enabled(p_organization_id);
  v_activated := exists (select 1 from hr.employer_profile ep
                          where ep.organization_id = p_organization_id and ep.deleted_at is null);

  -- Module off and not an owner/admin → absent too. The exception is the one person who can act.
  if not v_enabled and coalesce(v_role, 'none') not in ('owner','admin') then
    return jsonb_build_object('granted', false, 'reason', 'module_off');
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'module_enabled', v_enabled,
    'is_activated', v_activated,
    -- 🚨 HEADCOUNT RESOLVES FROM `hr.employment` AS OF TODAY, NEVER FROM A STORED
    -- FLAG (SPEC-EMPLOYEES §1.3 route 1, and D4: this card counted three
    -- offboarded people because `directory_status` had no writer past creation).
    -- Somebody on leave or suspended is still employed and still counted;
    -- prehire spells are excluded, exactly as route 1 requires.
    'headcount', (select count(*) from hr.employee e
                   where e.organization_id = p_organization_id and e.deleted_at is null
                     and hr.employee_directory_status(e.id, current_date) in ('active','on_leave')),
    'prehire_count', (select count(*) from hr.employee e
                       where e.organization_id = p_organization_id and e.deleted_at is null
                         and hr.employee_directory_status(e.id, current_date) = 'prehire'),
    'pending_approvals', (select count(*) from hr.workflow_instance wi
                           where wi.organization_id = p_organization_id
                             and wi.deleted_at is null
                             and wi.state in ('submitted','in_review','conflict')),
    'can_enable', coalesce(v_role, 'none') in ('owner','admin'));
end
$function$;


CREATE OR REPLACE FUNCTION public.hr_relations_list(p_organization_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_kind text := nullif(p_filter ->> 'case_kind','');
  v_ca jsonb := '{}'::jsonb; v_inc jsonb := '{}'::jsonb; v_rows jsonb := '[]'::jsonb;
  v_ca_filter jsonb; v_inc_filter jsonb; v_unknown text[];
  v_incident_only boolean;
  v_known constant text[] := array['organization_id','case_kind','state','assignee_employment_id',
                                   'subject_employment_id','osha_recordable','from','to'];
begin
  if v_uid is null then
    raise exception 'hr_relations_list: no authenticated caller' using errcode = '42501';
  end if;

  -- 🚨 RECORDED TECHNICAL DECISION 16c — `granted` FROM THE DOOR IS NOT THE ACCESS VERDICT HERE,
  -- AND TRUSTING IT LEAKED. Probed live as a user with no standing in the employer at all:
  -- `hr._door_list` returned `granted:true, rows:[]` — because the door's job is to scope a list,
  -- and a scope that matches nothing is an empty list, not a refusal. Rendered faithfully that is
  -- **"you have access to Employee Relations and there are no cases"** told to a stranger, which
  -- is precisely the statement §2.2 r15 forbids: no-access must make the route and the nav item
  -- ABSENT, and "an empty list says there are no cases, which is a different and false statement".
  --
  -- So standing in the employer is checked FIRST, before the door is consulted at all. The
  -- capability check stays the door's — this only establishes that the caller is somebody in this
  -- employer, which is the floor beneath every relations lane.
  if hr._l1_org_role(v_uid, p_organization_id, false) is null
     and hr._l1_self_employment(v_uid, p_organization_id, current_date) is null then
    perform hr._record_access_audit(
      p_organization_id => p_organization_id, p_action => 'denied',
      p_target_token => 'hr_incident', p_purpose => 'relations_list', p_basis => 'refused',
      p_granted => false, p_row_count => 0, p_sensitivity_tier => 'restricted',
      p_denial_reason => 'no_standing_in_employer');
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  -- hr_l1_83, same law as the door beneath it: a filter this route does not serve refuses by name.
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_unknown
    from jsonb_object_keys(coalesce(p_filter, '{}'::jsonb)) k
   where k <> all (v_known);
  if array_length(v_unknown, 1) > 0 then
    raise exception 'hr_relations_list does not support the filter(s) %; it supports %',
      array_to_string(v_unknown, ', '), array_to_string(v_known, ', ')
      using errcode = '22023';
  end if;

  -- 🚨 hr_l1_83 — THE TWO CASE KINDS DO NOT SPELL THE SAME QUESTION THE SAME WAY, AND THIS UNION
  -- IS THE ONLY PLACE THAT KNOWS BOTH SPELLINGS. Route 15's controls are written in one
  -- vocabulary; `hr.incident` calls its subject `subject_employment_id` while
  -- `hr.corrective_action` calls it `employment_id`, and the assignee is `assigned_to_employment_id`
  -- on the incident and does not exist at all on the corrective action. Passing the caller's
  -- filter through UNTRANSLATED is what made three of these controls dead: measured live on
  -- 2026-08-30, "Assigned to me" narrowed NOTHING on either side (the door's allowlist names
  -- `assigned_to_employment_id`, the caller sent `assignee_employment_id`) and a subject filter
  -- narrowed the incidents while returning every corrective action in the employer.
  v_inc_filter := jsonb_strip_nulls(jsonb_build_object(
    'organization_id', p_organization_id,
    'state',                     nullif(p_filter ->> 'state',''),
    'subject_employment_id',     nullif(p_filter ->> 'subject_employment_id',''),
    'assigned_to_employment_id', nullif(p_filter ->> 'assignee_employment_id',''),
    'osha_recordable',           nullif(p_filter ->> 'osha_recordable',''),
    'from',                      nullif(p_filter ->> 'from',''),
    'to',                        nullif(p_filter ->> 'to','')));

  v_ca_filter := jsonb_strip_nulls(jsonb_build_object(
    'organization_id', p_organization_id,
    -- served by `hr.corrective_action_state` inside the door since hr_l1_83; before that this key
    -- raised 42703 on this side and took the whole queue's state control down with it.
    'state',           nullif(p_filter ->> 'state',''),
    'employment_id',   nullif(p_filter ->> 'subject_employment_id',''),
    'from',            nullif(p_filter ->> 'from',''),
    'to',              nullif(p_filter ->> 'to','')));

  -- 🚨 AN INCIDENT-ONLY QUESTION HAS AN ANSWER ON THE CORRECTIVE-ACTION SIDE, AND THE ANSWER IS
  -- "NONE" — NOT "ALL OF THEM". "OSHA recordable" and "assigned to" are properties no corrective
  -- action has, so no corrective action can satisfy them. Dropping the key and answering with the
  -- whole ladder is the silent-widening defect; asking the door with a key it refuses by name
  -- would turn a legitimate filter into a 400. So this side is not asked, and it contributes zero
  -- rows. `corrective_actions_granted` stays TRUE because nothing refused: the answer is a
  -- definite empty, which is what `partial` must NOT be raised over.
  v_incident_only := nullif(p_filter ->> 'osha_recordable','') is not null
                  or nullif(p_filter ->> 'assignee_employment_id','') is not null;

  -- 🚨 RECORDED TECHNICAL DECISION 16b — THE TWO CASE KINDS ARE NOT ON THE SAME TIER, AND THE
  -- REGISTRY IS THE ONLY HONEST SOURCE FOR WHICH.
  -- SPEC-EMPLOYEES §2.2 r15 calls `hr_restricted_list` for BOTH; §13 D-4 records the underlying
  -- disagreement (SPEC-ACCESS makes `hr.corrective_action` CONF so the subject can read what they
  -- are asked to sign; SPEC-DATA-MODEL §10.1 says restricted). Live, `hr._door_spec` returns
  -- **confidential** for `hr_corrective_action` and **restricted** for `hr_incident` — and the
  -- shared door RAISES on a tier mismatch, by design, because asking the wrong family is a caller
  -- mistake and not a refusal. Passing the tier from the registry instead of a literal means this
  -- function keeps working whichever way the ruling finally lands.
  if (v_kind is null or v_kind = 'corrective_action') and not v_incident_only then
    select hr._door_list('hr_corrective_action', v_ca_filter, p_limit, null, 'relations_list', d.tier)
      into v_ca from hr._door_spec('hr_corrective_action') d;
  elsif v_kind is null or v_kind = 'corrective_action' then
    v_ca := jsonb_build_object('granted', true, 'rows', '[]'::jsonb, 'row_count', 0);
  end if;
  if v_kind is null or v_kind = 'incident' then
    select hr._door_list('hr_incident', v_inc_filter, p_limit, null, 'relations_list', d.tier)
      into v_inc from hr._door_spec('hr_incident') d;
  end if;

  -- 🚨 no-access here is the STRONGEST instance of §1.3: the caller gets `granted:false` and the
  -- client makes the route AND the nav item absent. It is never an empty list, because an empty
  -- list says "there are no cases" and that is a different, false statement.
  if not coalesce((v_ca ->> 'granted')::boolean, false)
     and not coalesce((v_inc ->> 'granted')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason',
      coalesce(v_ca ->> 'reason', v_inc ->> 'reason', 'no_lane'),
      'audit_id', coalesce(v_ca ->> 'audit_id', v_inc ->> 'audit_id'));
  end if;

  select coalesce(jsonb_agg(r order by r ->> 'sort_at' desc), '[]'::jsonb) into v_rows from (
    select (row || jsonb_build_object('case_kind','corrective_action',
              'sort_at', row ->> 'issued_on')) as r
      from jsonb_array_elements(coalesce(v_ca -> 'rows', '[]'::jsonb)) as row
    union all
    select (row || jsonb_build_object('case_kind','incident',
              'sort_at', row ->> 'reported_at')) as r
      from jsonb_array_elements(coalesce(v_inc -> 'rows', '[]'::jsonb)) as row) s;

  return jsonb_build_object(
    'granted', true, 'rows', v_rows,
    -- RECORDED DECISION 16: this total is what THIS viewer may see, by design.
    'total', jsonb_array_length(v_rows),
    'total_is_viewer_scoped', true,
    'corrective_actions_granted', coalesce((v_ca ->> 'granted')::boolean, false),
    'incidents_granted', coalesce((v_inc ->> 'granted')::boolean, false),
    -- §2.2 r15: export is ABSENT on this route in v1. A CSV of complaints is exactly the artifact
    -- that should not exist by accident.
    'export_available', false);
end
$function$;


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
  if hr._l1_org_role(v_uid, p_organization_id, false) is null then
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
$function$;


CREATE OR REPLACE FUNCTION public.mbr_remove(p_container_type text, p_container_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project') then
    raise exception 'unsupported membership container type %', p_container_type
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  -- DD-191: strict. Every arm below belongs to someone who holds a role here.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not v_service then
    -- DD-044: nobody ends up belonging to no organization. This is checked
    -- BEFORE the personal-organization guard so the person is told the real
    -- reason ("it is your only one") rather than an implementation word.
    if p_container_type = 'organization'
       and iam.is_last_organization(p_user_id, p_container_id) then
      if p_user_id = v_uid then
        raise exception
          'You can''t leave your only organization. Create or join another one first.'
          using errcode = '23514';
      else
        raise exception
          'This person can''t be removed from their only organization. They need to join or create another one first.'
          using errcode = '23514';
      end if;
    end if;

    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_user_id = v_uid then
      null;
    elsif coalesce(v_actor_role, 'none') = 'owner' then
      null;
    -- R21: admins add and remove ADMINS and members. Only the owner is
    -- untouchable by an admin.
    elsif coalesce(v_actor_role, 'none') = 'admin' and coalesce(v_target_role, 'none') in ('member', 'admin') then
      null;
    elsif coalesce(v_target_role, 'none') = 'owner' then
      raise exception
        'The owner can''t be removed from their own organization. Transfer ownership first, then remove them.'
        using errcode = '42501';
    else
      raise exception
        'Only this organization''s owner and admins can remove someone, and anyone can remove themselves.'
        using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot remove the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set deleted_at = now(),
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;


CREATE OR REPLACE FUNCTION public.mbr_update_role(p_container_type text, p_container_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role() = 'service_role', false);
  v_org uuid;
  v_personal boolean;
  v_actor_role text;
  v_target_role text;
  v_owner_count integer;
begin
  if p_container_type not in ('organization', 'project')
     or p_role not in ('owner', 'admin', 'member') then
    raise exception 'invalid membership role update' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_container_type || ':' || p_container_id::text,
      0
    )
  );

  -- DD-191: strict.
  select
    container.resource_org_id,
    container.resource_is_personal,
    container.actor_role
  into v_org, v_personal, v_actor_role
  from iam._container_authz(p_container_type, p_container_id, v_uid) as container;

  if not found or v_org is null then
    raise exception 'membership container not found' using errcode = 'P0002';
  end if;

  select membership.role
  into v_target_role
  from iam.memberships as membership
  where membership.container_type = p_container_type
    and membership.container_id = p_container_id
    and membership.organization_id = v_org
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.deleted_at is null
  for update;

  if not found then
    raise exception 'membership not found' using errcode = 'P0002';
  end if;

  if not v_service then
    -- DD-045 P3 owns this guard; DD-048 leaves it exactly as it was.
    if v_personal then
      raise exception 'personal organization memberships are immutable'
        using errcode = '42501';
    end if;

    if p_container_type = 'organization' then
      -- R21: one owner per organization. Ownership moves ONLY through
      -- transfer_organization_ownership, which demotes the outgoing owner in
      -- the same step. A role update may never mint a second owner.
      if p_role = 'owner' and v_target_role is distinct from 'owner' then
        raise exception
          'An organization can have exactly one owner. Use Transfer ownership to hand it to someone else.'
          using errcode = '23514';
      end if;

      if coalesce(v_actor_role, 'none') = 'owner' then
        null;
      -- R21: admins add and remove ADMINS and members. Only the owner is
      -- untouchable by an admin.
      elsif coalesce(v_actor_role, 'none') = 'admin'
            and coalesce(v_target_role, 'none') in ('member', 'admin')
            and p_role in ('member', 'admin') then
        null;
      elsif coalesce(v_target_role, 'none') = 'owner' then
        raise exception
          'The owner''s role can only be changed by transferring ownership, and only the owner can do that.'
          using errcode = '42501';
      else
        raise exception
          'Only this organization''s owner and admins can change what someone''s role is here.'
          using errcode = '42501';
      end if;
    elsif coalesce(v_actor_role, 'none') is distinct from 'owner' or p_role = 'owner' then
      raise exception 'project owner role required' using errcode = '42501';
    end if;
  end if;

  if coalesce(v_target_role, 'none') = 'owner' and p_role <> 'owner' then
    select count(*)::integer
    into v_owner_count
    from iam.memberships as membership
    where membership.container_type = p_container_type
      and membership.container_id = p_container_id
      and membership.organization_id = v_org
      and membership.role = 'owner'
      and membership.status = 'active'
      and membership.deleted_at is null;

    if v_owner_count <= 1 then
      raise exception 'cannot demote the last owner' using errcode = '23514';
    end if;
  end if;

  update iam.memberships
  set role = p_role,
      updated_by = v_uid,
      updated_at = now()
  where container_type = p_container_type
    and container_id = p_container_id
    and organization_id = v_org
    and user_id = p_user_id
    and status = 'active'
    and deleted_at is null;
end;
$function$;


CREATE OR REPLACE FUNCTION public.org_admin_remove_member(p_org_id uuid, p_user_id uuid, p_reassign_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_role text; v_owner_count int; v_removed int;
begin
  if not public.is_org_admin(p_org_id) then
    raise exception 'Forbidden: organization admin required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use leave organization to remove yourself' using errcode = '42501';
  end if;

  -- 🚨 DD-140. This argument called org_admin_reassign_member_resources, which rewrites the owner
  -- column of every shareable registered table — private conversations, DMs and HR records
  -- included — and a nested call inside a SECURITY DEFINER owned by postgres is privilege-checked
  -- as postgres, so closing the direct RPC alone would have left the identical capability here.
  if p_reassign_to is not null then
    raise exception 'Removing a member no longer transfers their work. Transferring another person''s resources is an audited action with its own door, because it changes who owns their private conversations and records — remove the member without a transfer, and ask for the offboarding transfer door if you need their work moved.'
      using errcode = '42501';
  end if;

  -- DD-140b: all three statements below read the relation the cutover removed (42P01).
  select m.role into v_role
  from iam.memberships m
  where m.container_type = 'organization' and m.container_id = p_org_id
    and m.user_id = p_user_id and m.status = 'active' and m.deleted_at is null;
  if v_role is null then
    raise exception 'User is not a member of this organization' using errcode = '23503';
  end if;
  if coalesce(v_role, 'none') = 'owner' then
    select count(*) into v_owner_count
    from iam.memberships m
    where m.container_type = 'organization' and m.container_id = p_org_id
      and m.role = 'owner' and m.status = 'active' and m.deleted_at is null;
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner' using errcode = '42501';
    end if;
  end if;

  -- SOFT delete: iam.memberships carries deleted_at, and a client path never destroys a
  -- soft-deletable row. The iam.organization_member view filters on exactly these two columns,
  -- so the person leaves every roster the moment this commits.
  update iam.memberships m
     set deleted_at = now(), status = 'removed', updated_at = now(), updated_by = auth.uid()
   where m.container_type = 'organization' and m.container_id = p_org_id
     and m.user_id = p_user_id and m.deleted_at is null;
  get diagnostics v_removed = row_count;

  delete from iam.org_member_controls where organization_id = p_org_id and user_id = p_user_id;

  perform iam._org_audit(p_org_id, p_user_id, 'member.remove',
                         jsonb_build_object('reassigned_to', null, 'reassigned', '[]'::jsonb,
                                            'memberships_removed', v_removed));

  return jsonb_build_object('removed', v_removed > 0, 'reassigned', '[]'::jsonb);
end;
$function$;
