-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- LANE ESIGN — PRODUCTS row 16, *"Have the client sign this before we start."*
--
-- WHAT WAS ALREADY THERE, AND WHY NOTHING OF IT IS REBUILT HERE
-- -------------------------------------------------------------
-- W3-DOC built the whole of VAL-10: `custom.doc_render` (one document version and its
-- SHA-256), `custom.doc_signature` (the seal — signer, time, hash, document version, refusing
-- a second seal on the same version), and `custom.doc_sign`, which in ONE act writes both the
-- Value on the record — a text Field whose format is `signature`, through the store's own
-- `custom.record_update`, with the render, the template, the document version and the document
-- hash in the interned provenance — and the seal. DOORS-TWO opened `custom.doc_renders` and
-- `custom.doc_signatures` so a person can see them. Every one of those is used as it stands.
--
-- THE HOLE, IN ONE SENTENCE: **you could sign a document, but you could not ASK anybody to.**
-- `custom.doc_sign` requires `editor` on the record, so the only person who could ever produce
-- a signature was somebody who already had the right to edit the thing being signed. A client
-- is not that person, and a signature only insiders can give is not e-sign.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SEVEN DECISIONS, EACH WITH ITS REASON
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 1. A SIGNATURE REQUEST IS A RECORD (`data_class = 'sign_request'`), exactly as REC-68's
--    document template is one and as a Rule, a Dashboard and a Work Approval are. Whom an
--    organization asked to sign which of its documents is its own business data, so it lives
--    where its business data lives, gets the store's own versioning, actor stamping and
--    history for free, and needs no second store to keep in step. It is written and moved
--    ONLY by the doors in this file, which is what `custom.doc_template_save` does for a
--    template.
--
-- 2. THE SIGNATURE IS NOT IN IT. The signature is still VAL-10's Value on the business record
--    plus the row in `custom.doc_signature`, written by `custom.doc_sign`, untouched by this
--    lane. A signature that lived in an e-sign object instead of on the record would be the
--    detour into another vendor that PRODUCTS row 16 exists to refuse. This Record is what was
--    ASKED, and its answer.
--
-- 3. THE LINK IS ONE OPAQUE STRING THAT CARRIES ITS OWN ADDRESS AND ITS OWN SECRET.
--    64 bytes, base64url, no padding: organization (16) ‖ request (16) ‖ secret (32). The
--    address half is what lets the signing door do a POINT READ on `custom.record`'s own
--    primary key `(organization_id, id)` — the store is hash partitioned on organization, so a
--    lookup by a secret alone would have to walk all sixteen partitions on every open. The
--    secret half is 256 bits of `gen_random_bytes` and is the whole authority.
--    **ONLY ITS SHA-256 IS STORED.** A public form's link is its own id, and correctly, because
--    a form is meant to be forwarded. A signing link is the opposite — it is one person's
--    authority to bind their organization — so an operator who can read every row of this
--    database must still be unable to sign. That is the DocuSign and Dropbox Sign posture and
--    it costs one `sha256()`.
--
-- 4. THE ARTIFACT IS FROZEN BY ITS HASH, NOT BY A COPY OR A LOCK. `document_hash` is the
--    render's own `content_hash` at send time. Every open and every signature RE-RENDERS the
--    record through `custom.doc_render_body` and compares. If the record moved, the request is
--    invalidated then and there, in writing, with a sentence a person wrote — *"This document
--    changed after it was sent for signature, so this link no longer works."* A copy would let
--    somebody sign a document the record no longer supports; a lock on the record would stop
--    the business from working while a client thinks about it.
--
-- 5. EXPIRY IS REQUIRED. A link that never expires is a signature anybody who ever saw the
--    email can still produce years later.
--
-- 6. THE WRONG SECRET IS ANSWERED ONCE, AND COUNTED. Because the token carries its own
--    address, a wrong secret can be attributed to the request it was aimed at: the door bumps
--    `bad_attempts` on that Record and, at ten, invalidates the request outright and tells the
--    owner why. That is a durable lockout with no new table and no new store — which matters
--    tonight, because `platform.provision` is refusing every spec on this database (see the
--    note at the foot of this file) and a lane that answered that by inventing its own table
--    would be doing the thing the provisioner exists to stop.
--
-- 7. THE SIGNER WRITES AS THE PERSON WHO ASKED, FOR ONE STATEMENT, AND SAYS SO. A stranger has
--    no principal, and `custom.doc_sign` asks `editor` on the record. So the signing door
--    assumes the requester's claims for exactly the `custom.doc_sign` call and restores the
--    session afterwards, exception path included — AGT-N-5, and the same answer lane FORMS
--    reached for `custom.anon_clear`. What is written is never the requester's signature: the
--    Value's text is the signer's own typed or drawn name, and the provenance names the signer,
--    their address, the moment, the document hash, where they signed from and on what.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE TOKEN
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.sign_token_encode(p_bytes bytea)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  -- base64url, unpadded. `encode(…, 'base64')` wraps at 76 characters, so the newline is
  -- translated away too or the link breaks the moment it is put in an email.
  select translate(encode(p_bytes, 'base64'), E'+/=\n', '-_');
$$;

comment on function custom.sign_token_encode(bytea) is
  'ESIGN: base64url without padding. The signing link''s one encoding.';

create or replace function custom.sign_token_decode(p_token text)
returns bytea
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{86}$' then
    return null;   -- NOT an exception: a malformed link is answered by one sentence upstream.
  end if;
  return decode(translate(p_token, '-_', '+/') || '==', 'base64');
exception when others then
  return null;
end;
$$;

comment on function custom.sign_token_decode(text) is
  'ESIGN: the inverse of custom.sign_token_encode, for the 64-byte signing token only. Null for anything that is not one - a malformed link is not an error, it is a link that does not work.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- WHAT STATE A REQUEST IS IN — derived, never stored, so it can never disagree with itself
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.sign_request_state(p_data jsonb)
returns text
language sql
stable
parallel safe
set search_path to 'pg_catalog'
as $$
  -- The order is the order a person reads: a finished answer first, then a stop that is not
  -- the signer's fault, then time, then whether they have looked at it.
  select case
    when p_data ? 'signed_at'      then 'signed'
    when p_data ? 'declined_at'    then 'declined'
    when p_data ? 'invalidated_at' then 'invalidated'
    when (p_data ->> 'expires_at')::timestamptz <= now() then 'expired'
    when p_data ? 'viewed_at'      then 'viewed'
    else 'sent'
  end;
$$;

comment on function custom.sign_request_state(jsonb) is
  'ESIGN: sent / viewed / signed / declined / invalidated / expired, derived from the request Record. Never stored, so the screen and the store cannot say different things.';

create or replace function custom.sign_request_sentence(p_data jsonb)
returns text
language sql
stable
parallel safe
set search_path to 'pg_catalog'
as $$
  -- ONE PLACE THE WORDS LIVE. The signing page, the owner's list and the agent all read this,
  -- so a person and a screen and a tool can never be told three different things.
  select case custom.sign_request_state(p_data)
    when 'signed'      then format('Signed by %s.', p_data ->> 'signed_name')
    when 'declined'    then case
                              when coalesce(p_data ->> 'decline_reason', '') = ''
                                then 'This was declined, without a reason given.'
                              else format('This was declined: %s', p_data ->> 'decline_reason')
                            end
    when 'invalidated' then coalesce(p_data ->> 'invalidation_reason',
                                     'This request was stopped, so the link no longer works.')
    when 'expired'     then 'This signing link has expired. Ask whoever sent it for a new one.'
    when 'viewed'      then 'Opened, not signed yet.'
    else                    'Sent, not opened yet.'
  end;
$$;

comment on function custom.sign_request_sentence(jsonb) is
  'ESIGN: the one English sentence for a request''s state, read by the signing page, the owner''s list and the agent alike.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- ASKING — a client door. `editor` on the record, because asking the world to sign a document
-- about a record is a bigger act than reading it.
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.sign_request_create(
  p_organization_id uuid,
  p_render_id       uuid,
  p_field_key       text,
  p_signer_email    text,
  p_signer_name     text,
  p_expires_in      interval default interval '14 days')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_doc     record;
  v_field   jsonb;
  v_secret  bytea;
  v_id      uuid;
  v_token   text;
  v_expires timestamptz;
  v_signer  uuid;
  v_email   text := lower(btrim(coalesce(p_signer_email, '')));
  v_name    text := btrim(coalesce(p_signer_name, ''));
  v_prior   uuid;
  v_tmpl    text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_create');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_create');

  if p_organization_id is null or p_render_id is null then
    raise exception 'custom.sign_request_create: organization_id and the document version are both required'
      using errcode = '22004';
  end if;

  select d.record_id, d.table_id, d.template_id, d.template_version, d.content_hash
    into v_doc
    from custom.doc_render d
   where d.organization_id = p_organization_id and d.id = p_render_id
     and d.deleted_at is null;
  if v_doc.record_id is null then
    raise exception 'there is no document % in this organization to ask anybody to sign', p_render_id
      using errcode = '02000',
            hint = 'A signature request is over a rendered document version. Render one first: custom.doc_render_document(organization, template, record).';
  end if;

  -- THE LADDER, ASKED WHERE THE RECORD IS KNOWN — the lesson W3-DOC's own door learned the
  -- hard way (`custom.doc_sign` once named a parameter it did not have and died on line nine).
  perform custom.assert_client_may_change(p_organization_id, v_doc.record_id,
                                          'custom.sign_request_create',
                                          'editor'::public.permission_level, 'record');

  -- VAL-10: THE FIELD IS NAMED WHEN THE ASK IS MADE, not when the signature arrives, so
  -- nobody can be asked for one signature and made to give another.
  select f.data into v_field
    from custom.field f
   where f.organization_id = p_organization_id
     and f.entity_definition_id = v_doc.table_id
     and f.key = p_field_key;
  if v_field is null then
    raise exception 'there is no field "%" on the table this document was rendered from', p_field_key
      using errcode = '23503', hint = 'VAL-10: a signature is a Value, so it belongs to a Field.';
  end if;
  if not custom.doc_signature_field_ok(v_field) then
    raise exception '"%" is a % field, and a signature is written on a text field whose format is signature',
                    coalesce(v_field ->> 'label', p_field_key), coalesce(v_field ->> 'type', 'nothing')
      using errcode = '23514',
            hint = format('The signature fields on this table are: %s.',
                          coalesce((select string_agg(format('%s (%s)', g.label, g.key), ', ' order by g.sort, g.key)
                                      from custom.field g
                                     where g.organization_id = p_organization_id
                                       and g.entity_definition_id = v_doc.table_id
                                       and custom.doc_signature_field_ok(g.data)),
                                   'none yet - declare one with type text and format signature'));
  end if;

  -- ALREADY SIGNED IS NOT A THING TO ASK ABOUT. `custom.doc_sign` would refuse at the end of
  -- the journey; refusing here means the client never gets a link that was never going to work.
  select s.id into v_prior
    from custom.doc_signature s
   where s.organization_id = p_organization_id
     and s.record_id = v_doc.record_id
     and s.field_key = p_field_key
     and s.deleted_at is null
   limit 1;
  if v_prior is not null then
    raise exception '"%" on this record is already signed, so there is nothing left to ask for',
                    coalesce(v_field ->> 'label', p_field_key)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed. A further agreement is a further Field with its own signature, or a further document version with its own seal.';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'a signature request has to be addressed to somebody, and "%" is not an email address', p_signer_email
      using errcode = '23514';
  end if;
  if v_name = '' then
    raise exception 'a signature request has to name who is being asked to sign'
      using errcode = '23514',
            hint = 'The name is shown on the signing page so the person opening the link can see they are the one who was meant to.';
  end if;

  v_expires := now() + coalesce(p_expires_in, interval '14 days');
  if v_expires <= now() then
    raise exception 'a signing link has to expire in the future, and % is not', v_expires
      using errcode = '22023';
  end if;

  -- THE SIGNER'S ACCOUNT, IF THERE IS ONE. A member signing in the app and an outsider
  -- (VIS-31's external principal) reach the same link; the difference is only that we can tell
  -- the first one about it through the notification system. No account is the normal case and
  -- is never an obstacle.
  select u.id into v_signer from auth.users u where lower(u.email) = v_email limit 1;

  select coalesce(r.data ->> 'name', 'a document') into v_tmpl
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_doc.template_id
     and r.data_class = 'doc_template';

  v_secret := extensions.gen_random_bytes(32);
  v_id := extensions.gen_random_uuid();

  insert into custom.record (organization_id, id, table_id, data_class, data)
  values (p_organization_id, v_id, null, 'sign_request', jsonb_strip_nulls(jsonb_build_object(
    'render_id',        p_render_id,
    'record_id',        v_doc.record_id,
    'table_id',         v_doc.table_id,
    'template_id',      v_doc.template_id,
    'document_title',   v_tmpl,
    'field_key',        p_field_key,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_user_id',   v_signer,
    'token_hash',       encode(sha256(convert_to(
                          custom.sign_token_encode(
                            decode(replace(p_organization_id::text, '-', ''), 'hex')
                            || decode(replace(v_id::text, '-', ''), 'hex')
                            || v_secret), 'UTF8')), 'hex'),
    'document_hash',    v_doc.content_hash,
    'document_version', v_doc.template_version,
    'sent_at',          now(),
    'expires_at',       v_expires,
    'bad_attempts',     0,
    'reminder_count',   0)));

  v_token := custom.sign_token_encode(
               decode(replace(p_organization_id::text, '-', ''), 'hex')
               || decode(replace(v_id::text, '-', ''), 'hex')
               || v_secret);

  -- THE ONE AND ONLY TIME THE SECRET EXISTS OUTSIDE THE SIGNER'S EMAIL.
  return jsonb_build_object(
    'request_id',       v_id,
    'token',            v_token,
    'path',             '/sign/' || v_token,
    'signer_email',     v_email,
    'signer_name',      v_name,
    'signer_has_account', v_signer is not null,
    'document_title',   v_tmpl,
    'document_version', v_doc.template_version,
    'document_hash',    v_doc.content_hash,
    'expires_at',       v_expires,
    'state',            'sent');
end;
$$;

comment on function custom.sign_request_create(uuid, uuid, text, text, text, interval) is
  'ESIGN / PRODUCTS row 16: ask one person to sign one rendered document version. Returns the link''s secret exactly once; the store keeps only its SHA-256.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE OWNER'S SIDE — the requests on a record, and stopping one
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function custom.sign_requests(p_organization_id uuid, p_record_id uuid)
returns table (
  request_id       uuid,
  render_id        uuid,
  record_id        uuid,
  field_key        text,
  document_title   text,
  signer_name      text,
  signer_email     text,
  signer_has_account boolean,
  state            text,
  sentence         text,
  document_version integer,
  document_hash    text,
  sent_at          timestamptz,
  expires_at       timestamptz,
  viewed_at        timestamptz,
  signed_at        timestamptz,
  declined_at      timestamptz,
  invalidated_at   timestamptz,
  signature_id     uuid,
  signature_mark   text,
  reminder_count   integer)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_requests');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_requests');
  -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT (DOORS-TWO's rule). `viewer` on the
  -- record, asked here as the definer, after the ladder has spoken.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.sign_requests',
                                          'viewer'::public.permission_level, 'record');

  return query
  select r.id,
         (r.data ->> 'render_id')::uuid,
         (r.data ->> 'record_id')::uuid,
         r.data ->> 'field_key',
         r.data ->> 'document_title',
         r.data ->> 'signer_name',
         r.data ->> 'signer_email',
         (r.data ? 'signer_user_id'),
         custom.sign_request_state(r.data),
         custom.sign_request_sentence(r.data),
         (r.data ->> 'document_version')::integer,
         r.data ->> 'document_hash',
         (r.data ->> 'sent_at')::timestamptz,
         (r.data ->> 'expires_at')::timestamptz,
         (r.data ->> 'viewed_at')::timestamptz,
         (r.data ->> 'signed_at')::timestamptz,
         (r.data ->> 'declined_at')::timestamptz,
         (r.data ->> 'invalidated_at')::timestamptz,
         (r.data ->> 'signature_id')::uuid,
         r.data ->> 'signature_mark',
         coalesce((r.data ->> 'reminder_count')::integer, 0)
    from custom.record r
   where r.organization_id = p_organization_id
     and r.data_class = 'sign_request'
     and r.data ->> 'record_id' = p_record_id::text
     and r.deleted_at is null
   order by (r.data ->> 'sent_at')::timestamptz desc;
end;
$$;

comment on function custom.sign_requests(uuid, uuid) is
  'ESIGN: every signature request on one record, with its state and the one sentence that describes it. Viewer on the record.';

create or replace function custom.sign_request_cancel(
  p_organization_id uuid, p_request_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_cancel');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_cancel');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_cancel',
                                          'editor'::public.permission_level, 'record');

  -- A FINISHED ANSWER IS NOT CANCELLED. Signed is signed; declined is an answer too.
  if custom.sign_request_state(v_r.data) in ('signed', 'declined') then
    raise exception 'this request was already answered - %', custom.sign_request_sentence(v_r.data)
      using errcode = '23505',
            hint = 'VAL-10: a signature is immutable once signed, and a decline is an answer rather than a failure. Ask again with a new document version if the agreement changed.';
  end if;

  update custom.record r
     set data = r.data || jsonb_build_object(
           'invalidated_at', now(),
           'invalidation_reason', coalesce(nullif(btrim(p_reason), ''),
             'This signature request was withdrawn by the organization that sent it, so the link no longer works.'))
   where r.organization_id = p_organization_id and r.id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'state', 'invalidated');
end;
$$;

comment on function custom.sign_request_cancel(uuid, uuid, text) is
  'ESIGN: withdraw a signature request that has not been answered. Editor on the record.';

create or replace function custom.sign_request_remind(p_organization_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r     record;
  v_state text;
  v_n     uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.sign_request_remind');
  perform custom.assert_store_door(p_organization_id, 'custom.sign_request_remind');

  select r.id, r.data into v_r
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_request_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_r.id is null then
    raise exception 'there is no signature request % in this organization', p_request_id
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, (v_r.data ->> 'record_id')::uuid,
                                          'custom.sign_request_remind',
                                          'editor'::public.permission_level, 'record');

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    -- NOTHING FAILS SILENTLY, AND NOTHING PRETENDS EITHER. There is nothing to remind about.
    return jsonb_build_object('reminded', false, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- REMINDERS GO THROUGH THE NOTIFICATION SYSTEM THAT ALREADY EXISTS — `custom.agg_deliver`,
  -- which writes `communication.notification`, the one sender with the one retry policy. Its
  -- dedupe key is (rule, record, day), so passing the REQUEST as the rule holds this to one
  -- reminder per request per day without a counter anybody has to trust.
  if (v_r.data ->> 'signer_user_id') is null then
    -- ABSENT, NEVER DEAD. We cannot notify somebody who has no account here, and the store
    -- says so in words rather than returning a cheerful null.
    return jsonb_build_object(
      'reminded', false, 'state', v_state,
      'message', format('%s does not have an account here, so there is nothing to send them through the app. Send them the signing link again yourself - it is the same link, and it works until %s.',
                        v_r.data ->> 'signer_email',
                        to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')));
  end if;

  v_n := custom.agg_deliver(
    p_organization_id, p_request_id, (v_r.data ->> 'record_id')::uuid, 'in_app',
    (v_r.data ->> 'signer_user_id')::uuid, 'custom.signature.reminder',
    format('Still waiting on your signature: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
    format('%s is waiting for you to sign %s. The link works until %s.',
           coalesce(v_r.data ->> 'signer_name', 'Somebody'),
           coalesce(v_r.data ->> 'document_title', 'a document'),
           to_char((v_r.data ->> 'expires_at')::timestamptz, 'FMDD FMMonth YYYY')),
    jsonb_build_object('sign_request_id', p_request_id, 'source', 'signature'));

  update custom.record r
     set data = r.data || jsonb_build_object(
           'reminded_at', now(),
           'reminder_count', coalesce((r.data ->> 'reminder_count')::integer, 0) + 1)
   where r.organization_id = p_organization_id and r.id = p_request_id;

  return jsonb_build_object('reminded', true, 'state', v_state, 'notification_id', v_n,
                            'message', 'Reminder sent.');
end;
$$;

comment on function custom.sign_request_remind(uuid, uuid) is
  'ESIGN: nudge a signer who has not answered, through communication.notification - the one notification system. Editor on the record.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE SIGNER'S SIDE — three SERVER-LANE doors. A browser holds no key to this store; the
-- server does, for the reason `custom.form_public` and `custom.form_submit` are server-lane:
-- the ORIGIN, the ADDRESS and the BROWSER are things the server knows and a browser can only
-- assert, and they are part of what a signature certificate means.
-- ═══════════════════════════════════════════════════════════════════════════════════════

create or replace function custom._sign_request_resolve(p_token text)
returns table (organization_id uuid, request_id uuid, data jsonb, ok boolean)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_b   bytea := custom.sign_token_decode(p_token);
  v_org uuid;
  v_id  uuid;
  v_d   jsonb;
  v_n   integer;
begin
  if v_b is null then
    return;                      -- a link that is not one of ours resolves to nothing at all
  end if;
  v_org := encode(substring(v_b from 1 for 16), 'hex')::uuid;
  v_id  := encode(substring(v_b from 17 for 16), 'hex')::uuid;

  -- THE POINT READ. `custom.record`'s primary key is (organization_id, id) and the store is
  -- hash partitioned on organization_id, so this prunes to ONE partition. That is the whole
  -- reason the token carries its own address.
  select r.data into v_d
    from custom.record r
   where r.organization_id = v_org and r.id = v_id
     and r.data_class = 'sign_request' and r.deleted_at is null;
  if v_d is null then
    return;
  end if;

  if (v_d ->> 'token_hash') is distinct from encode(sha256(convert_to(p_token, 'UTF8')), 'hex') then
    -- DECISION 6: the wrong secret aimed at a real request is counted, and at ten the request
    -- is stopped. The caller still gets nothing back, so this leaks no fact about the request.
    v_n := coalesce((v_d ->> 'bad_attempts')::integer, 0) + 1;
    update custom.record r
       set data = r.data || jsonb_build_object('bad_attempts', v_n)
                         || case when v_n >= 10 and not (r.data ? 'signed_at')
                                   and not (r.data ? 'declined_at') and not (r.data ? 'invalidated_at')
                                 then jsonb_build_object(
                                   'invalidated_at', now(),
                                   'invalidation_reason', 'This link was tried with the wrong address ten times, so it was stopped. Ask whoever sent it for a new one.')
                                 else '{}'::jsonb end
     where r.organization_id = v_org and r.id = v_id;
    return;
  end if;

  organization_id := v_org; request_id := v_id; data := v_d; ok := true;
  return next;
end;
$$;

comment on function custom._sign_request_resolve(text) is
  'ESIGN: token -> (organization, request, data), or nothing. A wrong secret aimed at a real request is counted and, at ten, stops it.';

create or replace function custom.sign_request_public(p_token text, p_origin text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r      record;
  v_state  text;
  v_fresh  text;
  v_hash   text;
  v_body   text;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    -- ONE ANSWER FOR FOUR QUESTIONS, ON PURPOSE: a link that was never ours, one whose request
    -- is gone, one whose secret is wrong, and one in an organization whose store is switched
    -- off. Telling them apart would make the link a way to learn that something is there.
    return jsonb_build_object('found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_public');

  v_state := custom.sign_request_state(v_r.data);

  -- DECISION 4, ON EVERY OPEN: has the record moved since the ask?
  if v_state in ('sent', 'viewed') then
    v_fresh := custom.doc_render_body(v_r.organization_id,
                                      (v_r.data ->> 'template_id')::uuid,
                                      (v_r.data ->> 'record_id')::uuid);
    v_hash := custom.doc_content_hash(v_fresh);
    if v_hash is distinct from (v_r.data ->> 'document_hash') then
      update custom.record r
         set data = r.data || jsonb_build_object(
               'invalidated_at', now(),
               'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
       where r.organization_id = v_r.organization_id and r.id = v_r.request_id
      returning r.data into v_r.data;
      v_state := 'invalidated';
    end if;
  end if;

  -- VIEWED IS WRITTEN ONCE. "They have seen it" is the fact; "they looked again" is not.
  if v_state = 'sent' then
    update custom.record r
       set data = r.data || jsonb_build_object('viewed_at', now())
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
       and not (r.data ? 'viewed_at')
    returning r.data into v_r.data;
    v_state := 'viewed';
  end if;

  -- THE DOCUMENT IS THE FROZEN ONE. What the signer reads is the text that was rendered when
  -- the ask was made and whose hash they will be sealing - never a fresh render, which is the
  -- whole difference between a signature and a screenshot.
  select d.body into v_body
    from custom.doc_render d
   where d.organization_id = v_r.organization_id
     and d.id = (v_r.data ->> 'render_id')::uuid;

  return jsonb_build_object(
    'found',            true,
    'state',            v_state,
    'signable',         v_state in ('sent', 'viewed'),
    'message',          case when v_state in ('sent','viewed') then null
                             else custom.sign_request_sentence(v_r.data) end,
    'document_title',   v_r.data ->> 'document_title',
    'document_version', (v_r.data ->> 'document_version')::integer,
    'document_hash',    v_r.data ->> 'document_hash',
    'body',             coalesce(v_body, ''),
    'signer_name',      v_r.data ->> 'signer_name',
    'signer_email',     v_r.data ->> 'signer_email',
    'expires_at',       v_r.data ->> 'expires_at',
    'signed_name',      v_r.data ->> 'signed_name',
    'signed_at',        v_r.data ->> 'signed_at');
end;
$$;

comment on function custom.sign_request_public(text, text) is
  'ESIGN: what the signing page shows. Server lane. Marks the request viewed on the first open and invalidates it if the record moved since the ask.';

create or replace function custom.sign_request_sign(
  p_token       text,
  p_signed_name text,
  p_mark        text,
  p_image       text default null,
  p_ip          text default null,
  p_user_agent  text default null,
  p_origin      text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r       record;
  v_state   text;
  v_fresh   text;
  v_hash    text;
  v_name    text := btrim(coalesce(p_signed_name, ''));
  v_mark    text := lower(btrim(coalesce(p_mark, 'typed')));
  v_file    uuid;
  v_sig     uuid;
  v_held    text;
  v_asker   uuid;
  v_src     jsonb;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    return jsonb_build_object('signed', false, 'found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_sign');

  if v_mark not in ('typed', 'drawn') then
    raise exception 'a signature is typed or drawn, and "%" is neither', p_mark
      using errcode = '23514',
            hint = 'A third way of signing would be a third thing every screen that shows a signature has to know how to draw.';
  end if;
  if v_name = '' then
    raise exception 'Please type your name as you sign.'
      using errcode = '22004',
            hint = 'VAL-10: the signature IS the Value on the record, and its text is the name the signer gave.';
  end if;
  if v_mark = 'drawn' and coalesce(p_image, '') !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]{64,}$' then
    raise exception 'The drawing did not arrive. Please sign again.'
      using errcode = '22023',
            hint = 'A drawn signature reaches this door as a data: URL holding a PNG or a JPEG.';
  end if;

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    return jsonb_build_object('signed', false, 'found', true, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- DECISION 4 AGAIN, AT THE MOMENT OF SIGNING. The open may have been ten minutes ago.
  v_fresh := custom.doc_render_body(v_r.organization_id,
                                    (v_r.data ->> 'template_id')::uuid,
                                    (v_r.data ->> 'record_id')::uuid);
  v_hash := custom.doc_content_hash(v_fresh);
  if v_hash is distinct from (v_r.data ->> 'document_hash') then
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at', now(),
             'invalidation_reason', 'This document changed after it was sent for signature, so this link no longer works. Whoever sent it needs to send the new version.')
     where r.organization_id = v_r.organization_id and r.id = v_r.request_id
    returning r.data into v_r.data;
    return jsonb_build_object('signed', false, 'found', true, 'state', 'invalidated',
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- THE DRAWN MARK IS A FILE, because that is what an image is on this platform (REC-27) and
  -- because a signature people can see has to be a thing the rest of the system can show,
  -- print and attach - never a blob wedged into one feature's own column.
  if v_mark = 'drawn' then
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_r.organization_id, custom.file_kernel_id(), 'record', jsonb_build_object(
      'name',        format('Signature of %s', v_name),
      'mime_type',   split_part(split_part(p_image, ';', 1), ':', 2),
      'content',     p_image,
      'byte_size',   length(p_image),
      'kind',        'signature'))
    returning id into v_file;
  end if;

  -- DECISION 7. `custom.doc_sign` asks `editor` on the record and a signer has no principal at
  -- all, so the session takes the claims of the person who ASKED for exactly this one call and
  -- gives them back afterwards, exception path included. What gets written is the SIGNER's
  -- name and the SIGNER's provenance; the borrowed principal is only the right to write it.
  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id;
  v_held := current_setting('request.jwt.claims', true);
  begin
    if custom.query_principal() is null and v_asker is not null then
      perform set_config('request.jwt.claims',
                         jsonb_build_object('sub', v_asker, 'role', 'authenticated')::text, true);
    end if;

    v_sig := custom.doc_sign(v_r.organization_id, (v_r.data ->> 'render_id')::uuid,
                             v_r.data ->> 'field_key', v_name,
                             (v_r.data ->> 'signer_user_id')::uuid);

    -- THE SIGNBLOCK, COMPLETED. `custom.doc_sign` writes the Value with the render, the
    -- template, the document version and the document hash. The rest of what a certificate
    -- means - who, by what address, from where, on what browser, drawn or typed, and the
    -- drawing itself - is written here, onto the SAME Value, in the SAME transaction, by the
    -- SAME act. It is a completion of one signature's provenance, not a later actor editing a
    -- sealed one: `custom.doc_sign` refuses any second signature on this Field from here on.
    v_src := jsonb_strip_nulls(jsonb_build_object(
      'kind',             'signature',
      'request_id',       v_r.request_id,
      'render_id',        (v_r.data ->> 'render_id')::uuid,
      'template_id',      (v_r.data ->> 'template_id')::uuid,
      'document_version', (v_r.data ->> 'document_version')::integer,
      'document_hash',    v_r.data ->> 'document_hash',
      'signature_id',     v_sig,
      'signer_name',      v_name,
      'signer_email',     v_r.data ->> 'signer_email',
      'signer_user_id',   (v_r.data ->> 'signer_user_id')::uuid,
      'signed_at',        now(),
      'mark',             v_mark,
      'signature_file_id', v_file,
      'ip',               nullif(btrim(coalesce(p_ip, '')), ''),
      'user_agent',       left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512),
      'origin',           nullif(btrim(coalesce(p_origin, '')), '')));

    perform custom.record_update(v_r.organization_id, (v_r.data ->> 'record_id')::uuid,
      jsonb_build_object(
        '_actor', 'user',
        v_r.data ->> 'field_key', to_jsonb(v_name),
        '_values', jsonb_build_object(v_r.data ->> 'field_key',
                                      jsonb_build_object('src', v_src))));

    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    raise;
  end;

  update custom.record r
     set data = jsonb_strip_nulls(r.data || jsonb_build_object(
           'signed_at',         now(),
           'signed_name',       v_name,
           'signature_id',      v_sig,
           'signature_file_id', v_file,
           'signature_mark',    v_mark,
           'signer_ip',         nullif(btrim(coalesce(p_ip, '')), ''),
           'signer_user_agent', left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512)))
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id
  returning r.data into v_r.data;

  -- THE PERSON WHO ASKED IS TOLD, through the one notification system.
  if v_asker is not null then
    perform custom.agg_deliver(
      v_r.organization_id, v_r.request_id, (v_r.data ->> 'record_id')::uuid, 'in_app', v_asker,
      'custom.signature.signed',
      format('Signed: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
      format('%s signed %s.', v_name, coalesce(v_r.data ->> 'document_title', 'the document')),
      jsonb_build_object('sign_request_id', v_r.request_id, 'signature_id', v_sig,
                         'source', 'signature'));
  end if;

  return jsonb_build_object('signed', true, 'found', true, 'state', 'signed',
                            'signature_id', v_sig, 'signature_file_id', v_file,
                            'document_hash', v_r.data ->> 'document_hash',
                            'message', custom.sign_request_sentence(v_r.data));
end;
$$;

comment on function custom.sign_request_sign(text, text, text, text, text, text, text) is
  'ESIGN / VAL-10: the signer signs. Writes the Value on the record with full provenance through custom.doc_sign plus this lane''s completion, the seal, the drawn image as a File, and the request''s own answer. Server lane.';

create or replace function custom.sign_request_decline(
  p_token text, p_reason text default null, p_ip text default null, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_r     record;
  v_state text;
  v_asker uuid;
begin
  select * into v_r from custom._sign_request_resolve(p_token) limit 1;
  if v_r.ok is not true then
    return jsonb_build_object('declined', false, 'found', false,
      'message', 'This signing link does not work. It may have been mistyped, or it may have been replaced by a newer one.');
  end if;
  perform custom.assert_store_door(v_r.organization_id, 'custom.sign_request_decline');

  v_state := custom.sign_request_state(v_r.data);
  if v_state not in ('sent', 'viewed') then
    return jsonb_build_object('declined', false, 'found', true, 'state', v_state,
                              'message', custom.sign_request_sentence(v_r.data));
  end if;

  -- A DECLINE IS AN ANSWER, NOT A FAILURE, and it ends the request as finally as a signature
  -- does. No hash check: somebody saying no to a document that has since changed is still no.
  update custom.record r
     set data = jsonb_strip_nulls(r.data || jsonb_build_object(
           'declined_at',       now(),
           'decline_reason',    nullif(btrim(coalesce(p_reason, '')), ''),
           'signer_ip',         nullif(btrim(coalesce(p_ip, '')), ''),
           'signer_user_agent', left(nullif(btrim(coalesce(p_user_agent, '')), ''), 512)))
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id
  returning r.data into v_r.data;

  select r.created_by into v_asker
    from custom.record r
   where r.organization_id = v_r.organization_id and r.id = v_r.request_id;
  if v_asker is not null then
    perform custom.agg_deliver(
      v_r.organization_id, v_r.request_id, (v_r.data ->> 'record_id')::uuid, 'in_app', v_asker,
      'custom.signature.declined',
      format('Declined: %s', coalesce(v_r.data ->> 'document_title', 'a document')),
      custom.sign_request_sentence(v_r.data),
      jsonb_build_object('sign_request_id', v_r.request_id, 'source', 'signature'));
  end if;

  return jsonb_build_object('declined', true, 'found', true, 'state', 'declined',
                            'message', custom.sign_request_sentence(v_r.data));
end;
$$;

comment on function custom.sign_request_decline(text, text, text, text) is
  'ESIGN: the signer says no, with or without a reason, and the person who asked is told. Server lane.';

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE DOOR ROWS. Declared BEFORE any grant (lessons ledger 1 and 24), so the guard that
-- sweeps DEFINER functions finds the declaration rather than revoking the grant behind it.
-- ═══════════════════════════════════════════════════════════════════════════════════════

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_create',
        'p_organization_id uuid, p_render_id uuid, p_field_key text, p_signer_email text, p_signer_name text, p_expires_in interval',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'interval'::regtype]::oid[],
        'PRODUCTS row 16. p_organization_id is checked by custom.assert_client_may_reach on entry; NULL is refused there. p_render_id is resolved together with the organization against custom.doc_render, so another tenant''s document reads as absent and is refused by name; the record it names is then checked by custom.assert_client_may_change at editor, which is the level asking the world to sign something about a record costs. p_field_key must name a Field of that document''s own Table whose type is text and whose format is signature, refused by name with the signature Fields that DO exist. p_signer_email must look like an address and p_signer_name must not be blank, both refused with 23514. p_expires_in defaults to fourteen days and an expiry in the past is refused with 22023. custom.assert_store_door resolves the custom/system_enabled guard. It returns the link''s secret exactly once; the store keeps only its SHA-256.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        null, true, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_requests',
        'p_organization_id uuid, p_record_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'PRODUCTS row 16. p_organization_id is checked by custom.assert_client_may_reach on entry. p_record_id is then checked by custom.assert_client_may_change at viewer, so a record this caller may not see is refused by name before any row is read. A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: custom.record holds no client SELECT and the rows are narrowed by organization_id, data_class and record inside the definer. It returns the request and its state - never the link, whose secret is not stored at all.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        null, true, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_cancel',
        'p_organization_id uuid, p_request_id uuid, p_reason text',
        array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype]::oid[],
        'PRODUCTS row 16. p_organization_id is checked by custom.assert_client_may_reach on entry. p_request_id is resolved together with the organization and with data_class = ''sign_request'', so another tenant''s request reads as absent and is refused by name; the record it is about is then checked by custom.assert_client_may_change at editor. A request that was already signed or declined is refused with 23505, because VAL-10 makes a signature immutable and a decline is an answer rather than a failure. p_reason is free text shown to the signer verbatim; blank means the door''s own sentence.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        null, true, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_remind',
        'p_organization_id uuid, p_request_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'PRODUCTS row 16. The same two checks as custom.sign_request_cancel - reach on the organization, editor on the record the request is about, after the request has been resolved within the tenant. It writes nothing but the reminder count and delivers through custom.agg_deliver into communication.notification, the one notification system, whose own dedupe key holds this to one reminder per request per day. A signer with no account here is answered in words rather than with a silent null.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        null, true, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_public',
        'p_token text, p_origin text',
        array['text'::regtype, 'text'::regtype]::oid[],
        'PRODUCTS row 16. p_token is the WHOLE authority: 64 base64url characters carrying the organization, the request and 256 bits of secret, of which only the SHA-256 is stored. Anything that is not one of ours, a request that is gone, a wrong secret and an organization whose store is switched off all answer with the same single sentence, so the link cannot be used to learn that anything is there. A wrong secret aimed at a real request is counted and stops that request at ten. p_origin is recorded, never trusted.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: the ORIGIN of a request and the address of the caller are things the server knows and a browser can only assert, and both are part of what a signature certificate means - the same reason custom.form_public and custom.form_submit are server-lane. Schema custom is revoked from PUBLIC, anon, authenticated and service_role by default; the grant this door holds is to service_role alone, the role behind SUPABASE_SECRET_KEY, which never leaves the app''''s own server process. anon gains nothing.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_sign',
        'p_token text, p_signed_name text, p_mark text, p_image text, p_ip text, p_user_agent text, p_origin text',
        array['text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'PRODUCTS row 16 / VAL-10. p_token as for custom.sign_request_public. p_signed_name is what the signer typed and becomes the Value''s own text; blank is refused with 22004. p_mark is ''typed'' or ''drawn'' and anything else is refused with 23514. p_image is required when p_mark is ''drawn'' and must be a PNG or JPEG data URL, refused with 22023; it becomes a File Record of that organization. The document is re-rendered and its hash compared before anything is written, so a record that moved after the ask invalidates the request instead of being signed. The Value and the seal are written by custom.doc_sign, which refuses a second signature on the same Field.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: p_ip and p_user_agent must be read from the request by the server rather than taken from a body a browser wrote, because they are part of what the signature certificate means. Same lane and same grant as custom.sign_request_public; anon gains nothing.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_decline',
        'p_token text, p_reason text, p_ip text, p_user_agent text',
        array['text'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'PRODUCTS row 16. p_token as for custom.sign_request_public. p_reason is free text in the signer''s own words, optional, shown to the owner verbatim. No hash check: somebody saying no to a document that has since changed is still saying no. It writes only the request''s own answer and tells the person who asked.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: same lane, same grant and the same reason as custom.sign_request_sign. anon gains nothing.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_token_encode',
        'p_bytes bytea',
        array['bytea'::regtype]::oid[],
        'ESIGN: base64url without padding, the signing link''s one encoding.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: pure, makes no access decision, and is called only by the doors above.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_token_decode',
        'p_token text',
        array['text'::regtype]::oid[],
        'ESIGN: the inverse, for the 64-byte signing token only. Null for anything that is not one, because a malformed link is a link that does not work rather than an error.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: pure, makes no access decision, and is called only by the doors above.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_state',
        'p_data jsonb',
        array['jsonb'::regtype]::oid[],
        'ESIGN: sent / viewed / signed / declined / invalidated / expired, derived from the request Record so the state can never disagree with itself.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: pure, makes no access decision, and is called only by the doors above.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'sign_request_sentence',
        'p_data jsonb',
        array['jsonb'::regtype]::oid[],
        'ESIGN: the one English sentence for a request''s state, read by the signing page, the owner''s list and the agent alike.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: pure, makes no access decision, and is called only by the doors above.', false, false)
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_sign_request_resolve',
        'p_token text',
        array['text'::regtype]::oid[],
        'ESIGN: token to request, by a point read on custom.record''s own primary key (organization_id, id) - which is why the token carries its own address. A wrong secret aimed at a real request is counted on that request and stops it at ten, and the caller is still told nothing.',
        'esign_asking_somebody_to_sign_is_a_door.sql',
        'server_only: called only by the three server-lane doors above, inside the same transaction, and never granted to anybody.', false, false)
on conflict do nothing;
