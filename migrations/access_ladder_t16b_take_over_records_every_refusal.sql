-- chair-step: replaces the take-over function body only; its DELETE statements (sessions, one-time links, second factors, outside sign-ins) run only inside a deliberate, audited account take-over, never at apply time.
-- based-on: public.org_admin_take_over_account(uuid, uuid, text, text, text) b0e104ef62ceed405cc570558f247ce85bb7d2471fce9a0305f8142fe59d37fd
-- ACCESS LADDER T-16b: every refused take-over is RECORDED (iam.access_audit) and returned, never
-- raised (a raise rolls the record back). The organization's log still keeps only its own people
-- (iam._record_access_audit, DD-213c). Same signature, same door row.
create or replace function public.org_admin_take_over_account(
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
  v_why text; v_code text;
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
  select om.role::text into v_target_role
    from iam.organization_member om
   where om.organization_id = p_org_id and om.user_id = p_user_id;

  -- 🚨 EVERY REFUSAL IS RECORDED (the audit is the guarantee): each one below writes an
  -- iam.access_audit row and RETURNS the refusal, because a raise would roll the record back.
  -- iam._record_access_audit keeps an organization's log to its own people (DD-213c): a
  -- stranger's knock on an organization they have no standing in is refused and not recorded.
  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    v_code := 'not_an_org_admin';
    v_why := 'Only an owner or admin of this organization can take over a member''s account.';
  elsif p_user_id = v_uid then
    v_code := 'self'; v_why := 'You cannot take over your own account.';
  elsif v_target_role is null then
    v_code := 'not_a_member'; v_why := 'That person is not a member of this organization.';
  elsif v_target_role = 'owner' then
    v_code := 'target_is_owner';
    v_why := 'An owner''s account cannot be taken over by anyone in the organization.';
  elsif v_target_role = 'admin' and v_caller_role <> 'owner' then
    v_code := 'admin_needs_owner'; v_why := 'Only an owner can take over an admin''s account.';
  -- A platform admin's account carries the admin system; no organization takes it over.
  elsif exists (select 1 from public.current_user_is_admin cua
                 where cua.user_id = p_user_id and cua.is_admin is true) then
    v_code := 'platform_admin';
    v_why := 'This account belongs to a platform administrator and cannot be taken over by an organization.';
  end if;

  -- 🚨 A MANAGED ACCOUNT ONLY (the Google Workspace model: an admin controls the accounts the
  -- organization owns, never a person's own account that joined it). A person may belong to
  -- unlimited organizations; taking over an account that also belongs to others would hand this
  -- organization every other organization's work.
  if v_code is null then
    select count(*) into v_other_orgs
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id and o.archived_at is null
     where om.user_id = p_user_id and om.organization_id <> p_org_id;
    if v_other_orgs > 0 then
      v_code := 'not_a_managed_account';
      v_why := format('This account also belongs to %s other organization(s), so it is the person''s own account, not one this organization manages. Only an account that belongs to this organization alone can be taken over. To keep their work here, transfer it through offboarding; to stop their access, suspend or remove them.', v_other_orgs);
    end if;
  end if;

  if v_code is null and not exists (
       select 1 from platform.categories cat
        where cat.dimension = 'access_purpose' and cat.slug = p_purpose
          and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
          and cat.deleted_at is null) then
    v_code := 'unregistered_purpose';
    v_why := format('Pick a reason category from the list (%s).',
      (select string_agg(cat.slug, ', ' order by cat.slug) from platform.categories cat
        where cat.dimension = 'access_purpose'
          and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
          and cat.deleted_at is null));
  end if;

  if v_code is null then
    v_min := coalesce(
      (platform.knob_resolve('platform.access', 'account_takeover_reason_min_chars', p_org_id, null, null) #>> '{}')::integer,
      40);
    if p_reason is null or length(btrim(p_reason)) < v_min then
      v_code := 'reason_too_short';
      v_why := format('Say why, in at least %s characters. This sentence is sent to the person whose account it is.', v_min);
    elsif p_new_password is null or length(p_new_password) < 12 then
      v_code := 'password_too_short'; v_why := 'The new password must be at least 12 characters.';
    end if;
  end if;

  if v_code is not null then
    v_audit := iam._record_access_audit(
      p_org_id, 'account_takeover', 'user', 'private', coalesce(p_purpose, '(none given)'), 'refused',
      false, ARRAY[p_user_id], null, p_user_id, p_reason, v_why, null, null, null, false, v_uid, v_uid);
    return jsonb_build_object('taken_over', false, 'reason', v_code, 'message', v_why, 'audit_id', v_audit);
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

