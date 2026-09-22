-- chair-step: this replaces the bodies of three live client doors (custom.table_share_outside, _invite, _resend), creates one operational table and four functions, and opens two new client doors — one of them to anon — so the judge cannot read what the statements will do from its allow-list
-- based-on: custom.table_share_outside(uuid, uuid) 39ae287e4f529b9d9413183bf53b2adffc26670bc02353f2970017ef7d5573ed
-- based-on: custom.table_share_outside_invite(uuid, uuid, text, permission_level) 284deb494acb59d7409f9869c6bb5242c69b8c05690128ca270d6d2c433df27f
-- based-on: custom.table_share_outside_resend(uuid, uuid) 794c72f581f2a92cb9504bdf78980654b35c8c620fbb08010768079e58a12b68
--
-- INVITE-DELIVERY — THE INVITATION ACTUALLY REACHES THE PERSON.
--
-- 🚨 WHAT WAS BROKEN, MEASURED NOT GUESSED. Lane SHARE-OUT built the whole of
-- "share one table with somebody outside this organization" — the pending row, the
-- token, the six doors, the accept page — and named the hole itself
-- (`PROGRESS-SHARE-OUT.md` §5): *"Nothing sends the invitation email.
-- `custom.table_share_outside_invite` mints the token and returns it; the dialog shows
-- the pending row; no message goes out."* The token was minted into a column nobody
-- could read and the screen said "Invited, not yet joined" forever. The feature was
-- unusable end to end.
--
-- THE CLASS. Organization, project and class invitations DO reach people today, and
-- they have for a long time: `inv_create` is followed by `POST /api/organizations/invite`
-- → `emailTemplates.organizationInvitation` → `sendEmail`, and
-- `components/membership/InvitationsPanel.tsx` gives every pending row a **Copy Link**
-- button plus, when the send fails, the link in selectable text with "send it yourself".
-- So this is not a missing class — it is ONE member of a working class that was built
-- without its delivery half. This file gives the table share the same two things, and
-- takes the delivery through the platform's ONE notification spine rather than the
-- frontend's bespoke `lib/email/client.ts`, which the notification program's own
-- remaining-work list (HANDOFF.md §"Remaining program work" item 1) exists to retire.
--
-- 🚨 WHY A SQL PRODUCER AND NOT A PYTHON ONE. The invitation is minted by a SQL door
-- called straight from the browser. The notice must be written in the same transaction
-- as the invitation, or a rolled-back invite tells somebody about access they were never
-- given. There is no Python anywhere in that path. This is exactly the situation
-- `services/notifications/render_pass.py` was built for: **the transaction writes the
-- FACTS and the render pass writes the WORDS**, via `status='render_pending'`.
-- `hr._wf_notify` is the worked example and `communication.notify_from_sql` below is its
-- generalisation — SECOND producer of notices, not a second notification system: same
-- outbox, same dispatcher, same preferences, same renderer, same link-honesty policy.
--
-- FOUR THINGS THIS FILE BUILDS:
--
--   1. `communication.channel_readiness` + `communication.record_channel_readiness` +
--      `communication.channel_readiness_say` — WHAT THE SERVER ACTUALLY HAS. The
--      database cannot know whether `RESEND_API_KEY` / `EMAIL_FROM` are set in the
--      server's environment, and a screen that promises an email the server cannot send
--      is the "dead control" this campaign keeps closing. So the server STAMPS what it
--      observed at startup and the screen reads the stamp. Declared vs observed state:
--      no row, or a stale one, reads as "we cannot tell", never as "yes".
--   2. `communication.notify_from_sql` — the general SQL-side spine producer.
--   3. `custom.table_share_outside_invite` / `_resend` call it, and answer whether the
--      notice was queued, skipped, or could not be sent — with the link either way.
--   4. `custom.table_share_outside` hands the sharer the ACCEPT LINK for every pending
--      row (a plumber texting a customer a link is the real case), and
--      `custom.table_share_outside_peek` lets the person on the other end of the link
--      see what they were offered BEFORE they are asked to make an account.
--
-- ON THE ONE SENTENCE. `custom.table_share_outside_accept` answers ONE sentence for
-- unknown / used / expired / somebody-else's, so a link cannot be used to learn that
-- anything is there. `_peek` is NOT a weakening of that rule, it is the other side of
-- it: a caller who holds the token already holds the secret, so it may be told which of
-- those four it is and who to ask — which is what `public.inv_peek_invited_email`
-- already does for an organization invitation, anonymously, today. An UNKNOWN token
-- still gets the one sentence and nothing else, so the door reveals nothing that the
-- token did not already carry.


-- ---------------------------------------------------------------------------
-- 1. WHAT THIS SERVER CAN ACTUALLY SEND — observed, stamped, never assumed.
-- ---------------------------------------------------------------------------
-- Deliberately NOT entity-shaped (no created_by/updated_at/deleted_at/metadata/
-- version/visibility): it is not a business record, it holds no tenant data, and
-- `platform._provision_shape_guard` judges by those columns. It is one row per channel,
-- overwritten by the server every time it starts. RLS is on with no policy at all: the
-- only way in is the two functions below.
create table if not exists communication.channel_readiness (
  channel      text primary key,
  configured   boolean not null,
  detail       text    not null,
  checked_at   timestamptz not null default now(),
  checked_by   text    not null
);

alter table communication.channel_readiness enable row level security;
alter table communication.channel_readiness force row level security;

comment on table communication.channel_readiness is
  'INVITE-DELIVERY: what each notification channel''s adapter reported about ITS OWN '
  'credentials the last time this server started. Written only by '
  'communication.record_channel_readiness (service_role), read only by '
  'communication.channel_readiness_say. An absent or stale row means "nobody has '
  'checked", which every reader must say as "we cannot tell" — never as "yes" and never '
  'as "no".';

-- THE SERVER'S STAMP. Called by aidream startup for every channel in
-- `services/notifications/channels/CHANNELS`, from that adapter's own `is_configured()`.
create or replace function communication.record_channel_readiness(
  p_channel text, p_configured boolean, p_detail text default '')
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  if coalesce(btrim(p_channel), '') = '' then
    raise exception 'A channel readiness stamp has to say which channel it is about.'
      using errcode = '22004';
  end if;
  insert into communication.channel_readiness (channel, configured, detail, checked_at, checked_by)
  values (lower(btrim(p_channel)), coalesce(p_configured, false),
          coalesce(nullif(btrim(p_detail), ''), 'no detail given'), now(), current_user)
  on conflict (channel) do update
     set configured = excluded.configured,
         detail     = excluded.detail,
         checked_at = excluded.checked_at,
         checked_by = excluded.checked_by;
end;
$fn$;

-- WHAT A SCREEN IS ALLOWED TO SAY ABOUT IT. Three answers, never two: `yes`, `no`, and
-- `unknown` — the last one for "no server has ever stamped this" and for a stamp so old
-- it is no longer evidence of anything. A failed check is never printed as a fact.
create or replace function communication.channel_readiness_say(p_channel text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_row communication.channel_readiness;
  v_ch  text := lower(btrim(coalesce(p_channel, '')));
  -- A server that has not started in a day is not evidence about today's credentials.
  c_stale constant interval := interval '36 hours';
begin
  select * into v_row from communication.channel_readiness where channel = v_ch;

  if not found then
    return jsonb_build_object(
      'channel', v_ch, 'answer', 'unknown', 'configured', null, 'checked_at', null,
      'say', format('Nothing has told us whether %s works on this server yet.', v_ch));
  end if;

  if v_row.checked_at < now() - c_stale then
    return jsonb_build_object(
      'channel', v_ch, 'answer', 'unknown', 'configured', null, 'checked_at', v_row.checked_at,
      'say', format('The last time anything checked whether %s works here was %s, which is too long ago to go on.',
                    v_ch, to_char(v_row.checked_at, 'FMDay DD FMMonth')));
  end if;

  return jsonb_build_object(
    'channel', v_ch,
    'answer', case when v_row.configured then 'yes' else 'no' end,
    'configured', v_row.configured,
    'checked_at', v_row.checked_at,
    'detail', v_row.detail,
    'say', case when v_row.configured
                then format('%s works on this server.', initcap(v_ch))
                else format('%s is not set up on this server.', initcap(v_ch)) end);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. ONE NOTICE, WRITTEN FROM SQL, ONTO THE ONE SPINE.
-- ---------------------------------------------------------------------------
-- The generalisation of `hr._wf_notify`'s queue decision. It decides NOTHING about who
-- may be told what — the caller already judged that — and it invents no prose: the words
-- come from the event's own registry templates through the ONE renderer, in the render
-- pass, exactly as they do for the thirteen HR workflow doors.
--
-- It takes a recipient the way the spine's own CHECK does: a `user` (id known) or an
-- `address` (an email for somebody who may have no account at all — which is the whole
-- point of an outside invitation).
create or replace function communication.notify_from_sql(
  p_organization_id uuid,
  p_event_key       text,
  p_recipient_user_id uuid,
  p_to_address      text,
  p_recipient_label text,
  p_payload         jsonb,
  p_deep_link       text,
  p_target_kind     text,
  p_target_id       uuid,
  p_dedupe_key      text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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

  v_kind := case when p_recipient_user_id is not null then 'user' else 'address' end;

  for ch in select key from jsonb_each_text(v_defaults) where value = 'true' order by key loop
    v_addr    := null;
    v_errcode := null;
    v_errmsg  := null;
    v_status  := 'render_pending';

    if ch = 'in_app' then
      -- THE ROW IS THE DELIVERY, and a row addressed to nobody is a row nobody reads.
      -- Somebody with no account has no inbox; saying so by name is the honest half.
      if p_recipient_user_id is null then
        v_status  := 'skipped';
        v_errcode := 'no_account';
        v_errmsg  := 'This person has no AI Matrx account yet, so there is no inbox to put this in. '
                  || 'It reaches them by email and by the link, and it will be in their inbox once they join.';
      end if;
    elsif ch in ('email', 'sms') then
      -- The address is KNOWN — it is the address the invitation was made out to — so
      -- there is nothing for `resolve_channel_address` to resolve and no contact point
      -- to invent for a person who is not in this organization.
      v_addr := nullif(btrim(coalesce(p_to_address, '')), '');
      if v_addr is null then
        v_status  := 'skipped';
        v_errcode := 'no_contact_point';
        v_errmsg  := format('No %s address for this recipient.', ch);
      end if;
    else
      v_status  := 'skipped';
      v_errcode := 'unsupported_channel';
      v_errmsg  := format('communication.notify_from_sql does not write %s notices.', ch);
    end if;

    -- THE QUEUE DECISION, in the same words the other two producers use. This function
    -- has no renderer and there must never be a second one, so a notice with a template
    -- goes to the render lane and a notice without one is a NAMED skip.
    if v_status = 'render_pending'
       and nullif(btrim(coalesce(v_templates -> ch ->> 'body', '')), '') is null then
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
$fn$;

-- ---------------------------------------------------------------------------
-- 3. THE EVENT ITSELF, so the invitation can be delivered BEFORE the next deploy.
-- ---------------------------------------------------------------------------
-- `services/notifications/declarations.py` is the source of truth and reconciles this
-- row at every startup; this insert is the same row, written now, so the feature works
-- tonight instead of after the train. `on conflict do nothing` — the declaration wins
-- any disagreement, because the code is where a template is authored.
--
-- 🚨 THE RENDERER IS STRICT: a merge field the payload does not carry is a render_failed
-- skip, not a blank. Every field named here is written by
-- `custom.table_share_outside_invite` below, and `link.deep` / `link.preferences` /
-- `employer.*` are supplied by the spine itself (`services/notifications/bindings.py`).
insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, enabled, config)
values (
  public.system_org_id('system'),
  'share.table_invited',
  'A table was shared with you',
  'Somebody outside an organization was given access to one of its tables. '
  'This is the message that carries the link they open it with.',
  '{"in_app": true, "email": true}'::jsonb,
  true,
  jsonb_build_object(
    'target_kind', 'custom_table_invitation',
    'deep_link_template', '/invitations/table/accept/{{invite.token}}',
    'sms_locked', true,
    'templates', jsonb_build_object(
      'in_app', jsonb_build_object(
        'body', '{{invite.inviter}} shared {{invite.table}} in {{invite.organization}} with you. You can {{invite.means}}.'),
      'email', jsonb_build_object(
        'subject', '{{invite.inviter}} shared {{invite.table}} with you',
        'body',
          '{{invite.inviter}} gave you access to {{invite.table}} in {{invite.organization}}.' || E'\n\n' ||
          'You can {{invite.means}}.' || E'\n\n' ||
          'Open it here:' || E'\n' ||
          '{{link.deep}}' || E'\n\n' ||
          'This link was sent to {{invite.email}} and only works when you are signed in with that address. ' ||
          'You do not need an account yet — the link will offer to make you one.' || E'\n' ||
          'It stops working on {{invite.expires}}, and {{invite.inviter}} can take it back at any time.' || E'\n\n' ||
          'Opening it does not put you in {{invite.organization}}. You will see {{invite.table}} and nothing else there.' || E'\n\n' ||
          '--' || E'\n' ||
          'AI Matrx sent this because somebody at {{invite.organization}} shared a table with you. ' ||
          'Manage notifications: {{link.preferences}}')))
)
on conflict (event_key) do nothing;

-- ---------------------------------------------------------------------------
-- 4. THE ROUTE THE LINK OPENS HAS TO BE IN THE MANIFEST.
-- ---------------------------------------------------------------------------
-- 🚨 A DEFECT THIS FILE WOULD OTHERWISE HAVE SHIPPED WITH. The render pass asks
-- `services/routes/liveness.py` what a reader who follows this link will actually get,
-- and rewrites the link to the nearest LIVE ancestor when the route is not in
-- `platform.route_manifest`. `/invitations/table/accept/[token]` was built by lane
-- SHARE-OUT on 2026-09-21 and the manifest was last synced on 2026-09-13, so every
-- invitation email would have carried a rewritten link to somewhere that is not the
-- invitation — silently, and with a warning in a log nobody reads. The row is written
-- here; `pnpm route-manifest:sync` on the next deploy writes the same value.
insert into platform.route_manifest (organization_id, app, pattern, status, source, source_sha)
values (public.system_org_id('system'), 'matrx-frontend', '/invitations/table/accept/[token]', 'live',
        'app/(core)/invitations/table/accept/[token]/page.tsx', 'invite-delivery-2026-09-21')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. THE FACTS A SENTENCE NEEDS — built once, for the invite and the resend.
-- ---------------------------------------------------------------------------
-- 🚨 THE RENDERER IS STRICT: every key below is guaranteed non-empty, because a notice
-- that fails to render reaches nobody at all. Internal lane; no client grant.
create or replace function custom._table_share_invite_payload(p_invitation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv   iam.invitations;
  v_org   text;
  v_table text;
  v_means text;
  v_who   text;
  v_lvl   public.permission_level;
begin
  select * into v_inv from iam.invitations where id = p_invitation_id;
  if not found then
    raise exception 'There is no such invitation.' using errcode = '02000';
  end if;

  select coalesce(nullif(btrim(o.name), ''), 'their organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;

  select coalesce(nullif(btrim(r.data ->> 'name'), ''), 'a table') into v_table
    from custom.record r
   where r.organization_id = v_inv.organization_id and r.id = v_inv.target_id;

  v_lvl := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  -- The words a person reads for a rung come from ONE place and this is not it.
  select l.means into v_means from custom.share_levels() l where l.level = v_lvl;

  -- WHO SHARED IT. A name if the account has one, otherwise the address they are known
  -- by — never "Someone", because the reader is being asked to trust a link.
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           nullif(btrim(u.email), ''),
           'Somebody at ' || v_org)
    into v_who
    from auth.users u where u.id = v_inv.created_by;

  return jsonb_build_object('invite', jsonb_build_object(
    'invitation_id', v_inv.id,
    'token',        v_inv.token,
    'email',        v_inv.email,
    'table',        coalesce(v_table, 'a table'),
    'organization', coalesce(v_org, 'their organization'),
    'level',        v_lvl::text,
    'level_label',  iam.level_label('table', v_lvl),
    'means',        coalesce(v_means, 'read it'),
    'inviter',      coalesce(v_who, 'Somebody at ' || coalesce(v_org, 'an organization')),
    'expires',      to_char(coalesce(v_inv.expires_at, now() + interval '14 days'),
                            'FMDay DD FMMonth YYYY')));
end;
$fn$;

-- THE ONE SEND PATH, so the invite and the resend can never disagree about what goes
-- out or about what the sharer is told. `dedupe_key` carries the TOKEN, so a resend —
-- which mints a fresh token — is a new notice, while a double-click on Invite is not.
create or replace function custom._table_share_invite_deliver(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv     iam.invitations;
  v_payload jsonb;
  v_answer  jsonb;
  v_email   jsonb;
  v_path    text;
begin
  select * into v_inv from iam.invitations where id = p_invitation_id;
  v_payload := custom._table_share_invite_payload(p_invitation_id);
  v_path    := '/invitations/table/accept/' || v_inv.token;

  v_answer := communication.notify_from_sql(
    v_inv.organization_id,
    'share.table_invited',
    v_inv.invited_user_id,   -- null when they have no account yet, which is the usual case
    v_inv.email,
    v_inv.email,
    v_payload,
    v_path,
    'custom_table_invitation',
    v_inv.id,
    'tableshare:' || v_inv.token);

  v_email := communication.channel_readiness_say('email');

  -- 🚨 THE SENTENCE THE SHARER READS. Three states, and the link is offered in ALL
  -- THREE — a plumber texting a customer a link is the ordinary case, not the fallback.
  return jsonb_build_object(
    'accept_path',  v_path,
    'queued',       v_answer -> 'queued',
    'skipped',      v_answer -> 'skipped',
    'email_answer', v_email ->> 'answer',
    'say', case
      when (v_email ->> 'answer') = 'no' then
        'Email is not set up on this server, so nothing was sent — copy the link and send it to them yourself.'
      when (v_email ->> 'answer') = 'unknown' then
        'We cannot tell whether email works on this server, so do not count on it arriving — copy the link and send it to them yourself.'
      when v_answer -> 'queued' ? 'email' then
        'An email with the link is on its way to them. You can also copy the link and send it yourself.'
      else
        'No email went out. Copy the link and send it to them yourself.'
    end);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. THE INVITE NOW SENDS SOMETHING.
-- ---------------------------------------------------------------------------
-- Byte-for-byte the door SHARE-OUT shipped, with ONE thing added at the end: the
-- invitation is delivered, and the answer carries the link and what actually happened to
-- it. Nothing above the delivery changed, so every sentence the seat suite asserts on is
-- the same sentence.
create or replace function custom.table_share_outside_invite(
  p_organization_id uuid, p_table_id uuid, p_email text,
  p_level public.permission_level default 'viewer'::public.permission_level)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mail  text := lower(btrim(coalesce(p_email, '')));
  v_row   custom.record;
  v_user  uuid;
  v_id    uuid;
  v_name  text;
  v_mylvl public.permission_level;
  v_org   text;
  v_sent  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_invite');
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
            'custom.table_share_outside_invite', 'admin'::public.permission_level, 'table');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if not found then
    raise exception 'There is no such table in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_name := coalesce(nullif(v_row.data ->> 'name', ''), 'this table');
  select o.name into v_org from iam.organizations o where o.id = p_organization_id;

  if position('@' in v_mail) < 2 then
    raise exception 'An invitation needs an email address to send the link to.'
      using errcode = '22004';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;

  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false) then
    raise exception 'Sharing with people outside % is turned off here, so % cannot be invited to %.',
      coalesce(v_org, 'this organization'), v_mail, v_name
      using errcode = '42501',
            hint = 'An owner or an administrator of this organization turns it on once, for everybody, in the organization''s settings (custom/external_principal_enabled). Until then, share this table with a colleague inside the organization instead.';
  end if;

  if not custom.may_invite_outside(p_organization_id, p_table_id) then
    raise exception 'You cannot invite people from outside % to %.',
      coalesce(v_org, 'this organization'), v_name
      using errcode = '42501',
            hint = 'Who may do that is this organization''s own setting (custom/outside_invite_who). By default it is an owner or an administrator of the organization, or whoever holds Admin on the table itself.';
  end if;

  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');
  if v_mylvl is null or p_level > v_mylvl then
    raise exception 'You hold % on %, so you cannot give somebody %.',
      coalesce(v_mylvl::text, 'nothing'), v_name, p_level::text
      using errcode = '42501',
            hint = 'Levels go viewer < commenter < editor < admin, and a share never confers more than the person sharing holds.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_mail order by u.created_at limit 1;
  if v_user is not null and exists (select 1 from iam.organization_member m
                                     where m.organization_id = p_organization_id and m.user_id = v_user) then
    raise exception '% is already in %, so share the table with them directly instead of inviting them from outside.',
      v_mail, coalesce(v_org, 'this organization')
      using errcode = '23505',
            hint = 'Use the Share dialog''s ordinary person lane — custom.share_grant — which gives them access immediately.';
  end if;

  update iam.invitations
     set role        = p_level::text,
         metadata    = coalesce(metadata, '{}'::jsonb)
                       || jsonb_build_object('level', p_level::text,
                                             'subject', 'custom_table',
                                             'table_name', v_name),
         expires_at  = now() + interval '14 days',
         token       = gen_random_uuid()::text,
         status      = 'pending',
         accepted_at = null,
         invited_user_id = v_user,
         updated_by  = custom.query_principal(),
         updated_at  = now()
   where target_type = 'custom_table'
     and target_id = p_table_id
     and organization_id = p_organization_id
     and lower(email) = v_mail
     and deleted_at is null
     and status <> 'accepted'
  returning id into v_id;

  if v_id is null then
    insert into iam.invitations
      (organization_id, target_type, target_id, email, invited_user_id, role, status,
       expires_at, metadata, created_by, updated_by)
    values
      (p_organization_id, 'custom_table', p_table_id, v_mail, v_user, p_level::text, 'pending',
       now() + interval '14 days',
       jsonb_build_object('level', p_level::text, 'subject', 'custom_table', 'table_name', v_name),
       custom.query_principal(), custom.query_principal())
    returning id into v_id;
  end if;

  -- 🚨 THE HALF THAT WAS MISSING. Same transaction as the invitation: a rolled-back
  -- invite can never have told anybody about access they were not given.
  v_sent := custom._table_share_invite_deliver(v_id);

  return jsonb_build_object(
    'invited', true,
    'invitation_id', v_id,
    'email', v_mail,
    'table', v_name,
    'level', p_level::text,
    'level_label', iam.level_label('table', p_level),
    'token', (select i.token from iam.invitations i where i.id = v_id),
    'accept_path', v_sent ->> 'accept_path',
    'delivery', v_sent,
    'expires_at', (select i.expires_at from iam.invitations i where i.id = v_id),
    'joined', false,
    'say', format('%s is invited to %s as a %s. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing, and they can see nothing of %s.',
                  v_mail, v_name, p_level::text,
                  coalesce(v_org, 'this organization')),
    'delivery_say', v_sent ->> 'say');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. THE RESEND USES THE SAME PATH — one class, one fix.
-- ---------------------------------------------------------------------------
create or replace function custom.table_share_outside_resend(
  p_organization_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv iam.invitations;
  v_tok text;
  v_sent jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_resend');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_resend');

  select * into v_inv from iam.invitations
   where id = p_invitation_id and organization_id = p_organization_id
     and target_type = 'custom_table' and deleted_at is null;
  if not found then
    raise exception 'There is no such invitation to a table in this organization.'
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_inv.target_id,
            'custom.table_share_outside_resend', 'admin'::public.permission_level, 'table');
  if not custom.may_invite_outside(p_organization_id, v_inv.target_id) then
    raise exception 'You cannot invite people from outside this organization to that table.'
      using errcode = '42501',
            hint = 'Who may is this organization''s own setting (custom/outside_invite_who).';
  end if;
  if v_inv.status = 'accepted' then
    raise exception '% has already joined, so there is nothing to resend.', v_inv.email
      using errcode = '23505',
            hint = 'To take their access away, revoke it — that removes the grant at once.';
  end if;

  update iam.invitations
     set token = gen_random_uuid()::text,
         expires_at = now() + interval '14 days',
         status = 'pending',
         updated_by = custom.query_principal(),
         updated_at = now()
   where id = v_inv.id
  returning token into v_tok;

  v_sent := custom._table_share_invite_deliver(v_inv.id);

  return jsonb_build_object(
    'resent', true, 'invitation_id', v_inv.id, 'email', v_inv.email, 'token', v_tok,
    'accept_path', v_sent ->> 'accept_path',
    'delivery', v_sent,
    'expires_at', (select i.expires_at from iam.invitations i where i.id = v_inv.id),
    'say', format('A fresh link is on its way to %s. The old one stops working immediately.', v_inv.email),
    'delivery_say', v_sent ->> 'say');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. THE DIALOG CAN HAND OVER THE LINK.
-- ---------------------------------------------------------------------------
-- Byte-for-byte the door lane SHARE-OUT shipped, plus `accept_path` on every row that
-- has not been accepted, and `email_delivery` at the top.
--
-- 🚨 WHY IT IS SAFE TO HAND THE CALLER THE TOKEN. Every caller who reaches this door has
-- already passed `assert_client_may_open` at VIEWER on the table, and `accept_path` is
-- drawn only for a caller `may_invite` already said yes to — the same people who may
-- press Resend, which mints a fresh token for the same person anyway. The token is not a
-- second credential: it opens exactly the grant they themselves created.
create or replace function custom.table_share_outside(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_lane   boolean;
  v_mine   boolean;
  v_rows   jsonb;
  v_who    text;
  v_role   text;
  v_mylvl  public.permission_level;
  v_levels jsonb;
  v_email  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside');
  perform custom.assert_client_may_open(p_organization_id, p_table_id,
            'custom.table_share_outside', 'viewer'::public.permission_level, 'table');

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false);
  v_mine := custom.may_invite_outside(p_organization_id, p_table_id);
  v_who  := coalesce(platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
                     'org_admins_and_table_owners');

  select m.role into v_role
    from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = custom.query_principal();

  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');

  select coalesce(jsonb_agg(jsonb_build_object('level', l.level, 'label', l.label, 'means', l.means)
                            order by l.ordinal), '[]'::jsonb)
    into v_levels
    from custom.share_levels() l
   where v_mylvl is not null and l.level <= v_mylvl;

  v_email := communication.channel_readiness_say('email');

  select coalesce(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id,
           'email',         i.email,
           'level',         coalesce(i.metadata ->> 'level', 'viewer'),
           'level_label',   iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
           'status',        i.status,
           'joined',        i.status = 'accepted',
           -- THE LINK, for the people who may hand it out and for the rows it still opens.
           'accept_path',   case when i.status <> 'accepted' and i.token is not null and v_mine
                                 then '/invitations/table/accept/' || i.token end,
           'say',           case
                              when i.status = 'accepted'
                                then format('%s can open this table as a %s.', i.email,
                                            coalesce(i.metadata ->> 'level', 'viewer'))
                              when i.expires_at is not null and i.expires_at <= now()
                                then format('%s was invited, and the invitation has run out. Resend it to give them a fresh link.', i.email)
                              else format('%s is invited and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email)
                            end,
           'expires_at',    i.expires_at,
           'invited_at',    i.created_at,
           'expired',       i.expires_at is not null and i.expires_at <= now())
           order by i.created_at desc), '[]'::jsonb)
    into v_rows
    from iam.invitations i
   where i.target_type = 'custom_table'
     and i.target_id = p_table_id
     and i.organization_id = p_organization_id
     and i.deleted_at is null
     and i.status <> 'revoked';

  return jsonb_build_object(
    'lane_open',  v_lane,
    'may_invite', v_mine,
    'may_open_lane', coalesce(v_role in ('owner', 'admin'), false),
    'my_level',   v_mylvl::text,
    'levels',     v_levels,
    'who',        v_who,
    'invitations', v_rows,
    -- 🚨 WHAT THIS SERVER CAN ACTUALLY DO, so the screen never promises an email that
    -- will not go. `answer` is yes / no / unknown — never a boolean, because
    -- "we could not look" is not "no".
    'email_delivery', v_email,
    'email_say', case
      when (v_email ->> 'answer') = 'yes' then
        'They get an email with the link. You can also copy the link and send it yourself.'
      when (v_email ->> 'answer') = 'no' then
        'Email is not set up on this server, so nothing is emailed — copy the link and send it to them yourself.'
      else
        'We cannot tell whether email works on this server, so do not count on it arriving — copy the link and send it to them yourself.'
    end,
    'say', case
             when not v_lane and coalesce(v_role in ('owner', 'admin'), false) then
               'Sharing with people outside this organization is turned off. You can turn it on — it applies to the whole organization, and after that anyone who may share a table can invite an outside person to it.'
             when not v_lane then
               'Sharing with people outside this organization is turned off here. An owner or an administrator of this organization turns it on once, for everybody, and then anyone who may share a table can invite an outside person to it.'
             when not v_mine and v_who = 'org_admins' then
               'An owner or an administrator of this organization invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             when not v_mine and v_who = 'table_admins' then
               'Whoever holds Admin on this table invites people from outside it. Ask them, or share this table with a colleague here instead.'
             when not v_mine then
               'An owner or an administrator of this organization, or whoever holds Admin on this table, invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             else
               'Invite somebody outside this organization by email. They will see this table and nothing else here, at the level you choose.'
           end);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. WHAT THE PERSON ON THE OTHER END OF THE LINK IS BEING OFFERED.
-- ---------------------------------------------------------------------------
-- The accept page used to ask a stranger to create an account before telling them what
-- for. This door answers, to anybody holding the token and to nobody else, the four
-- things a person needs before they decide: which table, whose organization, what they
-- will be able to do, and who invited them — plus which of the ways this link can be
-- dead it actually is, and who to ask about it.
--
-- 🚨 EVERYTHING IT ANSWERS, THE TOKEN ALREADY CARRIES. An UNKNOWN token gets the one
-- sentence `custom.table_share_outside_accept` gives and learns nothing, so the door
-- cannot be used to discover that anything exists. `public.inv_peek_invited_email` has
-- answered anonymously off a token since long before this lane, for the same reason.
-- The invited address is returned MASKED (j••••@example.com) unless the caller is signed
-- in as that person: enough to say "this was sent to a different address than the one
-- you are using", never enough to harvest one.
create or replace function custom.table_share_outside_peek(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv    iam.invitations;
  v_me     uuid := custom.query_principal();
  v_mail   text;
  v_lvl    public.permission_level;
  v_table  text;
  v_org    text;
  v_who    text;
  v_means  text;
  v_state  text;
  v_masked text;
  v_lane   boolean;
begin
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.target_type = 'custom_table'
   limit 1;

  if not found then
    -- The ONE sentence. A link that names nothing cannot be used to learn that
    -- something is there.
    return jsonb_build_object(
      'state', 'unknown', 'usable', false,
      'say', 'This invitation cannot be used: it has been withdrawn, already used, run out, '
          || 'or was sent to a different email address than the one you are signed in with.',
      'ask', 'Ask whoever sent it to send a fresh one, to the address you sign in with.');
  end if;

  if v_me is not null then
    select lower(u.email) into v_mail from auth.users u where u.id = v_me;
  end if;

  v_lvl := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  select coalesce(nullif(btrim(r.data ->> 'name'), ''), nullif(btrim(v_inv.metadata ->> 'table_name'), ''), 'a table')
    into v_table
    from custom.record r
   where r.organization_id = v_inv.organization_id and r.id = v_inv.target_id;
  v_table := coalesce(v_table, nullif(btrim(v_inv.metadata ->> 'table_name'), ''), 'a table');
  select coalesce(nullif(btrim(o.name), ''), 'an organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  select l.means into v_means from custom.share_levels() l where l.level = v_lvl;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.email), ''))
    into v_who from auth.users u where u.id = v_inv.created_by;

  -- j••••@example.com — enough to recognise, never enough to harvest.
  v_masked := left(v_inv.email, 1) || '••••' || substring(v_inv.email from position('@' in v_inv.email));

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false);

  -- WHICH ONE IT IS. Named, because "it did not work" with no reason is the dead end
  -- this lane exists to remove.
  v_state := case
    when v_inv.status = 'accepted'                                   then 'accepted'
    when v_inv.status = 'revoked' or v_inv.deleted_at is not null    then 'revoked'
    when v_inv.expires_at is not null and v_inv.expires_at <= now()  then 'expired'
    when not v_lane                                                  then 'lane_closed'
    when v_me is null                                                then 'sign_in_needed'
    when v_mail is distinct from lower(v_inv.email)
         and v_inv.invited_user_id is distinct from v_me             then 'wrong_account'
    else 'ready' end;

  return jsonb_build_object(
    'state',        v_state,
    'usable',       v_state in ('ready', 'sign_in_needed'),
    'table',        v_table,
    'table_id',     v_inv.target_id,
    'organization', v_org,
    'organization_id', v_inv.organization_id,
    'level',        v_lvl::text,
    'level_label',  iam.level_label('table', v_lvl),
    'means',        coalesce(v_means, 'read it'),
    'inviter',      coalesce(v_who, 'Somebody at ' || v_org),
    'invited_email', case when v_mail is not null and v_mail = lower(v_inv.email)
                          then v_inv.email else v_masked end,
    'signed_in_as', v_mail,
    'expires_at',   v_inv.expires_at,
    'offer', format('%s shared %s in %s with you. You will be able to %s it.',
                    coalesce(v_who, 'Somebody at ' || v_org), v_table, v_org,
                    coalesce(v_means, 'read')),
    'say', case v_state
      when 'ready' then
        format('Open %s and that one table is yours to see. You are not joining %s, and nothing else of theirs is open to you.', v_table, v_org)
      when 'sign_in_needed' then
        format('Sign in as %s — or make an account with that address — and %s opens.', v_masked, v_table)
      when 'wrong_account' then
        format('This invitation was sent to %s, and you are signed in as %s. Sign in with the address it was sent to, and it opens.', v_masked, coalesce(v_mail, 'somebody else'))
      when 'accepted' then
        format('%s is already open to you — this link has been used.', v_table)
      when 'revoked' then
        format('%s took this invitation back, so the link no longer opens %s.', v_org, v_table)
      when 'expired' then
        format('This invitation ran out on %s, so the link no longer opens %s.',
               to_char(v_inv.expires_at, 'FMDay DD FMMonth YYYY'), v_table)
      when 'lane_closed' then
        format('%s has turned off sharing with people outside it, so this invitation cannot be used.', v_org)
      else 'This invitation cannot be used.' end,
    'ask', case v_state
      when 'accepted' then format('Open %s from your own list of shared tables.', v_table)
      when 'wrong_account' then 'Sign out and sign in with the address it was sent to, or ask for a fresh one.'
      else format('Ask %s for a fresh one.', coalesce(v_who, 'whoever sent it')) end);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. THE DECLARATIONS, BEFORE THE GRANTS (db-rules §6d-4).
-- ---------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers, anonymous_purpose)
values
  ('custom', 'table_share_outside_peek', 'p_token text',
   array['text'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: what the person holding an invitation link is being offered, before they are asked to make an account. It takes NOTHING but the token — the caller is by definition not in the organization and could not be trusted with an id. A token that matches no custom_table invitation answers the same one sentence custom.table_share_outside_accept answers for unknown / used / expired / somebody-else''s, so the door cannot be used to learn that anything exists. Everything it returns about a MATCHED invitation is what that token already carries: the table''s name, the organization''s name, the rung, and who sent it. The invited address is masked unless the caller is signed in as exactly that person. It writes nothing and grants nothing — custom.table_share_outside_accept is still the only thing that writes a permission. Anonymous because the reader has no account yet; that is what outside means, and public.inv_peek_invited_email has answered anonymously off a token on the same reasoning since before this lane.',
   true, true,
   'The invited person. They are by definition NOT in the organization and usually have no AI Matrx account at all — that is what an outside share means — so there is no identity to require. THE TOKEN IS THE IDENTITY: a 36-character invitation token this platform minted, matched against one iam.invitations row of target_type custom_table, and nothing else selects a row. A token that matches nothing gets the same one sentence custom.table_share_outside_accept gives, so the door cannot be used to discover that anything exists, and the invited address comes back MASKED to anyone not signed in as exactly that person. It writes nothing and grants nothing: custom.table_share_outside_accept, which requires a signed-in caller whose email matches, is still the only thing that writes a permission.'),
  ('communication', 'channel_readiness_say', 'p_channel text',
   array['text'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: whether a notification channel''s adapter found its own credentials the last time this server started, so a screen never promises an email the server cannot send. p_channel is lowercased and used only as a primary-key lookup on communication.channel_readiness, a four-column operational table that holds no tenant data, no address and no message — one row per channel, overwritten at startup. It answers yes / no / unknown, the last for "nobody has checked" and for a stamp older than 36 hours, so a failed check is never printed as a fact. It writes nothing. Signed-in only: an anonymous reader has nothing to do with how this server sends mail.',
   true, false, null)
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args = excluded.identity_args,
       declared_by   = excluded.declared_by,
       reason        = excluded.reason,
       anonymous_callers = excluded.anonymous_callers,
       anonymous_purpose = excluded.anonymous_purpose;

-- THE FOUR INTERNAL LANES. No browser ever calls any of them; each is declared so that
-- "who may call this" is a FACT IN DATA rather than a sentence in a comment.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('communication', 'record_channel_readiness', 'p_channel text, p_configured boolean, p_detail text',
   array['text'::regtype::oid, 'boolean'::regtype::oid, 'text'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: the server''s own stamp of what its notification channel adapters found in their credentials at startup. It takes no entity id at all — one channel name, a boolean and a detail string, written to a four-column operational table that holds no tenant data.',
   'server_only: aidream''s startup lane (services/notifications/channel_readiness.py, run once per boot from api/app.py beside reconcile_notification_event_types) is the only caller, because it is the only thing that can see the server''s own environment. A browser cannot know whether RESEND_API_KEY is set and has no business asserting that it is — it reads the answer through communication.channel_readiness_say instead.',
   false, false),
  ('communication', 'notify_from_sql',
   'p_organization_id uuid, p_event_key text, p_recipient_user_id uuid, p_to_address text, p_recipient_label text, p_payload jsonb, p_deep_link text, p_target_kind text, p_target_id uuid, p_dedupe_key text',
   array['uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid,
         'text'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid, 'text'::regtype::oid,
         'uuid'::regtype::oid, 'text'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: the generalisation of hr._wf_notify — a SQL producer writing render_pending rows onto the ONE notification spine, inside the transaction that decided the thing being announced. It CHECKS NOTHING and must not be reachable by a caller who has not already been judged: p_organization_id, p_recipient_user_id, p_to_address and p_payload are written onto the notice exactly as given, so a caller who could choose them could mail anybody anything in any organization''s name. Every argument is NOT NULL-checked only for shape (an organization, and somebody to address), never for authority.',
   'server_only: called only from other SECURITY DEFINER functions that have ALREADY judged the caller and the act — today custom._table_share_invite_deliver, which runs after custom.table_share_outside_invite has proved the caller holds Admin on the table, that the organization''s outside lane is open, and that this caller may use it. No client role holds EXECUTE and none ever may; a new caller is another judged door, never a grant.',
   false, false),
  ('custom', '_table_share_invite_payload', 'p_invitation_id uuid',
   array['uuid'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: the merge fields one table-share invitation notice renders against. p_invitation_id is read with NO access check at all — it returns the table''s name, the organization''s name, the inviter''s name and the invited address for ANY invitation id handed to it.',
   'server_only: called only by custom._table_share_invite_deliver, itself called only after custom.table_share_outside_invite / _resend have judged the caller at the ADMIN rung on that exact table. It is unchecked precisely because its caller is checked; a client grant would turn it into a reader of every invitation on the platform.',
   false, false),
  ('custom', '_table_share_invite_deliver', 'p_invitation_id uuid',
   array['uuid'::regtype::oid], 'INVITE-DELIVERY',
   'INVITE-DELIVERY: the ONE send path for a table-share invitation, so the invite and the resend can never disagree about what goes out. p_invitation_id is used unchecked to build and enqueue a notice addressed to that invitation''s own email — it judges nobody.',
   'server_only: called only by custom.table_share_outside_invite and custom.table_share_outside_resend, in the same transaction, after both have run assert_client_may_change at ADMIN on the table and custom.may_invite_outside. A client grant would let any signed-in person make this platform email any address any invitation names, as often as they liked.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args   = excluded.identity_args,
       declared_by     = excluded.declared_by,
       reason          = excluded.reason,
       non_client_lane = excluded.non_client_lane;

grant execute on function custom.table_share_outside_peek(text) to authenticated, anon;
grant execute on function communication.channel_readiness_say(text) to authenticated;

