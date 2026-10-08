-- based-on: esign._notice_facts(uuid, uuid) 013026dcc7fd85b2be31951d11164aa2fef9bedc91aa55918c9714d71f6746e4
--
-- E-SIGN NOTICE SUBJECTS READ LIKE A PERSON WROTE THEM (fix round 3, 2026-10-07).
-- "admin: Please sign: test-agreement" -> "Arman Sadeghi sent you test-agreement to sign". The default
-- request subject names the sender in a sentence (the From name already reads "<name> via AI Matrx");
-- the old stored default "Please sign: <title>" counts as no custom subject; a subject the sender
-- really wrote is sent as written. Reminder / review / expiry / cancel subjects drop the "Name: " prefix.

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
      'subject', case when nullif(btrim(e.email_subject), '') is null or btrim(e.email_subject) = 'Please sign: ' || v_title
                      then coalesce(nullif(btrim(esign.envelope_sender(p_envelope_id) ->> 'name'), ''), 'Someone') || ' sent you ' || v_title || ' to sign'
                      else btrim(e.email_subject) end,
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

update communication.notification_event_type set config = jsonb_set(config, '{templates,email,subject}', to_jsonb(v.s))
  from (values
    ('esign.signature_requested', '{{request.subject}}'),
    ('esign.review_requested',    '{{sender.name}} sent you {{envelope.title}} to review'),
    ('esign.signature_reminder',  'Reminder: {{sender.name}} is waiting for your signature on {{envelope.title}}'),
    ('esign.expiry_warning',      '{{envelope.title}} expires {{envelope.expires_on}}'),
    ('esign.voided_for_signer',   '{{sender.name}} cancelled {{envelope.title}}')
  ) as v(k, s)
 where event_key = v.k and config -> 'templates' -> 'email' is not null;
