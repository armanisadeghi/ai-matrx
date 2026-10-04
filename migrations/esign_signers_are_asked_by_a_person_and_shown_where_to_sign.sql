-- based-on: esign._notify(uuid, text, uuid, uuid, text, uuid, text, text, text, jsonb, text) 9741207307fce625f9d10a9edb7858ee1f25cc7f9e7583266cc7113abc82b0e7
-- based-on: esign._notify_actionable_capped(uuid, integer) 6b20262b194890184b04318e4da0ee772ccc0d5cdcef1989cb0d3bf618cb9b76
--
-- E-SIGNATURE, THE REAL PRODUCT (2026-10-04). The owner sent a document and got: an email from
-- "AI Matrx" with no person's name, a reminder with no link, and no way to say where to sign.
-- This file gives the server half of each:
--   1. the sender's name and address ride on every esign notice (payload.sender) and the request
--      and reminder emails say who is asking;
--   2. a reminder to an outsider carries a working link (their open link is retired and a fresh
--      one minted — the secret exists only at mint, so the old link cannot be re-sent);
--   3. signature fields: where each signer signs, stored on the document before it is frozen,
--      readable by the signer;
--   4. the signed copy: what aidream needs to stamp signatures into the PDF, and where it files it.

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
                          'envelope', jsonb_build_object('title', v_title))
    -- THE PERSON WHO SENT IT (2026-10-04). A signer is asked by a person, not by "AI Matrx":
    -- `{{sender.name}}` words the email, and the email channel shows "<name> via AI Matrx" as the
    -- From name and makes the sender the Reply-To (SPEC-NOTIFICATIONS: payload.sender).
    || coalesce((select jsonb_build_object('sender', jsonb_build_object(
                   'name', coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                                    split_part(u.email, '@', 1)),
                   'email', u.email))
                   from esign.envelope e join auth.users u on u.id = e.created_by
                  where e.id = p_envelope_id), '{}'::jsonb);
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

create or replace function esign._notify_actionable_capped(p_envelope_id uuid, p_max integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'esign', 'public'
as $function$
declare s record; e esign.envelope%rowtype; v_n int := 0; v_tok jsonb; v_link text; v_token uuid;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  for s in select * from esign.envelope_signer
            where envelope_id = p_envelope_id
              and status in ('pending','notified','opened','viewed','consented','delivery_failed')
              and reminder_count < p_max
            order by position loop
    if (esign._can_act(s.id) ->> 'can_act')::boolean then
      v_link := null; v_token := s.actor_token_id;
      if s.actor_type = 'external' then
        -- 🚨 A REMINDER CARRIES A WORKING LINK (2026-10-04). An outsider's link secret exists only
        -- when it is minted, so a reminder could only say "use the link in the original email".
        -- Retire the open link and mint a fresh one: the newest email always opens the document.
        perform esign.retire_signer_link(s.id);
        perform esign._arm();   -- retire_signer_link disarms on its way out
        v_tok := public.esign_mint_signer_token(s.id, null);
        if not coalesce((v_tok ->> 'granted')::boolean, false) then
          update esign.envelope_signer
             set status = 'delivery_failed', delivery_error = v_tok ->> 'reason'
           where id = s.id;
          perform esign._event(p_envelope_id, 'delivery_failed', 'automation', p_signer_id => s.id,
                               p_payload => jsonb_build_object('reason', v_tok ->> 'reason'));
          continue;
        end if;
        v_link := '/x/sign#t=' || (v_tok ->> 'secret');
        v_token := (v_tok ->> 'actor_token_id')::uuid;
      end if;
      perform esign._notify(p_envelope_id, 'esign.signature_reminder', s.id,
                            p_to_user => s.signer_user_id, p_to_address => s.email,
                            p_actor_token_id => v_token,
                            p_subject => 'Reminder: ' || coalesce(e.title,'signature requested'),
                            p_deep_link => v_link);
      update esign.envelope_signer
         set reminder_count = reminder_count + 1, last_notified_at = now() where id = s.id;
      perform esign._event(p_envelope_id, 'reminded', 'automation', p_signer_id => s.id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('esign', '_notify_actionable_capped', 'p_envelope_id uuid, p_max integer',
        array['uuid'::regtype, 'integer'::regtype]::oid[],
        'p_envelope_id is the envelope public.esign_remind already loaded and judged; p_max comes from its frozen snapshot.',
        'esign_signers_are_asked_by_a_person_and_shown_where_to_sign.sql',
        'internal: reached only from public.esign_remind, which aidream calls after esign._may_manage(envelope, editor); no client role holds EXECUTE.',
        false, false)
on conflict do nothing;

-- The words. A signer is asked by a person; the reminder now opens the document.
update communication.notification_event_type
   set config = jsonb_set(config, '{templates,email}', jsonb_build_object(
         'subject', '{{sender.name}} sent you a document to sign: {{envelope.title}}',
         'body', E'{{sender.name}} ({{employer.name}}) sent you "{{envelope.title}}" to sign.\n\nReview and sign it here: {{link.deep}}\n\nQuestions? Reply to this email to reach {{sender.name}}.\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.'))
 where event_key = 'esign.signature_requested';
update communication.notification_event_type
   set config = jsonb_set(config, '{templates,email}', jsonb_build_object(
         'subject', 'Reminder: {{sender.name}} is waiting for your signature on {{envelope.title}}',
         'body', E'"{{envelope.title}}", sent by {{sender.name}} ({{employer.name}}), is still waiting for your signature.\n\nReview and sign it here: {{link.deep}}\n\nThis link replaces any earlier one.\n\n--\nSent through AI Matrx on behalf of {{sender.name}}.'))
 where event_key = 'esign.signature_reminder';
update communication.notification_event_type
   set config = jsonb_set(config, '{templates,email}', jsonb_build_object(
         'subject', 'Your signing code: {{code}}',
         'body', E'{{code}} is your code to open the document {{sender.name}} sent you to sign.\n\nIt works for 10 minutes and only once. Nobody from AI Matrx will ever ask you for it.\n\nIf you did not just ask for a code, ignore this email: without the link it opens nothing.'))
 where event_key = 'esign.verification_code';

-- WHERE EACH SIGNER SIGNS. Fields arrive from the sender keyed by the signer's email (the only
-- key the sender has before the envelope exists); stored keyed by the signer's id, on a document
-- that is not yet frozen — after the freeze the field map is evidence like the bytes.
create or replace function esign.attach_field_map(p_envelope_id uuid, p_fields jsonb)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare d record; v_fields jsonb; v_n int := 0; f jsonb; v_signer uuid;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return 0;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    select s.id into v_signer from esign.envelope_signer s
     where s.envelope_id = p_envelope_id and s.email = lower(f ->> 'signer_email');
    if v_signer is null then
      raise exception 'esign.attach_field_map: field for % names no signer on envelope %',
        f ->> 'signer_email', p_envelope_id using errcode = '22023';
    end if;
    if (f ->> 'kind') not in ('signature','initials','date_signed','full_name') then
      raise exception 'esign.attach_field_map: unknown field kind %', f ->> 'kind' using errcode = '22023';
    end if;
  end loop;
  for d in select * from esign.envelope_document where envelope_id = p_envelope_id order by position loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', gen_random_uuid(),
             'signer_id', (select s.id from esign.envelope_signer s
                            where s.envelope_id = p_envelope_id and s.email = lower(x ->> 'signer_email')),
             'kind', x ->> 'kind',
             'page', (x ->> 'page')::int,
             'x', (x ->> 'x')::numeric, 'y', (x ->> 'y')::numeric,
             'w', (x ->> 'w')::numeric, 'h', (x ->> 'h')::numeric)), '[]'::jsonb)
      into v_fields
      from jsonb_array_elements(p_fields) x
     where (x ->> 'document_position')::int = d.position;
    if jsonb_array_length(v_fields) > 0 then
      update esign.envelope_document set field_map = jsonb_build_object('fields', v_fields)
       where id = d.id and not is_frozen;
      v_n := v_n + jsonb_array_length(v_fields);
    end if;
  end loop;
  return v_n;
end $function$;

-- A signer sees where they (and the others) sign.
update platform.outsider_consumer
   set readable_columns = array_append(readable_columns, 'field_map')
 where consumer_key = 'esign.signer' and resource = 'esign_envelope_document'
   and not ('field_map' = any(readable_columns));

-- THE SIGNED COPY. Everything aidream needs to stamp each signer's marks into each document.
create or replace function esign.signed_copy_inputs(p_envelope_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'envelope_id', e.id, 'status', e.status, 'title', e.title,
    'organization_id', e.organization_id, 'owner_id', e.created_by, 'completed_at', e.completed_at,
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'position', d.position,
        'content_file_id', d.content_file_id, 'content_file_version', d.content_file_version,
        'content_hash', d.content_hash, 'field_map', d.field_map,
        'signed_copy_file_id', d.metadata ->> 'signed_copy_file_id') order by d.position)
      from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'full_name', s.full_name, 'email', s.email, 'status', s.status,
        'signature_kind', s.signature_kind, 'typed_name', s.typed_name, 'typed_style', s.typed_style,
        'signature_image_file_id', s.signature_image_file_id, 'signed_at', s.signed_at) order by s.position)
      from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb))
  from esign.envelope e where e.id = p_envelope_id
$function$;

-- Filed on the document's metadata (never a frozen column): the stamped copy is a rendering of
-- the frozen bytes, not a replacement for them.
create or replace function esign.record_signed_copy(p_document_id uuid, p_file_id uuid)
 returns boolean
 language sql
 set search_path to ''
as $function$
  update esign.envelope_document
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('signed_copy_file_id', p_file_id)
   where id = p_document_id
  returning true
$function$;
