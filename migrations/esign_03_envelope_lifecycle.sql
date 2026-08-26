-- E-sign C7 — migration 3 of 6 (register item HRB-011, lane core-c7-esign).
--
-- THE ENVELOPE LIFECYCLE: create → send (render-once freeze + hash) → the ordered signer walk →
-- remind / resend / void / expire, the ONE event writer, the ONE notification enqueuer, and
-- `esign_mint_signer_token` — the thin wrapper SPEC-ESIGN §9 owes from this lane.
--
-- Authority: SPEC-ESIGN §2.3, §2.5, §3.1–§3.3, §3.5, §5.4, §6.1, §6.2, §9. Applied live as
-- `esign_03_envelope_lifecycle`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE DATABASE CANNOT HASH BYTES IT DOES NOT HOLD, SO THE HASH IS AN ARGUMENT — AND A
--    REQUIRED ONE. §2.3 computes content_hash "over the exact bytes presented to signers"; those
--    bytes live in the file service, not in Postgres. The freeze therefore takes the hash from the
--    renderer (aidream) and stores it, and every later comparison takes an OBSERVED hash from
--    whoever just read the bytes. The important half is that the observed hash is NOT optional:
--    `esign_signer_sign` refuses a NULL observed hash outright, because "I did not check" and "it
--    matched" must never be the same code path — that is precisely how a tamper check rots into a
--    no-op. §8.2 case 8 is provable at this layer for exactly this reason.
--
-- 2. THE IP/DEVICE CAPTURE RULE IS ENFORCED BY THE WRITER, IN BOTH DIRECTIONS (§2.5). One function
--    writes every event. It RAISES if a human-interaction event (opened, viewed, consent_given,
--    signature_adopted, signed, declined, downloaded) arrives without an IP, and it NULLS the IP
--    and user-agent on system-generated events (reminded, expired, certificate_generated) no matter
--    what the caller passed — "a fabricated IP on a cron-fired row is worse than no IP".
--
-- 3. `opened` DOES NOT CONSUME AND DOES NOT IMPLY `viewed`. Token resolution — which a corporate
--    mail scanner performs on the recipient's behalf — writes `opened` and nothing else. `viewed`
--    is written only by esign_signer_preview_ack (migration 05), the call the client makes after
--    the document actually rendered, and only `viewed` sets document_previewed_at, which §4.3
--    precondition 2 requires before consent.
--
-- 4. THE SEQUENTIAL WALK IS A PREDICATE, NOT A NOTIFICATION SIDE EFFECT. `esign._can_act` answers
--    "may this signer act right now" from the rows, and the notifier, the loader, the consent gate
--    and the sign gate all consult the same predicate. A design where "not yet notified" is what
--    stops signer 3 leaks the moment anyone reaches the page another way.
--
-- 5. THE ENVELOPE'S ORG IS SUPPLIED, NEVER RESOLVED. Every write in this file carries an explicit
--    organization_id taken from the envelope row the caller named (2026-08-21 NO-NULL-ORG ruling);
--    no trigger, default or resolver chooses one anywhere in esign.
--
-- 6. REFUSALS ARE RETURNED, NOT RAISED, WHEREVER AN EVENT ROW IS THE POINT OF THE REFUSAL — THE
--    REFUSAL-ENVELOPE LAW (SPEC-DATA-MODEL §14.6, inherited from HRB-007/008). Postgres has no
--    autonomous transactions, so a function that writes `hash_mismatch` and then RAISEs logs
--    nothing at all, and the evidence ledger would contain only the signatures that succeeded.
--    Every refusal here returns {granted:false, reason, …} carrying no row payload; a raise is
--    reserved for programming errors, where nothing was audited and nothing is being refused.
-- ===================================================================================

set local statement_timeout = '300s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. The declared notification events (§6.2).
-- ---------------------------------------------------------------------------------
insert into communication.notification_event_type (organization_id, event_key, label, description, default_channels)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.k, v.lbl, v.d, v.ch::jsonb
from (values
 ('esign.signature_requested','Signature requested','A document is waiting for your signature.','["email","in_app"]'),
 ('esign.signature_reminder','Signature reminder','A reminder that a document is still waiting for your signature.','["email","in_app"]'),
 ('esign.verification_code','Signing verification code','The one-time code that proves the link reached its addressee.','["email"]'),
 ('esign.completed','Signing completed','Every required signer has signed.','["email","in_app"]'),
 ('esign.declined','Signing declined','A signer declined; the envelope is terminated.','["email","in_app"]'),
 ('esign.voided','Signing voided','The requester voided the envelope.','["email","in_app"]'),
 ('esign.expired','Signing expired','The envelope passed its expiry without completing.','["email","in_app"]'),
 ('esign.campaign_progress','Campaign progress','A bulk signature campaign reported progress.','["in_app"]'),
 ('esign.delivery_failed','Signature delivery failed','A signature request could not be delivered.','["email","in_app"]'),
 ('esign.signer_viewed','Signer viewed the document','A signer opened and rendered the document.','["in_app"]')
) as v(k, lbl, d, ch)
where not exists (select 1 from communication.notification_event_type t
                   where t.event_key = v.k and t.deleted_at is null);

-- ---------------------------------------------------------------------------------
-- 2. The write-guard arm/disarm pair (RECORDED DECISION 6 of migration 01).
-- ---------------------------------------------------------------------------------
create or replace function esign._arm() returns void
language sql volatile as $fn$ select set_config('esign.privileged_write','on',true)::void $fn$;
create or replace function esign._disarm() returns void
language sql volatile as $fn$ select set_config('esign.privileged_write','off',true)::void $fn$;


-- 🚨 THE OWNER BRANCH. `iam.has_access` is has_access_for(auth.uid(), …) and it does NOT include
-- the row's creator — every generated entity policy on this platform reads "owner OR
-- iam.has_access(...)", precisely because the function is only the second half. A permission check
-- written as has_access alone therefore refuses the person who created the envelope, which is the
-- textbook over-tightening defect (db-rules §6): the requester could not send their own request.
-- One helper, consulted by every esign RPC that gates on the envelope.
create or replace function esign._may_manage(p_envelope_id uuid, p_level text default 'editor')
returns boolean
language sql stable security definer set search_path to 'esign','public' as $fn$
  select exists (select 1 from esign.envelope e
                  where e.id = p_envelope_id
                    and (e.created_by = auth.uid()
                         or iam.has_access('esign_envelope', e.id, p_level::permission_level)))
      or public.is_platform_admin();
$fn$;

create or replace function esign._may_manage_campaign(p_campaign_id uuid, p_level text default 'editor')
returns boolean
language sql stable security definer set search_path to 'esign','public' as $fn$
  select exists (select 1 from esign.campaign c
                  where c.id = p_campaign_id
                    and (c.created_by = auth.uid()
                         or iam.has_access('esign_campaign', c.id, p_level::permission_level)))
      or public.is_platform_admin();
$fn$;

-- ---------------------------------------------------------------------------------
-- 3. THE ONE EVENT WRITER (§2.5, RECORDED DECISION 2).
-- ---------------------------------------------------------------------------------
create or replace function esign._event(
  p_envelope_id uuid, p_event_type text, p_actor_type text,
  p_signer_id uuid default null, p_document_id uuid default null,
  p_actor_user_id uuid default null, p_actor_token_id uuid default null,
  p_actor_label text default null, p_auth_method text default null,
  p_ip inet default null, p_user_agent text default null, p_device_hint text default null,
  p_payload jsonb default '{}'::jsonb, p_provider_event_id text default null)
returns uuid
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare v_org uuid; v_id uuid; v_ip inet := p_ip; v_ua text := p_user_agent; v_dh text := p_device_hint;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    -- A programming error, not a refusal: nothing was reached, so there is nothing to attribute.
    raise exception 'esign._event: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;

  -- THE CAPTURE RULE, both directions.
  if p_event_type in ('reminded','expired','certificate_generated') then
    v_ip := null; v_ua := null; v_dh := null;
  elsif p_event_type in ('opened','viewed','consent_given','signature_adopted','signed','declined','downloaded')
        and p_ip is null then
    raise exception 'esign._event: % is a human-interaction event and must carry an IP (§2.5 the capture rule)', p_event_type
      using errcode = '22023';
  end if;

  insert into esign.envelope_event
    (organization_id, envelope_id, signer_id, document_id, event_type, occurred_at, actor_type,
     actor_user_id, actor_token_id, actor_label, auth_method, ip_address, user_agent, device_hint,
     payload, provider_event_id)
  values (v_org, p_envelope_id, p_signer_id, p_document_id, p_event_type, now(), p_actor_type,
          p_actor_user_id, p_actor_token_id, p_actor_label, p_auth_method, v_ip, v_ua, v_dh,
          coalesce(p_payload,'{}'::jsonb), p_provider_event_id)
  returning id into v_id;
  return v_id;
end $fn$;

-- ---------------------------------------------------------------------------------
-- 4. THE ONE NOTIFICATION ENQUEUER (§6.2). No feature builds its own notifier.
-- ---------------------------------------------------------------------------------
create or replace function esign._notify(
  p_envelope_id uuid, p_event_key text, p_signer_id uuid default null,
  p_to_user uuid default null, p_to_address text default null, p_actor_token_id uuid default null,
  p_subject text default null, p_body text default null, p_deep_link text default null,
  p_payload jsonb default '{}'::jsonb, p_channel text default 'email')
returns uuid
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare v_org uuid; v_id uuid; v_kind text;
begin
  select organization_id into v_org from esign.envelope where id = p_envelope_id;
  if v_org is null then
    raise exception 'esign._notify: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  v_kind := case when p_to_user is not null then 'user'
                 when p_actor_token_id is not null then 'actor_token'
                 else 'address' end;
  if v_kind <> 'user' and p_to_address is null then
    -- SPEC-NOTIFICATIONS §3.2, as HRB-001 landed it: a resolver that finds no address writes a
    -- terminal `skipped` row carrying an error_code — VISIBLE, not silent — and never a raise and
    -- never a placeholder address, which would corrupt the one column the evidence rests on.
    insert into communication.notification
      (organization_id, event_key, channel, recipient_kind, recipient_user_id, to_address,
       status, error_code, error_message, subject, payload, target_kind, target_id)
    values (v_org, p_event_key, p_channel, 'address', null, null,
            'skipped', 'no_address',
            'esign could not address this notice', p_subject,
            coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
            'esign_envelope', p_envelope_id)
    returning id into v_id;
    return v_id;
  end if;

  insert into communication.notification
    (organization_id, event_key, channel, recipient_kind, recipient_user_id, recipient_actor_token_id,
     to_address, subject, body, payload, target_kind, target_id, deep_link, dedupe_key)
  values (v_org, p_event_key, p_channel, v_kind, p_to_user, p_actor_token_id,
          p_to_address, p_subject, p_body,
          coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('envelope_id', p_envelope_id, 'signer_id', p_signer_id),
          'esign_envelope', p_envelope_id, p_deep_link,
          p_event_key || ':' || p_envelope_id::text || ':' || coalesce(p_signer_id::text,'-') || ':' ||
          to_char(now(), 'YYYYMMDDHH24MISSMS'))
  returning id into v_id;
  return v_id;
end $fn$;


-- The requester's place in the live fifteen-value taxonomy. E-sign is a PLATFORM product (D20) and
-- the taxonomy is HR-shaped, so the mapping is read from the consumer key — the envelope's own
-- record of which module asked — rather than assumed. OWED: SPEC-ESIGN §2.5 and the taxonomy's
-- owner need a platform-neutral `requester` member; until then this is the least-wrong honest map.
create or replace function esign._requester_actor_type(p_consumer_key text)
returns text
language sql stable as $fn$
  select case when public.is_platform_admin() then 'platform_admin'
              when auth.uid() is null then 'automation'
              when p_consumer_key like 'hr.%' then 'hr_admin'
              else 'employee' end;
$fn$;

-- ---------------------------------------------------------------------------------
-- 5. THE ORDER PREDICATE (§3.3, RECORDED DECISION 4).
-- ---------------------------------------------------------------------------------
create or replace function esign._can_act(p_signer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_blockers int;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then return jsonb_build_object('can_act', false, 'reason', 'unknown_signer'); end if;
  select * into e from esign.envelope where id = s.envelope_id;

  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('can_act', false, 'reason', 'envelope_' || e.status);
  end if;
  if e.expires_at <= now() then
    return jsonb_build_object('can_act', false, 'reason', 'envelope_expired');
  end if;
  if s.status in ('signed','declined','delegated','expired') then
    return jsonb_build_object('can_act', false, 'reason', 'signer_' || s.status);
  end if;
  if s.role = 'cc_recipient' then
    -- cc rows never block and never act; their read-only tokens are minted at completion, not send.
    return jsonb_build_object('can_act', false, 'reason', 'cc_recipient');
  end if;

  if e.signing_order = 'sequential' then
    -- §3.3, non-negotiable: a signer at position n cannot be notified, cannot resolve a token, and
    -- cannot load documents until every position < n is signed. cc_recipient rows never block.
    select count(*) into v_blockers from esign.envelope_signer b
     where b.envelope_id = s.envelope_id and b.position < s.position
       and b.role <> 'cc_recipient' and b.status <> 'signed';
    if v_blockers > 0 then
      return jsonb_build_object('can_act', false, 'reason', 'waiting_on_earlier_position',
                                'blockers', v_blockers, 'position', s.position);
    end if;
  end if;
  return jsonb_build_object('can_act', true, 'position', s.position, 'envelope_id', s.envelope_id);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 6. CREATE (draft).
-- ---------------------------------------------------------------------------------
create or replace function public.esign_create_envelope(
  p_organization_id uuid, p_consumer_key text, p_title text,
  p_documents jsonb, p_signers jsonb,
  p_envelope_type text default 'custom', p_sensitivity text default 'standard',
  p_signing_order text default null, p_message text default null,
  p_source jsonb default '{}'::jsonb, p_expires_in_days int default null,
  p_callback_key text default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare
  v_env uuid; v_cat uuid; v_snap jsonb; v_days int; v_order text; d jsonb; s jsonb; v_pos int := 0;
  v_sid uuid; v_docs int := 0; v_signers int := 0;
begin
  if p_organization_id is null then
    raise exception 'esign_create_envelope: organization_id is explicit on every write and was not supplied'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_documents');
  end if;
  if jsonb_typeof(p_signers) <> 'array' or jsonb_array_length(p_signers) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_signers');
  end if;

  select id into v_cat from platform.categories
   where dimension = 'esign_envelope_type' and slug = coalesce(p_envelope_type,'custom')
     and deleted_at is null order by (organization_id = p_organization_id) desc limit 1;
  if v_cat is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_envelope_type', 'detail', p_envelope_type);
  end if;

  v_snap  := esign.resolve_config_snapshot(p_organization_id, coalesce(p_sensitivity,'standard'));
  v_days  := coalesce(p_expires_in_days, (v_snap ->> 'expiry_days')::int);
  v_order := coalesce(p_signing_order,
                      trim(both '"' from (esign.config_resolve(p_organization_id,'esign.signing_order.default'))::text));

  perform esign._arm();
  insert into esign.envelope
    (organization_id, category_id, title, message, status, signing_order, consumer_key,
     source_type, source_id, sensitivity, expires_at, config_snapshot, callback_key,
     retention_trigger)
  values (p_organization_id, v_cat, p_title, p_message, 'draft', v_order, p_consumer_key,
          nullif(p_source ->> 'type',''), nullif(p_source ->> 'id','')::uuid,
          coalesce(p_sensitivity,'standard'), now() + make_interval(days => v_days), v_snap,
          p_callback_key, trim(both '"' from (v_snap -> 'retention_trigger')::text))
  returning id into v_env;

  for d in select * from jsonb_array_elements(p_documents) loop
    v_docs := v_docs + 1;
    insert into esign.envelope_document
      (organization_id, envelope_id, position, name, source_kind, template_id, template_version,
       document_id, document_version, field_map, render_source, mime_type)
    values (p_organization_id, v_env, coalesce((d ->> 'position')::int, v_docs),
            coalesce(d ->> 'name', 'Document ' || v_docs),
            coalesce(d ->> 'source_kind','uploaded_file'),
            nullif(d ->> 'template_id','')::uuid, nullif(d ->> 'template_version','')::int,
            nullif(d ->> 'document_id','')::uuid, nullif(d ->> 'document_version','')::int,
            coalesce(d -> 'field_map','{}'::jsonb), coalesce(d -> 'record_context','{}'::jsonb),
            d ->> 'mime_type');
  end loop;

  for s in select * from jsonb_array_elements(p_signers) loop
    v_signers := v_signers + 1;
    v_pos := coalesce((s ->> 'position')::int, v_signers);
    insert into esign.envelope_signer
      (organization_id, envelope_id, position, role, actor_type, signer_user_id,
       subject_ref_type, subject_ref_id, full_name, email, phone, auth_method, is_required,
       verification_factor)
    values (p_organization_id, v_env, v_pos, coalesce(s ->> 'role','signer'),
            coalesce(s ->> 'actor_type','external'), nullif(s ->> 'user_id','')::uuid,
            nullif(s -> 'subject_ref' ->> 'type',''), nullif(s -> 'subject_ref' ->> 'id','')::uuid,
            s ->> 'full_name', lower(s ->> 'email'), nullif(s ->> 'phone',''),
            case when coalesce(s ->> 'actor_type','external') = 'internal_user' then 'session'
                 else 'token_link' end,
            coalesce(s ->> 'role','signer') <> 'cc_recipient',
            case when coalesce(s ->> 'actor_type','external') = 'internal_user' then null
                 else trim(both '"' from (v_snap -> 'verification_factor')::text) end)
    returning id into v_sid;
  end loop;

  perform esign._event(v_env, 'created', esign._requester_actor_type(p_consumer_key),
                       p_actor_user_id => auth.uid(),
                       p_actor_label => 'requester',
                       p_payload => jsonb_build_object('consumer_key', p_consumer_key,
                                                       'documents', v_docs, 'signers', v_signers));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', v_env, 'status', 'draft',
                            'documents', v_docs, 'signers', v_signers,
                            'expires_at', (select expires_at from esign.envelope where id = v_env));
end $fn$;

-- ---------------------------------------------------------------------------------
-- 7. SEND — the render-once freeze (§2.3 THE FREEZE LAW) + the first walk step.
-- ---------------------------------------------------------------------------------
create or replace function public.esign_send_envelope(p_envelope_id uuid, p_frozen jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; f jsonb; v_doc esign.envelope_document%rowtype;
        v_unfrozen int; v_notified int := 0;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_send_envelope: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if e.status <> 'draft' then
    return jsonb_build_object('granted', false, 'reason', 'not_draft', 'status', e.status);
  end if;
  if jsonb_typeof(p_frozen) <> 'array' or jsonb_array_length(p_frozen) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'no_frozen_artifacts',
      'detail', 'send freezes the rendered bytes; the renderer supplies file id, version, hash, size (RECORDED DECISION 1)');
  end if;

  perform esign._arm();
  for f in select * from jsonb_array_elements(p_frozen) loop
    select * into v_doc from esign.envelope_document
     where id = (f ->> 'document_id')::uuid and envelope_id = p_envelope_id;
    if not found then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'unknown_document',
                                'document_id', f ->> 'document_id');
    end if;
    if (f ->> 'content_hash') is null or length(f ->> 'content_hash') <> 64 then
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'bad_content_hash',
                                'document_id', f ->> 'document_id',
                                'detail', 'lowercase hex SHA-256 of the exact bytes presented to signers');
    end if;
    update esign.envelope_document
       set content_file_id      = (f ->> 'content_file_id')::uuid,
           content_file_version = coalesce((f ->> 'content_file_version')::int, 1),
           content_hash         = lower(f ->> 'content_hash'),
           hash_algorithm       = coalesce(f ->> 'hash_algorithm', 'sha-256'),
           byte_size            = (f ->> 'byte_size')::bigint,
           page_count           = (f ->> 'page_count')::int,
           mime_type            = coalesce(f ->> 'mime_type', v_doc.mime_type),
           is_frozen            = true,
           frozen_at            = now()
     where id = v_doc.id;
    perform esign._event(p_envelope_id, 'document_frozen', 'automation', p_document_id => v_doc.id,
                         p_payload => jsonb_build_object('document_hash', lower(f ->> 'content_hash'),
                                                         'hash_algorithm', coalesce(f ->> 'hash_algorithm','sha-256'),
                                                         'byte_size', f -> 'byte_size'));
  end loop;

  select count(*) into v_unfrozen from esign.envelope_document
   where envelope_id = p_envelope_id and not is_frozen;
  if v_unfrozen > 0 then
    perform esign._disarm();
    return jsonb_build_object('granted', false, 'reason', 'documents_not_all_frozen',
                              'unfrozen', v_unfrozen,
                              'detail', 'signers never see a live-rendered template (§2.3)');
  end if;

  update esign.envelope set status = 'sent', sent_at = now() where id = p_envelope_id;
  perform esign._event(p_envelope_id, 'sent', esign._requester_actor_type(e.consumer_key),
                       p_actor_user_id => auth.uid(), p_actor_label => 'requester');
  v_notified := esign._notify_actionable(p_envelope_id, 'esign.signature_requested');
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', p_envelope_id, 'status', 'sent',
                            'notified', v_notified);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 8. The walk: notify exactly the signers who may act right now (§3.3).
-- ---------------------------------------------------------------------------------
create or replace function esign._notify_actionable(p_envelope_id uuid, p_event_key text)
returns integer
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s record; e esign.envelope%rowtype; v_n int := 0; v_tok jsonb; v_link text;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  for s in select * from esign.envelope_signer
            where envelope_id = p_envelope_id and status in ('pending','notified','opened','viewed','consented','delivery_failed')
            order by position loop
    if (esign._can_act(s.id) ->> 'can_act')::boolean then
      if s.actor_type = 'internal_user' then
        -- §6.0 U-03: the internal signing route, outside the HR shell.
        v_link := '/sign/e/' || p_envelope_id::text;
        perform esign._notify(p_envelope_id, p_event_key, s.id, p_to_user => s.signer_user_id,
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
        perform esign._notify(p_envelope_id, p_event_key, s.id, p_to_address => s.email,
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
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $fn$;

-- ---------------------------------------------------------------------------------
-- 9. 🚨 esign_mint_signer_token — THE WRAPPER SPEC-ESIGN §9 OWES FROM THIS LANE.
--    Thin by ruling: check the caller's permission on the subject, then call
--    platform.mint_outsider_token. Scope validation, TTL resolution and the registry are the
--    lane's, and were built by HRB-007. "A lane that finds itself writing scope validation, TTL
--    resolution, or registry rows has taken the wrong turn."
-- ---------------------------------------------------------------------------------
create or replace function public.esign_mint_signer_token(p_signer_id uuid, p_email text default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_scope jsonb; v_mint jsonb;
        v_factor text; v_email text;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    raise exception 'esign_mint_signer_token: signer % does not exist', p_signer_id using errcode = 'P0002';
  end if;
  select * into e from esign.envelope where id = s.envelope_id;

  -- THE PERMISSION CHECK — the whole reason a per-purpose wrapper exists (§5.4 issuance side).
  if auth.uid() is not null and not esign._may_manage(e.id, 'editor') then
    return jsonb_build_object('granted', false, 'reason', 'no_permission_on_envelope');
  end if;
  if s.actor_type <> 'external' then
    return jsonb_build_object('granted', false, 'reason', 'internal_signer_uses_session',
      'detail', 'an internal signer authenticates with their platform session at /sign/e/{envelopeId} (§6.0 U-03)');
  end if;
  if e.status not in ('draft','sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  v_email  := lower(coalesce(p_email, s.email));
  v_factor := coalesce(s.verification_factor,
                       trim(both '"' from (e.config_snapshot -> 'verification_factor')::text),
                       'email_code');

  -- §5.3: no wildcards; every grant names a concrete registered resource plus an id or a parent_id,
  -- and every action is one the registry declares for this purpose.
  v_scope := jsonb_build_object(
    'consumer_key','esign.signer',
    'subject', jsonb_build_object('type','esign_envelope_signer','id', s.id),
    'grants', jsonb_build_array(
      jsonb_build_object('resource','esign_envelope',          'id', e.id,  'actions', jsonb_build_array('read')),
      jsonb_build_object('resource','esign_envelope_document', 'parent_id', e.id, 'actions', jsonb_build_array('read','download')),
      jsonb_build_object('resource','esign_envelope_signer',   'id', s.id, 'actions', jsonb_build_array('read','consent','sign','decline','delegate'))),
    'constraints', jsonb_build_object('expires_at', e.expires_at, 'max_uses', null, 'single_session', true));

  v_mint := platform.mint_outsider_token(
    p_consumer_key => 'esign.signer', p_subject_type => 'esign_envelope_signer',
    p_subject_id => s.id, p_scope => v_scope, p_organization_id => e.organization_id,
    p_recipient => jsonb_build_object('name', s.full_name, 'email', v_email, 'verification_target', v_email),
    p_overrides => jsonb_build_object('verification_factor', v_factor, 'expires_at', e.expires_at));

  perform esign._arm();
  update esign.envelope_signer
     set actor_token_id = (v_mint ->> 'actor_token_id')::uuid,
         email = v_email,
         verification_factor = v_factor,
         auth_method = case v_factor when 'none' then 'token_link'
                                     when 'email_code' then 'token_link_email_code'
                                     when 'sms_code' then 'token_link_sms_code'
                                     else 'token_link_access_code' end
   where id = s.id;
  perform esign._disarm();

  return v_mint || jsonb_build_object('granted', true, 'signer_id', s.id, 'envelope_id', e.id);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 10. VOID, REMIND, RESEND, EXPIRE (§3.5).
-- ---------------------------------------------------------------------------------
create or replace function esign._revoke_open_tokens(p_envelope_id uuid, p_reason text)
returns integer
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s record; v_n int := 0;
begin
  for s in select id, actor_token_id from esign.envelope_signer
            where envelope_id = p_envelope_id and actor_token_id is not null
              and status not in ('signed','declined') loop
    perform platform.revoke_outsider_token(s.actor_token_id, p_reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

create or replace function public.esign_void_envelope(p_envelope_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; v_revoked int;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_void_envelope: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    return jsonb_build_object('granted', false, 'reason', 'reason_required');
  end if;
  if e.status = 'completed' then
    -- §3.5: voiding a completed envelope is impossible; the correction path is a NEW envelope with
    -- a superseding reference.
    return jsonb_build_object('granted', false, 'reason', 'cannot_void_completed',
      'detail', 'issue a new envelope carrying superseded_by_envelope_id');
  end if;
  if e.status in ('declined','voided','expired') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;

  perform esign._arm();
  update esign.envelope set status = 'voided', voided_at = now(), void_reason = p_reason
   where id = p_envelope_id;
  v_revoked := esign._revoke_open_tokens(p_envelope_id, 'envelope voided');
  perform esign._event(p_envelope_id, 'voided', esign._requester_actor_type(e.consumer_key),
                       p_actor_user_id => auth.uid(),
                       p_actor_label => 'requester',
                       p_payload => jsonb_build_object('reason', p_reason, 'tokens_revoked', v_revoked));
  perform esign._notify(p_envelope_id, 'esign.voided',
                        p_to_user => e.created_by, p_to_address => null,
                        p_subject => 'Signature request voided: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('reason', p_reason));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'envelope_id', p_envelope_id, 'status', 'voided',
                            'tokens_revoked', v_revoked);
end $fn$;

create or replace function public.esign_remind(p_envelope_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; v_max int; v_n int; v_capped int;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_remind: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  -- §7 / AD-11: the cadence and the cap come from THIS envelope's frozen snapshot, never from
  -- today's org configuration.
  v_max := coalesce((e.config_snapshot ->> 'reminder_max_count')::int, 3);
  select count(*) into v_capped from esign.envelope_signer
   where envelope_id = p_envelope_id and reminder_count >= v_max
     and status not in ('signed','declined','delegated','expired');

  perform esign._arm();
  v_n := esign._notify_actionable_capped(p_envelope_id, v_max);
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'reminded', v_n, 'capped_out', v_capped,
                            'max_reminders', v_max);
end $fn$;

create or replace function esign._notify_actionable_capped(p_envelope_id uuid, p_max int)
returns integer
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s record; e esign.envelope%rowtype; v_n int := 0;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  for s in select * from esign.envelope_signer
            where envelope_id = p_envelope_id
              and status in ('pending','notified','opened','viewed','consented','delivery_failed')
              and reminder_count < p_max
            order by position loop
    if (esign._can_act(s.id) ->> 'can_act')::boolean then
      perform esign._notify(p_envelope_id, 'esign.signature_reminder', s.id,
                            p_to_user => s.signer_user_id, p_to_address => s.email,
                            p_actor_token_id => s.actor_token_id,
                            p_subject => 'Reminder: ' || coalesce(e.title,'signature requested'));
      update esign.envelope_signer
         set reminder_count = reminder_count + 1, last_notified_at = now() where id = s.id;
      perform esign._event(p_envelope_id, 'reminded', 'automation', p_signer_id => s.id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $fn$;

create or replace function public.esign_resend_signer(p_signer_id uuid, p_email text default null)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_new_addr boolean; v_tok jsonb;
        v_link text; v_old uuid;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    raise exception 'esign_resend_signer: signer % does not exist', p_signer_id using errcode = 'P0002';
  end if;
  select * into e from esign.envelope where id = s.envelope_id;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('granted', false, 'reason', 'envelope_' || e.status);
  end if;
  if not (esign._can_act(s.id) ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', esign._can_act(s.id) ->> 'reason');
  end if;

  v_new_addr := p_email is not null and lower(p_email) is distinct from s.email;
  perform esign._arm();
  if s.actor_type = 'external' and (v_new_addr or s.actor_token_id is null) then
    -- §3.5: the addressee changed, so the old token dies and a new one is minted — the evidence
    -- must show WHICH ADDRESS received WHICH LINK. Same address ⇒ the existing token is reused, so
    -- an already-opened link keeps working.
    v_old := s.actor_token_id;
    if v_old is not null then
      perform platform.revoke_outsider_token(v_old, 'signer email corrected on resend');
      update esign.envelope_signer set actor_token_id = null where id = s.id;
    end if;
    v_tok := public.esign_mint_signer_token(s.id, coalesce(p_email, s.email));
    if not coalesce((v_tok ->> 'granted')::boolean, false) then
      perform esign._disarm();
      return v_tok;
    end if;
    v_link := '/x/sign#t=' || (v_tok ->> 'secret');
  end if;

  perform esign._notify(s.envelope_id, 'esign.signature_requested', s.id,
                        p_to_user => s.signer_user_id,
                        p_to_address => lower(coalesce(p_email, s.email)),
                        p_actor_token_id => coalesce((v_tok ->> 'actor_token_id')::uuid, s.actor_token_id),
                        p_subject => coalesce(e.title,'Signature requested'), p_deep_link => v_link);
  update esign.envelope_signer
     set last_notified_at = now(), notify_attempts = notify_attempts + 1,
         status = case when status = 'delivery_failed' then 'notified' else status end,
         delivery_error = null
   where id = s.id;
  perform esign._event(s.envelope_id, 'resent', esign._requester_actor_type(e.consumer_key),
                       p_signer_id => s.id, p_actor_user_id => auth.uid(),
                       p_payload => jsonb_build_object('address_changed', v_new_addr,
                                                       'token_reissued', v_tok is not null,
                                                       'revoked_token_id', v_old));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'address_changed', v_new_addr,
                            'token_reissued', v_tok is not null);
end $fn$;

-- §3.5: expiry is a SWEEP, not a lazy check at open time — an expired envelope must report as
-- expired on a dashboard nobody has opened.
create or replace function public.esign_expire_sweep(p_limit int default 500)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare r record; v_n int := 0; v_tokens int := 0;
begin
  -- The sweep crosses every organization, so it is the scheduler's call and platform staff's, not
  -- an ordinary member's. It can only move rows that are ALREADY past their frozen expiry.
  if auth.uid() is not null and not public.is_platform_admin() then
    return jsonb_build_object('granted', false, 'reason', 'platform_admin_only');
  end if;
  perform esign._arm();
  for r in select id, organization_id, created_by, title from esign.envelope
            where status in ('sent','in_progress') and expires_at <= now() and deleted_at is null
            order by expires_at limit p_limit loop
    update esign.envelope set status = 'expired' where id = r.id;
    update esign.envelope_signer set status = 'expired'
     where envelope_id = r.id and status not in ('signed','declined','delegated');
    v_tokens := v_tokens + esign._revoke_open_tokens(r.id, 'envelope expired');
    perform esign._event(r.id, 'expired', 'automation',
                         p_payload => jsonb_build_object('swept_at', now()));
    perform esign._notify(r.id, 'esign.expired', p_to_user => r.created_by,
                          p_subject => 'Signature request expired: ' || coalesce(r.title,''));
    v_n := v_n + 1;
  end loop;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'expired', v_n, 'tokens_revoked', v_tokens);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 11. The read the consuming module's UI uses until `esign` is exposed to PostgREST.
-- ---------------------------------------------------------------------------------
create or replace function public.esign_envelope_state(p_envelope_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype;
begin
  select * into e from esign.envelope where id = p_envelope_id;
  if not found then
    raise exception 'esign_envelope_state: envelope % does not exist', p_envelope_id using errcode = 'P0002';
  end if;
  if not esign._may_manage(e.id, 'viewer') then
    return jsonb_build_object('granted', false, 'reason', 'no_access');
  end if;
  return jsonb_build_object(
    'granted', true,
    'envelope', to_jsonb(e) - 'config_snapshot',
    'config_snapshot', e.config_snapshot,
    'documents', coalesce((select jsonb_agg(to_jsonb(d) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'signers',   coalesce((select jsonb_agg(to_jsonb(s) - 'signature_payload_hash' order by s.position)
                             from esign.envelope_signer s where s.envelope_id = e.id), '[]'::jsonb),
    'events',    coalesce((select jsonb_agg(to_jsonb(v) order by v.occurred_at)
                             from esign.envelope_event v where v.envelope_id = e.id), '[]'::jsonb));
end $fn$;

-- ---------------------------------------------------------------------------------
-- 12. Grants. `anon` receives nothing here — every RPC in this file is a requester-side call.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.esign_create_envelope(uuid,text,text,jsonb,jsonb,text,text,text,text,jsonb,integer,text)',
    'public.esign_send_envelope(uuid,jsonb)',
    'public.esign_mint_signer_token(uuid,text)',
    'public.esign_void_envelope(uuid,text)',
    'public.esign_remind(uuid)',
    'public.esign_resend_signer(uuid,text)',
    'public.esign_expire_sweep(integer)',
    'public.esign_envelope_state(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 13. ASSERTIONS.
-- ---------------------------------------------------------------------------------
do $$
declare v_n int;
begin
  select count(*) into v_n from communication.notification_event_type
   where event_key like 'esign.%' and deleted_at is null;
  if v_n < 10 then raise exception 'esign_03: only % esign notification events declared', v_n; end if;

  -- §5.4 / T-34: anon's EXECUTE surface must not have grown by one function from THIS file. The
  -- outsider signing family in migration 05 is anon-callable by design (§5.4 names it), so the
  -- assertion is scoped to the requester-side functions this file creates, not to `esign_%`.
  select count(*) into v_n from unnest(ARRAY[
      'public.esign_create_envelope(uuid,text,text,jsonb,jsonb,text,text,text,text,jsonb,integer,text)',
      'public.esign_send_envelope(uuid,jsonb)',
      'public.esign_mint_signer_token(uuid,text)',
      'public.esign_void_envelope(uuid,text)',
      'public.esign_remind(uuid)',
      'public.esign_resend_signer(uuid,text)',
      'public.esign_expire_sweep(integer)',
      'public.esign_envelope_state(uuid)']) f
   where has_function_privilege('anon', to_regprocedure(f), 'EXECUTE');
  if v_n > 0 then raise exception 'esign_03: anon can execute % requester-side esign functions — this file grants none', v_n; end if;

  if to_regprocedure('public.esign_mint_signer_token(uuid,text)') is null then
    raise exception 'esign_03: the owed mint wrapper esign_mint_signer_token was not created';
  end if;
end $$;
