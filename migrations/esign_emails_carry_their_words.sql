-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) e7ae88c5b97e78bd3cf05c763fa20fb6da740edc8ba3bf65c2c3c67f29ef7b16
--
-- E-SIGNATURE EMAILS CARRY THEIR WORDS.
--
-- 🚨 THE DEFECT (found 2026-10-02 by a clone probe; the constraint is live on production).
-- Every caller of `esign._notify` — `_notify_actionable`, `_notify_actionable_capped`,
-- `_maybe_complete`, `_act_decline`, `esign_expire_sweep`, `esign_resend_signer`,
-- `esign_void_envelope` — passes `p_body => NULL` with `p_channel => 'email'`. `_notify` wrote that
-- row at the default status `pending`, and `communication.notification_outbound_body_ck` refuses a
-- `pending`/`in_progress` email or sms row with a blank body. The CheckViolation aborted the CALLER,
-- so sending an envelope, reminding, declining, voiding, expiring and completing all failed —
-- for an internal signer and an outsider alike.
--
-- THE CLASS FIX: the one render lane. A SQL producer records FACTS in its own transaction and
-- `aidream/services/notifications/render_pass.py` writes the WORDS (the same path as
-- `communication.notify_from_sql` and this function's own paired DM leg). So:
--   1. `esign._notify` writes an email/sms row with no body at `render_pending` (never `pending`),
--      and every row's payload carries `envelope.title`. A caller that composes a body still sends
--      it as written.
--   2. Each esign.* event gets its `email` template in the registry
--      (`notification_event_type.config.templates.email`), editable per organization through the
--      override rung like every other event. An admin's existing email template is never
--      overwritten. `esign.verification_code` gets none: its body is the code, composed by its
--      sender. An event with no template is a named `no_template` skip in the render pass, never a
--      silent empty send.
-- The templates use only facts every row carries (`envelope.title`, `employer.name`, the deep
-- link) because the renderer refuses a blank value. A signature request whose link could not be
-- re-minted (a resend that reuses an open token) therefore records `render_failed` by name instead
-- of emailing a signer something they cannot act on.
--
-- ORDER WITH THE PAIRING FILE (2026-10-03): this file was first written on top of
-- `dm_soft_expiry_and_dm_pairs_with_email.sql`'s body, but that file still awaits its production
-- apply and this defect stopped every envelope from being sent. So this file now replaces the
-- PRODUCTION body, and the pairing file's own `esign._notify` (which adds the paired DM leg) carries
-- this change and declares this file's resulting body as its based-on.

CREATE OR REPLACE FUNCTION esign._notify(p_envelope_id uuid, p_event_key text, p_signer_id uuid DEFAULT NULL::uuid, p_to_user uuid DEFAULT NULL::uuid, p_to_address text DEFAULT NULL::text, p_actor_token_id uuid DEFAULT NULL::uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_deep_link text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb, p_channel text DEFAULT 'email'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_org uuid; v_id uuid; v_kind text; v_addr text; v_refusal text; v_occasion text; v_key text;
        v_title text; v_payload jsonb; v_status text;
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
                          'envelope', jsonb_build_object('title', v_title));
  v_status := case when p_channel in ('email', 'sms')
                    and nullif(btrim(coalesce(p_body, '')), '') is null
                   then 'render_pending' else 'pending' end;
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
     to_address, status, subject, body, payload, target_kind, target_id, deep_link, dedupe_key)
  values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id,
          v_addr, v_status, p_subject, p_body, v_payload,
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

update communication.notification_event_type t
   set config = jsonb_set(
         coalesce(t.config, '{}'::jsonb),
         '{templates}',
         coalesce(t.config -> 'templates', '{}'::jsonb)
           || jsonb_build_object('email', jsonb_build_object('subject', w.subject, 'body', w.body)),
         true)
  from (values
    ('esign.signature_requested',
     'Please sign: {{envelope.title}}',
     E'{{employer.name}} sent you {{envelope.title}} to sign.\n\nReview and sign it here: {{link.deep}}\n\n--\nSent through AI Matrx on behalf of {{employer.name}}.'),
    ('esign.signature_reminder',
     'Reminder: {{envelope.title}} is waiting for your signature',
     E'{{envelope.title}}, sent by {{employer.name}}, is still waiting for your signature.\n\nOpen the signing link in the original request to review and sign it.\n\n--\nSent through AI Matrx on behalf of {{employer.name}}.'),
    ('esign.completed',
     'Signed by everyone: {{envelope.title}}',
     E'Everyone has signed {{envelope.title}}. The signed copy and its certificate are saved with the request.\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}'),
    ('esign.declined',
     'Signature declined: {{envelope.title}}',
     E'A signer declined {{envelope.title}}, so the request is closed and its signing links no longer work.\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}'),
    ('esign.expired',
     'Signature request expired: {{envelope.title}}',
     E'{{envelope.title}} expired before everyone signed, so its signing links no longer work. Send a new request if you still need it signed.\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}'),
    ('esign.voided',
     'Signature request voided: {{envelope.title}}',
     E'{{envelope.title}} was voided, and its signing links no longer work.\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}'),
    ('esign.delivery_failed',
     'Could not reach a signer: {{envelope.title}}',
     E'{{envelope.title}} could not reach one of its signers. Check the signer''s email address and send it again.\n\n--\nAI Matrx sent this because you sent this document for signature. Manage notifications: {{link.preferences}}')
  ) as w(event_key, subject, body)
 where t.event_key = w.event_key
   and t.deleted_at is null
   and nullif(btrim(coalesce(t.config -> 'templates' -> 'email' ->> 'body', '')), '') is null;
