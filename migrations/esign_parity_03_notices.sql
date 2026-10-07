-- chair-step: esign._notify gains two trailing defaulted parameters (decision J); the 11-argument overload is dropped and the 13-argument one accepts every old positional call unchanged.
-- based-on: esign._notify_actionable(uuid, text) ecb094853e572a4bd870d45d049a67353e8a208db614351f102d754ab5ae6ff2
-- based-on: communication.stamp_notification_render(uuid, text, text, text) 261dffa9cac2e5011132b6dd1ddeba2b21459a654338d8414a8e2f2a0f6c79ed
-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) 9027698bc955c3f0149347183bd456bbff1f1860893288436e86d1f77ad1decc
-- E-signature parity, wave A, step 3 — every notice (CONTRACT.md v2 §8.2, §9; decisions E, J; A-F10,
-- A-F11, A-R6). Words live only in the registry; SQL writes facts. Reminders and expiry warnings are
-- FUTURE-DATED notification rows timed from when each signer was told — no new schedule.


-- ── registry: changed templates ──────────────────────────────────────────────
update communication.notification_event_type set config = jsonb_set(config, '{templates}', '{"email": {"subject": "{{sender.name}}: {{request.subject}}", "body": "{{sender.name}} ({{employer.name}}) sent you \"{{envelope.title}}\" to sign.\n\n{{request.note}}\n\nReview and sign it here: {{link.deep}}\n\nPlease sign by {{envelope.expires_on}}.\n\nQuestions? Reply to this email to reach {{sender.name}}.\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.", "cta": {"label": "Review and sign"}}, "dm": {"body": "{{envelope.title}} is ready for your signature."}}'::jsonb) where event_key = 'esign.signature_requested';
update communication.notification_event_type set config = jsonb_set(config, '{templates}', '{"email": {"subject": "Reminder from {{sender.name}}: {{request.subject}}", "body": "\"{{envelope.title}}\", sent by {{sender.name}} ({{employer.name}}), is still waiting for your signature.\n\nReview and sign it here: {{link.deep}}\n\nPlease sign by {{envelope.expires_on}}.\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.", "cta": {"label": "Review and sign"}}, "dm": {"body": "Reminder: {{envelope.title}} is still waiting for your signature."}}'::jsonb) where event_key = 'esign.signature_reminder';
update communication.notification_event_type set config = jsonb_set(config, '{templates}', '{"email": {"subject": "{{signer.name}} declined {{envelope.title}}", "body": "{{signer.name}} declined \"{{envelope.title}}\", so the request is closed and its signing links no longer work.\n\nTheir reason: {{decline.reason}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}", "cta": {"label": "Open"}}, "dm": {"body": "{{signer.name}} declined {{envelope.title}}."}}'::jsonb) where event_key = 'esign.declined';
update communication.notification_event_type set config = jsonb_set(config, '{templates,email,cta}', '{"label": "Open"}'::jsonb) where event_key = 'esign.completed' and config #> '{templates,email}' is not null;
update communication.notification_event_type set config = jsonb_set(config, '{templates,email,cta}', '{"label": "Open"}'::jsonb) where event_key = 'esign.voided' and config #> '{templates,email}' is not null;
update communication.notification_event_type set config = jsonb_set(config, '{templates,email,cta}', '{"label": "Open"}'::jsonb) where event_key = 'esign.expired' and config #> '{templates,email}' is not null;
update communication.notification_event_type set config = jsonb_set(config, '{templates,email,cta}', '{"label": "Open"}'::jsonb) where event_key = 'esign.delivery_failed' and config #> '{templates,email}' is not null;
update communication.notification_event_type set config = config || '{"audience_widened": "every signer and every cc recipient (D14.3)"}'::jsonb where event_key = 'esign.signed_copy';

-- ── registry: new events (copied from esign.completed's row for the owning organization and shape)
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.review_requested', 'Review requested', 'E-signature: review requested.', '{"email": true, "in_app": true}'::jsonb, '{"bucket": "needs_you", "templates": {"email": {"subject": "{{sender.name}}: {{request.subject}}", "body": "{{sender.name}} ({{employer.name}}) sent you \"{{envelope.title}}\" to review.\n\n{{request.note}}\n\nReview it here: {{link.deep}}\n\nQuestions? Reply to this email to reach {{sender.name}}.\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.", "cta": {"label": "Review document"}}, "dm": {"body": "{{envelope.title}} is ready for your review."}}, "pair_dm_with_email": true}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.review_requested');
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.expiry_warning', 'Signature request expiring', 'E-signature: signature request expiring.', '{"email": true, "in_app": true}'::jsonb, '{"bucket": "needs_you", "templates": {"email": {"subject": "Expires {{envelope.expires_on}}: {{request.subject}}", "body": "{{sender.name}}''s request \"{{envelope.title}}\" expires on {{envelope.expires_on}}.\n\nReview and sign it here: {{link.deep}}\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.", "cta": {"label": "Review and sign"}}, "dm": {"body": "{{envelope.title}} expires on {{envelope.expires_on}}."}}, "pair_dm_with_email": true}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.expiry_warning');
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.signature_handoff', 'Sign on your phone', 'E-signature: sign on your phone.', '{"sms": true}'::jsonb, '{"bucket": "direct", "templates": {"sms": {"body": "AI Matrx: open this link on your phone to draw your signature for {{employer.short_name}}: {{link.deep}} It works for {{handoff.minutes}} minutes."}}, "pair_dm_with_email": false, "quiet_hours_exempt": true, "non_user_capable": true, "pair_dm_with_email_reason": "An SMS link the signer asked for on their own phone; no account, no thread."}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.signature_handoff');
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.signer_signed', 'A signer signed', 'E-signature: a signer signed.', '{"email": true, "in_app": true}'::jsonb, '{"bucket": "updates", "templates": {"email": {"subject": "{{signer.name}} signed {{envelope.title}}", "body": "{{signer.name}} signed \"{{envelope.title}}\". {{progress.signed}} of {{progress.total}} have signed.\n\nTheir note: {{signer.note}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}", "cta": {"label": "Open"}}, "dm": {"body": "{{signer.name}} signed {{envelope.title}}."}}, "pair_dm_with_email": true}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.signer_signed');
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.delegated', 'A signer assigned someone else', 'E-signature: a signer assigned someone else.', '{"email": true, "in_app": true}'::jsonb, '{"bucket": "direct", "templates": {"email": {"subject": "{{signer.name}} assigned {{envelope.title}} to {{delegate.name}}", "body": "{{signer.name}} assigned \"{{envelope.title}}\" to {{delegate.name}} ({{delegate.email}}).\n\nTheir note: {{signer.note}}\n\nOpen it: {{link.deep}}\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}", "cta": {"label": "Open"}}, "dm": {"body": "{{signer.name}} assigned {{envelope.title}} to {{delegate.name}}."}}, "pair_dm_with_email": true}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.delegated');
insert into communication.notification_event_type (event_key, label, description, default_channels, config, enabled, organization_id)
select 'esign.voided_for_signer', 'Signature request cancelled', 'E-signature: signature request cancelled.', '{"email": true, "in_app": true}'::jsonb, '{"bucket": "direct", "templates": {"email": {"subject": "{{sender.name}} cancelled: {{request.subject}}", "body": "{{sender.name}} cancelled \"{{envelope.title}}\", so its link no longer works.\n\nReason: {{void.reason}}\n\n--\nSent through AI Matrx on behalf of {{sender.name}}."}, "dm": {"body": "{{envelope.title}} was cancelled by {{sender.name}}."}}, "pair_dm_with_email": true}'::jsonb, true, organization_id
  from communication.notification_event_type where event_key = 'esign.completed'
   and not exists (select 1 from communication.notification_event_type x where x.event_key = 'esign.voided_for_signer');

-- ── the facts (§8.2) ─────────────────────────────────────────────────────────
create or replace function esign._format_date(p_date date, p_format text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case coalesce(p_format, 'MM/DD/YYYY')
    when 'MM/DD/YY'    then to_char(p_date, 'MM/DD/YY')
    when 'DD/MM/YYYY'  then to_char(p_date, 'DD/MM/YYYY')
    when 'DD/MM/YY'    then to_char(p_date, 'DD/MM/YY')
    when 'YYYY-MM-DD'  then to_char(p_date, 'YYYY-MM-DD')
    when 'MMM D, YYYY' then to_char(p_date, 'Mon FMDD, YYYY')
    when 'D MMM YYYY'  then to_char(p_date, 'FMDD Mon YYYY')
    else to_char(p_date, 'MM/DD/YYYY') end
$$;

create or replace function esign._notice_facts(p_envelope_id uuid, p_signer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = esign, public as $$
declare e esign.envelope%rowtype; s esign.envelope_signer%rowtype; d esign.envelope_signer%rowtype;
        v_title text; v_docs text; v_note text;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if p_signer_id is not null then select * into s from esign.envelope_signer where id = p_signer_id; end if;
  if s.delegated_to_signer_id is not null then select * into d from esign.envelope_signer where id = s.delegated_to_signer_id; end if;
  v_title := coalesce(nullif(btrim(e.title), ''), 'Your document');
  select string_agg(x.name || coalesce(' (' || x.page_count || case when x.page_count = 1 then ' page)' else ' pages)' end, ''), ', ' order by x.position)
    into v_docs from esign.envelope_document x where x.envelope_id = p_envelope_id;
  v_note := nullif(concat_ws(E'\n\n', nullif(btrim(coalesce(e.message, '')), ''),
                                       nullif(btrim(coalesce(s.private_message, '')), '')), '');
  -- A delegate's request carries the delegator's note (§8.2).
  if s.delegated_from_signer_id is not null then
    v_note := coalesce((select nullif(btrim(f.delegation_reason), '') from esign.envelope_signer f
                         where f.id = s.delegated_from_signer_id), v_note);
  end if;
  return jsonb_build_object(
    'request', jsonb_build_object(
      'subject', coalesce(nullif(btrim(e.email_subject), ''), 'Please sign: ' || v_title),
      'note', coalesce(v_note, 'Documents: ' || coalesce(v_docs, v_title))),
    'envelope', jsonb_build_object('title', v_title,
                                   'expires_on', to_char(e.expires_at, 'Mon FMDD, YYYY')),
    'recipient', jsonb_build_object('first_name', coalesce(nullif(split_part(btrim(coalesce(s.full_name, '')), ' ', 1), ''), 'there')),
    'progress', jsonb_build_object(
      'signed', (select count(*) from esign.envelope_signer x where x.envelope_id = p_envelope_id and x.status in ('signed','acknowledged')),
      'total',  (select count(*) from esign.envelope_signer x where x.envelope_id = p_envelope_id
                   and x.role <> 'cc_recipient' and x.status <> 'delegated')),
    'signer', jsonb_build_object('name', coalesce(nullif(btrim(s.full_name), ''), 'A signer'),
                                 'note', coalesce(nullif(btrim(s.message_to_sender), ''),
                                                  nullif(btrim(s.delegation_reason), ''), '—')),
    'decline', jsonb_build_object('reason', coalesce(nullif(btrim(s.decline_reason), ''), '—')),
    'delegate', jsonb_build_object('name', coalesce(d.full_name, '—'), 'email', coalesce(d.email, '—')),
    'void', jsonb_build_object('reason', coalesce(nullif(btrim(e.void_reason), ''), '—')),
    'handoff', jsonb_build_object('minutes', coalesce(
        (esign.config_resolve(e.organization_id, 'esign.signature.handoff_ttl_minutes'))::text, '10')));
end $$;

drop function if exists esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION esign._notify(p_envelope_id uuid, p_event_key text, p_signer_id uuid DEFAULT NULL::uuid, p_to_user uuid DEFAULT NULL::uuid, p_to_address text DEFAULT NULL::text, p_actor_token_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_deep_link text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'email'::text, p_deliver_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_schedule_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_org uuid; v_id uuid; v_kind text; v_addr text; v_refusal text; v_occasion text; v_key text;
        v_paired text[]; v_title text; v_payload jsonb; v_status text;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    perform platform.refuse_not_found(format('esign._notify: envelope %s does not exist', p_envelope_id));
  end if;
  -- 🚨 THE WORDS COME FROM THE REGISTRY, RENDERED BY THE ONE RENDER LANE (2026-10-02).
  -- Every caller passes p_body => NULL, and this function used to write that NULL onto an
  -- email row at `pending` — which `notification_outbound_body_ck` refuses, so the
  -- CheckViolation aborted the CALLER: no signature request, reminder, decline, void,
  -- expiry or completion could be sent at all. An email/sms row with no body now waits at
  -- `render_pending` carrying its facts (`envelope.title`); the render pass words it from
  -- the event's `templates.<channel>` and only then moves it to `pending`. A caller that
  -- does compose a body still sends it as-is.
  select coalesce(nullif(btrim(e.title), ''), 'Your document') into v_title
    from esign.envelope e where e.id = p_envelope_id;
  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id,
                          'envelope', jsonb_build_object('title', v_title))
    -- THE PERSON WHO SENT IT (2026-10-04). A signer is asked by a person, not by "AI Matrx":
    -- `{{sender.name}}` words the email, and the email channel shows "<name> via AI Matrx" as the
    -- From name and makes the sender the Reply-To (SPEC-NOTIFICATIONS: payload.sender).
    -- An envelope no person sent (a workflow, an automation) is sent by its organization: the
    -- templates require `sender.name`, so it is never absent (2026-10-04 review).
    || jsonb_build_object('sender', coalesce(esign.envelope_sender(p_envelope_id),
                                             jsonb_build_object('name', 'AI Matrx')));
  -- E-SIGN PARITY §8.2 (2026-10-07): the facts every template words from. A caller's flat
  -- `signer` string (v1 callers) gives way to the fact object; the caller's own keys still win.
  if jsonb_typeof(p_payload -> 'signer') = 'string' then p_payload := p_payload - 'signer'; v_payload := v_payload - 'signer'; end if;
  v_payload := esign._notice_facts(p_envelope_id, p_signer_id) || v_payload;
  v_payload := v_payload || jsonb_build_object('envelope', (esign._notice_facts(p_envelope_id, p_signer_id) -> 'envelope'))
                         || case when p_schedule_id is not null
                                 then jsonb_build_object('schedule_id', p_schedule_id) else '{}'::jsonb end;
  v_status := case when p_channel in ('email', 'sms')
                    and nullif(btrim(coalesce(p_body, '')), '') is null
                   then 'render_pending' else 'pending' end;
  -- THE SENDER'S NOTICE OPENS THE ENVELOPE (2026-10-03). Completed / declined / voided / expired /
  -- could-not-reach notices go to the envelope's sender with no link of their own; theirs is the
  -- envelope page (/esign/<id>), where they see who signed and act on it.
  if p_deep_link is null and p_to_user is not null then
    if p_event_key in ('esign.signature_requested', 'esign.signature_reminder') then
      -- An account signer always signs at their own door, even when they also sent it.
      p_deep_link := '/sign/e/' || p_envelope_id::text;
    elsif p_to_user = (select e.created_by from esign.envelope e where e.id = p_envelope_id) then
      p_deep_link := '/esign/' || p_envelope_id::text;
    end if;
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
  -- A SCHEDULED notice's occasion carries a fresh schedule id per scheduling (A-F10), so a
  -- rescheduled reminder never collides with the cancelled one it replaces.
  v_occasion := case when p_schedule_id is not null
                     then 'sched:' || p_schedule_id::text || ':' || coalesce(p_payload ->> 'schedule_n', '0')
                     else case p_event_key
    when 'esign.signature_requested' then
      'send' || coalesce((select s.notify_attempts from esign.envelope_signer s where s.id = p_signer_id), 0)
    when 'esign.signature_reminder' then
      'reminder' || coalesce((select s.reminder_count from esign.envelope_signer s where s.id = p_signer_id), 0)
    when 'esign.declined'  then 'once'
    when 'esign.completed' then 'once'
    when 'esign.expired'   then 'once'
    when 'esign.voided'    then 'once'
    when 'esign.voided_for_signer' then 'once'
    when 'esign.signer_signed' then 'once'
    when 'esign.review_requested' then
      'send' || coalesce((select s.notify_attempts from esign.envelope_signer s where s.id = p_signer_id), 0)
  end end;
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
      insert into communication.notification
        (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
         status, subject, payload, target_kind, target_id, deep_link, next_attempt_at, metadata, dedupe_key)
      values (v_org, p_event_key, 'dm', 'user', p_to_user, p_to_user::text,
              'render_pending', p_subject, v_payload,
              'esign_envelope', p_envelope_id, p_deep_link, coalesce(p_deliver_at, now()),
              case when p_schedule_id is not null
                   then jsonb_build_object('esign_scheduled', true, 'schedule_id', p_schedule_id)
                   else '{}'::jsonb end,
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
              v_payload,
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
              v_payload,
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
  -- 🚨 A NOTICE TO AN ACCOUNT RESOLVES THE ACCOUNT'S ADDRESS (2026-10-03). The sender's notices
  -- (completed / declined / voided / expired) name the sender's account and no address, and were
  -- written with to_address NULL — every one failed at dispatch with missing_recipient_address.
  if v_addr is null and v_kind = 'user' and p_channel in ('email', 'sms') then
    select r.address into v_addr
      from communication.resolve_channel_address(p_channel, v_org, 'user', p_to_user, null, null, null) r
     limit 1;
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
            v_payload,
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
     to_address, status, subject, body, payload, target_kind, target_id, deep_link,
     next_attempt_at, metadata, dedupe_key)
  values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id,
          v_addr, v_status, p_subject, p_body, v_payload,
          'esign_envelope', p_envelope_id, p_deep_link,
          -- §9: a reminder or expiry warning is a FUTURE row; the dispatcher claims it only when
          -- next_attempt_at <= now(), and the render pass keeps the time (stamp_notification_render).
          coalesce(p_deliver_at, now()),
          case when p_schedule_id is not null
               then jsonb_build_object('esign_scheduled', true, 'schedule_id', p_schedule_id)
               else '{}'::jsonb end,
          v_key)
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


-- ── scheduling (§9) ──────────────────────────────────────────────────────────
create or replace function esign._cancel_scheduled_notices(p_envelope_id uuid, p_signer_id uuid default null)
returns integer language plpgsql security definer set search_path = esign, public as $$
declare v_n int;
begin
  update communication.notification n
     set status = 'cancelled', error_code = 'superseded', updated_at = now()
   where n.target_kind = 'esign_envelope' and n.target_id = p_envelope_id
     and n.status in ('pending', 'render_pending')
     and coalesce((n.metadata ->> 'esign_scheduled')::boolean, false)
     and (p_signer_id is null or n.payload ->> 'signer_id' = p_signer_id::text);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- A deliver_at inside the quiet hours (in the signer's zone, else the sender's, else UTC) moves to
-- the end of the quiet hours there (§9).
create or replace function esign._outside_quiet_hours(p_at timestamptz, p_zone text, p_quiet jsonb)
returns timestamptz language plpgsql stable set search_path = pg_catalog as $$
declare v_zone text := coalesce(nullif(p_zone, ''), 'UTC'); v_local timestamp; v_from time; v_to time;
begin
  begin
    v_local := p_at at time zone v_zone;
  exception when others then
    v_zone := 'UTC'; v_local := p_at at time zone v_zone;
  end;
  v_from := coalesce((p_quiet ->> 'from')::time, '21:00');
  v_to   := coalesce((p_quiet ->> 'to')::time, '08:00');
  if v_from > v_to then
    if v_local::time >= v_from then
      return ((v_local::date + 1) + v_to) at time zone v_zone;
    elsif v_local::time < v_to then
      return (v_local::date + v_to) at time zone v_zone;
    end if;
  elsif v_local::time >= v_from and v_local::time < v_to then
    return (v_local::date + v_to) at time zone v_zone;
  end if;
  return p_at;
end $$;

create or replace function esign._schedule_signer_notices(p_signer_id uuid, p_deep_link text)
returns integer language plpgsql security definer set search_path = esign, public as $$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_link text; v_sched uuid;
        v_base timestamptz; v_at timestamptz; v_day jsonb; v_i int := 0; v_n int := 0; v_max int;
        v_warn int; v_offset interval := interval '0'; v_zone text; v_internal boolean;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then return 0; end if;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent', 'in_progress') or s.role not in ('signer', 'approver')
     or s.status in ('signed', 'declined', 'delegated', 'expired', 'acknowledged') then
    return 0;
  end if;
  v_internal := s.actor_type = 'internal_user';
  v_link := case when v_internal then '/sign/e/' || e.id::text else p_deep_link end;
  if v_link is null then return 0; end if;   -- no link to carry: the existing schedule stays

  perform esign._cancel_scheduled_notices(e.id, s.id);
  v_sched := gen_random_uuid();
  v_base := coalesce(s.last_notified_at, now());
  v_max := coalesce((e.config_snapshot ->> 'reminder_max_count')::int, 3);
  v_warn := coalesce((e.config_snapshot ->> 'expiry_warning_days')::int,
                     (esign.config_resolve(e.organization_id, 'esign.reminder.expiry_warning_days'))::text::int);
  v_zone := coalesce(s.metadata ->> 'time_zone', e.config_snapshot ->> 'sender_time_zone', 'UTC');
  -- Campaigns (A-N4): spread each signer 0–60 minutes so thousands of reminders never land in one sweep.
  if e.source_type is distinct from 'files.file' and exists (select 1 from esign.campaign_member m where m.envelope_id = e.id) then
    v_offset := make_interval(mins => abs(hashtext(s.id::text)) % 61);
  end if;

  for v_day in select * from jsonb_array_elements(case when jsonb_typeof(e.config_snapshot -> 'reminder_cadence_days') = 'array'
                                                       then e.config_snapshot -> 'reminder_cadence_days' else '[]'::jsonb end) loop
    v_i := v_i + 1;
    exit when v_i > v_max;
    v_at := esign._outside_quiet_hours(v_base + make_interval(days => (v_day #>> '{}')::int) + v_offset,
                                       v_zone, e.config_snapshot -> 'reminder_quiet_hours');
    if v_at > now() and v_at < e.expires_at then
      perform esign._notify(e.id, 'esign.signature_reminder', s.id,
                            p_to_user => case when v_internal then s.signer_user_id end,
                            p_to_address => s.email,
                            p_actor_token_id => case when v_internal then null else s.actor_token_id end,
                            p_subject => coalesce(e.title, 'Signature reminder'),
                            p_deep_link => v_link,
                            p_payload => jsonb_build_object('schedule_n', v_i),
                            p_channel => 'email', p_deliver_at => v_at, p_schedule_id => v_sched);
      v_n := v_n + 1;
    end if;
  end loop;

  if coalesce(v_warn, 0) > 0 then
    v_at := esign._outside_quiet_hours(e.expires_at - make_interval(days => v_warn) + v_offset,
                                       v_zone, e.config_snapshot -> 'reminder_quiet_hours');
    if v_at > now() and v_at < e.expires_at then
      perform esign._notify(e.id, 'esign.expiry_warning', s.id,
                            p_to_user => case when v_internal then s.signer_user_id end,
                            p_to_address => s.email,
                            p_actor_token_id => case when v_internal then null else s.actor_token_id end,
                            p_subject => coalesce(e.title, 'Signature request expiring'),
                            p_deep_link => v_link,
                            p_payload => jsonb_build_object('schedule_n', 99),
                            p_channel => 'email', p_deliver_at => v_at, p_schedule_id => v_sched);
      v_n := v_n + 1;
    end if;
  end if;
  return v_n;
end $$;

CREATE OR REPLACE FUNCTION esign._notify_actionable(p_envelope_id uuid, p_event_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s record; e esign.envelope%rowtype; v_n int := 0; v_tok jsonb; v_link text; v_key text;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  for s in select * from esign.envelope_signer
            where envelope_id = p_envelope_id and status in ('pending','notified','opened','viewed','consented','delivery_failed')
            order by position loop
    if (esign._can_act(s.id) ->> 'can_act')::boolean then
      -- §8: a viewer is asked to review, never to sign.
      v_key := case when s.role = 'viewer' and p_event_key = 'esign.signature_requested'
                    then 'esign.review_requested' else p_event_key end;
      v_tok := null;
      if s.actor_type = 'internal_user' then
        -- §6.0 U-03: the internal signing route, outside the HR shell.
        v_link := '/sign/e/' || p_envelope_id::text;
        perform esign._notify(p_envelope_id, v_key, s.id, p_to_user => s.signer_user_id,
                              p_to_address => s.email,
                              p_subject => coalesce(e.title,'Signature requested'),
                              p_deep_link => v_link, p_channel => 'email');
      else
        if s.actor_token_id is null then
          v_tok := public.esign_mint_signer_token(s.id, null);
          if not coalesce((v_tok ->> 'granted')::boolean, false) then
            update esign.envelope_signer
               set status = 'delivery_failed', delivery_error = v_tok ->> 'reason'
             where id = s.id;
            perform esign._event(p_envelope_id, 'delivery_failed', 'automation', p_signer_id => s.id,
                                 p_payload => jsonb_build_object('reason', v_tok ->> 'reason'));
            continue;
          end if;
          -- §5.4: the secret travels in the URL FRAGMENT, never the path or the query string, so it
          -- cannot land in a web-server log, a proxy log or a Referer header.
          v_link := '/x/sign#t=' || (v_tok ->> 'secret');
        else
          v_link := null;   -- a resend that reuses the existing token re-sends the original link
        end if;
        perform esign._notify(p_envelope_id, v_key, s.id, p_to_address => s.email,
                              p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid,
                                                           (select actor_token_id from esign.envelope_signer where id = s.id)),
                              p_subject => coalesce(e.title,'Signature requested'),
                              p_deep_link => v_link, p_channel => 'email');
      end if;
      update esign.envelope_signer
         set status = case when status = 'pending' then 'notified' else status end,
             last_notified_at = now(), notify_attempts = notify_attempts + 1,
             reminder_count = reminder_count + case when p_event_key = 'esign.signature_reminder' then 1 else 0 end
       where id = s.id;
      if p_event_key = 'esign.signature_reminder' then
        perform esign._event(p_envelope_id, 'reminded', 'automation', p_signer_id => s.id);
      end if;
      -- §9: whenever a signer is told, their reminders and expiry warning are (re)scheduled from
      -- THIS moment, carrying the link they now hold (no second secret). No link to carry (a
      -- resend that reused the token) keeps the schedule they already have.
      if s.role <> 'viewer' then
        perform esign._schedule_signer_notices(s.id, v_link);
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION communication.stamp_notification_render(p_id uuid, p_worker_id text, p_subject text, p_body text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_rows integer;
begin
  -- 🚨 AN EMPTY BODY NEVER LEAVES THIS LANE. The whole point of `render_pending` is that a
  -- notice reaches 'pending' only once it has words; a renderer that produced nothing is a
  -- render FAILURE and belongs in abandon_notification_render, not here.
  if p_body is null or btrim(p_body) = '' then
    raise warning 'communication.stamp_notification_render: refused an empty body for %', p_id;
    return false;
  end if;

  update communication.notification
     set subject = coalesce(nullif(btrim(p_subject), ''), subject),
         body = p_body,
         status = 'pending',
         -- A future-dated notice (an e-sign reminder, §9 / A-R6) keeps its time through the render
         -- pass; anything already due goes now, as before.
         next_attempt_at = greatest(next_attempt_at, now()),
         claimed_by = null,
         lease_expires_at = null,
         updated_at = now()
   where id = p_id
     and status = 'render_in_progress'
     and claimed_by = p_worker_id;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end
$function$;

-- Every new SECURITY DEFINER function declares who may call it (§5.8; provision_shape_guard).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; every id argument is a row the calling door already authorised.', 'esign_parity_03_notices',
       'server_only: called only inside e-sign doors and the notice scheduler; no client calls it directly', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','_notice_facts'),
  ('esign','_notify'),
  ('esign','_cancel_scheduled_notices'),
  ('esign','_schedule_signer_notices'))
   and p.prosecdef
on conflict do nothing;
