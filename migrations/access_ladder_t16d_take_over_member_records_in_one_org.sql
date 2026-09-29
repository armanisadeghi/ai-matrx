-- ACCESS LADDER T-16d (owner-session ruling 2026-09-28): the SECOND take-over mode.
--
-- public.org_admin_take_over_account (T-16/T-16b) stays exactly as built: whole-account take-over,
-- only for an account that belongs to this organization alone (Google Workspace / Microsoft 365
-- managed account). A member who is ALSO in other organizations owns their own account; one of
-- those organizations may never sign them out or reset their password.
--
-- For that member this adds ONE org-scoped door, public.org_admin_take_over_member_records:
--   an owner/admin of organization X, with a registered reason category and a written reason,
--   moves ownership of that member's records INSIDE X — their Private records in X included — to a
--   named member of X (default: the acting admin). Their sign-in, sessions, second factors, and
--   everything they hold in every other organization are never touched. The person is told (email +
--   in-app), it is recorded on their own access log (iam.access_audit) and X's log
--   (iam.org_admin_audit), and every refusal is recorded and RETURNED (never raised).
--
-- What moves: every registered entity table (platform.entity_types, active, not a component — a
-- component follows its parent) that carries organization_id and an owner column (created_by, else
-- owner_id — the same owner rule iam._door_target uses), for rows owned by the member with
-- organization_id = X. What never moves (iam._org_records_owned_by, one list with its reasons):
--   Confidential tables — their own rules name who may open them; HR has its own door; credentials,
--     browser profiles and passkeys are a person's keys, not the organization's work.
--   System / ledger / reference / restricted tables — machinery and history, not a person's work.
--   Schemas hr (HR's own door and offboarding), billing (money history), runtime (request logs).
--   notification, notification_channel_preference, knob_override, app_setting, app_sync_status,
--     user_form_profile — addressed to or configuring the person, not work.
--   custom.record rows one by one — custom data is owned by its Table; each custom Table the member
--     owns here moves through the custom data system's own door, custom.table_transfer_owner.
-- A table whose rows cannot move (a uniqueness clash with the recipient's own rows, a table guard)
-- does not stop the rest: it is named in the result, the org log and the notice.
--
-- Also: public.org_admin_take_over_options(org, user) — the read the one "Take over account"
-- dialog uses to offer the right mode automatically (member of no other organization -> whole
-- account; otherwise -> records in this organization), with the per-type counts. It never names
-- the other organizations.

-- ── The one list of what an org-scoped take-over moves ─────────────────────────────────────────
create function iam._org_records_owned_by(p_org_id uuid, p_user_id uuid)
returns table (token text, label text, data_class text, schema_name text, table_name text,
               owner_column text, row_count bigint)
language plpgsql
stable
security definer
set search_path to 'iam', 'platform', 'public', 'pg_temp'
as $function$
declare r record; v_n bigint;
begin
  for r in
    select et.token, coalesce(et.label, et.token) as label, et.data_class::text as data_class,
           et.schema_name, et.table_name,
           case when exists (select 1 from information_schema.columns c
                              where c.table_schema = et.schema_name and c.table_name = et.table_name
                                and c.column_name = 'created_by') then 'created_by'
                when exists (select 1 from information_schema.columns c
                              where c.table_schema = et.schema_name and c.table_name = et.table_name
                                and c.column_name = 'owner_id') then 'owner_id' end as owner_column
      from platform.entity_types et
     where et.is_active
       and not et.is_component                                   -- a component follows its parent
       and et.type = 'entity'                                    -- a person's work, not machinery
       and et.data_class::text in ('organization', 'public', 'private')   -- never Confidential
       and et.schema_name not in ('hr', 'billing', 'runtime')
       and et.token not in ('notification', 'notification_channel_preference', 'knob_override',
                            'app_setting', 'app_sync_status', 'user_form_profile',
                            'record')   -- custom data moves by its Table, below
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'organization_id')
     order by et.data_class::text desc, et.token
  loop
    continue when r.owner_column is null;
    execute format('select count(*) from %I.%I where %I = $1 and organization_id = $2',
                   r.schema_name, r.table_name, r.owner_column)
       into v_n using p_user_id, p_org_id;
    continue when v_n = 0;
    token := r.token; label := r.label; data_class := r.data_class; schema_name := r.schema_name;
    table_name := r.table_name; owner_column := r.owner_column; row_count := v_n;
    return next;
  end loop;
  -- Custom data (custom.record) is owned by its Table: a custom Table the member owns here moves
  -- through the custom data system's own door, custom.table_transfer_owner (its rows follow it).
  select count(*) into v_n from custom.record t
   where t.table_id = custom.table_kernel_id() and t.deleted_at is null
     and t.created_by = p_user_id and t.organization_id = p_org_id;
  if v_n > 0 then
    token := 'custom_table'; label := 'Table'; data_class := 'organization'; schema_name := 'custom';
    table_name := 'record'; owner_column := 'created_by'; row_count := v_n;
    return next;
  end if;
end $function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', '_org_records_owned_by', 'p_org_id uuid, p_user_id uuid',
        ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
        'Internal list of what an org-scoped take-over moves. p_org_id and p_user_id are NOT checked here: both callers (public.org_admin_take_over_options and public.org_admin_take_over_member_records) check the caller''s own owner/admin membership of p_org_id and p_user_id''s membership before calling it. Never null in practice; a null matches no row.',
        'access_ladder_t16d_take_over_member_records_in_one_org',
        'server_only: called only inside the two access-ladder take-over doors after their own owner/admin check; no client ever calls it directly.',
        false, false);

-- ── The dialog's read: which mode, and what it would move ──────────────────────────────────────
create function public.org_admin_take_over_options(p_org_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_role text; v_other integer; v_records jsonb;
begin
  select om.role::text into v_role
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
   where om.organization_id = p_org_id and om.user_id = v_uid;
  if v_uid is null or v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'Only an owner or admin of this organization can see take-over options.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from iam.organization_member om
                  where om.organization_id = p_org_id and om.user_id = p_user_id) then
    raise exception 'That person is not a member of this organization.' using errcode = '23503';
  end if;

  select count(*) into v_other
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
   where om.user_id = p_user_id and om.organization_id <> p_org_id;

  select coalesce(jsonb_agg(jsonb_build_object('token', r.token, 'label', r.label,
                                               'data_class', r.data_class, 'count', r.row_count)
                            order by r.data_class desc, r.label), '[]'::jsonb)
    into v_records
    from iam._org_records_owned_by(p_org_id, p_user_id) r;

  return jsonb_build_object(
    'mode', case when v_other = 0 then 'account' else 'records' end,
    'in_other_organizations', v_other > 0,
    'records', v_records,
    'total', (select coalesce(sum((e ->> 'count')::bigint), 0) from jsonb_array_elements(v_records) e));
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, gate_predicate, argument_rules)
values ('public', 'org_admin_take_over_options', 'p_org_id uuid, p_user_id uuid',
        ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
        'Read for the one "Take over account" dialog (access ladder T-16d): which take-over mode applies to a member (whole account when they belong to this organization alone, their records in this organization otherwise) and per-type counts of what the records mode would move. p_org_id: the caller''s OWN owner/admin membership is checked first; never null. p_user_id: must be a member of p_org_id; the answer never names their other organizations.',
        'access_ladder_t16d_take_over_member_records_in_one_org',
        null, true, false, 'auth.uid()',
        jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
          'p_org_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_org_id -> caller''s own owner/admin row in iam.organization_member',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'caller membership checked before anything is read')),
          'p_user_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_user_id -> member of p_org_id',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'target membership checked before anything is read')))));
grant execute on function public.org_admin_take_over_options(uuid, uuid) to authenticated;

-- ── The notice ─────────────────────────────────────────────────────────────────────────────────
insert into communication.notification_event_type
  (event_key, label, description, default_channels, organization_id, visibility)
values ('platform.access.records_taken_over',
        'Your records in an organization were taken over',
        'An owner or admin of an organization you belong to moved your records in that organization to another member, with a written reason. Your sign-in and your other organizations were not touched.',
        '{"email": true, "in_app": true}'::jsonb,
        '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
        'internal'::platform.visibility);

-- ── THE ORG-SCOPED TAKE-OVER DOOR ──────────────────────────────────────────────────────────────
create function public.org_admin_take_over_member_records(
  p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_to_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_to uuid := coalesce(p_to_user_id, auth.uid());
  v_caller_role text; v_target_role text; v_min integer;
  v_why text; v_code text; v_audit uuid;
  r record; v_tbl record; v_tables integer := 0; v_n bigint; v_left bigint; v_total bigint := 0;
  v_moved jsonb := '[]'::jsonb; v_not_moved jsonb := '[]'::jsonb;
  v_email text; v_to_email text; v_org_name text; v_summary text;
  v_channels text[]; ch text; v_notices integer := 0;
begin
  if v_uid is null then
    raise exception 'org_admin_take_over_member_records: no signed-in caller' using errcode = '42501';
  end if;

  select om.role::text into v_caller_role
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
   where om.organization_id = p_org_id and om.user_id = v_uid;
  select om.role::text into v_target_role
    from iam.organization_member om
   where om.organization_id = p_org_id and om.user_id = p_user_id;

  -- 🚨 EVERY REFUSAL IS RECORDED and RETURNED (a raise would roll the record back); the
  -- organization's log keeps only its own people (iam._record_access_audit, DD-213c).
  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    v_code := 'not_an_org_admin';
    v_why := 'Only an owner or admin of this organization can take over a member''s records.';
  elsif p_user_id = v_uid then
    v_code := 'self'; v_why := 'You cannot take over your own records.';
  elsif v_target_role is null then
    v_code := 'not_a_member'; v_why := 'That person is not a member of this organization.';
  elsif v_target_role = 'owner' then
    v_code := 'target_is_owner';
    v_why := 'An owner''s records cannot be taken over by anyone in the organization.';
  elsif v_target_role = 'admin' and v_caller_role <> 'owner' then
    v_code := 'admin_needs_owner'; v_why := 'Only an owner can take over an admin''s records.';
  elsif exists (select 1 from public.current_user_is_admin cua
                 where cua.user_id = p_user_id and cua.is_admin is true) then
    v_code := 'platform_admin';
    v_why := 'This account belongs to a platform administrator and its records cannot be taken over by an organization.';
  elsif v_to = p_user_id then
    v_code := 'recipient_is_the_person';
    v_why := 'Choose someone other than the person whose records are being taken over to receive them.';
  elsif not exists (select 1 from iam.organization_member om
                     where om.organization_id = p_org_id and om.user_id = v_to) then
    v_code := 'recipient_not_a_member';
    v_why := 'The person receiving the records must be a member of this organization.';
  elsif not exists (
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
      v_why := format('Say why, in at least %s characters. This sentence is sent to the person whose records they are.', v_min);
    end if;
  end if;

  if v_code is not null then
    v_audit := iam._record_access_audit(
      p_org_id, 'records_takeover', 'user', 'private', coalesce(p_purpose, '(none given)'), 'refused',
      false, ARRAY[p_user_id], null, p_user_id, p_reason, v_why, null, null, null, false, v_uid, v_to);
    return jsonb_build_object('taken_over', false, 'reason', v_code, 'message', v_why, 'audit_id', v_audit);
  end if;

  -- ── THE MOVE: ownership of their records in THIS organization only. Sign-in is not touched.
  for r in select * from iam._org_records_owned_by(p_org_id, p_user_id) loop
    if r.token = 'custom_table' then
      -- Each custom Table through the custom data system's own audited transfer (it keeps the
      -- previous owner on the Table as an editor while they are still a member, and tells both).
      for v_tbl in select ct.id from custom.record ct
                where ct.table_id = custom.table_kernel_id() and ct.deleted_at is null
                  and ct.created_by = p_user_id and ct.organization_id = p_org_id loop
        begin
          perform custom.table_transfer_owner(v_tbl.id, v_to, p_reason);
          v_tables := v_tables + 1;
        exception when others then
          v_not_moved := v_not_moved || jsonb_build_object('token', r.token, 'label', r.label,
            'count', 1, 'why', format('%s %s', sqlstate, sqlerrm));
        end;
      end loop;
      if v_tables > 0 then
        v_moved := v_moved || jsonb_build_object('token', r.token, 'label', r.label,
          'data_class', r.data_class, 'count', v_tables);
        v_total := v_total + v_tables;
      end if;
      continue;
    end if;
    begin
      execute format('update %I.%I set %I = $1 where %I = $2 and organization_id = $3',
                     r.schema_name, r.table_name, r.owner_column, r.owner_column)
        using v_to, p_user_id, p_org_id;
      get diagnostics v_n = row_count;
      -- A table trigger that quietly puts the owner back is a failure, not a success: re-count.
      execute format('select count(*) from %I.%I where %I = $1 and organization_id = $2',
                     r.schema_name, r.table_name, r.owner_column)
         into v_left using p_user_id, p_org_id;
      if v_left > 0 then
        v_not_moved := v_not_moved || jsonb_build_object('token', r.token, 'label', r.label,
          'count', v_left, 'why', 'the table kept the original owner on some rows');
      end if;
      if v_n - v_left > 0 then
        v_moved := v_moved || jsonb_build_object('token', r.token, 'label', r.label,
          'data_class', r.data_class, 'count', v_n - v_left);
        v_total := v_total + (v_n - v_left);
      end if;
    exception when others then
      v_not_moved := v_not_moved || jsonb_build_object('token', r.token, 'label', r.label,
        'count', r.row_count, 'why', format('%s %s', sqlstate, sqlerrm));
    end;
  end loop;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  select u.email into v_to_email from auth.users u where u.id = v_to;
  select o.name into v_org_name from iam.organizations o where o.id = p_org_id;
  v_summary := coalesce((select string_agg(format('%s %s', e ->> 'count', e ->> 'label'), ', ')
                           from jsonb_array_elements(v_moved) e), 'nothing');

  -- ── THE RECORD: the person's own access log and the organization's log.
  v_audit := iam._record_access_audit(
    p_org_id, 'records_takeover', 'user', 'private', p_purpose, 'records_takeover', true,
    ARRAY[p_user_id], v_total::integer, p_user_id, p_reason, null, null, null, null, false, v_uid, v_to);
  perform iam._org_audit(p_org_id, p_user_id, 'member.records_takeover',
    jsonb_build_object('purpose', p_purpose, 'reason', p_reason, 'access_audit_id', v_audit,
                       'to_user_id', v_to, 'moved', v_moved, 'not_moved', v_not_moved,
                       'records_moved', v_total));

  -- ── THE PERSON IS TOLD. Fails toward telling: an unregistered channel list still reaches in-app.
  select coalesce((select array_agg(key) from jsonb_each(t.default_channels) where value = 'true'::jsonb),
                  ARRAY['in_app'])
    into v_channels
    from communication.notification_event_type t
   where t.event_key = 'platform.access.records_taken_over' and t.deleted_at is null
   limit 1;
  v_channels := coalesce(v_channels, ARRAY['in_app']);
  begin
    foreach ch in array v_channels loop
      insert into communication.notification
        (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
         subject, body, target_kind, target_id, deep_link, dedupe_key, visibility)
      values (p_org_id, 'platform.access.records_taken_over', p_user_id, 'user', ch,
              jsonb_build_object('taken_over_by', v_uid, 'to_user_id', v_to, 'purpose', p_purpose,
                                 'reason', p_reason, 'audit_id', v_audit, 'organization_id', p_org_id,
                                 'moved', v_moved, 'not_moved', v_not_moved),
              format('Your records in %s were taken over', coalesce(v_org_name, 'an organization')),
              format('%s, an %s of %s, took over your records in that organization: %s now belong to %s.%sYour sign-in, your other organizations and everything you hold outside %s were not touched.%sThe reason they gave: "%s".%sThis is recorded permanently on your access page. If you did not expect this, contact the organization.',
                     coalesce((select u.email from auth.users u where u.id = v_uid), 'someone'),
                     v_caller_role, coalesce(v_org_name, 'your organization'), v_summary,
                     coalesce(v_to_email, 'another member'), E'\n\n',
                     coalesce(v_org_name, 'that organization'), E'\n\n', p_reason, E'\n\n'),
              'iam_access_audit', v_audit, '/me/access-log',
              'records_takeover:' || v_audit::text || ':' || ch, 'personal'::platform.visibility)
      on conflict do nothing;
      v_notices := v_notices + 1;
    end loop;
  exception when others then
    raise warning 'org_admin_take_over_member_records: the person could not be told (% %). The take-over happened and is recorded.', sqlstate, sqlerrm;
    perform iam._record_access_audit(
      p_org_id, 'notice_failed', 'user', 'private', 'audit', 'refused', false, ARRAY[p_user_id],
      null, p_user_id, null, format('the person could not be told: %s %s', sqlstate, sqlerrm),
      null, null, null, false, v_uid, v_uid);
  end;

  return jsonb_build_object(
    'taken_over', true, 'mode', 'records', 'user_id', p_user_id, 'email', v_email,
    'to_user_id', v_to, 'to_email', v_to_email, 'audit_id', v_audit,
    'records_moved', v_total, 'moved', v_moved, 'not_moved', v_not_moved, 'notices', v_notices,
    'message', case
      when v_total = 0 and jsonb_array_length(v_not_moved) = 0 then
        format('%s had no records in this organization to move. They were told, and it is recorded.', coalesce(v_email, 'This member'))
      else format('%s of %s''s records in this organization now belong to %s (%s).%s Their sign-in and other organizations were not touched; they were told why.',
                  v_total, coalesce(v_email, 'this member'), coalesce(v_to_email, 'the chosen member'), v_summary,
                  case when jsonb_array_length(v_not_moved) > 0
                       then format(' Could not move: %s.', (select string_agg(format('%s %s (%s)', e ->> 'count', e ->> 'label', e ->> 'why'), '; ') from jsonb_array_elements(v_not_moved) e))
                       else '' end)
    end);
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, gate_predicate, argument_rules, probe_args)
values ('public', 'org_admin_take_over_member_records',
        'p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_to_user_id uuid',
        ARRAY['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
        'THE org-scoped take-over door (access ladder T-16d), for a member who also belongs to other organizations: moves ownership of that member''s records inside p_org_id only (Private included, Confidential never) to a named member. Never touches sign-in, sessions or other organizations. p_org_id: the caller''s OWN owner/admin membership in it is checked first; never null. p_user_id: must be a member of p_org_id, not the caller, not an owner, an admin only for an owner, not a platform admin. p_to_user_id: a member of p_org_id other than p_user_id; null = the caller. Written reason (knob floor), registered purpose, the person notified, recorded in iam.access_audit and iam.org_admin_audit; every refusal recorded and returned.',
        'access_ladder_t16d_take_over_member_records_in_one_org',
        null, true, false, 'auth.uid()',
        jsonb_build_object('version', 1, 'arguments', jsonb_build_object(
          'p_org_id', jsonb_build_object('type', 'uuid', 'position', 1, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_org_id -> caller''s own owner/admin row in iam.organization_member',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'caller membership checked before anything is read')),
          'p_user_id', jsonb_build_object('type', 'uuid', 'position', 2, 'optional', false, 'null_rule', '{}'::jsonb,
                        'check', 'p_user_id -> member of p_org_id',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'target membership checked before anything is written')),
          'p_purpose', jsonb_build_object('type', 'text', 'position', 3, 'optional', false, 'null_rule', '{}'::jsonb, 'foreign', jsonb_build_object('not_an_id', true)),
          'p_reason', jsonb_build_object('type', 'text', 'position', 4, 'optional', false, 'null_rule', '{}'::jsonb, 'foreign', jsonb_build_object('not_an_id', true)),
          'p_to_user_id', jsonb_build_object('type', 'uuid', 'position', 5, 'optional', true, 'null_rule', jsonb_build_object('means', 'the caller'),
                        'check', 'p_to_user_id -> member of p_org_id, not p_user_id',
                        'foreign', jsonb_build_object('decided_before_read', true, 'note', 'recipient membership checked before anything is written')))),
        jsonb_build_object(
          'args', jsonb_build_object(
            'p_org_id', 'other_org',
            'p_user_id', 'victim_user',
            'p_purpose', 'literal:offboarding',
            'p_reason', 'literal:Door-rows probe: a stranger asking to take over another organization''s member records.',
            'p_to_user_id', 'omit'),
          'note', 'A stranger names another organization and its member: the door must refuse, and iam._record_access_audit must keep that refusal out of the organization''s log (DD-213c). The probe transaction is always rolled back.'));

grant execute on function public.org_admin_take_over_member_records(uuid, uuid, text, text, uuid) to authenticated;

-- The knob that sets the reason floor now has two readers.
update platform.feature_knob
   set description = 'The shortest written reason an organization owner or admin must give to take over a member''s account, or a member''s records in the organization. The reason is recorded and sent to the person.'
 where feature = 'platform.access' and key = 'account_takeover_reason_min_chars' and archived_at is null;
