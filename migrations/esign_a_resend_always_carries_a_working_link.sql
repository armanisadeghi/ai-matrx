-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) 595592f2c5897209ac04846d7a297c3184329f8ad2c8b85a9ee17d2161c0203e
--
-- A RESEND ALWAYS CARRIES A WORKING LINK; AN ACCOUNT SIGNER'S NOTICE OPENS THEIR SIGNING DOOR.
--
-- 1. `esign_resend_signer` re-mints an outsider's link only when the address changes; resending to
--    the same address reused the token and emailed NO link (the secret exists only at mint), so the
--    signature-request email failed to render. `esign.retire_signer_link` retires the signer's open
--    link so the resend mints a fresh one — the sender pressed "Send again" to give the signer a
--    working link. aidream's /esign/envelopes resend calls it for outsiders, after checking the
--    caller may manage the envelope. SECURITY INVOKER (server-only by reach).
-- 2. `esign._notify` link order: a signature request or reminder to an account signer links to
--    their signing door (/sign/e/<id>) even when they also sent the envelope; any other notice to
--    the sender links to the envelope page (/esign/<id>).

create or replace function esign.retire_signer_link(p_signer_id uuid)
returns boolean
language plpgsql
set search_path to ''
as $fn$
declare v_token uuid;
begin
  select s.actor_token_id into v_token
    from esign.envelope_signer s where s.id = p_signer_id and s.actor_type = 'external';
  if v_token is null then
    return false;
  end if;
  perform platform.revoke_outsider_token(v_token, 'superseded by a resend');
  perform esign._arm();
  update esign.envelope_signer set actor_token_id = null where id = p_signer_id;
  perform esign._disarm();
  return true;
end $fn$;

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
