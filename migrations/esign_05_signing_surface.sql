-- E-sign C7 — migration 5 of 6 (register item HRB-011, lane core-c7-esign).
--
-- THE SIGNING SURFACE: preview → consent → adopt → SIGN, plus decline, delegate and download —
-- ONE implementation behind TWO doors, the outsider session (§3.2/§5.4) and the platform session
-- (§3.1/§6.0 U-03). Carries §4.3's five-condition precondition, under which a typed name alone is
-- impossible.
--
-- Authority: SPEC-ESIGN §3.1, §3.2, §3.3, §3.5, §4.1–§4.3, §5.3–§5.5, §6.0. Applied live as
-- `esign_05_signing_surface`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 ONE IMPLEMENTATION, TWO DOORS. §3.1 and §3.2 describe the same act performed by two kinds
--    of actor. Writing them twice would mean §4.3's five conditions exist twice and drift on the
--    first spec change — the exact defect HRB-008 avoided by making its resolver end in the same
--    predicate the gate uses. Each `esign._act_*` takes a resolved actor CONTEXT; the two doors
--    resolve that context and nothing else. An internal signer's `auth_method` is `session` and
--    their `verification_factor` is recorded as `session` on the certificate, because that is
--    literally how they were authenticated.
--
-- 2. 🚨 AN UNVERIFIED OUTSIDER SESSION CANNOT SIGN, AND assert_outsider_scope DOES NOT CHECK THAT.
--    Read live: platform.assert_outsider_scope validates the session's existence, expiry and
--    revocation and the scope grant — it never looks at platform.actor_session.verified_at. §4.3
--    condition 3 says "an unverified token can never sign", so this lane checks verified_at itself
--    whenever the token declares a factor other than `none`. Assuming a helper enforces something
--    it does not is how §8.4 case 26 ships broken.
--
-- 3. 🚨 THE OUTSIDER REGISTRY'S readable_columns ARE REPOINTED AT COLUMNS THAT EXIST. Recorded in
--    migration 01 decision 2 and paid here, where the projection that consumes them lives:
--    esign_envelope_document `file_name` → `name`; esign_envelope_signer
--    `signer_name/signer_email/order_index` → `full_name/email/position`. Three UPDATEs to
--    readable_columns only. No purpose row, no allowed_actions, no TTL, no verification factor and
--    no new registry row is touched — SPEC-ESIGN §9 says the lane is seeded and it is.
--
-- 4. THE PROJECTION IS THE ALLOWLIST, MECHANICALLY (§5.3 law 3). `esign._project` builds an outsider
--    response by selecting `readable_columns` out of the row's jsonb — it never returns
--    `to_jsonb(row)` minus something, because a subtractive rule silently widens the moment a
--    sensitive column is added to the table.
--
-- 5. DELEGATION CREATES A ROW AND REVOKES A TOKEN, IN ONE TRANSACTION (§2.4/§3.5). The original
--    signer becomes `delegated` (terminal for them), their token is revoked so a forwarded link
--    cannot still sign, and the delegate is a NEW signer row at the same position — evidence keeps
--    both, because who was asked and who actually signed are different facts.
--
-- 7. 🚨 IP PINNING IS RECORDED BY THE LANE AND ENFORCED BY NOBODY, SO THIS FAMILY ENFORCES IT.
--    §5.7 rule 6 says outsider sessions are IP-pinned by default. Read live: `outsider_verify`
--    STORES the issuing IP on platform.actor_session when the purpose declares `ip_pinned`, and
--    `platform.assert_outsider_scope` never compares it to anything — so a stolen session secret
--    works from any address on every purpose in the lane. `esign._ctx_outsider` compares the
--    caller's IP to the session's and refuses on a mismatch, uniformly. This closes it for the
--    signing family only. DEBT, OWNER = the access lane (HRB-007): the comparison belongs in
--    assert_outsider_scope, where all eight purposes get it.
--
-- 8. THE DOWNLOAD DOOR ASSERTS THE `download` VERB ON THE DOCUMENT, not merely `read` on the signer
--    row. The registry declares `download` on esign_envelope_document for a reason; checking the
--    weaker grant would mean the stronger one is decorative.
--
-- 6. DOWNLOADS RETURN A TICKET, NOT A URL. §2.8 forbids a new store and a new ACL, and Postgres
--    cannot mint a signed storage URL. The RPC authorises the download, writes the `downloaded`
--    event with IP and user-agent, and returns the file id, version and a TTL taken from
--    `esign.download.url_ttl_seconds`; the file service exchanges that for the short-lived signed
--    URL exactly as it does for every other file on the platform. An outsider never receives a
--    durable file URL from this layer, which is the property §2.8 actually asks for.
-- ===================================================================================

set local statement_timeout = '300s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. RECORDED DECISION 3 — the allowlist correction.
-- ---------------------------------------------------------------------------------
update platform.outsider_consumer
   set readable_columns = ARRAY['id','name','position','content_hash','hash_algorithm','byte_size','page_count','mime_type','is_frozen']
 where consumer_key = 'esign.signer' and resource = 'esign_envelope_document'
   and readable_columns is distinct from ARRAY['id','name','position','content_hash','hash_algorithm','byte_size','page_count','mime_type','is_frozen'];

update platform.outsider_consumer
   set readable_columns = ARRAY['id','status','full_name','email','position','role','document_previewed_at','consented_at','signed_at','signature_kind','typed_name']
 where consumer_key = 'esign.signer' and resource = 'esign_envelope_signer'
   and readable_columns is distinct from ARRAY['id','status','full_name','email','position','role','document_previewed_at','consented_at','signed_at','signature_kind','typed_name'];

update platform.outsider_consumer
   set readable_columns = ARRAY['id','title','message','status','expires_at','signing_order']
 where consumer_key = 'esign.signer' and resource = 'esign_envelope'
   and readable_columns is distinct from ARRAY['id','title','message','status','expires_at','signing_order'];

-- Every allowlisted name must resolve to a real column, or the read returns nothing forever.
do $$
declare r record; v_missing text;
begin
  for r in select oc.resource, oc.readable_columns, et.schema_name, et.table_name
             from platform.outsider_consumer oc
             join platform.entity_types et on et.token = oc.resource
            where oc.consumer_key = 'esign.signer' loop
    select string_agg(c, ', ') into v_missing from unnest(r.readable_columns) c
     where not exists (select 1 from information_schema.columns ic
                        where ic.table_schema = r.schema_name and ic.table_name = r.table_name
                          and ic.column_name = c);
    if v_missing is not null then
      raise exception 'esign_05: outsider allowlist for % names columns that do not exist: %', r.resource, v_missing;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 2. RECORDED DECISION 4 — the mechanical projection.
-- ---------------------------------------------------------------------------------
create or replace function esign._project(p_resource text, p_row jsonb)
returns jsonb
language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare v_cols text[]; c text; v_out jsonb := '{}'::jsonb;
begin
  select readable_columns into v_cols from platform.outsider_consumer
   where consumer_key = 'esign.signer' and resource = p_resource and is_active and deleted_at is null;
  if v_cols is null then
    raise exception 'esign._project: % is not a registered resource for esign.signer', p_resource
      using errcode = '22023';
  end if;
  foreach c in array v_cols loop
    v_out := v_out || jsonb_build_object(c, p_row -> c);
  end loop;
  return v_out;
end $fn$;

-- ---------------------------------------------------------------------------------
-- 3. THE TWO DOORS' CONTEXT RESOLVERS (RECORDED DECISIONS 1 and 2).
-- ---------------------------------------------------------------------------------
create or replace function esign._ctx_outsider(p_session text, p_action text, p_ip inet, p_ua text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare v_ctx jsonb; s esign.envelope_signer%rowtype; t platform.actor_token%rowtype;
        ses platform.actor_session%rowtype; v_token uuid; v_signer uuid;
begin
  -- The scope check raises 42501 on refusal. Catching it here turns a raise into the UNIFORM
  -- client-facing refusal §5.7 rule 2 requires — unknown, expired, revoked, exhausted and
  -- wrong-consumer are indistinguishable to the caller, and the true reason lives in the token
  -- ledger the lane already writes.
  begin
    select actor_token_id into v_token from platform.actor_session
     where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
    select subject_id into v_signer from platform.actor_token
     where id = v_token and consumer_key = 'esign.signer';
    v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action);
  exception when others then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
  end;

  select * into s from esign.envelope_signer where id = (v_ctx ->> 'subject_id')::uuid;
  if not found then return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid'); end if;
  select * into t from platform.actor_token where id = (v_ctx ->> 'actor_token_id')::uuid;
  select * into ses from platform.actor_session where id = (v_ctx ->> 'session_id')::uuid;

  -- RECORDED DECISION 2 — assert_outsider_scope does NOT check this.
  if t.verification_factor <> 'none' and ses.verified_at is null then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'true_reason', 'session_not_verified');
  end if;

  -- RECORDED DECISION 7 — nor does it check this. §5.7 rule 6.
  if ses.ip is not null and p_ip is not null and ses.ip <> p_ip then
    insert into platform.actor_token_event (organization_id, actor_token_id, session_id, event_type, ip, detail)
    values (t.organization_id, t.id, ses.id, 'replay_rejected', p_ip,
            jsonb_build_object('true_reason','session_ip_moved'));
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid',
                              'true_reason', 'session_ip_moved');
  end if;

  return jsonb_build_object(
    'granted', true, 'signer_id', s.id, 'envelope_id', s.envelope_id,
    'organization_id', s.organization_id,
    'actor_type', 'external_signer', 'actor_user_id', null,
    'actor_token_id', t.id, 'session_id', ses.id,
    'actor_label', s.full_name || ' <' || s.email || '>',
    'auth_method', s.auth_method,
    'verification_factor', t.verification_factor,
    'verification_passed', (t.verification_factor = 'none') or (ses.verified_at is not null),
    'ip', host(coalesce(p_ip, ses.ip)), 'user_agent', coalesce(p_ua, ses.user_agent));
end $fn$;

create or replace function esign._ctx_internal(p_signer_id uuid, p_ip inet, p_ua text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('granted', false, 'reason', 'not_authenticated');
  end if;
  select * into s from esign.envelope_signer where id = p_signer_id;
  if not found then
    raise exception 'esign: signer % does not exist', p_signer_id using errcode = 'P0002';
  end if;
  if s.actor_type <> 'internal_user' or s.signer_user_id is distinct from auth.uid() then
    -- §8.4 case 23, the internal half: you may act on YOUR signer row and no other.
    return jsonb_build_object('granted', false, 'reason', 'not_your_signer_row');
  end if;
  return jsonb_build_object(
    'granted', true, 'signer_id', s.id, 'envelope_id', s.envelope_id,
    'organization_id', s.organization_id,
    'actor_type', 'employee', 'actor_user_id', auth.uid(),
    'actor_token_id', null, 'session_id', null,
    'actor_label', s.full_name || ' <' || s.email || '>',
    'auth_method', 'session', 'verification_factor', 'session', 'verification_passed', true,
    'ip', host(p_ip), 'user_agent', p_ua);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 4. THE ACTS.
-- ---------------------------------------------------------------------------------

-- LOAD — envelope title + allowlisted documents. Refuses before the signer's turn (§3.3, case 24).
create or replace function esign._act_load(p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare e esign.envelope%rowtype; s esign.envelope_signer%rowtype; v_can jsonb; v_first boolean;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean and e.status <> 'completed' then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;

  perform esign._arm();
  v_first := s.status in ('pending','notified');
  if v_first then
    update esign.envelope_signer set status = 'opened' where id = s.id;
  end if;
  -- `opened` fires on every load; only esign_signer_preview_ack writes `viewed` (DECISION 3 of 03).
  perform esign._event(s.envelope_id, 'opened', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent');
  perform esign._disarm();

  return jsonb_build_object(
    'granted', true,
    'envelope', esign._project('esign_envelope', to_jsonb(e)),
    'me', esign._project('esign_envelope_signer',
            (select to_jsonb(r) from esign.envelope_signer r where r.id = s.id)),
    -- §5.6 A "Denied": other signers' rows, including their names beyond a display list.
    'other_signers', coalesce((select jsonb_agg(jsonb_build_object('order', o.position, 'role', o.role, 'status', o.status) order by o.position)
                                 from esign.envelope_signer o where o.envelope_id = e.id and o.id <> s.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(esign._project('esign_envelope_document', to_jsonb(d)) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'consent', (select jsonb_build_object('disclosure_id', cd.id, 'version', cd.version_label,
                                          'title', cd.title, 'text', cd.body)
                  from esign.consent_disclosure cd
                 where cd.id = nullif(e.config_snapshot ->> 'consent_disclosure_id','')::uuid),
    'signature_options', jsonb_build_object('typed', e.config_snapshot -> 'allow_typed',
                                            'drawn', e.config_snapshot -> 'allow_drawn'),
    'branding', e.config_snapshot -> 'branding');
end $fn$;

-- PREVIEW ACK — the ESIGN §101(c) demonstration, implemented literally (§4.1).
create or replace function esign._act_preview_ack(p_ctx jsonb, p_document_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; v_can jsonb; v_unseen int;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if not exists (select 1 from esign.envelope_document
                  where id = p_document_id and envelope_id = s.envelope_id) then
    return jsonb_build_object('granted', false, 'reason', 'unknown_document');
  end if;

  perform esign._arm();
  perform esign._event(s.envelope_id, 'viewed', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_document_id => p_document_id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent');
  -- document_previewed_at is set only when EVERY document has actually rendered in this session.
  select count(*) into v_unseen from esign.envelope_document d
   where d.envelope_id = s.envelope_id
     and not exists (select 1 from esign.envelope_event v
                      where v.signer_id = s.id and v.document_id = d.id and v.event_type = 'viewed');
  if v_unseen = 0 and s.document_previewed_at is null then
    update esign.envelope_signer set status = case when status = 'opened' then 'viewed' else status end,
                                     document_previewed_at = now()
     where id = s.id;
  else
    update esign.envelope_signer set status = case when status = 'opened' then 'viewed' else status end
     where id = s.id;
  end if;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'documents_unseen', v_unseen,
                            'previewed_at', (select document_previewed_at from esign.envelope_signer where id = s.id));
end $fn$;

-- CONSENT (§4.1).
create or replace function esign._act_consent(p_ctx jsonb, p_disclosure_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; cd esign.consent_disclosure%rowtype;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  -- §4.1: the submit button is disabled until document_previewed_at is set, and the RPC refuses
  -- the same thing, because a disabled button is a suggestion and this is the evidence.
  if coalesce((e.config_snapshot ->> 'require_preview')::boolean, true)
     and s.document_previewed_at is null then
    return jsonb_build_object('granted', false, 'reason', 'document_not_previewed',
      'detail', 'ESIGN §101(c) requires a demonstration that the signer can access the format');
  end if;
  select * into cd from esign.consent_disclosure where id = p_disclosure_id and deleted_at is null;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_disclosure');
  end if;
  if p_disclosure_id is distinct from nullif(e.config_snapshot ->> 'consent_disclosure_id','')::uuid then
    -- AD-11: this envelope consents to the version frozen at send, not to today's version.
    return jsonb_build_object('granted', false, 'reason', 'disclosure_not_the_frozen_version',
                              'expected', e.config_snapshot -> 'consent_disclosure_id');
  end if;

  perform esign._arm();
  update esign.envelope_signer
     set status = 'consented', consented_at = now(), consent_disclosure_id = p_disclosure_id
   where id = s.id;
  perform esign._event(s.envelope_id, 'consent_given', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('consent_disclosure_id', p_disclosure_id,
                                                       'disclosure_version', cd.version_label));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'consented_at', now(), 'disclosure_version', cd.version_label);
end $fn$;

-- ADOPT (§4.2). Adoption is NOT signing.
create or replace function esign._act_adopt(p_ctx jsonb, p_kind text, p_typed_name text,
                                            p_typed_style text, p_image_file_id uuid, p_strokes jsonb)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if p_kind not in ('typed','drawn') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_signature_kind');
  end if;
  if p_kind = 'typed' and not coalesce((e.config_snapshot ->> 'allow_typed')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'typed_not_allowed');
  end if;
  if p_kind = 'drawn' and not coalesce((e.config_snapshot ->> 'allow_drawn')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'drawn_not_allowed');
  end if;
  if p_kind = 'typed' and coalesce(btrim(p_typed_name),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'typed_name_required');
  end if;
  if p_kind = 'drawn' and p_image_file_id is null then
    return jsonb_build_object('granted', false, 'reason', 'signature_image_required');
  end if;

  perform esign._arm();
  update esign.envelope_signer
     set signature_kind = p_kind, typed_name = p_typed_name, typed_style = p_typed_style,
         signature_image_file_id = p_image_file_id, signature_adopted_at = now(),
         -- §4.2: stroke timing is corroborating evidence that a human drew it.
         metadata = metadata || case when p_strokes is null then '{}'::jsonb
                                     else jsonb_build_object('signature_strokes', p_strokes) end
   where id = s.id;
  perform esign._event(s.envelope_id, 'signature_adopted', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('signature_kind', p_kind));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signature_kind', p_kind,
                            'detail', 'adoption is not signing — press Sign on the document screen (§4.2)');
end $fn$;

-- 🚨 SIGN — §4.3 THE BAR. All five conditions, or the RPC refuses.
create or replace function esign._act_sign(p_ctx jsonb, p_observed jsonb, p_action_id text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; d record; o jsonb;
        v_hashes jsonb := '[]'::jsonb; v_payload jsonb; v_hash text; v_img text; v_done jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;

  -- CONDITION 1 — a consent_given event exists for this signer, citing a specific disclosure.
  if s.consented_at is null or s.consent_disclosure_id is null
     or not exists (select 1 from esign.envelope_event v
                     where v.signer_id = s.id and v.event_type = 'consent_given') then
    return jsonb_build_object('granted', false, 'reason', 'no_consent',
      'detail', '§4.3 condition 1 — a typed name alone is never a signature');
  end if;
  -- CONDITION 2 — document_previewed_at is set for this signer on this envelope.
  if s.document_previewed_at is null then
    return jsonb_build_object('granted', false, 'reason', 'document_not_previewed',
      'detail', '§4.3 condition 2');
  end if;
  -- CONDITION 3 — the actor is authenticated: a live platform session, or a VERIFIED outsider
  -- session. The context resolver already refused an unverified token; this is the belt.
  if not coalesce((p_ctx ->> 'verification_passed')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'not_verified', 'detail', '§4.3 condition 3');
  end if;
  -- CONDITION 5 — the explicit Sign action, carried as the button's own action id.
  if coalesce(btrim(p_action_id),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'no_sign_action',
      'detail', '§4.3 condition 5 — a Sign action, never a Next that happens to also sign');
  end if;
  -- §4.2 — you cannot sign with a signature you never adopted.
  if s.signature_kind is null then
    return jsonb_build_object('granted', false, 'reason', 'no_signature_adopted');
  end if;
  if p_observed is null or jsonb_typeof(p_observed) <> 'array' then
    return jsonb_build_object('granted', false, 'reason', 'no_observed_hashes',
      'detail', 'the signer''s client must supply the hash of the bytes it actually rendered (migration 03 decision 1)');
  end if;

  -- CONDITION 4 — every document's content_hash re-read at signing time equals the stored hash.
  perform esign._arm();
  for d in select * from esign.envelope_document where envelope_id = s.envelope_id order by position loop
    o := null;
    select el into o from jsonb_array_elements(p_observed) as el
     where el ->> 'document_id' = d.id::text limit 1;
    if o is null or lower(o ->> 'content_hash') is distinct from d.content_hash then
      -- THE REFUSAL-ENVELOPE LAW: write the evidence, then RETURN the refusal. A raise here would
      -- roll back the very row that records the tampering.
      perform esign._event(s.envelope_id, 'hash_mismatch', p_ctx ->> 'actor_type', p_signer_id => s.id,
                           p_document_id => d.id,
                           p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                           p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                           p_actor_label => p_ctx ->> 'actor_label',
                           p_auth_method => p_ctx ->> 'auth_method',
                           p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                           p_payload => jsonb_build_object(
                             'expected_hash', d.content_hash,
                             'actual_hash', o ->> 'content_hash',
                             'observed_supplied', o is not null));
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'document_hash_mismatch',
        'document_id', d.id,
        'detail', 'the document presented is not the document that was frozen; the signer stays consented, not signed (§8.2 case 8)');
    end if;
    v_hashes := v_hashes || jsonb_build_array(d.content_hash);
  end loop;

  -- §4.3 — what binds THIS PERSON'S INTENT to THESE EXACT BYTES.
  select checksum into v_img from files.files where id = s.signature_image_file_id;
  v_payload := jsonb_build_object(
    'envelope_id', s.envelope_id, 'signer_id', s.id, 'document_hashes', v_hashes,
    'signature_kind', s.signature_kind,
    'typed_name_or_image_checksum', coalesce(s.typed_name, v_img),
    'consent_disclosure_id', s.consent_disclosure_id, 'consented_at', s.consented_at,
    'signed_at', now(), 'auth_method', s.auth_method,
    'actor_token_id', (p_ctx ->> 'actor_token_id')::uuid);
  v_hash := encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');

  update esign.envelope_signer
     set status = 'signed', signed_at = now(), signature_payload_hash = v_hash,
         -- one column holds the first document's re-read hash; the FULL ordered array is in the
         -- `signed` event payload and inside signature_payload_hash, so a multi-document envelope
         -- loses nothing. OWED: §2.4's singular signed_content_hash on a plural document set.
         signed_content_hash = (v_hashes ->> 0),
         verification_passed = true
   where id = s.id;
  perform esign._event(s.envelope_id, 'signed', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object(
                         'document_hash', v_hashes ->> 0, 'document_hashes', v_hashes,
                         'signature_payload_hash', v_hash, 'sign_action_id', p_action_id,
                         'verification_factor', p_ctx ->> 'verification_factor'));
  v_done := esign._maybe_complete(s.envelope_id);
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'signed_at', now(),
                            'signature_payload_hash', v_hash, 'envelope', v_done);
end $fn$;

-- DECLINE (§3.5). Already-collected signatures are RETAINED as evidence.
create or replace function esign._act_decline(p_ctx jsonb, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; v_revoked int;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if coalesce(btrim(p_reason),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'reason_required');
  end if;

  perform esign._arm();
  update esign.envelope_signer
     set status = 'declined', declined_at = now(), decline_reason = p_reason where id = s.id;
  perform esign._event(s.envelope_id, 'declined', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('reason', p_reason));
  update esign.envelope
     set status = 'declined', declined_at = now(),
         decline_summary = s.full_name || ': ' || p_reason
   where id = s.envelope_id;
  -- in the SAME transaction (§8.5 case 45)
  v_revoked := esign._revoke_open_tokens(s.envelope_id, 'envelope declined');
  perform esign._notify(s.envelope_id, 'esign.declined', s.id, p_to_user => e.created_by,
                        p_subject => 'Signature declined: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('reason', p_reason, 'signer', s.full_name));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'envelope_status', 'declined',
                            'tokens_revoked', v_revoked);
end $fn$;

-- DELEGATE (§2.4/§3.5, RECORDED DECISION 5).
create or replace function esign._act_delegate(p_ctx jsonb, p_full_name text, p_email text, p_reason text)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; v_new uuid; v_tok jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if not coalesce((e.config_snapshot ->> 'delegation_allowed')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'delegation_not_allowed',
                              'detail', 'esign.delegation.allowed is false for this envelope (§7)');
  end if;
  if coalesce(btrim(p_email),'') = '' or coalesce(btrim(p_full_name),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'delegate_identity_required');
  end if;

  perform esign._arm();
  insert into esign.envelope_signer
    (organization_id, envelope_id, position, role, actor_type, full_name, email,
     auth_method, status, is_required, verification_factor)
  values (s.organization_id, s.envelope_id, s.position, s.role, 'external',
          p_full_name, lower(p_email), 'token_link', 'pending', s.is_required,
          trim(both '"' from (e.config_snapshot -> 'verification_factor')::text))
  returning id into v_new;

  update esign.envelope_signer
     set status = 'delegated', delegated_to_signer_id = v_new, delegation_reason = p_reason
   where id = s.id;
  if s.actor_token_id is not null then
    perform platform.revoke_outsider_token(s.actor_token_id, 'signer delegated');
  end if;
  perform esign._event(s.envelope_id, 'delegated', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('delegated_to_signer_id', v_new,
                                                       'delegate', p_full_name, 'reason', p_reason));
  perform esign._notify_actionable(s.envelope_id, 'esign.signature_requested');
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'delegated_to_signer_id', v_new);
end $fn$;

-- DOWNLOAD (§2.8, RECORDED DECISION 6).
create or replace function esign._act_download(p_ctx jsonb, p_document_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'esign','public' as $fn$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; d esign.envelope_document%rowtype;
        v_ttl int; v_can jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  select * into d from esign.envelope_document where id = p_document_id and envelope_id = s.envelope_id;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'unknown_document');
  end if;
  v_can := esign._can_act(s.id);
  -- A signer may download while they may act, and afterwards to keep their own copy — but not
  -- before their turn, and not on an envelope that was voided out from under them.
  if not (v_can ->> 'can_act')::boolean
     and not (s.status in ('signed','declined') or e.status = 'completed') then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if not d.is_frozen then
    return jsonb_build_object('granted', false, 'reason', 'document_not_frozen');
  end if;

  v_ttl := coalesce((e.config_snapshot ->> 'download_url_ttl_seconds')::int, 300);
  perform esign._arm();
  perform esign._event(s.envelope_id, 'downloaded', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_document_id => d.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('document_hash', d.content_hash));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'document_id', d.id, 'name', d.name,
                            'content_file_id', d.content_file_id,
                            'content_file_version', d.content_file_version,
                            'content_hash', d.content_hash,
                            'ticket_expires_at', now() + make_interval(secs => v_ttl),
                            'detail', 'exchange this with the file service for a short-lived signed URL; an outsider never receives a durable file URL (§2.8)');
end $fn$;

-- ---------------------------------------------------------------------------------
-- 5. DOOR A — the outsider session (§5.4's exhaustive anon-callable surface).
-- ---------------------------------------------------------------------------------
create or replace function public.esign_signer_load(p_session text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'read', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_load(c);
end $fn$;

create or replace function public.esign_signer_preview_ack(p_session text, p_document_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'read', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_preview_ack(c, p_document_id);
end $fn$;

create or replace function public.esign_signer_consent(p_session text, p_disclosure_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'consent', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_consent(c, p_disclosure_id);
end $fn$;

create or replace function public.esign_signer_adopt_signature(p_session text, p_kind text,
  p_typed_name text default null, p_typed_style text default null,
  p_image_file_id uuid default null, p_strokes jsonb default null,
  p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_adopt(c, p_kind, p_typed_name, p_typed_style, p_image_file_id, p_strokes);
end $fn$;

create or replace function public.esign_signer_sign(p_session text, p_observed jsonb, p_action_id text,
  p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_sign(c, p_observed, p_action_id);
end $fn$;

create or replace function public.esign_signer_decline(p_session text, p_reason text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'decline', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_decline(c, p_reason);
end $fn$;

create or replace function public.esign_signer_delegate(p_session text, p_full_name text, p_email text,
  p_reason text default null, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'delegate', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_delegate(c, p_full_name, p_email, p_reason);
end $fn$;

create or replace function public.esign_signer_download_url(p_session text, p_document_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'read', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  -- RECORDED DECISION 8 — the `download` verb, on the document, per §5.3 law 2.
  begin
    perform platform.assert_outsider_scope(p_session, 'esign_envelope_document', p_document_id, 'download');
  exception when others then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
  end;
  return esign._act_download(c, p_document_id);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 6. DOOR B — the platform session, /sign/e/{envelopeId} (§6.0 U-03).
-- ---------------------------------------------------------------------------------
create or replace function public.esign_my_signer_row(p_envelope_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'esign','public' as $fn$
declare v_id uuid; begin
  if auth.uid() is null then return jsonb_build_object('granted', false, 'reason', 'not_authenticated'); end if;
  select id into v_id from esign.envelope_signer
   where envelope_id = p_envelope_id and signer_user_id = auth.uid()
     and status not in ('declined','delegated','expired') order by position limit 1;
  if v_id is null then return jsonb_build_object('granted', false, 'reason', 'not_a_signer'); end if;
  return jsonb_build_object('granted', true, 'signer_id', v_id);
end $fn$;

create or replace function public.esign_sign_load(p_envelope_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare m jsonb; c jsonb; begin
  m := public.esign_my_signer_row(p_envelope_id);
  if not (m ->> 'granted')::boolean then return m; end if;
  c := esign._ctx_internal((m ->> 'signer_id')::uuid, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_load(c);
end $fn$;

create or replace function public.esign_sign_preview_ack(p_signer_id uuid, p_document_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_preview_ack(c, p_document_id);
end $fn$;

create or replace function public.esign_sign_consent(p_signer_id uuid, p_disclosure_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_consent(c, p_disclosure_id);
end $fn$;

create or replace function public.esign_sign_adopt_signature(p_signer_id uuid, p_kind text,
  p_typed_name text default null, p_typed_style text default null,
  p_image_file_id uuid default null, p_strokes jsonb default null,
  p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_adopt(c, p_kind, p_typed_name, p_typed_style, p_image_file_id, p_strokes);
end $fn$;

create or replace function public.esign_sign(p_signer_id uuid, p_observed jsonb, p_action_id text,
  p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_sign(c, p_observed, p_action_id);
end $fn$;

create or replace function public.esign_sign_decline(p_signer_id uuid, p_reason text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_decline(c, p_reason);
end $fn$;

create or replace function public.esign_sign_download(p_signer_id uuid, p_document_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path to 'esign','public' as $fn$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_download(c, p_document_id);
end $fn$;

-- ---------------------------------------------------------------------------------
-- 7. Grants. §5.4: the OUTSIDER family is anon-callable, by name, and nothing else is.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'public.esign_signer_load(text,inet,text)',
    'public.esign_signer_preview_ack(text,uuid,inet,text)',
    'public.esign_signer_consent(text,uuid,inet,text)',
    'public.esign_signer_adopt_signature(text,text,text,text,uuid,jsonb,inet,text)',
    'public.esign_signer_sign(text,jsonb,text,inet,text)',
    'public.esign_signer_decline(text,text,inet,text)',
    'public.esign_signer_delegate(text,text,text,text,inet,text)',
    'public.esign_signer_download_url(text,uuid,inet,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
  foreach f in array ARRAY[
    'public.esign_my_signer_row(uuid)',
    'public.esign_sign_load(uuid,inet,text)',
    'public.esign_sign_preview_ack(uuid,uuid,inet,text)',
    'public.esign_sign_consent(uuid,uuid,inet,text)',
    'public.esign_sign_adopt_signature(uuid,text,text,text,uuid,jsonb,inet,text)',
    'public.esign_sign(uuid,jsonb,text,inet,text)',
    'public.esign_sign_decline(uuid,text,inet,text)',
    'public.esign_sign_download(uuid,uuid,inet,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------
-- 8. ASSERTIONS.
-- ---------------------------------------------------------------------------------
do $$
declare v_n int; f text;
begin
  -- §5.4: `anon` still holds ZERO table grants in esign — the door is the only door.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'esign' and grantee = 'anon';
  if v_n > 0 then raise exception 'esign_05: anon holds % table grants in esign', v_n; end if;

  -- and the anon EXECUTE surface this lane adds is EXACTLY the eight §5.4 names
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'esign\_%'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 8 then
    raise exception 'esign_05: anon can execute % esign functions; §5.4 names exactly 8', v_n;
  end if;

  foreach f in array ARRAY['esign._act_sign(jsonb,jsonb,text)','esign._act_consent(jsonb,uuid)',
                           'esign._act_decline(jsonb,text)','esign._act_delegate(jsonb,text,text,text)',
                           'esign._project(text,jsonb)','esign._ctx_outsider(text,text,inet,text)',
                           'esign._ctx_internal(uuid,inet,text)'] loop
    if to_regprocedure(f) is null then raise exception 'esign_05: % did not create', f; end if;
  end loop;
end $$;
