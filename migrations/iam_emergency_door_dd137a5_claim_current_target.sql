-- iam_emergency_door_dd137a5 — CLAIM THE ASK, THEN MINT ONLY A VIEWER KEY (DD-137a).
--
-- Two independently verified P0 defects were in the live definitions:
--
-- 1. Both emergency grant UPSERTs reactivated an existing permission without replacing its
--    `permission_level`. A dormant editor/admin permission therefore became active again when
--    the emergency door promised a temporary viewer grant.
-- 2. The private approval path read a pending request without locking it, then trusted the
--    request's historical target facts. Concurrent approvers could both mint a grant/audit/notice,
--    and an old request could approve after its row changed organization, subject, or class.
--
-- The repair is deliberately additive and idempotent: it replaces only the two existing public
-- doors. It neither changes historical requests nor applies any migration ledger row itself.

-- ═════════════════════════════════════════════════════════════ 1. A confidential opening
-- never revives a stronger pre-existing grant. `EXCLUDED.permission_level` is always `viewer`.
create or replace function iam.emergency_door_open(
  p_token text, p_id uuid, p_purpose text, p_justification text)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'hr', 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_class text; v_t record; v_min integer; v_ttl integer; v_audit uuid; v_perm uuid;
  v_req uuid; v_is_admin boolean; v_is_owner boolean; v_expires timestamptz; v_rec record;
begin
  if v_uid is null then
    raise exception 'emergency_door_open: no authenticated caller' using errcode = '42501';
  end if;

  if exists (select 1 from hr._door_spec(p_token)) then
    return public.hr_break_glass(p_token, p_id, p_purpose, p_justification);
  end if;

  v_class := iam.emergency_door_class(p_token);
  select * into v_t from iam._door_target(p_token, p_id);

  if v_t.o_schema is null then
    raise exception 'emergency_door_open: % is not a registered entity token, so there is no row for this door to open. Register it in platform.entity_types first.', p_token
      using errcode = '22023';
  end if;
  if v_t.o_org is null then
    raise exception 'emergency_door_open: no % row with id %', p_token, p_id using errcode = 'P0002';
  end if;

  select bool_or(om.role in ('owner','admin')), bool_or(om.role = 'owner')
    into v_is_admin, v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org;
  v_is_admin := coalesce(v_is_admin, false);
  v_is_owner := coalesce(v_is_owner, false);

  if v_class is null then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, '(unclassified)', coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s has no data class yet, so this door cannot know how strictly to open it. Classify the token in platform.entity_types before asking for emergency access.', p_token));
    return jsonb_build_object('granted', false, 'reason', 'unclassified_token',
      'message', format('%s has no data class yet. Nobody can open it in an emergency until someone says how private it is.', p_token),
      'audit_id', v_audit);
  end if;

  if v_class not in ('private', 'confidential') then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s is %s-class data, which is reached by ordinary access rather than by an emergency door.', p_token, v_class));
    return jsonb_build_object('granted', false, 'reason', 'no_door_needed',
      'message', format('%s is %s data. Ask for ordinary access to it — this door is for private data only.', p_token, v_class),
      'audit_id', v_audit);
  end if;

  if not v_is_admin then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      'the caller is not an owner or admin of the organization that owns this row');
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_admin',
      'message', 'Only an owner or admin of the organization that owns this data can open the emergency door on it.',
      'audit_id', v_audit);
  end if;

  v_min := iam._door_min_chars(v_t.o_org);
  if p_justification is null or length(btrim(p_justification)) < v_min then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'message', format('Say why, in at least %s characters. This sentence goes to the person whose data you are opening.', v_min),
      'audit_id', v_audit);
  end if;

  if not exists (select 1 from platform.categories cat
                  where cat.dimension = 'access_purpose' and cat.slug = p_purpose
                    and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and cat.deleted_at is null) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, '(unregistered)', 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('purpose %s is not in the access_purpose dimension', coalesce(p_purpose,'(null)')));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose',
      'message', 'Pick a reason from the list. A typed reason cannot be reported on, so it is not accepted.',
      'audit_id', v_audit);
  end if;

  if v_t.o_subject = v_uid then
    return jsonb_build_object('granted', false, 'reason', 'self',
      'message', 'This is your own data. You can already read it.');
  end if;

  if not exists (select 1 from platform.shareable_resource_registry srr
                  where srr.is_active and srr.resource_type = p_token) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, p_purpose, 'refused', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification,
      format('%s is not a registered sharing token, so no grant can be written for it', p_token));
    return jsonb_build_object('granted', false, 'reason', 'token_not_grantable',
      'message', format('%s cannot carry a grant, so the emergency door has nothing to open. Register it as a shareable resource first.', p_token),
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);

  if v_class = 'private' then
    insert into iam.emergency_door_request
      (organization_id, target_token, target_id, subject_user_id, data_class, purpose,
       justification, requested_by, status, request_expires_at, created_by, visibility)
    values (v_t.o_org, p_token, p_id, v_t.o_subject, v_class, p_purpose, p_justification, v_uid,
            'pending', now() + interval '24 hours', v_uid, 'personal'::platform.visibility)
    returning id into v_req;

    v_audit := iam._record_access_audit(
      v_t.o_org, 'requested', p_token, v_class, p_purpose, 'requested', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification, null, v_req);

    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_requested', v_t.o_subject,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'request_id', v_req, 'data_class', v_class),
      v_req, '/me/access-log', 'edoor:req:' || v_req::text || ':' || coalesce(v_t.o_subject::text,'-'));

    for v_rec in select om.user_id from iam.organization_member om
                  where om.organization_id = v_t.o_org and om.role = 'owner' and om.user_id <> v_uid loop
      perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_approval_needed', v_rec.user_id,
        jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                           'purpose', p_purpose, 'justification', p_justification,
                           'request_id', v_req, 'subject_user_id', v_t.o_subject),
        v_req, '/organizations/emergency-access', 'edoor:appr:' || v_req::text || ':' || v_rec.user_id::text);
    end loop;

    return jsonb_build_object('granted', false, 'reason', 'awaiting_approval', 'request_id', v_req,
      'audit_id', v_audit, 'data_class', v_class,
      'message', 'This is private data, so one person cannot open it. The organization''s owner has been asked to approve, and the person whose data it is has been told you asked.');
  end if;

  v_expires := now() + make_interval(mins => v_ttl);
  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (p_token, p_id, v_uid, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set permission_level = excluded.permission_level,
         expires_at = excluded.expires_at,
         status = 'active'
  returning id into v_perm;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'read', p_token, v_class, p_purpose, 'emergency_door', true, ARRAY[p_id], 1,
    v_t.o_subject, p_justification, null, null, v_perm, v_expires);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened', v_t.o_subject,
    jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                       'purpose', p_purpose, 'justification', p_justification,
                       'expires_at', v_expires, 'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires, 'data_class', v_class,
    'alert_event', 'platform.access.emergency_door_opened', 'alert_tier', 'immediate',
    'message', format('Opened, read-only, until %s. The person whose data this is has been told who you are and why.',
                      to_char(v_expires, 'HH24:MI')));
end $fn$;

-- ═════════════════════════════════════════════════════════════ 2. The canonical `_door_target`
-- reader is deliberately STABLE because the read-only eligibility/opening paths use it. A row lock
-- cannot live there: PostgreSQL forbids `FOR SHARE` in a STABLE function. This private VOLATILE
-- companion locks exactly the current target row; callers first hold the entity-type row and then
-- call `_door_target` again after this lock, so schema/table mapping and target facts are stable
-- through commit without turning the client-readable reader into a mutation-capable surface.
create or replace function iam._door_target_lock(p_token text, p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'iam', 'platform', 'public'
as $fn$
declare v_schema text; v_table text; v_locked integer;
begin
  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e
   where e.token = p_token;
  if v_schema is null or v_table is null then
    return false;
  end if;

  execute format('select 1 from %I.%I where id = $1 for share', v_schema, v_table)
     into v_locked using p_id;
  return v_locked is not null;
end $fn$;

revoke execute on function iam._door_target_lock(text, uuid) from public, anon, authenticated;

-- A private decision locks the request before it decides anything. It also holds the entity type,
-- target, requester membership, and decider membership through commit. `FOR UPDATE` serializes
-- competing approvers/deniers; `FOR SHARE` blocks a target move/reclassification or membership
-- removal/role change after current facts have been accepted and before the grant commits.
create or replace function iam.emergency_door_approve(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'public'
as $fn$
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
  if not found or v_requester_role not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency grant, so it cannot be approved.');
  end if;

  select om.role into v_approver_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;

  if not found or v_approver_role <> 'owner' then
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
end $fn$;

-- The original grants remain valid; replacing a function does not widen EXECUTE privileges.
grant execute on function iam.emergency_door_open(text, uuid, text, text) to authenticated;
grant execute on function iam.emergency_door_approve(uuid, text) to authenticated;

-- The denial path claims the very same request. Previously it updated with a pending predicate
-- but ignored whether it won, then wrote a false denial audit/notification after a concurrent
-- approval. A decision that did not claim a current pending request now has no side effects.
create or replace function iam.emergency_door_deny(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'public'
as $fn$
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
  if not found or v_requester_role not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency request, so it cannot be denied.');
  end if;

  select om.role into v_decider_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;
  if not found or v_decider_role <> 'owner' then
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
end $fn$;

grant execute on function iam.emergency_door_deny(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════ 3. Source-level assertions.
-- These make a future partial re-cut fail loud at apply time, while the live forcing matrix owns
-- behavioral proof after this migration is applied through the sanctioned runner.
do $assert$
declare v_open text; v_approve text; v_deny text; v_target_lock text;
begin
  select p.prosrc into v_open
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_open'
     and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_id uuid, p_purpose text, p_justification text';
  select p.prosrc into v_approve
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_approve'
     and pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid, p_note text';
  select p.prosrc into v_deny
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_deny'
     and pg_get_function_identity_arguments(p.oid) = 'p_request_id uuid, p_note text';
  select p.prosrc into v_target_lock
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = '_door_target_lock'
     and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_id uuid';

  if v_open is null or v_open !~ 'permission_level = excluded\.permission_level' then
    raise exception 'dd137a5: emergency_door_open can still reactivate a stronger permission';
  end if;
  if v_approve is null
     or v_approve !~ 'for update'
     or v_approve !~ 'iam\._door_target'
     or v_approve !~ 'iam\._door_target_lock'
     or v_approve !~ 'for share'
     or v_approve !~ 'v_t\.o_org is distinct from q\.organization_id'
     or v_approve !~ 'v_t\.o_subject is distinct from q\.subject_user_id'
     or v_approve !~ 'v_requester_role'
     or v_approve !~ 'permission_level = excluded\.permission_level' then
    raise exception 'dd137a5: emergency_door_approve lost its claim, stable-current-target, eligibility, or viewer-only guard';
  end if;
  if v_target_lock is null or v_target_lock !~ 'for share' then
    raise exception 'dd137a5: the target lock does not hold the target row through the decision';
  end if;
  if v_deny is null
     or v_deny !~ 'for update'
     or v_deny !~ 'iam\._door_target_lock'
     or v_deny !~ 'where id = q\.id and status = ''pending'''
     or v_deny !~ 'if not found then'
     or v_deny !~ 'for share' then
    raise exception 'dd137a5: emergency_door_deny can still emit a decision without winning the pending claim';
  end if;
  raise notice 'dd137a5: assertions passed';
end $assert$;
