-- iam_emergency_door_dd137a4 — THE AUDIT NAMES WHO HOLDS THE KEY (DD-137a, fix round 1).
--
-- 🚨 RED, found by the independent browser verifier V-38 on the real screen: `/me/access-log` told
-- the subject that `admin@admin.com` opened her conversation. He did not — he APPROVED it.
-- `test@test.com` held the key. The one page the platform builds to tell a person who read their
-- data named the wrong person.
--
-- The cause is in the DATA, not the screen, which is why the repair is here. `iam.access_audit`
-- records ONE actor, and on the two-person path the actor of the `approved` row is the approver
-- (`v_uid` in `iam.emergency_door_approve`). The row carried nothing that said who the key was
-- MINTED FOR, so no client could have rendered it correctly. The notification for the very same
-- act got it right (its payload carries `opened_by = q.requested_by`), so the screen and the email
-- about one event disagreed with each other — the clearest possible sign the model was wrong
-- rather than the renderer.
--
-- Repairs, all at the source:
--   1. `iam.access_audit.granted_to_user_id` — WHO HOLDS THE KEY, distinct from who authorised it.
--      Backfilled for every existing row from the request that produced it.
--   2. Both door paths write it: `confidential` (the one admin is both) and `private` (the
--      requester, never the approver).
--   3. `iam.my_access_log` / `iam.org_access_log` return `grantee_user_id` + `grantee_label`
--      ALONGSIDE the actor, so a surface can say "X opened it, Y approved it" — both true.
--   4. A refused APPROVAL now tells the subject, which it never did. V-38: "the subject is not told
--      when an approver refuses" — an emergency ask about your private data being turned down is
--      exactly as much your business as it being granted.
--   5. `iam.emergency_door_eligibility(token, id)` — so the refusal screen can offer the door to
--      somebody who can actually walk through it, and offer NOTHING to anybody else. A button that
--      is always refused is the dead control law 4 forbids; the eligibility answer is what lets the
--      affordance be absent rather than dishonest.

-- ═════════════════════════════════════════════════ 1. the column
alter table iam.access_audit
  add column if not exists granted_to_user_id uuid references auth.users(id);

comment on column iam.access_audit.granted_to_user_id is
  'WHO HOLDS THE KEY — distinct from actor_user_id, who authorised it. On the two-person `private` path the actor of an `approved` row is the APPROVER and the grantee is the REQUESTER; conflating them told a person the wrong name on her own access page (V-38, 2026-09-12).';

create index if not exists iam_access_audit_grantee_idx
  on iam.access_audit (granted_to_user_id, occurred_at desc);

-- ── backfill: every historical row, from the request or the actor
update iam.access_audit a
   set granted_to_user_id = q.requested_by
  from iam.emergency_door_request q
 where a.request_id = q.id
   and a.granted_to_user_id is null;

-- A `confidential` open and every refusal are one-person acts: the actor IS the person the key
-- was (or would have been) for. Only the two-person rows above could ever have disagreed.
update iam.access_audit
   set granted_to_user_id = actor_user_id
 where granted_to_user_id is null
   and actor_user_id is not null;

-- ═════════════════════════════════════════════════ 2. the recorder carries it
create or replace function iam._record_access_audit(
  p_organization_id uuid, p_action text, p_target_token text, p_data_class text,
  p_purpose text, p_basis text, p_granted boolean,
  p_target_ids uuid[] default '{}'::uuid[], p_row_count integer default null,
  p_subject_user_id uuid default null, p_justification text default null,
  p_denial_reason text default null, p_request_id uuid default null,
  p_permission_id uuid default null, p_grant_expires_at timestamptz default null,
  p_is_emergency_door boolean default true, p_actor_user_id uuid default null,
  p_granted_to_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'iam', 'public'
as $fn$
declare v_id uuid; v_actor uuid := coalesce(p_actor_user_id, auth.uid());
begin
  insert into iam.access_audit
    (organization_id, action, target_token, target_ids, row_count, subject_user_id, data_class,
     purpose, basis, justification, is_emergency_door, granted, denial_reason, request_id,
     permission_id, grant_expires_at, actor_user_id, granted_to_user_id, created_by, visibility)
  values
    (p_organization_id, p_action, p_target_token, coalesce(p_target_ids, '{}'::uuid[]), p_row_count,
     p_subject_user_id, p_data_class, p_purpose, p_basis, p_justification, p_is_emergency_door,
     p_granted, p_denial_reason, p_request_id, p_permission_id, p_grant_expires_at, v_actor,
     -- THE DEFAULT IS THE ACTOR, and that is right for every one-person act. Only the
     -- approval path has two people in it, and it passes the grantee explicitly.
     coalesce(p_granted_to_user_id, v_actor),
     v_actor, 'personal'::platform.visibility)
  returning id into v_id;
  return v_id;
end $fn$;

revoke execute on function iam._record_access_audit(uuid, text, text, text, text, text, boolean, uuid[], integer, uuid, text, text, uuid, uuid, timestamptz, boolean, uuid, uuid) from public, anon, authenticated;

-- ═════════════════════════════════════════════════ 3. the approval names the grantee, and a
--                                                     refused approval tells the subject
create or replace function iam.emergency_door_approve(p_request_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'iam', 'platform', 'communication', 'public'
as $fn$
declare
  v_uid uuid := auth.uid(); q iam.emergency_door_request%rowtype;
  v_is_owner boolean; v_ttl integer; v_perm uuid; v_audit uuid; v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'emergency_door_approve: no authenticated caller' using errcode = '42501';
  end if;
  select * into q from iam.emergency_door_request where id = p_request_id;
  if not found then
    raise exception 'emergency_door_approve: no request %', p_request_id using errcode = 'P0002';
  end if;

  select bool_or(om.role = 'owner') into v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = q.organization_id;

  if not coalesce(v_is_owner, false) then
    v_audit := iam._record_access_audit(
      q.organization_id, 'denied', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'only an organization OWNER can approve a private-class emergency request', p_request_id,
      null, null, true, null, q.requested_by);
    -- V-38: THE SUBJECT IS TOLD WHEN IT IS TURNED DOWN, TOO.
    perform iam._notify_door(q.organization_id, 'platform.access.emergency_door_denied',
      q.subject_user_id,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose, 'note', 'the approver was not an organization owner',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can approve emergency access to private data.',
      'audit_id', v_audit);
  end if;

  -- TWO PEOPLE, NEVER ONE.
  if q.requested_by = v_uid then
    v_audit := iam._record_access_audit(
      q.organization_id, 'denied', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'the person who asked cannot also be the person who approves', p_request_id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(q.organization_id, 'platform.access.emergency_door_denied',
      q.subject_user_id,
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

  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;
  if q.request_expires_at <= now() then
    update iam.emergency_door_request set status = 'expired', updated_at = now() where id = q.id;
    v_audit := iam._record_access_audit(
      q.organization_id, 'expired', q.target_token, q.data_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, q.subject_user_id, q.justification,
      'the request lapsed before anyone answered it', p_request_id,
      null, null, true, null, q.requested_by);
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.',
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(q.organization_id);
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (q.target_token, q.target_id, q.requested_by, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
  returning id into v_perm;

  update iam.emergency_door_request
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         permission_id = v_perm, grant_expires_at = v_expires, updated_at = now()
   where id = q.id;

  -- 🚨 THE GRANTEE IS THE REQUESTER, NOT THE APPROVER. This argument is the whole fix.
  v_audit := iam._record_access_audit(
    q.organization_id, 'approved', q.target_token, q.data_class, q.purpose, 'emergency_door', true,
    ARRAY[q.target_id], 1, q.subject_user_id, q.justification, null, q.id, v_perm, v_expires,
    true, null, q.requested_by);

  perform iam._notify_door(q.organization_id, 'platform.access.emergency_door_opened',
    q.subject_user_id,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'opened_by', q.requested_by, 'approved_by', v_uid, 'purpose', q.purpose,
                       'justification', q.justification, 'expires_at', v_expires,
                       'data_class', q.data_class, 'audit_id', v_audit),
    v_audit, '/me/access-log',
    'edoor:open:' || v_audit::text || ':' || coalesce(q.subject_user_id::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires,
    'message', format('Approved, read-only, until %s. The person whose data it is has been told.',
                      to_char(v_expires, 'HH24:MI')));
end $fn$;

grant execute on function iam.emergency_door_approve(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════ 4. the read doors return both people
create or replace function iam.my_access_log(p_limit integer default 200, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc), '[]'::jsonb)
    from (
      select a.id, a.occurred_at, a.action, a.target_token, a.target_ids, a.data_class,
             a.purpose, a.justification, a.granted, a.denial_reason,
             a.actor_user_id, au.email as actor_label,
             a.granted_to_user_id as grantee_user_id, gu.email as grantee_label,
             a.grant_expires_at, a.organization_id, a.basis, a.is_emergency_door,
             o.name as organization_label
        from iam.access_audit a
        left join auth.users au on au.id = a.actor_user_id
        left join auth.users gu on gu.id = a.granted_to_user_id
        left join iam.organizations o on o.id = a.organization_id
       where a.subject_user_id = (select auth.uid())
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
      offset greatest(0, coalesce(p_offset, 0))
    ) x;
$fn$;

comment on function iam.my_access_log(integer, integer) is
  'THE SUBJECT''S OWN PAGE (DD-137a). Returns BOTH people for every act: `grantee_*` is who holds the key and is the answer to "who opened my data"; `actor_*` is who authorised it. Before 2026-09-12 it returned only the actor, and on the two-person path that named the approver as the reader — the page''s one job, done wrong (V-38).';

create or replace function iam.org_access_log(p_organization_id uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path to 'iam', 'public'
as $fn$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc), '[]'::jsonb)
    from (
      select a.id, a.occurred_at, a.action, a.target_token, a.target_ids, a.data_class, a.purpose,
             a.justification, a.granted, a.denial_reason,
             a.actor_user_id, au.email as actor_label,
             a.granted_to_user_id as grantee_user_id, gu.email as grantee_label,
             a.subject_user_id, su.email as subject_label,
             a.grant_expires_at, a.organization_id, a.basis, a.is_emergency_door
        from iam.access_audit a
        left join auth.users au on au.id = a.actor_user_id
        left join auth.users gu on gu.id = a.granted_to_user_id
        left join auth.users su on su.id = a.subject_user_id
       where a.organization_id = p_organization_id
         and exists (select 1 from iam.organization_member om
                      where om.user_id = (select auth.uid())
                        and om.organization_id = p_organization_id
                        and om.role in ('owner','admin'))
       order by a.occurred_at desc
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) x;
$fn$;

grant execute on function iam.my_access_log(integer, integer) to authenticated;
grant execute on function iam.org_access_log(uuid, integer) to authenticated;

-- ═════════════════════════════════════════════════ 5. can this person walk through this door?
-- 🚨 SO THE AFFORDANCE CAN BE ABSENT RATHER THAN DEAD (law 4). The refusal screen may not guess:
-- whether a door exists depends on the record's CLASS and on the viewer's standing in the
-- organization that owns the row — neither of which the browser can read, because the row is
-- exactly the thing it cannot see. This answers in one call and discloses nothing else: no title,
-- no owner, no organization name, no hint about a record the caller has no access to.
create or replace function iam.emergency_door_eligibility(p_token text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'iam', 'platform', 'hr', 'public'
as $fn$
declare
  v_uid uuid := auth.uid(); v_class text; v_t record; v_is_admin boolean; v_pending uuid;
begin
  if v_uid is null then
    return jsonb_build_object('eligible', false, 'reason', 'anonymous');
  end if;

  v_class := iam.emergency_door_class(p_token);
  if v_class is null or v_class not in ('private', 'confidential') then
    return jsonb_build_object('eligible', false, 'reason', 'no_door_for_this_class');
  end if;

  select * into v_t from iam._door_target(p_token, p_id);
  if v_t.o_org is null then
    return jsonb_build_object('eligible', false, 'reason', 'no_such_row');
  end if;
  if v_t.o_subject = v_uid then
    return jsonb_build_object('eligible', false, 'reason', 'self');
  end if;

  select bool_or(om.role in ('owner','admin')) into v_is_admin
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org;
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('eligible', false, 'reason', 'not_an_org_admin');
  end if;

  if not exists (select 1 from platform.shareable_resource_registry srr
                  where srr.is_active and srr.resource_type = p_token) then
    return jsonb_build_object('eligible', false, 'reason', 'token_not_grantable');
  end if;

  -- An ask already in flight is not a second ask. The screen says so instead of offering a
  -- button that would silently write a duplicate row.
  select q.id into v_pending from iam.emergency_door_request q
   where q.target_token = p_token and q.target_id = p_id and q.requested_by = v_uid
     and q.status = 'pending' and q.request_expires_at > now()
   limit 1;

  return jsonb_build_object(
    'eligible', v_pending is null, 'data_class', v_class,
    'reason', case when v_pending is null then 'ok' else 'already_pending' end,
    'pending_request_id', v_pending,
    'needs_second_person', v_class = 'private');
end $fn$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select 'iam', 'emergency_door_eligibility', 'p_token text, p_id uuid',
       'iam_emergency_door_dd137a4',
       'Answers ONE question for the access-refusal screen: may this caller open the emergency door on this record, and is one of their own asks already pending. Scoping is inside — class, organization standing and ownership are all resolved for auth.uid(). It discloses nothing about the record itself (no title, owner, organization or existence beyond a yes/no reason code), so it cannot be used to probe for rows; it exists so the "Request emergency access" affordance can be ABSENT for somebody who would only ever be refused, instead of dead.'
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'iam' and d.function_name = 'emergency_door_eligibility');

grant execute on function iam.emergency_door_eligibility(text, uuid) to authenticated;

-- ═════════════════════════════════════════════════ 6. the assertions
do $$
declare v_n integer; v_oid oid;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='iam' and table_name='access_audit'
                    and column_name='granted_to_user_id') then
    raise exception 'dd137a4: iam.access_audit.granted_to_user_id was not added';
  end if;

  -- no historical row is left without a grantee
  select count(*) into v_n from iam.access_audit
   where granted_to_user_id is null and actor_user_id is not null;
  if v_n > 0 then
    raise exception 'dd137a4: % audit rows still name nobody as the key holder', v_n;
  end if;

  -- every `approved` row's grantee is the REQUESTER, never the approver
  select count(*) into v_n
    from iam.access_audit a join iam.emergency_door_request q on q.id = a.request_id
   where a.action = 'approved' and a.granted_to_user_id is distinct from q.requested_by;
  if v_n > 0 then
    raise exception 'dd137a4: % approved rows still name the approver as the key holder', v_n;
  end if;

  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='iam' and p.proname='my_access_log') !~ 'grantee_label' then
    raise exception 'dd137a4: the subject page still cannot name the key holder';
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_eligibility';
  if v_oid is null or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'dd137a4: the eligibility door is not callable by a signed-in person';
  end if;

  -- the refused-approval notice exists
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='iam' and p.proname='emergency_door_approve')
     !~ 'emergency_door_denied' then
    raise exception 'dd137a4: a refused approval still tells the subject nothing';
  end if;

  raise notice 'dd137a4: all assertions passed';
end $$;
