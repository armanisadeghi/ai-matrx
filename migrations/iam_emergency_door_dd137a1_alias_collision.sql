-- iam_emergency_door_dd137a1 — the `r` alias collision in iam.emergency_door_open (DD-137a).
--
-- 🚨 RED, proven live on the first forcing run: `55000 record "r" is not assigned yet`. The
-- function DECLAREs `r record` for the owner-notification loop, and a later subquery aliased
-- `platform.shareable_resource_registry r` — plpgsql resolves the name to its own unassigned
-- variable before the SQL alias, so the token check raised instead of answering. The door refused
-- everything, which is the safe direction to fail in and still a defect.
--
-- The class, not the instance: a plpgsql record variable named like a common SQL alias is a trap
-- in every definer door. This function now uses `v_`-prefixed names for every local, which is the
-- convention the rest of the door already followed.

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

  -- 🚨 ONE DOOR (chair R4). An HR token keeps HR's own vetoes — subject-exclusion, the medical
  -- note class, the five structurally doorless tokens — so the platform door DELEGATES rather
  -- than building a second, weaker path beside it. hr_break_glass writes the platform audit row
  -- and the subject notification itself.
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

  -- ══════════ the `private` procedure: TWO PEOPLE, NEVER ONE
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

  -- ══════════ the `confidential` procedure: one organization admin, opened now
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                               status, expires_at, created_by)
  values (p_token, p_id, v_uid, 'viewer', 'active', v_expires, v_uid)
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set expires_at = excluded.expires_at, status = 'active'
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

comment on function iam.emergency_door_open(text, uuid, text, text) is
  'THE emergency door for the whole platform (DD-137a, VISIBILITY-BY-CLASS §3.5). `confidential`: one organization admin opens it now. `private`: an admin requests and the organization OWNER approves — two people, never one. Always read-only (`viewer`), always time-boxed by platform.access.emergency_door_ttl_minutes, always audited on grant AND on refusal, and the subject is always told. An HR token is delegated to public.hr_break_glass so HR''s absolute vetoes still apply — one door, never two.';

grant execute on function iam.emergency_door_open(text, uuid, text, text) to authenticated;

-- the guard against the class returning: no plpgsql record variable in this door may share a name
-- with a SQL alias it uses.
do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'iam' and p.proname = 'emergency_door_open';
  if v_src ~ 'shareable_resource_registry r\M' then
    raise exception 'dd137a1: the `r` alias collision is still there';
  end if;
  if v_src !~ 'v_rec record' then
    raise exception 'dd137a1: the notification loop variable was not renamed';
  end if;
  raise notice 'dd137a1: assertions passed';
end $$;
