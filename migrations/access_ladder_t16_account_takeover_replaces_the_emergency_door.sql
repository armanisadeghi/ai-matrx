-- chair-step: retires the organization-admin emergency door (access ladder T-16, Arman 2026-09-26): drops its functions, triggers and lane field, deletes its door rows (retirement rows written), revokes client access to its empty request table; no person's data is removed (0 requests, 0 live grants at retirement).
-- based-on: iam.class_lanes(text) 0bbf84ffc94b46ce9dc9aad46aa913ba4e28c58d1419422a7077c5d32a8e54a8
-- based-on: iam.supersede_bespoke_policies(text, text, text[], text) 7be1d2f23c1091ea9723e887a1368360858180019233f5108504bc0f013606bc
-- ACCESS LADDER T-16 (common-docs/policies/access-ladder.md, Arman 2026-09-26):
--   Private = the owner alone. "An organization admin's only way in is taking over the account
--   (the Google Workspace model); there is no standing admin read."
--   Confidential = the owner and the people the record's own rules name. HR break-glass stays as
--   HR's own audited door (public.hr_break_glass) and is untouched here.
--
-- What this does:
--   1. Retires the organization-admin emergency door: iam.emergency_door_open / _approve / _deny /
--      _eligibility / _pending / _sweep / _lapsed_grants / _purposes / _class, its two knob readers,
--      its door rows, its three notice types, and its knobs. iam.emergency_door_request keeps its
--      history (0 rows at retirement) but no writer and no client grant.
--   2. Removes the door's lane: iam.class_lanes no longer answers `emergency_door`, and the field is
--      dropped from platform.lane_set.
--   3. Replaces the private-grant guard: the old one refused a non-owner's grant on a private or
--      confidential row UNLESS the door had set `iam.emergency_door=on`. The new one has no bypass.
--   4. Adds ONE account take-over door, public.org_admin_take_over_account — the Google Workspace /
--      Microsoft 365 procedure: sign the person out everywhere, reset how the account signs in,
--      written reason, the person told, audited in both the organization's log and the person's own
--      access log. Only for an account this organization alone holds (a managed account); a person's
--      own account that also belongs to other organizations is never taken over by one of them.
--      Their work leaves through the existing offboarding transfer (HR offboarding / hr_transfer).
--   5. A DDL guard refuses the door back (any function named emergency_door*, a call to a retired
--      door function, the bypass setting, the lane assignment, or the lane_set field).
--   Platform admins' read inside the admin apps (platform_admin_lane) is untouched.

-- ── 1. The door's functions go ─────────────────────────────────────────────────────────────────
drop function iam.emergency_door_open(text, uuid, text, text);
drop function iam.emergency_door_approve(uuid, text);
drop function iam.emergency_door_deny(uuid, text);
drop function iam.emergency_door_eligibility(text, uuid);
drop function iam.emergency_door_pending();
drop function iam.emergency_door_sweep();
drop function iam.emergency_door_lapsed_grants();
drop function iam.emergency_door_purposes();
drop function iam._door_ttl_minutes(uuid);
drop function iam._door_min_chars(uuid);

-- A door follows its function: the rows go with them, and the retirement is written down.
insert into platform.client_callable_door_retirement
  (schema_name, function_name, identity_args, retirement_class, retired_reason, successor,
   was_reason, was_declared_by, retired_by)
select d.schema_name, d.function_name, d.identity_args, 'not_a_function',
       'Access ladder T-16 (Arman 2026-09-26): the organization-admin emergency door is retired. Private is the owner alone and an organization admin''s only way in is taking over the account; there is no standing admin read.',
       'public.org_admin_take_over_account(p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_new_password text)',
       d.reason, d.declared_by, 'access_ladder_t16_account_takeover_replaces_the_emergency_door'
  from platform.client_callable_door d
 where d.schema_name = 'iam' and d.function_name like 'emergency\_door\_%';
delete from platform.client_callable_door
 where schema_name = 'iam' and function_name like 'emergency\_door\_%';

-- ── 3. The private-grant guard, with no bypass ─────────────────────────────────────────────────
create or replace function iam._guard_private_grant_owner_only()
returns trigger
language plpgsql
security definer
set search_path to 'iam', 'platform', 'hr', 'public'
as $function$
declare v_class text; t record; v_uid uuid := auth.uid();
begin
  -- HR's tokens are guarded by HR's own door (public.hr_break_glass) and its own guard.
  if exists (select 1 from hr._door_spec(new.resource_type)) then
    return new;
  end if;
  -- The server (no signed-in caller) writes grants through iam.share_with_person's own rules.
  if v_uid is null then
    return new;
  end if;

  v_class := iam.class_gate_class(new.resource_type);
  if v_class is null or v_class not in ('private', 'confidential') then
    return new;
  end if;

  select * into t from iam._door_target(new.resource_type, new.resource_id);
  if t.o_subject is null or t.o_subject = v_uid then
    return new;                                     -- the owner sharing their own record
  end if;

  raise exception
    'owner_only: % is % data. Only its owner can share it; nobody else can write a grant on it.',
    new.resource_type, v_class
    using errcode = '42501',
          hint = 'There is no emergency door (access ladder T-16). An organization owner or admin''s only way into a member''s private data is taking over that account: public.org_admin_take_over_account — a written reason, the person told, audited. A person''s work leaves through offboarding''s transfer.';
end $function$;

drop trigger _iam_emergency_door_grant_guard_ins on iam.permissions;
drop trigger _iam_emergency_door_grant_guard_upd on iam.permissions;
create trigger _iam_private_grant_owner_only_ins
  before insert on iam.permissions
  for each row execute function iam._guard_private_grant_owner_only();
create trigger _iam_private_grant_owner_only_upd
  before update of resource_type, resource_id, granted_to_user_id, permission_level, expires_at on iam.permissions
  for each row execute function iam._guard_private_grant_owner_only();
drop function iam._guard_emergency_door_grant();
drop function iam.emergency_door_class(text);

-- ── 2. The lane goes from iam.class_lanes and from platform.lane_set ───────────────────────────
do $do$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('iam.class_lanes(text)'::regprocedure);
  v_new := regexp_replace(v_def,
    '\n\s*r\.emergency_door\s*:=\s*case v_class\s*when ''private''\s*then ''owner_plus_approver''\s*when ''confidential'' then ''one_admin''\s*else ''none'' end;',
    E'\n  -- ACCESS LADDER T-16: there is no emergency-door lane. Private is the owner alone; an\n  -- organization admin''s only way in is taking over the account (public.org_admin_take_over_account).',
    'g');
  if v_new = v_def then
    raise exception 'T-16: iam.class_lanes no longer carries the emergency_door assignment this migration removes; re-read the live body';
  end if;
  execute v_new;
end
$do$;
alter type platform.lane_set drop attribute emergency_door;

-- The refusal that still told people "org admins go through the audited emergency door".
do $do$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('iam.supersede_bespoke_policies(text, text, text[], text)'::regprocedure);
  v_new := replace(v_def,
    'The admin system keeps full read access; org admins go through the audited emergency door.',
    'The admin system keeps full read access; an organization admin''''s only way into a member''''s private data is taking over the account.');
  if v_new = v_def then
    raise exception 'T-16: iam.supersede_bespoke_policies no longer carries the emergency-door sentence; re-read the live body';
  end if;
  execute v_new;
end
$do$;

-- ── Knobs: the door's retire, the take-over's floor is born ────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction, bound_value,
   ui, taxonomy_node_id, propagation, public_read, delegable, not_delegable_reason)
select feature, 'account_takeover_reason_min_chars', value, default_value, value_type, unit,
       min_value, max_value, allowed_values,
       'Account take-over reason minimum',
       'The shortest written reason an organization owner or admin must give to take over a member''s account. The reason is recorded and sent to the person.',
       set_by,
       'Carried from the retired emergency door''s floor (40 characters is one real sentence). Tightening only: a take-over opens everything the account holds.',
       review_due, overridable_by, override_direction, bound_value, ui, taxonomy_node_id,
       propagation, public_read, delegable, not_delegable_reason
  from platform.feature_knob
 where feature = 'platform.access' and key = 'emergency_door_justification_min_chars';

update platform.feature_knob
   set archived_at = now(),
       archived_reason = 'Access ladder T-16: the organization-admin emergency door is retired; account take-over replaced it.',
       archived_by = 'access_ladder_t16_account_takeover_replaces_the_emergency_door'
 where (feature, key) in (('platform.access', 'emergency_door_justification_min_chars'),
                          ('platform.access', 'emergency_door_ttl_minutes'),
                          ('custom', 'emergency_door_guard'))
   and archived_at is null;

-- ── Notices: the door's three go, the take-over's one is born ──────────────────────────────────
update communication.notification_event_type
   set deleted_at = now()
 where event_key in ('platform.access.emergency_door_requested',
                     'platform.access.emergency_door_approval_needed',
                     'platform.access.emergency_door_denied')
   and deleted_at is null;
-- platform.access.emergency_door_opened stays: public.hr_break_glass (HR's own door) sends it.

insert into communication.notification_event_type
  (event_key, label, description, default_channels, organization_id, visibility)
values ('platform.access.account_taken_over',
        'Your account was taken over',
        'An owner or admin of an organization that manages your account signed you out everywhere and reset how it signs in, with a written reason.',
        '{"email": true, "in_app": true}'::jsonb,
        '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
        'internal'::platform.visibility);

-- The retired request table keeps its history and nothing else.
revoke all on iam.emergency_door_request from anon, authenticated;
comment on table iam.emergency_door_request is
  'RETIRED (access ladder T-16, 2026-09-28): history of the organization-admin emergency door, which no longer exists. No writer, no client access. Account take-over (public.org_admin_take_over_account) replaced it.';

-- ── 4. THE ACCOUNT TAKE-OVER DOOR ──────────────────────────────────────────────────────────────
create function public.org_admin_take_over_account(
  p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_caller_role text; v_target_role text; v_min integer; v_other_orgs integer;
  v_sessions integer; v_factors integer; v_identities integer; v_tokens integer;
  v_audit uuid; v_email text; v_channels text[]; ch text; v_notices integer := 0;
begin
  if v_uid is null then
    raise exception 'org_admin_take_over_account: no signed-in caller' using errcode = '42501';
  end if;

  -- The caller must be an owner or admin of THIS organization, by their own membership. Platform
  -- admins act inside the admin apps; this door is the organization's, and it asks the membership.
  select om.role::text into v_caller_role
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
   where om.organization_id = p_org_id and om.user_id = v_uid;
  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Only an owner or admin of this organization can take over a member''s account.'
      using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot take over your own account.' using errcode = '42501';
  end if;

  select om.role::text into v_target_role
    from iam.organization_member om
   where om.organization_id = p_org_id and om.user_id = p_user_id;
  if v_target_role is null then
    raise exception 'That person is not a member of this organization.' using errcode = '23503';
  end if;
  if v_target_role = 'owner' then
    raise exception 'An owner''s account cannot be taken over by anyone in the organization.'
      using errcode = '42501';
  end if;
  if v_target_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'Only an owner can take over an admin''s account.' using errcode = '42501';
  end if;

  -- A platform admin's account carries the admin system; no organization takes it over.
  if exists (select 1 from public.current_user_is_admin cua
              where cua.user_id = p_user_id and cua.is_admin is true) then
    raise exception 'This account belongs to a platform administrator and cannot be taken over by an organization.'
      using errcode = '42501';
  end if;

  -- 🚨 A MANAGED ACCOUNT ONLY (the Google Workspace model: an admin controls the accounts the
  -- organization owns, never a person's own account that joined it). A person may belong to
  -- unlimited organizations; taking over an account that also belongs to others would hand this
  -- organization every other organization's work.
  select count(*) into v_other_orgs
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
   where om.user_id = p_user_id and om.organization_id <> p_org_id;
  if v_other_orgs > 0 then
    raise exception 'This account also belongs to % other organization(s), so it is the person''s own account, not one this organization manages. Only an account that belongs to this organization alone can be taken over.', v_other_orgs
      using errcode = '42501',
            hint = 'To keep their work for the organization, transfer it through offboarding. To stop their access here, suspend or remove them.';
  end if;

  if not exists (select 1 from platform.categories cat
                  where cat.dimension = 'access_purpose' and cat.slug = p_purpose
                    and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and cat.deleted_at is null) then
    raise exception 'Pick a reason category from the list (%).',
      (select string_agg(cat.slug, ', ' order by cat.slug) from platform.categories cat
        where cat.dimension = 'access_purpose'
          and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
          and cat.deleted_at is null)
      using errcode = '22023';
  end if;

  v_min := coalesce(
    (platform.knob_resolve('platform.access', 'account_takeover_reason_min_chars', p_org_id, null, null) #>> '{}')::integer,
    40);
  if p_reason is null or length(btrim(p_reason)) < v_min then
    raise exception 'Say why, in at least % characters. This sentence is sent to the person whose account it is.', v_min
      using errcode = '22023';
  end if;
  if p_new_password is null or length(p_new_password) < 12 then
    raise exception 'The new password must be at least 12 characters.' using errcode = '22023';
  end if;

  -- ── THE TAKE-OVER: signed out everywhere, every other way in closed, a new password set.
  select u.email into v_email from auth.users u where u.id = p_user_id;
  update auth.users
     set encrypted_password     = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         recovery_token         = '',
         email_change           = '',
         email_change_token_new = '',
         email_change_token_current = '',
         reauthentication_token = '',
         updated_at             = now()
   where id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;           -- refresh tokens go with them
  get diagnostics v_sessions = row_count;
  delete from auth.one_time_tokens where user_id = p_user_id;    -- outstanding reset / magic links
  get diagnostics v_tokens = row_count;
  delete from auth.mfa_factors where user_id = p_user_id;        -- their second factor is theirs
  get diagnostics v_factors = row_count;
  delete from auth.identities where user_id = p_user_id and provider not in ('email', 'phone');
  get diagnostics v_identities = row_count;                      -- "Sign in with Google" etc.

  -- ── THE RECORD: the person's own access log and the organization's governance log.
  v_audit := iam._record_access_audit(
    p_org_id, 'account_takeover', 'user', 'private', p_purpose, 'account_takeover', true,
    ARRAY[p_user_id], null, p_user_id, p_reason, null, null, null, null, false, v_uid, v_uid);
  perform iam._org_audit(p_org_id, p_user_id, 'member.account_takeover',
    jsonb_build_object('purpose', p_purpose, 'reason', p_reason, 'access_audit_id', v_audit,
                       'sessions_ended', v_sessions, 'links_voided', v_tokens,
                       'second_factors_removed', v_factors, 'outside_sign_ins_removed', v_identities));

  -- ── THE PERSON IS TOLD. Fails toward telling: an unregistered channel list still reaches in-app.
  select coalesce((select array_agg(key) from jsonb_each(t.default_channels) where value = 'true'::jsonb),
                  ARRAY['in_app'])
    into v_channels
    from communication.notification_event_type t
   where t.event_key = 'platform.access.account_taken_over' and t.deleted_at is null
   limit 1;
  v_channels := coalesce(v_channels, ARRAY['in_app']);
  begin
    foreach ch in array v_channels loop
      insert into communication.notification
        (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
         subject, body, target_kind, target_id, deep_link, dedupe_key, visibility)
      values (p_org_id, 'platform.access.account_taken_over', p_user_id, 'user', ch,
              jsonb_build_object('taken_over_by', v_uid, 'purpose', p_purpose, 'reason', p_reason,
                                 'audit_id', v_audit, 'organization_id', p_org_id),
              'Your account was taken over',
              format('%s, an %s of %s, took over your account (%s). You were signed out everywhere and your password was changed.%sThe reason they gave: "%s".%sThis is recorded permanently on your access page. If you did not expect this, contact the organization.',
                     coalesce((select u.email from auth.users u where u.id = v_uid), 'someone'),
                     v_caller_role,
                     coalesce((select o.name from iam.organizations o where o.id = p_org_id), 'your organization'),
                     coalesce(v_email, 'your account'), E'\n\n', p_reason, E'\n\n'),
              'iam_access_audit', v_audit, '/me/access-log',
              'takeover:' || v_audit::text || ':' || ch, 'personal'::platform.visibility)
      on conflict do nothing;
      v_notices := v_notices + 1;
    end loop;
  exception when others then
    raise warning 'org_admin_take_over_account: the person could not be told (% %). The take-over happened and is recorded.', sqlstate, sqlerrm;
    perform iam._record_access_audit(
      p_org_id, 'notice_failed', 'user', 'private', 'audit', 'refused', false, ARRAY[p_user_id],
      null, p_user_id, null, format('the person could not be told: %s %s', sqlstate, sqlerrm),
      null, null, null, false, v_uid, v_uid);
  end;

  return jsonb_build_object(
    'taken_over', true, 'user_id', p_user_id, 'email', v_email, 'audit_id', v_audit,
    'sessions_ended', v_sessions, 'links_voided', v_tokens, 'second_factors_removed', v_factors,
    'outside_sign_ins_removed', v_identities, 'notices', v_notices,
    'message', format('You can now sign in as %s with the new password. They were signed out everywhere and told why. To move their work to someone else, use offboarding''s transfer.', coalesce(v_email, 'this account')));
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, gate_predicate, argument_rules)
values ('public', 'org_admin_take_over_account',
        'p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_new_password text',
        ARRAY['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'THE account take-over door (access ladder T-16), the only way an organization owner or admin reaches a member''s private data. p_org_id: the caller''s OWN owner/admin membership in it is checked first (iam.organization_member, archived organizations closed); never null. p_user_id: must be a member of p_org_id, not the caller, not an owner, an admin only for an owner, not a platform admin, and in NO other organization (a managed account only); never null. Written reason (knob floor), registered purpose, the person notified, recorded in iam.access_audit and iam.org_admin_audit.',
        'access_ladder_t16_account_takeover_replaces_the_emergency_door',
        null, true, false, 'auth.uid()',
        jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
          'p_org_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_org_id -> caller''s own owner/admin row in iam.organization_member',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'caller membership checked before anything is read')),
          'p_user_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_user_id -> member of p_org_id and of no other organization',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'target membership checked before anything is written')),
          'p_purpose', jsonb_build_object('type', 'text', 'position', 3, 'optional', false, 'null_rule', '{}'::jsonb, 'foreign', jsonb_build_object('not_an_id', true)),
          'p_reason', jsonb_build_object('type', 'text', 'position', 4, 'optional', false, 'null_rule', '{}'::jsonb, 'foreign', jsonb_build_object('not_an_id', true)),
          'p_new_password', jsonb_build_object('type', 'text', 'position', 5, 'optional', false, 'null_rule', '{}'::jsonb, 'foreign', jsonb_build_object('not_an_id', true)))));

-- (The definer guard already took PUBLIC/anon EXECUTE away at CREATE; the door row keeps signed-in only.)
grant execute on function public.org_admin_take_over_account(uuid, uuid, text, text, text) to authenticated;

-- ── 5. THE GUARD THAT REFUSES THE DOOR BACK ────────────────────────────────────────────────────
create or replace function platform._no_org_admin_emergency_door()
returns event_trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  -- Assembled so this body never names what it refuses.
  c_w constant text := 'emergency' || '_' || 'door';
  c_call constant text := '\m' || c_w || '_(open|approve|deny|eligibility|pending|sweep|lapsed_grants|purposes|class)\s*\(';
  c_bypass constant text := 'iam\.' || c_w || '''';
  c_lane constant text := '\m' || c_w || '\s*:=';
  c_hint constant text := 'Access ladder T-16 (common-docs/policies/access-ladder.md, Arman 2026-09-26): Private is the owner alone and an organization admin''s only way in is taking over the account (public.org_admin_take_over_account) — there is no standing admin read and no emergency door. HR break-glass is HR''s own door and is not this. Platform admins read inside the admin apps.';
  cmd record; v_name text; v_src text; v_ident text;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.in_extension then continue; end if;
    if cmd.classid = 'pg_catalog.pg_proc'::regclass then
      select p.proname, p.prosrc, p.oid::regprocedure::text into v_name, v_src, v_ident
        from pg_proc p where p.oid = cmd.objid;
      if v_name ~ ('^' || c_w) then
        raise exception 'The organization-admin emergency door is retired: % may not be created.', v_ident
          using errcode = 'check_violation', hint = c_hint;
      end if;
      if v_src ~ c_call or v_src ~ c_bypass or v_src ~* c_lane then
        raise exception 'The organization-admin emergency door is retired: % calls it, sets its bypass, or answers its lane.', v_ident
          using errcode = 'check_violation', hint = c_hint;
      end if;
    end if;
  end loop;
  if exists (select 1 from pg_attribute a
              where a.attrelid = (select t.typrelid from pg_type t where t.oid = to_regtype('platform.lane_set'))
                and a.attname = c_w and a.attnum > 0 and not a.attisdropped) then
    raise exception 'The organization-admin emergency door is retired: platform.lane_set may not carry its lane again.'
      using errcode = 'check_violation', hint = c_hint;
  end if;
end $function$;

create event trigger no_org_admin_emergency_door on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION', 'CREATE PROCEDURE', 'ALTER TYPE', 'CREATE TYPE')
  execute function platform._no_org_admin_emergency_door();
