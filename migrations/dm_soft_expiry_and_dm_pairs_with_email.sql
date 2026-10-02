-- draft: owner-session(board+notify) — applied to clone; production apply awaits Arman (ALTER on communication.dm_messages)
-- based-on: public.get_dm_unread_count(uuid, uuid) d9ce120d569bac59c466e4b7fddc39ff15a315ae9221554c6f7cbef5b12d4ca4
-- based-on: communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) 35135eeee5d692e87d5aefc9b244e8e3ac709d4b42b7a617fd9c61f780d3b75a
-- based-on: communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text) 7510107182dc09fb91601ba12bced08b9177ffb4e4033214d326b2c44f0ba25e
--
-- TWO PLATFORM PRIMITIVES, one file, because the second is useless without the first.
--
-- 1. SOFT EXPIRY ON A DIRECT MESSAGE (`communication.dm_messages.soft_expires_at`).
--    A message that is only worth reading until some moment — a meeting invitation is worth
--    reading until an hour after the meeting starts — carries that moment. Past it the message
--    is LAPSED: it is never deleted, never hidden, never edited, and the reader's watermark
--    (`dm_conversation_participants.last_read_at`) is never moved for it — moving the watermark
--    would silently mark every OTHER message in the thread read too. A lapsed message simply
--    stops counting as unread. "Lapsed" is DERIVED (soft_expires_at <= now()), never stamped:
--    a status is computed live (TRUE CURRENT status law), so there is no sweeper, no schedule,
--    and nothing to drift.
--
-- 2. THE PAIRING RULE: AN EMAIL TO A PLATFORM USER NEVER GOES WITHOUT A DM.
--    A DM without an email is fine; an email without a DM is silly — the person is IN the
--    product and the product said nothing to them. `communication.notification_pair_channels`
--    is the ONE place the rule lives. Every producer passes through it:
--      - `notify()` (Python) and `hr._notify_channels` → via `notification_user_channels`
--      - `communication.notify_from_sql` (share / invitation / SQL producers) → directly
--    It is an organization knob with a platform default of ON: the event's
--    `config.pair_dm_with_email`, patched by the organization's override `config_patch`.
--    Only a USER recipient is paired — somebody with no account has no inbox to DM.

-- ── 1. the column ──────────────────────────────────────────────────────────────────────────
alter table communication.dm_messages
  add column if not exists soft_expires_at timestamptz;

comment on column communication.dm_messages.soft_expires_at is
  'Soft expiry: past this instant the message is LAPSED — it stays readable but no longer counts '
  'as unread. Derived live (soft_expires_at <= now()), never stamped. NULL = never lapses.';

-- ── 1b. the unread count honours it ───────────────────────────────────────────────────────
-- `get_dm_conversations_with_details` reads unread through this function, so the inbox list
-- and the badge move together.
create or replace function public.get_dm_unread_count(p_conversation_id uuid, p_user_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_last_read timestamptz;
  v_count integer;
begin
  if auth.role() <> 'service_role' and p_user_id is distinct from ( SELECT auth.uid()) then
    raise exception 'cannot read another user''s unread count' using errcode = '42501';
  end if;

  select participant.last_read_at
    into v_last_read
  from communication.dm_conversation_participants as participant
  where participant.conversation_id = p_conversation_id
    and participant.user_id = p_user_id
    and participant.deleted_at is null;

  if not found then
    raise exception 'conversation participant required' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_count
  from communication.dm_messages as message
  where message.conversation_id = p_conversation_id
    and message.sender_id is distinct from p_user_id
    and message.deleted_at is null
    and (v_last_read is null or message.created_at > v_last_read)
    -- SOFT EXPIRY: a lapsed message is still there, it just is not waiting on anyone.
    and (message.soft_expires_at is null or message.soft_expires_at > now());

  return v_count;
end;
$function$;

-- ── 2. THE PAIRING RULE ───────────────────────────────────────────────────────────────────
create or replace function communication.notification_pair_channels(
  p_event_key         text,
  p_organization_id   uuid,
  p_recipient_user_id uuid,
  p_channels          jsonb
)
 returns jsonb
 language plpgsql
 stable
 security invoker  -- only ever called from inside the two definer producers below; no door of its own
 set search_path to ''
as $function$
declare
  v_channels jsonb := coalesce(p_channels, '{}'::jsonb);
  v_pair     jsonb;
  v_patch    jsonb;
begin
  -- Nobody to DM: an address, a party or an outsider token has no inbox.
  if p_recipient_user_id is null then
    return v_channels;
  end if;
  if coalesce(v_channels ->> 'email', 'false') <> 'true' then
    return v_channels;
  end if;

  -- The knob: platform row's config, patched by this organization's override.
  select t.config -> 'pair_dm_with_email' into v_pair
    from communication.notification_event_type t
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;
  select o.config_patch -> 'pair_dm_with_email' into v_patch
    from communication.notification_event_override o
   where o.organization_id = p_organization_id and o.event_key = p_event_key
     and o.deleted_at is null
   limit 1;
  if v_patch is not null then
    v_pair := v_patch;
  end if;
  if v_pair is not null and v_pair = 'false'::jsonb then
    return v_channels;
  end if;

  return v_channels || jsonb_build_object('dm', true);
end
$function$;

comment on function communication.notification_pair_channels(text, uuid, uuid, jsonb) is
  'THE PAIRING RULE: an email to a platform user is always accompanied by a DM. Knob: '
  'notification_event_type.config.pair_dm_with_email (default on), patched by the organization '
  'override config_patch. Called by notification_user_channels and notify_from_sql — never copy it.';

revoke all on function communication.notification_pair_channels(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- ── 2b. the user rung applies it (covers notify() and hr._notify_channels) ────────────────
create or replace function communication.notification_user_channels(p_user uuid, p_event_key text, p_organization_id uuid, p_base jsonb, p_mandatory boolean DEFAULT false)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_base jsonb := coalesce(p_base, '{}'::jsonb);
  v_user jsonb := '{}'::jsonb;
  v_out  jsonb;
begin
  -- A non-user recipient has NO user rung at all — we do not run accounts for candidates, and
  -- consent (not a preference row) is their unsubscribe. Same rule as the spine's `is_user` check.
  if p_user is null then
    return v_base;
  end if;

  -- ── BOTH USER RUNGS, NEAREST FIRST.
  --   `pr.organization_id = p_organization_id` → this organization's row, the NEAREST rung.
  --   any other row of the same person        → the person's own latest statement, in whichever
  --                                              of their organizations they made it.
  -- `distinct on (pr.channel)` keeps the first row per channel in the ORDER BY's order, so the
  -- organization's row wins whenever one exists and the person's latest row is what a channel
  -- falls back to. Every organization is equal (access ladder, 2026-09-26): no organization type
  -- decides which row is the person's "own".
  select coalesce(jsonb_object_agg(w.channel, to_jsonb(w.enabled)), '{}'::jsonb)
    into v_user
    from (
      select distinct on (pr.channel) pr.channel, pr.enabled
        from communication.notification_preference pr
       where pr.user_id = p_user
         and pr.event_key = p_event_key
         and pr.deleted_at is null
       order by pr.channel,
                (pr.organization_id is not distinct from p_organization_id) desc,  -- this org first
                pr.updated_at desc                              -- deterministic, never arbitrary
    ) w;

  -- `||` is the ladder: a user key overwrites its channel, and a user key the rung above never
  -- mentioned is ADDED — which is how a person turns a channel ON.
  v_out := v_base || v_user;

  -- ── THE ⚖ FLOOR (SPEC-NOTIFICATIONS §7.1). The user tier "may not silence a ⚖ event entirely".
  -- Checked ONCE, after both rungs, and that is deliberate: the floor is a property of the TIER,
  -- not of a rung, so it holds whether the silence came from the employer row, the global row, or
  -- the two of them together. Moving a ⚖ event between channels is untouched.
  if p_mandatory and not exists (select 1 from jsonb_each(v_out) where value = 'true'::jsonb) then
    v_out := v_base;
  end if;

  -- ── THE PAIRING RULE, applied LAST so no rung can produce an email without its DM.
  return communication.notification_pair_channels(p_event_key, p_organization_id, p_user, v_out);
end
$function$;

-- ── 2c. the SQL producer learns `dm` and applies the rule ─────────────────────────────────
create or replace function communication.notify_from_sql(p_organization_id uuid, p_event_key text, p_recipient_user_id uuid, p_to_address text, p_recipient_label text, p_payload jsonb, p_deep_link text, p_target_kind text, p_target_id uuid, p_dedupe_key text)
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
begin
  if p_organization_id is null then
    raise exception 'A notice has to belong to an organization.' using errcode = '22004';
  end if;
  if p_recipient_user_id is null and coalesce(btrim(p_to_address), '') = '' then
    raise exception 'A notice has to be addressed to somebody.' using errcode = '22004';
  end if;

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
  -- rung is deliberately not asked here — see the note on the invitation caller below.
  select o.config_patch -> 'default_channels' into v_override
    from communication.notification_event_override o
   where o.organization_id = p_organization_id and o.event_key = p_event_key
     and o.deleted_at is null
   limit 1;
  if v_override is not null and jsonb_typeof(v_override) = 'object' then
    v_defaults := v_defaults || v_override;
  end if;

  -- THE PAIRING RULE — the same function the user rung ends with.
  v_defaults := communication.notification_pair_channels(
                  p_event_key, p_organization_id, p_recipient_user_id, v_defaults);

  v_kind := case when p_recipient_user_id is not null then 'user' else 'address' end;

  for ch in select key from jsonb_each_text(v_defaults) where value = 'true' order by key loop
    v_addr    := null;
    v_errcode := null;
    v_errmsg  := null;
    v_status  := 'render_pending';

    if ch in ('in_app', 'dm') then
      -- THE ROW IS THE DELIVERY (in_app) / THE INBOX IS THE ADDRESS (dm), and somebody
      -- with no account has neither. Saying so by name is the honest half.
      if p_recipient_user_id is null then
        v_status  := 'skipped';
        v_errcode := 'no_account';
        v_errmsg  := 'This person has no AI Matrx account yet, so there is no inbox to put this in. '
                  || 'It reaches them by email and by the link, and it will be in their inbox once they join.';
      elsif ch = 'dm' then
        v_addr := p_recipient_user_id::text;
      end if;
    elsif ch in ('email', 'sms') then
      -- The address is the one the invitation was made out to — but it belongs to ONE
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

    insert into communication.notification
      (id, organization_id, event_key, recipient_user_id, recipient_kind, recipient_label,
       channel, payload, to_address, status, error_code, error_message,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values
      (v_id, p_organization_id, p_event_key, p_recipient_user_id, v_kind,
       nullif(btrim(coalesce(p_recipient_label, '')), ''),
       ch, coalesce(p_payload, '{}'::jsonb), v_addr, v_status, v_errcode, v_errmsg,
       p_target_kind, p_target_id, v_link,
       coalesce(nullif(btrim(p_dedupe_key), ''), v_id::text) || ':' || ch,
       'personal'::platform.visibility)
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
