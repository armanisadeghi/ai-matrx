-- draft: owner-session(board+notify) — applied to clone; production apply awaits Arman (ALTER on communication.dm_messages). ONE file on purpose: the column, the rule, every producer, the DM words and the knob rows land together or not at all.
-- based-on: public.get_dm_unread_count(uuid, uuid) d9ce120d569bac59c466e4b7fddc39ff15a315ae9221554c6f7cbef5b12d4ca4
-- based-on: communication.notification_user_channels(uuid, text, uuid, jsonb, boolean) 35135eeee5d692e87d5aefc9b244e8e3ac709d4b42b7a617fd9c61f780d3b75a
-- based-on: communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text) 7510107182dc09fb91601ba12bced08b9177ffb4e4033214d326b2c44f0ba25e
-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) e7ae88c5b97e78bd3cf05c763fa20fb6da740edc8ba3bf65c2c3c67f29ef7b16
-- based-on: iam._notify_door(uuid, text, uuid, jsonb, uuid, text, text) 6727eebbe9779ee0bd45b91c5e676830ced54ed5109c9e73dc911013f5cb90be
-- based-on: public.org_admin_take_over_account(uuid, uuid, text, text, text) b5d40e915824b176e50393ea1864e8114455f6af2ef4c8bbb82d1f89dc01d92b
-- based-on: public.org_admin_take_over_member_records(uuid, uuid, text, text, uuid) 3b1bfeae05d3a074440d8ff471c94552d79672d485abf94801e3477ecf55731c
-- based-on: custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, text) 3dc8d308c985f09d48dde3c8341418525777b005f92642fc699f487a8d68eba2
-- based-on: communication.my_notification_unread_count() e1c5933ef166d42f7caa4f8aaf0dbbd4e380f17d77d9185c8788dbae33dabd72
-- based-on: communication.my_notifications(integer, timestamp with time zone, boolean) b8763b3814b5a5e293830fe5d8e63059dcd595b90fa4c86ed30d394caf125a56
--
-- EVERYTHING "AN EMAIL NEVER GOES WITHOUT A DM" NEEDS, IN ONE TRANSACTION.
--
-- This file used to be four: this one, `meet_dm_soft_expiry_and_voice_knobs.sql` (the knob rows),
-- `notification_dm_templates_from_in_app.sql` (the DM words) and
-- `notify_from_sql_options_and_the_server_door.sql` (the server's door; it replaced the same
-- function, so the two could never both apply). None had reached the main database, so each was
-- deleted (an unledgered `-- retired:` file halts the release sweep, JUDGMENT §1b). Apart, the rule
-- could land WITHOUT the words — and a paired DM with no words is a `no_template` skip, i.e. exactly the email
-- without its DM the rule exists to forbid. They are merged so the rule can never arrive alone.
--
-- 1. SOFT EXPIRY ON A DIRECT MESSAGE (`communication.dm_messages.soft_expires_at`).
--    A message that is only worth reading until some moment carries that moment. Past it the
--    message is LAPSED: never deleted, hidden or edited, and the reader's watermark is never moved
--    for it (moving it would mark every OTHER message in the thread read). A lapsed message just
--    stops counting as unread. Lapsed is DERIVED (soft_expires_at <= now()), never stamped.
--    The in-app notice of the same event lapses with it (notification.metadata.soft_expires_at,
--    `communication.notice_lapsed`), so the bell and the inbox badge move together.
--
-- 2. THE PAIRING RULE: AN EMAIL TO A PLATFORM USER NEVER GOES WITHOUT A DM.
--    Arman, 2026-10-02: "It's ok to DM someone but not email them, but it's silly to email them but
--    not DM them." `communication.notification_pair_channels` is the ONE place it lives.
--    - knob: the event's `config.pair_dm_with_email`, patched by the organization override
--      `config_patch`. Seeded EXPLICITLY on every row below (true, or false with its reason) —
--      nothing relies on a null.
--    - the person: EMAIL REQUIRES DM. A person who turned a notice's DM off has turned its email
--      off too (their choice is respected, and no email-without-DM can result). A ⚖ (mandatory)
--      notice the person would thereby silence entirely falls back to the floor, paired.
--    Every producer passes through it:
--      - `notify()` (Python) and `hr._notify_channels` → `notification_user_channels` (applies it last)
--      - `communication.notify_from_sql` (10-arg → 11-arg with `p_options`, the server's door) → directly
--      - `esign._notify`, `iam._notify_door`, `public.org_admin_take_over_account`,
--        `public.org_admin_take_over_member_records` → `notification_pair_channel_list`
--      - `custom.agg_deliver` → its ladder (`hr._notify_channels`), then queues the DM leg itself
--    Guard: aidream `scripts/check_email_never_without_dm.py --live` (every SQL function that
--    inserts into communication.notification calls the rule or is an approved producer).
--
-- 3. THE SIGNAL: `communication.notification_paired_dm_gaps(since)` — per event, emails that
--    SUCCEEDED to a platform user whose paired DM was not delivered. Server-side only (service role).

-- ── 1. the column ──────────────────────────────────────────────────────────────────────────
alter table communication.dm_messages
  add column if not exists soft_expires_at timestamptz;

comment on column communication.dm_messages.soft_expires_at is
  'Soft expiry: past this instant the message is LAPSED — it stays readable but no longer counts '
  'as unread. Derived live (soft_expires_at <= now()), never stamped. NULL = never lapses.';

-- ── 1b. the DM unread count honours it ────────────────────────────────────────────────────
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

-- ── 1c. the in-app notice lapses with its DM ──────────────────────────────────────────────
-- `notify()` writes `metadata.soft_expires_at` (ISO 8601 WITH a zone) on the in-app leg of a
-- notice whose DM lapses. Anything else in that key — absent, malformed, zone-less — is "never
-- lapses": a bad value can only leave a notice unread, never break the bell for everyone.
create or replace function communication.notice_lapsed(p_metadata jsonb)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select case
           when coalesce(p_metadata ->> 'soft_expires_at', '')
                ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$'
             then (p_metadata ->> 'soft_expires_at')::timestamptz <= now()
           else false
         end
$function$;

comment on function communication.notice_lapsed(jsonb) is
  'True when a notification row''s metadata.soft_expires_at (zoned ISO 8601) has passed: the notice '
  'stays readable but stops counting as unread. Malformed or absent = never lapses.';

-- ── 1d. a newer notice SUPERSEDES the older ones ───────────────────────────────────────────
-- When a meeting is re-announced (updated, moved, cancelled) for a person, everything they were
-- told about it before LAPSES — never deleted, never hidden — so exactly one notice stays unread:
-- the newest. One call, three facts: delivered DMs get `soft_expires_at = now()`; DM legs still
-- waiting in the queue carry the lapse in `metadata.dm.soft_expires_at`, so they arrive lapsed;
-- in-app notices carry it in `metadata.soft_expires_at` (the bell reads `notice_lapsed`).
-- An instant already in the past is never moved later. Server-only.
create or replace function communication.lapse_superseded_notices(
  p_target_kind text, p_target_id uuid, p_recipient_user_id uuid, p_event_keys jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_now  timestamptz := now();
  v_iso  text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  v_n    integer := 0;
  v_rows integer;
begin
  if p_target_kind is null or p_target_id is null or p_recipient_user_id is null
     or jsonb_typeof(p_event_keys) is distinct from 'array' then
    raise exception 'lapse_superseded_notices needs a target, a recipient and a JSON array of event keys' using errcode = '22004';
  end if;

  update communication.dm_messages m
     set soft_expires_at = v_now
   where m.client_message_id in (
           select 'notification:' || n.id::text
             from communication.notification n
            where n.target_kind = p_target_kind
              and n.target_id = p_target_id
              and n.recipient_user_id = p_recipient_user_id
              and n.channel = 'dm'
              and n.event_key in (select jsonb_array_elements_text(p_event_keys))
              and n.created_at < v_now)
     and m.client_message_id like 'notification:%'
     and m.deleted_at is null
     and (m.soft_expires_at is null or m.soft_expires_at > v_now);
  get diagnostics v_rows = row_count;
  v_n := v_n + v_rows;

  update communication.notification n
     set metadata = case n.channel
                      when 'dm' then jsonb_set(coalesce(n.metadata, '{}'::jsonb), '{dm}',
                                               coalesce(n.metadata -> 'dm', '{}'::jsonb)
                                                 || jsonb_build_object('soft_expires_at', v_iso))
                      else coalesce(n.metadata, '{}'::jsonb)
                             || jsonb_build_object('soft_expires_at', v_iso)
                    end
   where n.target_kind = p_target_kind
     and n.target_id = p_target_id
     and n.recipient_user_id = p_recipient_user_id
     and n.event_key in (select jsonb_array_elements_text(p_event_keys))
     and n.created_at < v_now
     and n.deleted_at is null
     and ((n.channel = 'in_app' and not communication.notice_lapsed(n.metadata))
          or (n.channel = 'dm' and n.status in ('pending', 'render_pending', 'in_progress')
              and not communication.notice_lapsed(n.metadata -> 'dm')));
  get diagnostics v_rows = row_count;
  return v_n + v_rows;
end
$function$;

comment on function communication.lapse_superseded_notices(text, uuid, uuid, jsonb) is
  'A newer notice supersedes the older ones: lapses (never deletes) every earlier DM and in-app '
  'notice this person got about this target for these events. Server-only.';

revoke all on function communication.lapse_superseded_notices(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function communication.lapse_superseded_notices(text, uuid, uuid, jsonb) to service_role;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('communication', 'lapse_superseded_notices',
   pg_get_function_identity_arguments('communication.lapse_superseded_notices(text, uuid, uuid, jsonb)'::regprocedure),
   array['text','uuid','uuid','jsonb']::regtype[]::oid[],
   'p_target_id + p_target_kind name the object the notices are about; p_recipient_user_id the '
   'person whose own notices lapse. Only that person''s rows change, and only to stop counting as unread.',
   'dm_soft_expiry_and_dm_pairs_with_email.sql',
   'server_only: aidream Meet calls it when it re-announces a meeting to an invitee; a client could '
   'mark another person''s notices read, so no client may call it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 2. THE PAIRING RULE ───────────────────────────────────────────────────────────────────
-- The person's own choice about the DM leg of ONE notice, nearest rung first: this
-- organization's row, else their latest row anywhere (the same ladder notification_user_channels
-- walks). NULL = they never said.
create or replace function communication.notification_person_dm_choice(
  p_user uuid, p_event_key text, p_organization_id uuid)
 returns boolean
 language sql
 stable
 security invoker  -- only ever called from inside definer producers; no door of its own
 set search_path to ''
as $function$
  select pr.enabled
    from communication.notification_preference pr
   where pr.user_id = p_user
     and pr.event_key = p_event_key
     and pr.channel = 'dm'
     and pr.deleted_at is null
   order by (pr.organization_id is not distinct from p_organization_id) desc,
            pr.updated_at desc
   limit 1
$function$;

revoke all on function communication.notification_person_dm_choice(uuid, text, uuid)
  from public, anon, authenticated;

-- The 4-argument rule (clone only; never on the main database) is replaced by the 5-argument one,
-- whose fifth argument has a default — so every 4-argument caller keeps working, and the two
-- cannot coexist (a 4-argument call would be ambiguous).
drop function if exists communication.notification_pair_channels(text, uuid, uuid, jsonb);

create or replace function communication.notification_pair_channels(
  p_event_key         text,
  p_organization_id   uuid,
  p_recipient_user_id uuid,
  p_channels          jsonb,
  p_honor_person      boolean default true
)
 returns jsonb
 language plpgsql
 stable
 security invoker  -- only ever called from inside definer producers; no door of its own
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

  -- EMAIL REQUIRES DM (owner ruling, 2026-10-02). The person turned this notice's DM off: their
  -- choice stands, and the email follows it off — never an email without its DM, never a DM they
  -- refused. `p_honor_person = false` only for the ⚖ floor, which may not let a person silence a
  -- mandatory notice entirely.
  if p_honor_person
     and communication.notification_person_dm_choice(
           p_recipient_user_id, p_event_key, p_organization_id) is false then
    return v_channels || '{"email": false, "dm": false}'::jsonb;
  end if;

  return v_channels || jsonb_build_object('dm', true);
end
$function$;

comment on function communication.notification_pair_channels(text, uuid, uuid, jsonb, boolean) is
  'THE PAIRING RULE: an email to a platform user is always accompanied by a DM, and email requires '
  'DM (a person who turned the DM off has turned the email off). Knob: notification_event_type.'
  'config.pair_dm_with_email, patched by the organization override config_patch. Called by '
  'notification_user_channels, notify_from_sql and notification_pair_channel_list — never copy it.';

revoke all on function communication.notification_pair_channels(text, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;

-- The same rule for a producer that holds its channels as a list: the paired list, DM FIRST
-- (a DM is queued before its email), then email, then the rest by name.
create or replace function communication.notification_pair_channel_list(
  p_event_key text, p_organization_id uuid, p_recipient_user_id uuid, p_channels text[])
 returns text[]
 language sql
 stable
 security invoker  -- only ever called from inside definer producers; no door of its own
 set search_path to ''
as $function$
  select coalesce(
           array_agg(k.key order by case k.key when 'dm' then 0 when 'email' then 1 else 2 end, k.key),
           '{}'::text[])
    from jsonb_each(
           communication.notification_pair_channels(
             p_event_key, p_organization_id, p_recipient_user_id,
             coalesce((select jsonb_object_agg(c, true) from unnest(p_channels) c), '{}'::jsonb))) k
   where k.value = 'true'::jsonb
$function$;

revoke all on function communication.notification_pair_channel_list(text, uuid, uuid, text[])
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
  --
  -- THE PAIRING RULE, both directions (owner ruling 2026-10-02):
  --   * the DM pairs with the email the ORGANIZATION would send — so a person who turns only the
  --     EMAIL off still gets the DM ("it's ok to DM someone but not email them");
  --   * a person who turns the DM off turns the email off too (email requires DM).
  -- So the rule is applied to the ladder WITHOUT the person's email switch, and that switch is laid
  -- on top: off is off; on is on only through the rule again (never an email without its DM).
  v_out := communication.notification_pair_channels(
             p_event_key, p_organization_id, p_user, v_base || (v_user - 'email'));
  if v_user ? 'email' then
    if v_user -> 'email' = 'true'::jsonb then
      v_out := communication.notification_pair_channels(
                 p_event_key, p_organization_id, p_user, v_out || '{"email": true}'::jsonb);
    else
      v_out := v_out || '{"email": false}'::jsonb;
    end if;
  end if;

  -- ── THE ⚖ FLOOR (SPEC-NOTIFICATIONS §7.1). The user tier "may not silence a ⚖ event entirely".
  -- Checked ONCE, after both rungs AND the pairing rule (whose "email follows DM off" could
  -- otherwise be the silencing step): the floor is a property of the TIER, so it holds whether
  -- the silence came from the employer row, the global row, the pairing, or all of them. The
  -- floor's answer is the organization's, paired WITHOUT the person's choice — they asked for
  -- silence, which a ⚖ notice may not give them.
  if p_mandatory and not exists (select 1 from jsonb_each(v_out) where value = 'true'::jsonb) then
    v_out := communication.notification_pair_channels(
               p_event_key, p_organization_id, p_user, v_base, false);
  end if;

  return v_out;
end
$function$;

-- ── 2c. the SQL producer: `dm`, the rule, and the server's door (p_options) ─────────────────
-- (Folded in from the email-to-spine lane's `notify_from_sql_options_and_the_server_door.sql`, now
-- deleted: two files replacing one function cannot both apply — the second one's based-on breaks.)
--
-- THE SERVER'S DOOR TO THE SQL PRODUCER. matrx-frontend's email-only routes (invitations,
-- comments, feedback, shares, access requests, due-date reminders) write the FACTS through
-- `communication.notify_from_sql` and the registry row supplies the WORDS, so the pairing rule
-- adds the DM for every user recipient. Those routes run as `service_role`.
--
-- `p_options jsonb` carries what those callers know and a trigger never does:
--   - `dm`        → stored on the DM leg's `metadata.dm` ONLY, exactly the shape `notify()` stores
--                   (services/notifications/channels/dm.py reads it): `sender_user_id` (absent →
--                   the Matrx System bot), `action_data` (a structured chip),
--                   `when_sender_is_recipient` ('system_bot' | 'skip').
--   - `opted_out` → channel names the RECIPIENT turned off in a preference the caller holds (today:
--                   the legacy `users.user_email_preferences` flags). Each becomes a named
--                   `skipped` / `opted_out` row. Email off → the DM still goes. DM off → the email
--                   is off too (EMAIL REQUIRES DM), whenever the rule pairs this event.
--
-- The 10-argument signature every SQL producer already calls (share / portal / table / records /
-- meet) keeps its exact contract and becomes a one-line delegation — one body, never two.
-- `p_options` is NOT executable by anon/authenticated: a sender identity is only trusted from the
-- server.
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
  v_email_base boolean;
  v_email_follows_dm boolean := false;
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
  -- person's own "off", so an opted-out email still brings its DM (a DM without an email is fine).
  v_email_base := coalesce(v_defaults ->> 'email', 'false') = 'true';
  v_defaults := communication.notification_pair_channels(
                  p_event_key, p_organization_id, p_recipient_user_id, v_defaults);

  -- EMAIL REQUIRES DM (owner ruling, 2026-10-02). A person who turned this notice's DM off —
  -- in their notification preferences (the rule itself withheld the email above) or in a switch
  -- the caller holds (`p_options.opted_out` names `dm`) — has turned its email off too, whenever
  -- the rule pairs this email. The email is then a NAMED `opted_out` skip, never a silent absence
  -- and never an email without its DM.
  if p_recipient_user_id is not null and v_email_base
     and (coalesce(v_defaults ->> 'email', 'false') <> 'true'
          or (v_opted_out ? 'dm'
              and communication.notification_pair_channels(
                    p_event_key, p_organization_id, p_recipient_user_id,
                    '{"email": true}'::jsonb, false) ->> 'dm' = 'true')) then
    v_email_follows_dm := true;
    v_defaults := v_defaults || '{"email": true}'::jsonb;
  end if;

  v_kind := case when p_recipient_user_id is not null then 'user' else 'address' end;

  for ch in select key from jsonb_each_text(v_defaults) where value = 'true' order by key loop
    v_addr     := null;
    v_errcode  := null;
    v_errmsg   := null;
    v_status   := 'render_pending';
    v_metadata := '{}'::jsonb;

    if ch = 'email' and v_email_follows_dm then
      v_status  := 'skipped';
      v_errcode := 'opted_out';
      v_errmsg  := 'This person turned off messages for notices like this, so its email is off too '
                || '— an email never goes without its message.';
    elsif v_opted_out ? ch then
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
  'rule; a DM switched off takes its paired email with it. Server-only (service_role).';

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
   'dm_soft_expiry_and_dm_pairs_with_email.sql',
   'server_only: called by matrx-frontend server routes as service_role after their own '
   'authenticated access checks, and by SQL producers through the 10-argument delegation. A client '
   'calling it could message any person in any organization as anyone (p_options.dm.sender_user_id).',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

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

-- ── 3. THE OTHER PRODUCERS PASS THE RULE ───────────────────────────────────────────────────
-- Every SQL function that writes communication.notification rows directly. Each body below is
-- the live body (identical on the clone and the main database) with ONE change: its channel
-- decision now passes through the pairing rule, and the DM leg is queued before the email.
-- The bell doors at the end exclude a lapsed in-app notice from "unread".
CREATE OR REPLACE FUNCTION esign._notify(p_envelope_id uuid, p_event_key text, p_signer_id uuid DEFAULT NULL::uuid, p_to_user uuid DEFAULT NULL::uuid, p_to_address text DEFAULT NULL::text, p_actor_token_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_deep_link text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'email'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_org uuid; v_id uuid; v_kind text; v_addr text; v_refusal text; v_occasion text; v_key text;
        v_paired text[]; v_title text;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    perform platform.refuse_not_found(format('esign._notify: envelope %s does not exist', p_envelope_id));
  end if;
  v_kind := case when p_to_user is not null then 'user'
                 when p_actor_token_id is not null then 'actor_token'
                 else 'address' end;


  -- 🚨 WHAT MAKES ONE NOTICE THIS NOTICE (1417). The key used to end in
  -- to_char(now(), …ms) — the TRANSACTION's clock, identical for every call in one
  -- transaction — so two real notices (the email and the SMS of one send; a send and
  -- a resend) collided with a unique violation that aborted the caller, while a true
  -- duplicate in a later transaction never deduplicated at all. The occasion is now
  -- the fact that distinguishes them:
  --   signature_requested → the signer's notify_attempts (every sender bumps it after
  --                         telling them: _notify_actionable, esign_resend_signer);
  --   signature_reminder  → the signer's reminder_count (bumped by both reminder paths);
  --   declined / completed / expired / voided → the envelope/signer transition, which
  --                         happens once;
  --   any other event     → no key, so it never deduplicates rather than wrongly doing so.
  -- The channel ends the key, as notify() does, so one occasion's channels stay distinct.
  v_occasion := case p_event_key
    when 'esign.signature_requested' then
      'send' || coalesce((select s.notify_attempts from esign.envelope_signer s where s.id = p_signer_id), 0)
    when 'esign.signature_reminder' then
      'reminder' || coalesce((select s.reminder_count from esign.envelope_signer s where s.id = p_signer_id), 0)
    when 'esign.declined'  then 'once'
    when 'esign.completed' then 'once'
    when 'esign.expired'   then 'once'
    when 'esign.voided'    then 'once'
  end;
  v_key := case when v_occasion is not null then
    p_event_key || ':' || p_envelope_id::text || ':' || coalesce(p_signer_id::text, '-') || ':'
      || v_occasion || ':' || coalesce(p_channel, 'email')
  end;

  -- 🚨 THE PAIRING RULE (communication.notification_pair_channels): an email to a platform user
  -- never goes without its DM, and the DM is queued FIRST. The DM's words are the event's `dm`
  -- template, rendered by the one render lane (`render_pending`) from `envelope.title` — never
  -- composed here. A person who turned this notice's DM off has turned its email off too: the
  -- email becomes a named `opted_out` skip, never a silent absence. An outsider (actor_token /
  -- address) has no inbox, so nothing changes for them.
  if p_channel = 'email' and v_kind = 'user' then
    v_paired := communication.notification_pair_channel_list(p_event_key, v_org, p_to_user, array['email']);
    if 'dm' = any (v_paired) then
      select coalesce(nullif(btrim(e.title), ''), 'Your document') into v_title
        from esign.envelope e where e.id = p_envelope_id;
      insert into communication.notification
        (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
         status, subject, payload, target_kind, target_id, deep_link, dedupe_key)
      values (v_org, p_event_key, 'dm', 'user', p_to_user, p_to_user::text,
              'render_pending', p_subject,
              coalesce(p_payload, '{}'::jsonb)
                || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id,
                                      'envelope', jsonb_build_object('title', v_title)),
              'esign_envelope', p_envelope_id, p_deep_link,
              case when v_occasion is not null then
                p_event_key || ':' || p_envelope_id::text || ':' || coalesce(p_signer_id::text, '-')
                  || ':' || v_occasion || ':dm' end)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
    if not ('email' = any (v_paired)) then
      insert into communication.notification
        (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
         status, error_code, error_message, subject, payload, target_kind, target_id, dedupe_key)
      values (v_org, p_event_key, 'email', 'user', p_to_user, null, 'skipped', 'opted_out',
              'They turned off messages for this notice, so its email is off too — an email never goes without its message.',
              p_subject,
              coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
              'esign_envelope', p_envelope_id, v_key)
      on conflict (dedupe_key) where dedupe_key is not null do nothing
      returning id into v_id;
      if v_id is null and v_key is not null then
        select n.id into v_id from communication.notification n where n.dedupe_key = v_key;
      end if;
      return v_id;
    end if;
  end if;
  -- 🚨 THE ADDRESS IS RESOLVED FOR THIS ROW'S CHANNEL (1415). The caller's literal used to
  -- be written as-is, whatever channel the row was for. It now goes through the one
  -- resolver: a literal the channel cannot use is a named `skipped` row, never a send.
  if p_channel in ('email', 'sms') and nullif(btrim(coalesce(p_to_address, '')), '') is not null then
    select r.address, r.refusal into v_addr, v_refusal
      from communication.resolve_channel_address(
             p_channel, v_org, 'address', null, null, null, p_to_address) r
     limit 1;
    if v_addr is null then
      insert into communication.notification
        (organization_id, event_key, channel, recipient_kind, recipient_user_id,
         recipient_actor_token_id, to_address, status, error_code, error_message, subject,
         payload, target_kind, target_id, dedupe_key)
      values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id, null,
              'skipped', coalesce(v_refusal, 'no_address'),
              format('esign could not address this %s notice (%s)', p_channel,
                     coalesce(v_refusal, 'no_address')),
              p_subject,
              coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
              'esign_envelope', p_envelope_id, v_key)
      on conflict (dedupe_key) where dedupe_key is not null do nothing
      returning id into v_id;
      if v_id is null then
        select n.id into v_id from communication.notification n where n.dedupe_key = v_key;
      end if;
      return v_id;
    end if;
  else
    v_addr := nullif(btrim(coalesce(p_to_address, '')), '');
  end if;

  if v_kind <> 'user' and v_addr is null then
    -- SPEC-NOTIFICATIONS §3.2, as HRB-001 landed it: a resolver that finds no address writes a
    -- terminal `skipped` row carrying an error_code — VISIBLE, not silent — and never a raise and
    -- never a placeholder address, which would corrupt the one column the evidence rests on.
    insert into communication.notification
      (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
       status, error_code, error_message, subject, payload, target_kind, target_id, dedupe_key)
    values (v_org, p_event_key, p_channel, 'address', null, null,
            'skipped', 'no_address',
            'esign could not address this notice', p_subject,
            coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
            'esign_envelope', p_envelope_id, v_key)
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
    if v_id is null then
      select n.id into v_id from communication.notification n where n.dedupe_key = v_key;
    end if;
    return v_id;
  end if;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_kind, recipient_user_id, recipient_actor_token_id,
     to_address, subject, body, payload, target_kind, target_id, deep_link, dedupe_key)
  values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id,
          v_addr, p_subject, p_body,
          coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
          'esign_envelope', p_envelope_id, p_deep_link, v_key)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    -- The same occasion was already told on this channel: that row IS this notice.
    select n.id into v_id from communication.notification n where n.dedupe_key = v_key;
    return v_id;
  end if;

  -- 🚨 THE READ REFERENCE, FOR INTERNAL (user) ROWS ONLY (D286; the esign twin of hr_c4_47's
  -- DEFECT-1 fix). The link is built BEFORE the row id exists, so it is folded in AFTER the insert.
  -- §5.2: following the link stamps read_at — and only a `user` notice reads via the spine
  -- (mark_notification_read gates on recipient_user_id = auth.uid(), so this points at the viewer's
  -- OWN row and cross-viewer stamping cannot happen). 🚨 OUTSIDER (actor_token) rows are LEFT
  -- UNTOUCHED: their read signal is the esign.envelope_event ledger, and their link carries the
  -- secret in the URL FRAGMENT (§5.4) — a query param would push it past the `#`. The `#`-guard
  -- makes that impossible even for a user row that somehow carried a fragment.
  if v_kind = 'user' and p_deep_link is not null and position('#' in p_deep_link) = 0 then
    update communication.notification
       set deep_link = p_deep_link
                    || case when p_deep_link like '%?%' then '&' else '?' end
                    || 'notice=' || v_id::text
     where id = v_id;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION iam._notify_door(p_organization_id uuid, p_event_key text, p_recipient uuid, p_payload jsonb, p_target_id uuid, p_deep_link text, p_dedupe text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'communication', 'public'
AS $function$
declare
  v_raw jsonb; v_channels text[]; ch text; v_n integer := 0;
  v_actor text; v_subject_line text; v_body text; v_what text; v_when text;
begin
  if p_recipient is null then return 0; end if;

  select t.default_channels into v_raw
    from communication.notification_event_type t
   where t.event_key = p_event_key and t.deleted_at is null
   order by (t.organization_id = p_organization_id) desc
   limit 1;

  -- 🚨 FAILS TOWARD TELLING THE PERSON. An unregistered event key or a malformed channel object
  -- must never be the reason a subject is not told their data was opened.
  if v_raw is null then
    v_channels := ARRAY['in_app'];
  elsif jsonb_typeof(v_raw) = 'array' then
    v_channels := coalesce((select array_agg(value) from jsonb_array_elements_text(v_raw)), ARRAY['in_app']);
  else
    v_channels := coalesce((select array_agg(key) from jsonb_each(v_raw) where value = 'true'::jsonb),
                           ARRAY['in_app']);
  end if;
  if cardinality(v_channels) = 0 then v_channels := ARRAY['in_app']; end if;
  -- 🚨 THE PAIRING RULE: an email to a platform user never goes without its DM (queued first —
  -- the list comes back dm, email, in_app, …). The DM says what the in-app notice says.
  v_channels := communication.notification_pair_channel_list(
                  p_event_key, p_organization_id, p_recipient, v_channels);

  -- ── THE WORDS. A notice a person cannot act on is not a notice.
  select coalesce(u.email, 'someone in your organization') into v_actor
    from auth.users u
   where u.id = coalesce((p_payload->>'opened_by')::uuid, (p_payload->>'requested_by')::uuid);
  v_actor := coalesce(v_actor, 'someone in your organization');
  v_what := coalesce(p_payload->>'token', 'your data');
  v_when := case when (p_payload->>'expires_at') is null then null
                 else to_char((p_payload->>'expires_at')::timestamptz, 'Mon DD, HH24:MI') end;

  if p_event_key = 'platform.access.emergency_door_opened' then
    v_subject_line := 'Someone opened your data';
    v_body := format(
      '%s opened one of your %s records under emergency access.%s%sThe reason they gave: "%s".%s%s'
      || 'This was read-only and it is recorded permanently. You can see every time anyone opened '
      || 'your data on your own access page, and nobody can hide a row from you there.',
      v_actor, v_what, E'\n\n',
      case when v_when is null then '' else format('Their access ends %s.%s', v_when, E'\n\n') end,
      coalesce(p_payload->>'justification', '(none given)'), E'\n\n', E'\n\n');
  elsif p_event_key = 'platform.access.emergency_door_requested' then
    v_subject_line := 'Emergency access to your data was requested';
    v_body := format(
      '%s asked for emergency access to one of your %s records. Nobody can open it alone — an '
      || 'owner of your organization has to approve it first.%sThe reason they gave: "%s".%s'
      || 'You will be told again if it is approved, and this request is on your own access page either way.',
      v_actor, v_what, E'\n\n', coalesce(p_payload->>'justification', '(none given)'), E'\n\n');
  elsif p_event_key = 'platform.access.emergency_door_approval_needed' then
    v_subject_line := 'An emergency access request needs your approval';
    v_body := format(
      '%s asked for emergency access to a private %s record belonging to someone in your '
      || 'organization.%sThe reason they gave: "%s".%s'
      || 'You are the second person: this access does not happen unless you approve it. If you do, '
      || 'it is read-only, time-boxed, and the person it is about has already been told it was asked for.',
      v_actor, v_what, E'\n\n', coalesce(p_payload->>'justification', '(none given)'), E'\n\n');
  else
    v_subject_line := 'An emergency access request about your data was refused';
    v_body := format(
      'A request by %s for emergency access to one of your %s records was refused.%s%s'
      || 'Nothing was opened. It is on your own access page, with the reason.',
      v_actor, v_what, E'\n\n',
      case when (p_payload->>'note') is null then ''
           else format('The note left with the refusal: "%s".%s', p_payload->>'note', E'\n\n') end);
  end if;

  -- ── THE DOOR DOES NOT CLOSE WHEN NOTIFICATIONS ARE DOWN (§3.5).
  begin
    foreach ch in array v_channels loop
      insert into communication.notification
        (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
         subject, body, target_kind, target_id, deep_link, dedupe_key, visibility)
      values (p_organization_id, p_event_key, p_recipient, 'user', ch, p_payload,
              v_subject_line, v_body, 'iam_access_audit', p_target_id, p_deep_link,
              p_dedupe || ':' || ch, 'personal'::platform.visibility)
      on conflict do nothing;
      v_n := v_n + 1;
    end loop;
  exception when others then
    -- audited, loud, and NOT fatal. A failed notification is itself an event the person sees.
    raise warning 'iam._notify_door: could not tell % about % (% %). The access still happened and is in iam.access_audit; the notice did not go out.',
      p_recipient, p_event_key, sqlstate, sqlerrm;
    begin
      insert into iam.access_audit
        (organization_id, action, target_token, target_ids, data_class, purpose, basis,
         justification, is_emergency_door, granted, denial_reason, subject_user_id,
         actor_user_id, created_by, visibility)
      values (p_organization_id, 'notice_failed', coalesce(p_payload->>'token','(unknown)'),
              ARRAY[]::uuid[], coalesce(p_payload->>'data_class','(unknown)'), 'audit', 'refused',
              null, true, false,
              format('the subject could not be told: %s %s', sqlstate, sqlerrm),
              p_recipient, auth.uid(), auth.uid(), 'personal'::platform.visibility);
    exception when others then null;
    end;
    return 0;
  end;
  return v_n;
end $function$;

-- It is a SECURITY DEFINER the database calls on its own (emergency-access doors); it had no
-- declared access decision, and a replaced definer must carry one (provision_shape_guard).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', '_notify_door',
   pg_get_function_identity_arguments('iam._notify_door(uuid, text, uuid, jsonb, uuid, text, text)'::regprocedure),
   array['uuid','text','uuid','jsonb','uuid','text','text']::regtype[]::oid[],
   'p_organization_id files the notice; p_recipient is the person the access audit row is about, '
   'chosen by the calling door after its own access decision; p_target_id is the audit row id, stored, '
   'never dereferenced here.',
   'dm_soft_expiry_and_dm_pairs_with_email.sql',
   'server_only: called only from inside the iam emergency-access doors (open/request/approve/refuse), '
   'never by a client — a client calling it could notify any person about any access.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

CREATE OR REPLACE FUNCTION public.org_admin_take_over_account(p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_new_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 🚨 THE PAIRING RULE: the channel decision passes through the one rule (an email to a
  -- platform user never goes without its DM, queued first). Its knob decides per event —
  -- see communication.notification_event_type.config.pair_dm_with_email for platform.access.account_taken_over.
  v_channels := communication.notification_pair_channel_list(
                  'platform.access.account_taken_over', p_org_id, p_user_id, v_channels);
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

CREATE OR REPLACE FUNCTION public.org_admin_take_over_member_records(p_org_id uuid, p_user_id uuid, p_purpose text, p_reason text, p_to_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- 🚨 THE PAIRING RULE: the channel decision passes through the one rule (an email to a
  -- platform user never goes without its DM, queued first). Its knob decides per event —
  -- see communication.notification_event_type.config.pair_dm_with_email for platform.access.records_taken_over.
  v_channels := communication.notification_pair_channel_list(
                  'platform.access.records_taken_over', p_org_id, p_user_id, v_channels);
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

CREATE OR REPLACE FUNCTION custom.agg_deliver(p_organization_id uuid, p_rule_id uuid, p_record_id uuid, p_channel text, p_recipient_user_id uuid, p_event_key text, p_subject text, p_body text, p_payload jsonb DEFAULT '{}'::jsonb, p_dedupe_suffix text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid;
  v_key     text;
  v_chan    text[];
  v_addr    record;
  v_status  text := 'pending';
  v_err     text;
  v_errmsg  text;
  v_link    text;
  v_to      text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');

  -- STORE-TAILS-3: THE PERSON'S OWN SWITCH, ASKED BEFORE A CHANNEL IS WRITTEN. The one channel
  -- ladder — the event's registry row, the organization's override, then this person's own
  -- preference (`hr._notify_channels` → `communication.notification_user_channels`, the ladder
  -- every other producer asks). A channel the person switched off for this kind of notice is
  -- not written at all: a choice they made is not a failure and is not queued.
  if p_recipient_user_id is not null then
    v_chan := hr._notify_channels(p_event_key, p_organization_id, p_recipient_user_id, null);
    if not (coalesce(p_channel, 'in_app') = any (coalesce(v_chan, array['in_app']))) then
      return null;
    end if;
  end if;

  v_key := format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
                  coalesce(nullif(btrim(p_dedupe_suffix), ''),
                           to_char(now() at time zone 'utc', 'YYYY-MM-DD')));

  -- STORE-TAILS-3: AN EMAIL GOES TO AN ADDRESS, AND IS WORDED BY ITS REGISTRY ROW. The in-app
  -- row carries its words and is the delivery; an email row (until today written with no
  -- address, so every one failed `missing_recipient_address`) resolves the person's address
  -- through the one resolver and waits at `render_pending` for the render pass, which words it
  -- from the event's template with `payload.notice` and the record's link. No address is a
  -- named skip, never a silent drop.
  -- 🚨 THE PAIRING RULE: an email to a platform user never goes without its DM. The ladder above
  -- (`hr._notify_channels` → `notification_user_channels`) ends in
  -- `communication.notification_pair_channels`, so `dm` is in `v_chan` exactly when the rule pairs
  -- this email — and (the person's own switch) `email` is absent when they turned the DM off,
  -- which returned above. The DM is queued FIRST, worded by the event's `dm` template through the
  -- render lane, under its own dedupe key.
  if p_channel = 'email' and p_recipient_user_id is not null and 'dm' = any (coalesce(v_chan, '{}')) then
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind, to_address,
       status, dedupe_key, subject, body, payload, target_kind, target_id, deep_link)
    values
      (p_organization_id, p_event_key, 'dm', p_recipient_user_id, 'user', p_recipient_user_id::text,
       'render_pending', v_key || ':dm', p_subject, null,
       coalesce(p_payload, '{}'::jsonb) ||
         jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id,
                            'notice', jsonb_build_object('subject', p_subject, 'body', p_body)),
       'custom.record', p_record_id,
       case when p_record_id is not null then '/o/' || p_record_id::text end)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if coalesce(p_channel, 'in_app') <> 'in_app' then
    v_key := v_key || ':' || p_channel;
    v_link := case when p_record_id is not null then '/o/' || p_record_id::text end;
    select * into v_addr
      from communication.resolve_channel_address(p_channel, p_organization_id, 'user',
                                                 p_recipient_user_id, null, null, null)
     limit 1;
    v_to := v_addr.address;
    if v_to is null then
      v_status := 'skipped';
      v_err    := coalesce(v_addr.refusal, 'no_contact_point');
      v_errmsg := format('There is no %s address for this person, so this notice went to their AI Matrx inbox only.', p_channel);
    else
      v_status := 'render_pending';
    end if;
  end if;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind, to_address,
     status, error_code, error_message,
     dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
  values
    (p_organization_id, p_event_key, coalesce(p_channel, 'in_app'), p_recipient_user_id, 'user', v_to,
     v_status, v_err, v_errmsg,
     v_key, p_subject, p_body,
     coalesce(p_payload, '{}'::jsonb) ||
       jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id,
                          'notice', jsonb_build_object('subject', p_subject, 'body', p_body)),
     'custom.record', p_record_id, v_link, 'personal'::platform.visibility)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    select n.id into v_id from communication.notification n
     where n.organization_id = p_organization_id and n.dedupe_key = v_key;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION communication.my_notification_unread_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer
    from communication.notification n
   where n.recipient_user_id = auth.uid()
     and auth.uid() is not null
     and n.channel = 'in_app'
     and n.status = 'succeeded'
     and n.read_at is null
     -- SOFT EXPIRY: a notice paired with a lapsing DM lapses with it (metadata.soft_expires_at,
     -- written by notify()); it stays in the list, it just stops waiting on anyone.
     and not communication.notice_lapsed(n.metadata);
$function$;

CREATE OR REPLACE FUNCTION communication.my_notifications(p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_unread_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, event_key text, subject text, body text, deep_link text, target_kind text, target_id uuid, organization_id uuid, created_at timestamp with time zone, delivered_at timestamp with time zone, read_at timestamp with time zone, acted_at timestamp with time zone, outcome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.id, n.event_key, n.subject, n.body, n.deep_link, n.target_kind, n.target_id,
         n.organization_id, n.created_at, n.delivered_at, n.read_at, n.acted_at, n.outcome
    from communication.notification n
   where n.recipient_user_id = auth.uid()
     and auth.uid() is not null
     and n.channel = 'in_app'
     and n.status = 'succeeded'
     and (p_before is null or n.created_at < p_before)
     and (not p_unread_only or (n.read_at is null and not communication.notice_lapsed(n.metadata)))
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

-- ── 4. THE SIGNAL: emails that succeeded without their paired DM ───────────────────────────
-- Delivery stays two independent legs (one leg's failure never holds the other). This makes the
-- gap MEASURABLE: per event, in the window, how many emails to platform users succeeded while
-- their paired DM was missing, failed, or still waiting. Server-side only (service role). A DM the producer deliberately did not
-- send (`sender_is_recipient`: a host inviting themselves) is not a gap. Whether an email WAS
-- paired is asked of the rule itself, so an unpaired event (a one-time code) is never counted.
create or replace function communication.notification_paired_dm_gaps(
  p_since timestamptz default now() - interval '24 hours')
 returns table(event_key text, emails_succeeded integer, dm_not_delivered integer,
               dm_missing integer, example_notification_id uuid)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  return query
  with emails as (
    select e.id, e.event_key, e.organization_id, e.recipient_user_id, e.dedupe_key,
           e.target_id, e.created_at
      from communication.notification e
     where e.channel = 'email'
       and e.status = 'succeeded'
       and e.recipient_kind = 'user'
       and e.recipient_user_id is not null
       and e.deleted_at is null
       and e.created_at >= p_since
  ), paired as (
    select e.*
      from emails e
     where communication.notification_pair_channels(
             e.event_key, e.organization_id, e.recipient_user_id, '{"email": true}'::jsonb, false)
           ->> 'dm' = 'true'
  ), legs as (
    select p.id, p.event_key,
           (select d.status || coalesce(':' || d.error_code, '')
              from communication.notification d
             where d.channel = 'dm'
               and d.recipient_user_id = p.recipient_user_id
               and d.event_key = p.event_key
               and d.organization_id = p.organization_id
               and d.deleted_at is null
               and case
                     when p.dedupe_key is not null and d.dedupe_key is not null
                       then regexp_replace(d.dedupe_key, ':dm$', '')
                          = regexp_replace(p.dedupe_key, ':email$', '')
                     else d.target_id is not distinct from p.target_id
                          and d.created_at between p.created_at - interval '5 minutes'
                                               and p.created_at + interval '5 minutes'
                   end
             order by (d.status = 'succeeded') desc, d.created_at
             limit 1) as dm_leg
      from paired p
  )
  select l.event_key,
         count(*)::integer,
         count(*) filter (where l.dm_leg is null
                             or (l.dm_leg not like 'succeeded%'
                                 and l.dm_leg <> 'skipped:sender_is_recipient'))::integer,
         count(*) filter (where l.dm_leg is null)::integer,
         (array_agg(l.id order by l.id) filter (
            where l.dm_leg is null
               or (l.dm_leg not like 'succeeded%' and l.dm_leg <> 'skipped:sender_is_recipient')))[1]
    from legs l
   group by l.event_key
   order by 3 desc, 1;
end
$function$;

comment on function communication.notification_paired_dm_gaps(timestamptz) is
  'Per event since p_since: emails that succeeded to a platform user, and how many of them have no '
  'delivered paired DM (missing, failed or still waiting). The measurable half of THE PAIRING RULE.';

-- Server-side only (the health check runs as the service role); no client door.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('communication', 'notification_paired_dm_gaps',
   pg_get_function_identity_arguments('communication.notification_paired_dm_gaps(timestamptz)'::regprocedure),
   array['timestamptz']::regtype[]::oid[],
   'No entity-id argument: p_since only bounds the window. Returns counts per event key and one '
   'example notification id — operator health data across every organization.',
   'dm_soft_expiry_and_dm_pairs_with_email.sql',
   'server_only: the notification health check (aidream scripts/check_email_never_without_dm.py) '
   'reads it as the service role; it spans every organization, so no client may call it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;
revoke all on function communication.notification_paired_dm_gaps(timestamptz) from public, anon, authenticated;
grant execute on function communication.notification_paired_dm_gaps(timestamptz) to service_role;


-- ── 5. THE PAIRED DM NEEDS WORDS ON EVERY ROW ──────────────────────────────────────────────
-- (merged from notification_dm_templates_from_in_app.sql.) The SQL producers that walk the ladder
-- themselves — hr._wf_notify, hr._punch_notify_edited, hr._l1_notify_consent_requested,
-- interview._decision_answer_notify — read `config->'templates'->ch->'body'` and record a channel
-- with no body as a `no_template` skip. So every row with an in-app line gets a `dm` template
-- with the same words. Idempotent: a row that already has a `dm` template is never touched, and an
-- admin may edit the DM words independently afterwards.
update communication.notification_event_type t
   set config = jsonb_set(
         t.config,
         '{templates,dm}',
         jsonb_build_object('body', t.config -> 'templates' -> 'in_app' -> 'body'),
         true)
 where t.deleted_at is null
   and jsonb_typeof(t.config -> 'templates') = 'object'
   and not (t.config -> 'templates' ? 'dm')
   and nullif(btrim(coalesce(t.config -> 'templates' -> 'in_app' ->> 'body', '')), '') is not null;

-- ── 6. E-SIGNATURE: the DM words (esign._notify composes its email and in-app text inline; its
-- paired DM is worded here, by the registry, and rendered by the one render lane from
-- `envelope.title`). Never overwrites a `dm` template an admin already wrote.
update communication.notification_event_type t
   set config = jsonb_set(
         coalesce(t.config, '{}'::jsonb),
         '{templates}',
         coalesce(t.config -> 'templates', '{}'::jsonb)
           || jsonb_build_object('dm', jsonb_build_object('body', w.body)),
         true)
  from (values
    ('esign.signature_requested', '{{envelope.title}} is ready for your signature.'),
    ('esign.signature_reminder',  'Reminder: {{envelope.title}} is still waiting for your signature.'),
    ('esign.completed',           '{{envelope.title}} is signed by everyone.'),
    ('esign.declined',            '{{envelope.title}} was declined.'),
    ('esign.expired',             '{{envelope.title}} expired before everyone signed.'),
    ('esign.voided',              '{{envelope.title}} was voided.'),
    ('esign.delivery_failed',     '{{envelope.title}} could not reach one of its signers.')
  ) as w(event_key, body)
 where t.event_key = w.event_key
   and t.deleted_at is null
   and not coalesce(t.config -> 'templates' ? 'dm', false);

-- ── 7. A TOKEN NEVER GOES TO CHAT ───────────────────────────────────────────────────────────
-- An invitation's link IS its acceptance token (`/invitations/<kind>/accept/<token>`). Its DM
-- tells the person they were invited and where the invitation is; the token stays in the email
-- and the in-app notice. Rewritten only while the DM still carries `{{link.deep…}}`, so an
-- admin's own words are never overwritten. (aidream's declarations carry the same words.)
update communication.notification_event_type t
   set config = jsonb_set(t.config, '{templates,dm}', jsonb_build_object('body', w.body), true)
  from (values
    ('invitation.organization',
     '{{invite.inviter}} invited you to join {{invite.organization}} on AI Matrx. Accept it from your invitation email or your notifications.'),
    ('invitation.organization_reminder',
     'Reminder: {{invite.inviter}} invited you to join {{invite.organization}} on AI Matrx. Accept it from your invitation email or your notifications.'),
    ('invitation.project',
     '{{invite.inviter}} invited you to join project {{invite.project}} in {{invite.organization}} on AI Matrx. Accept it from your invitation email or your notifications.'),
    ('invitation.project_reminder',
     'Reminder: {{invite.inviter}} invited you to join project {{invite.project}} in {{invite.organization}} on AI Matrx. Accept it from your invitation email or your notifications.'),
    ('invitation.class',
     '{{invite.inviter}} invited you to join {{invite.class}} on AI Matrx Education. Accept it from your invitation email or your notifications.')
  ) as w(event_key, body)
 where t.event_key = w.event_key
   and t.deleted_at is null
   and coalesce(t.config -> 'templates' -> 'dm' ->> 'body', '') ~ '\{\{\s*link\.deep';

-- ── 8. THE KNOB, EXPLICIT ON EVERY ROW ──────────────────────────────────────────────────────
-- 8a. OFF, each with its reason, where a DM would be wrong. Owner rule: codes, tokens and secrets
-- never go to a chat thread.
update communication.notification_event_type t
   set config = coalesce(t.config, '{}'::jsonb)
                || jsonb_build_object('pair_dm_with_email', false,
                                      'pair_dm_with_email_reason', w.reason)
  from (values
    ('esign.verification_code',
     'The email carries a one-time signing code; a code never goes to a chat thread.'),
    ('iam.invitation.token_rotated',
     'The email carries the replacement invitation link, which is its token; a token never goes to a chat thread.'),
    ('secure_delivery.link',
     'The link is a single-use secret on its own channel; a DM copy would outlive it in a chat thread.'),
    ('secure_delivery.code',
     'A one-time code travels only on the channel it was sent to; a DM copy defeats the two-channel design.'),
    ('access_request.approved',
     'The email carries a one-use sign-up code, and the person has no account to DM yet.'),
    ('platform.access.account_taken_over',
     'The account''s own inbox now belongs to whoever took it over; only the email reaches the person.'),
    ('task.assigned',
     'Already paired: the assignee gets the task_assignment_dm action chip; a plain DM beside it would tell them twice.')
  ) as w(event_key, reason)
 where t.event_key = w.event_key
   and t.deleted_at is null;

-- 8b. ON, explicitly, everywhere else the row does not already say. (A row that says `false`
-- keeps it: that was a decision, and its reason sits beside its declaration.)
update communication.notification_event_type t
   set config = coalesce(t.config, '{}'::jsonb) || '{"pair_dm_with_email": true}'::jsonb
 where t.deleted_at is null
   and not coalesce(t.config ? 'pair_dm_with_email', false);

-- ── 9. THE KNOB ROWS the server reads (rows only; an admin's value is never overwritten) ────
-- meet / dm_soft_expiry_minutes (org-overridable, 60): minutes after a meeting STARTS that its DMs
--   lapse (aidream/services/meet/knobs.py::dm_soft_expiry_minutes — a missing row screams and
--   the declared 60 is used, never a raise that kills an announce).
-- communication.notifications / voice_open (platform-locked, false): whether a notification
--   phone call may reach anyone beyond the loopback test handsets (channels/voice.py).
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction, ui,
   taxonomy_node_id, propagation, public_read)
SELECT 'meet', 'dm_soft_expiry_minutes',
       '60'::jsonb, '60'::jsonb, 'integer', 'minutes', 0, 10080, NULL,
       'Meeting messages stop counting as unread',
       'Minutes after a meeting starts when its invitation, reminder and reply messages stop counting as unread. They stay in the inbox.',
       'agent',
       'Agent-set default (blind approval). Set by the DM-pairing lane (Claude) on 2026-10-02. Basis: Arman, 2026-10-02 — a meeting DM should no longer count as unread an hour after the meeting starts. Arman approved this class of decision in advance (2026-08-20). Review due 2026-12-15.',
       '2026-12-15', ARRAY['organization'], 'any', '{}'::jsonb,
       k.taxonomy_node_id, 'next_load', false
  FROM platform.feature_knob k
 WHERE k.feature = 'meet' AND k.key = 'reminder_minutes_before'
ON CONFLICT (feature, key) DO NOTHING;

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction, ui,
   taxonomy_node_id, propagation, public_read)
SELECT 'communication.notifications', 'voice_open',
       'false'::jsonb, 'false'::jsonb, 'boolean', NULL, NULL, NULL, NULL,
       'Phone-call notifications reach real people',
       'When off, notification phone calls reach only the platform''s own test handsets. Platform-wide.',
       'agent',
       'Agent-set default (blind approval). Set by the DM-pairing lane (Claude) on 2026-10-02. Basis: a call is the most interruptive channel and has no consent program of its own yet; closed until the platform decides to open it. Review due 2026-12-15.',
       '2026-12-15', ARRAY[]::text[], 'any', '{}'::jsonb,
       k.taxonomy_node_id, 'next_load', false
  FROM platform.feature_knob k
 WHERE k.feature = 'communication.notifications' AND k.key = 'default_timezone'
ON CONFLICT (feature, key) DO NOTHING;
