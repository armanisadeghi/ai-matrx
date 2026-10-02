-- draft: email-to-spine lane — applied to clone; production apply must FOLLOW dm_soft_expiry_and_dm_pairs_with_email.sql (needs communication.notification_pair_channels)
-- based-on: communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text) a9fc65dc42ab85be6a750b77ff46ce6131b43de90a50cf8fb70fad13fa6977a6
--
-- THE SERVER'S DOOR TO THE SQL PRODUCER, and the two facts a server caller has that a SQL
-- trigger does not.
--
-- matrx-frontend's email-only routes (invitations, comments, feedback, shares, access requests,
-- due-date reminders) move onto the notification spine: they write the FACTS through
-- `communication.notify_from_sql` and the registry row supplies the WORDS, so the pairing rule
-- adds the DM for every user recipient. Those routes run as `service_role`; until this file the
-- function was executable by its owner only.
--
-- `p_options jsonb` carries what those callers know and a trigger never does:
--   - `dm`        → stored on the DM leg's `metadata.dm` ONLY, exactly the shape `notify()` stores
--                   (services/notifications/channels/dm.py reads it): `sender_user_id` (the person
--                   who caused it; absent → the Matrx System bot), `action_data` (a structured
--                   chip), `when_sender_is_recipient` ('system_bot' | 'skip').
--   - `opted_out` → channel names the RECIPIENT has turned off in a preference the caller holds
--                   (today: the legacy `users.user_email_preferences` flags). Each becomes a named
--                   `skipped` / `opted_out` row, never a silent absence. The pairing rule is applied
--                   to the event's channels FIRST, so turning email off never takes the DM with it —
--                   "it's ok to DM someone but not email them".
--
-- The 10-argument signature every SQL producer already calls (share / portal / table / records /
-- meet) keeps its exact contract and becomes a one-line delegation — one body, never two.
-- `p_options` is NOT executable by anon/authenticated: a sender identity is only trusted from
-- the server.

create or replace function communication.notify_from_sql(
  p_organization_id uuid, p_event_key text, p_recipient_user_id uuid, p_to_address text,
  p_recipient_label text, p_payload jsonb, p_deep_link text, p_target_kind text,
  p_target_id uuid, p_dedupe_key text, p_options jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_defaults  jsonb;
  v_templates jsonb;
  v_enabled   boolean;
  v_override  jsonb;
  ch          text;
  v_id        uuid;
  v_link      text;
  v_addr      text;
  v_status    text;
  v_errcode   text;
  v_errmsg    text;
  v_kind      text;
  v_queued    text[] := '{}';
  v_skipped   jsonb  := '[]'::jsonb;
  v_ins       integer;
  v_template  text;
  v_dm        jsonb;
  v_opted_out jsonb;
  v_metadata  jsonb;
begin
  if p_organization_id is null then
    raise exception 'A notice has to belong to an organization.' using errcode = '22004';
  end if;
  if p_recipient_user_id is null and coalesce(btrim(p_to_address), '') = '' then
    raise exception 'A notice has to be addressed to somebody.' using errcode = '22004';
  end if;

  v_dm := case when jsonb_typeof(p_options -> 'dm') = 'object' then p_options -> 'dm' end;
  v_opted_out := case when jsonb_typeof(p_options -> 'opted_out') = 'array'
                      then p_options -> 'opted_out' else '[]'::jsonb end;

  select t.enabled,
         coalesce(t.default_channels, '{}'::jsonb),
         coalesce(t.config -> 'templates', '{}'::jsonb)
    into v_enabled, v_defaults, v_templates
    from communication.notification_event_type t
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;

  if not found then
    -- The event has never been declared. NOT a silent no-op: the caller is told, and
    -- says so to the person, because the remedy (deploy the server that declares it) is
    -- a real thing somebody does.
    return jsonb_build_object(
      'queued', '[]'::jsonb, 'skipped', jsonb_build_array(jsonb_build_object(
        'channel', 'all', 'why', 'event_not_declared')),
      'say', format('This server does not know the %s notice yet, so nothing was sent.', p_event_key));
  end if;

  if not coalesce(v_enabled, true) then
    return jsonb_build_object(
      'queued', '[]'::jsonb, 'skipped', jsonb_build_array(jsonb_build_object(
        'channel', 'all', 'why', 'event_disabled')),
      'say', 'An administrator has switched this kind of notice off, so nothing was sent.');
  end if;

  -- THE ORGANIZATION RUNG, read the same way `notify()` and `hr._notify_channels` read
  -- it: the platform row's defaults, patched by this organization's override. The USER
  -- rung (`notification_preference`) is deliberately not asked here; a caller that holds a
  -- person's own "off" passes it as `p_options.opted_out` and it is honoured below.
  select o.config_patch -> 'default_channels' into v_override
    from communication.notification_event_override o
   where o.organization_id = p_organization_id and o.event_key = p_event_key
     and o.deleted_at is null
   limit 1;
  if v_override is not null and jsonb_typeof(v_override) = 'object' then
    v_defaults := v_defaults || v_override;
  end if;

  -- THE PAIRING RULE — the same function the user rung ends with. Applied BEFORE the
  -- person's own "off", so an opted-out email still brings its DM.
  v_defaults := communication.notification_pair_channels(
                  p_event_key, p_organization_id, p_recipient_user_id, v_defaults);

  v_kind := case when p_recipient_user_id is not null then 'user' else 'address' end;

  for ch in select key from jsonb_each_text(v_defaults) where value = 'true' order by key loop
    v_addr     := null;
    v_errcode  := null;
    v_errmsg   := null;
    v_status   := 'render_pending';
    v_metadata := '{}'::jsonb;

    if v_opted_out ? ch then
      v_status  := 'skipped';
      v_errcode := 'opted_out';
      v_errmsg  := format('This person turned %s notices like this off in their settings.', ch);
    elsif ch in ('in_app', 'dm') then
      -- THE ROW IS THE DELIVERY (in_app) / THE INBOX IS THE ADDRESS (dm), and somebody
      -- with no account has neither. Saying so by name is the honest half.
      if p_recipient_user_id is null then
        v_status  := 'skipped';
        v_errcode := 'no_account';
        v_errmsg  := 'This person has no AI Matrx account yet, so there is no inbox to put this in. '
                  || 'It reaches them by email and by the link, and it will be in their inbox once they join.';
      elsif ch = 'dm' then
        v_addr := p_recipient_user_id::text;
        if v_dm is not null then
          v_metadata := jsonb_build_object('dm', v_dm);
        end if;
      end if;
    elsif ch in ('email', 'sms') then
      -- The address is the one the notice was made out to — but it belongs to ONE
      -- channel (1415). The literal goes through the one resolver as a literal: each
      -- channel gets its own kind of address or a named refusal (`address_not_for_channel`),
      -- and still no contact point is invented for a person who is not in this organization.
      select r.address, r.refusal
        into v_addr, v_errcode
        from communication.resolve_channel_address(
               ch, p_organization_id, 'address', null, null, null, p_to_address) r
       limit 1;
      if v_addr is null then
        v_status  := 'skipped';
        v_errcode := coalesce(v_errcode, 'no_contact_point');
        v_errmsg  := case v_errcode
                       when 'address_not_for_channel' then
                         format('The address this was made out to is not a %s address, so '
                                'nothing was sent this way.',
                                case ch when 'sms' then 'phone' else ch end)
                       else format('No %s address for this recipient (%s).', ch, v_errcode)
                     end;
      end if;
    else
      v_status  := 'skipped';
      v_errcode := 'unsupported_channel';
      v_errmsg  := format('communication.notify_from_sql does not write %s notices.', ch);
    end if;

    -- THE QUEUE DECISION, in the same words the other two producers use. This function
    -- has no renderer and there must never be a second one, so a notice with a template
    -- goes to the render lane and a notice without one is a NAMED skip. A DM says what the
    -- in-app notice says unless the event authors its own `dm` template — the same rule the
    -- renderer applies (services/notifications template_for_channel).
    v_template := coalesce(
      nullif(btrim(coalesce(v_templates -> ch ->> 'body', '')), ''),
      case when ch = 'dm' then nullif(btrim(coalesce(v_templates -> 'in_app' ->> 'body', '')), '') end);
    if v_status = 'render_pending' and v_template is null then
      v_status  := 'skipped';
      v_errcode := 'no_template';
      v_errmsg  := format('No renderable %s template for %s — the notice was never sendable '
                          'this way and was not queued.', ch, p_event_key);
    end if;

    v_id   := gen_random_uuid();
    v_link := p_deep_link;

    -- The row's access word is not written: its column default ('personal') is what a notice
    -- is, and T-13 refuses any new function body that names that retiring column.
    insert into communication.notification
      (id, organization_id, event_key, recipient_user_id, recipient_kind, recipient_label,
       channel, payload, to_address, status, error_code, error_message,
       target_kind, target_id, deep_link, dedupe_key, metadata)
    values
      (v_id, p_organization_id, p_event_key, p_recipient_user_id, v_kind,
       nullif(btrim(coalesce(p_recipient_label, '')), ''),
       ch, coalesce(p_payload, '{}'::jsonb), v_addr, v_status, v_errcode, v_errmsg,
       p_target_kind, p_target_id, v_link,
       coalesce(nullif(btrim(p_dedupe_key), ''), v_id::text) || ':' || ch,
       v_metadata)
    on conflict do nothing;

    get diagnostics v_ins = row_count;

    if v_ins = 0 then
      -- `on conflict do nothing` writes nothing and raises nothing. Counting it as sent
      -- is how a notice disappears; it is named instead.
      v_skipped := v_skipped || jsonb_build_object('channel', ch, 'why', 'already_queued');
    elsif v_status = 'render_pending' then
      v_queued := v_queued || ch;
    else
      v_skipped := v_skipped || jsonb_build_object('channel', ch, 'why', v_errcode);
    end if;
  end loop;

  return jsonb_build_object(
    'queued',  to_jsonb(v_queued),
    'skipped', v_skipped,
    'say', case
             when array_length(v_queued, 1) is null then 'Nothing could be sent to them.'
             when 'email' = any (v_queued) then 'An email is on its way to them.'
             else 'They have been told in AI Matrx.'
           end);
end;
$function$;

comment on function communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text, jsonb) is
  'THE SQL producer of the notification spine. p_options: {dm: {sender_user_id, action_data, '
  'when_sender_is_recipient}} stored on the DM leg''s metadata.dm; {opted_out: [channel,...]} '
  'the recipient''s own off switches, written as named skipped/opted_out rows after the pairing '
  'rule. Server-only (service_role).';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('communication', 'notify_from_sql',
   pg_get_function_identity_arguments('communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text, jsonb)'::regprocedure),
   array['uuid','text','uuid','text','text','jsonb','text','text','uuid','text','jsonb']::regtype[]::oid[],
   'p_organization_id files the notice (NULL refused 22004); p_recipient_user_id names the recipient '
   'and is trusted only because the caller is the server, which proved the relationship (an '
   'invitation it manages, a grant it made, an assignment it wrote) before calling; NULL means an '
   'address-only notice. p_target_id is a pointer stored on the row, never dereferenced here.',
   'notify_from_sql_options_and_the_server_door.sql',
   'server_only: called by matrx-frontend server routes as service_role after their own '
   'authenticated access checks, and by SQL producers through the 10-argument delegation. A client '
   'calling it could message any person in any organization as anyone (p_options.dm.sender_user_id).',
   false, false);

revoke all on function communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text, jsonb)
  to service_role;

-- The 10-argument contract every SQL producer calls: one delegation, one body.
create or replace function communication.notify_from_sql(
  p_organization_id uuid, p_event_key text, p_recipient_user_id uuid, p_to_address text,
  p_recipient_label text, p_payload jsonb, p_deep_link text, p_target_kind text,
  p_target_id uuid, p_dedupe_key text)
 returns jsonb
 language sql
 security definer
 set search_path to 'pg_catalog'
as $function$
  select communication.notify_from_sql(
           p_organization_id, p_event_key, p_recipient_user_id, p_to_address,
           p_recipient_label, p_payload, p_deep_link, p_target_kind, p_target_id,
           p_dedupe_key, '{}'::jsonb);
$function$;

revoke all on function communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text)
  from public, anon, authenticated;
