-- chair-step: three internal acts (esign._act_sign/_act_adopt/_act_download) gain trailing defaulted parameters, so each old overload is dropped; every v1 public door still calls them unchanged.
-- based-on: esign._act_load(jsonb) 2f0309797c5b68cba0b027be13a06af0886a0d61bc2221eff257504728eb4904
-- based-on: esign._can_act(uuid) 86a4fcd4ea093e5877dc72d8f2543c84043ab2f17a8171aeb2e44355b860a1a7
-- based-on: esign._maybe_complete(uuid) 6de270de1bf1cdc189584ff935e14c03875e2780ac70da62131941174f19986c
-- based-on: esign._act_delegate(jsonb, text, text, text) 3bf9e72e01ee62ce3b00bae1e39aba291c4696abca7ce175e624237ecebc0087
-- based-on: esign._act_decline(jsonb, text) fe06d83b8d0914f587b10490a6c6be20f901c7d7507383475ce52f42bcb9b5fd
-- based-on: esign._ctx_outsider(text, text, inet, text) fc01bb11d74c600d47ee9b6c12031dcfb60f34ab7a289a98f9cca7ffa2c06ce0
-- based-on: esign._act_sign(jsonb, jsonb, text) abacbfb6aba534d7fc18d40fa4403b8be904b4b9ca31302c5d0a1495925b8a7d
-- based-on: esign._act_adopt(jsonb, text, text, text, uuid, jsonb) cc4cc03a4310f5bc2899ac4d0a09b1ee2e79041b5597fc5ec0ed372a790224f4
-- based-on: esign._act_download(jsonb, uuid) 2a290d2b4bf506396e19e696816210613ac69f5be36ebb083a16818460b67e07
-- SCHEMA NOTE: v2 doors live in `esign` (esign.esign_sign, esign.esign_signer_sign, …) because nothing new may be created in public (public_placement guard); the v1 public doors stay exactly as they were.
-- E-signature parity, wave A, step 4 — the signing core (CONTRACT.md v2 §1.3, §2, §3.1, §5.4, §6.2, §6.3,
-- §11). Values autosave per field with a sequence (§2.1); Sign binds the complete on-screen values into
-- the append-only `signed` event (payload v2, §2.4); marks gain initials/upload/phone/saved; viewers
-- acknowledge; delegation never blocks (A-F3); outsider sessions slide and say why they ended (A-F2).
-- The F-refusals of §18 (F2 required fields at Sign, F3 value shape at save) sit behind
-- esign._enforce(), which answers false until Arman approves them; the door answers granted:true.

create or replace function esign._enforce(p_flag text) returns boolean
language sql immutable set search_path = pg_catalog as $$
  -- §18: F1 access code, F2 required_fields_missing at Sign, F3 save_values shape refusals.
  -- Each stays OFF until Arman approves it in his own words, with the date (law 12).
  select case p_flag when 'F1' then false when 'F2' then false when 'F3' then false else false end
$$;

create or replace function esign._acts_for(p_signer_id uuid) returns uuid[]
language sql stable security definer set search_path = esign, public as $$
  -- §2.1: a field belongs to the signer at the end of its owner's delegated_to chain.
  with recursive chain(id, depth) as (
    select p_signer_id, 0
    union all
    select s.id, c.depth + 1 from esign.envelope_signer s join chain c on s.delegated_to_signer_id = c.id
     where c.depth < 20)
  select array_agg(id order by depth) from chain
$$;

create or replace function esign._my_fields(p_signer_id uuid) returns jsonb
language sql stable security definer set search_path = esign, public as $$
  -- Every field (v1 or v2 map) owned by this signer or anyone who delegated to them.
  select coalesce(jsonb_agg(f.value || jsonb_build_object('document_id', d.id,
           'schema_version', coalesce((d.field_map ->> 'schema_version')::int, 1))
           order by d.position, f.ord), '[]'::jsonb)
    from esign.envelope_signer me
    join esign.envelope_document d on d.envelope_id = me.envelope_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(d.field_map -> 'fields') = 'array'
                                                 then d.field_map -> 'fields' else '[]'::jsonb end)
         with ordinality f(value, ord)
   where me.id = p_signer_id
     and (f.value ->> 'signer_id') in (select unnest(esign._acts_for(p_signer_id))::text)
$$;

create or replace function esign._my_groups(p_signer_id uuid) returns jsonb
language sql stable security definer set search_path = esign, public as $$
  select coalesce(jsonb_agg(g.value || jsonb_build_object('document_id', d.id)), '[]'::jsonb)
    from esign.envelope_signer me
    join esign.envelope_document d on d.envelope_id = me.envelope_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(d.field_map -> 'groups') = 'array'
                                                 then d.field_map -> 'groups' else '[]'::jsonb end) g(value)
   where me.id = p_signer_id
     and (g.value ->> 'signer_id') in (select unnest(esign._acts_for(p_signer_id))::text)
$$;

create or replace function esign._plain_values(p_entries jsonb) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  -- FieldValues ({id: {v, seq, at}}) → {id: v}
  select coalesce(jsonb_object_agg(key, value -> 'v'), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_entries) = 'object' then p_entries else '{}'::jsonb end)
$$;

create or replace function esign._resolve_values(p_signer_id uuid, p_values jsonb, p_time_zone text)
returns jsonb language plpgsql stable security definer set search_path = esign, public as $$
-- §2.3 step 2: the final value of every field this signer fills.
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; f jsonb; v jsonb;
        v_out jsonb := '{}'::jsonb; v_zone text; v_today date; v_name text;
begin
  select * into s from esign.envelope_signer where id = p_signer_id;
  select * into e from esign.envelope where id = s.envelope_id;
  v_zone := coalesce(nullif(p_time_zone, ''), s.metadata ->> 'time_zone', 'UTC');
  begin
    v_today := (now() at time zone v_zone)::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;
  v_name := btrim(coalesce(s.full_name, ''));
  for f in select * from jsonb_array_elements(esign._my_fields(p_signer_id)) loop
    v := coalesce(p_values, '{}'::jsonb) -> (f ->> 'id');
    if v = 'null'::jsonb then v := null; end if;
    if coalesce((f ->> 'read_only')::boolean, false) and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
      v := f -> 'prefill';
    elsif (f ->> 'kind') = 'date_signed' then
      v := to_jsonb(esign._format_date(v_today, coalesce(f ->> 'date_format',
             e.config_snapshot ->> 'date_format_default', 'MM/DD/YYYY')));
    elsif (v is null or v = '""'::jsonb)
          and (f ->> 'kind') in ('full_name','first_name','last_name','email','company','title') then
      v := to_jsonb(case f ->> 'kind'
             when 'full_name'  then v_name
             when 'first_name' then case when position(' ' in v_name) > 0 then regexp_replace(v_name, '\s+\S+$', '') else v_name end
             when 'last_name'  then case when position(' ' in v_name) > 0 then substring(v_name from '(\S+)$') else '' end
             when 'email'      then coalesce(s.email, '')
             when 'company'    then coalesce(s.company, '')
             when 'title'      then coalesce(s.job_title, '') end);
      if coalesce(v #>> '{}', '') = '' and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
        v := f -> 'prefill';
      end if;
    elsif v is null and f -> 'prefill' is not null and f -> 'prefill' <> 'null'::jsonb then
      v := f -> 'prefill';
    end if;
    v_out := v_out || jsonb_build_object(f ->> 'id', coalesce(v, 'null'::jsonb));
  end loop;
  return v_out;
end $$;

create or replace function esign._missing_required(p_signer_id uuid, p_resolved jsonb)
returns jsonb language plpgsql stable security definer set search_path = esign, public as $$
-- §2.3 step 3: required fields and groups with no value ([field_id | 'group:<id>']).
declare f jsonb; g jsonb; v jsonb; v_missing jsonb := '[]'::jsonb; v_fields jsonb; v_cnt int;
begin
  v_fields := esign._my_fields(p_signer_id);
  for f in select * from jsonb_array_elements(v_fields) loop
    continue when nullif(f ->> 'group_id', '') is not null;
    continue when (f ->> 'kind') = 'date_signed';
    -- v1 maps: signature/initials are proven by the adopted mark, never a value.
    continue when (f ->> 'schema_version')::int = 1 and (f ->> 'kind') in ('signature','initials');
    continue when (f ->> 'schema_version')::int >= 2 and not coalesce((f ->> 'required')::boolean,
                                                                       (f ->> 'kind') <> 'checkbox');
    v := p_resolved -> (f ->> 'id');
    if v is null or v = 'null'::jsonb or v = '""'::jsonb or v = 'false'::jsonb then
      v_missing := v_missing || to_jsonb(f ->> 'id');
    end if;
  end loop;
  for g in select * from jsonb_array_elements(esign._my_groups(p_signer_id)) loop
    select count(*) into v_cnt from jsonb_array_elements(v_fields) x
     where x ->> 'group_id' = g ->> 'id' and (p_resolved -> (x ->> 'id')) = 'true'::jsonb;
    if (g ->> 'kind') = 'radio' and coalesce((g ->> 'required')::boolean, true) and v_cnt < 1 then
      v_missing := v_missing || to_jsonb('group:' || (g ->> 'id'));
    elsif (g ->> 'kind') = 'checkbox' and coalesce((g ->> 'required')::boolean, false)
          and v_cnt < coalesce((g ->> 'min')::int, 1) then
      v_missing := v_missing || to_jsonb('group:' || (g ->> 'id'));
    end if;
  end loop;
  return v_missing;
end $$;

create or replace function esign._value_problem(p_field jsonb, p_v jsonb) returns text
language sql immutable set search_path = pg_catalog as $$
  -- §2.2: what cannot be a value of this field (null = it can).
  select case
    when p_v is null or p_v = 'null'::jsonb then null
    when p_field ->> 'kind' in ('signature','initials') then case when p_v = '"applied"'::jsonb then null else 'expected "applied"' end
    when p_field ->> 'kind' = 'date_signed' then 'filled automatically'
    when p_field ->> 'kind' in ('checkbox','radio') then case when jsonb_typeof(p_v) = 'boolean' then null else 'expected true or false' end
    when jsonb_typeof(p_v) <> 'string' then 'expected text'
    when p_field ->> 'kind' = 'date' then case when (p_v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$' then null else 'expected YYYY-MM-DD' end
    when p_field ->> 'kind' = 'number' then case
         when (p_v #>> '{}') !~ '^-?\d+(\.\d+)?$' then 'expected a number'
         when (p_field #>> '{number,min}') is not null and (p_v #>> '{}')::numeric < (p_field #>> '{number,min}')::numeric then 'below the minimum'
         when (p_field #>> '{number,max}') is not null and (p_v #>> '{}')::numeric > (p_field #>> '{number,max}')::numeric then 'above the maximum'
         else null end
    when p_field ->> 'kind' = 'dropdown' then case when (p_v #>> '{}') = '' or coalesce(p_field -> 'options', '[]'::jsonb) ? (p_v #>> '{}') then null else 'not one of the options' end
    when length(p_v #>> '{}') > coalesce((p_field ->> 'max_length')::int, 4000) then 'too long'
    else null end
$$;

create or replace function esign._act_save_values(p_ctx jsonb, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- §2.1/§2.2: per field, stored only when its seq is newer than the stored one; answers the stored
-- entries for the patched fields. After Sign every write is refused by _can_act (signer_signed).
declare s esign.envelope_signer%rowtype; v_can jsonb; v_mine jsonb; k text; p jsonb; f jsonb; x jsonb;
        v_fv jsonb; v_cur jsonb := '{}'::jsonb; v_ignored jsonb := '[]'::jsonb; v_prob text; v_seq numeric;
        v_missing jsonb; v_reason text;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  v_mine := esign._my_fields(s.id);
  v_fv := coalesce(s.field_values, '{}'::jsonb);
  for k, p in select key, value from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) loop
    f := null;
    select y into f from jsonb_array_elements(v_mine) y where y ->> 'id' = k limit 1;
    v_reason := null;
    if f is null then
      v_reason := case when exists (
          select 1 from esign.envelope_document d,
                 jsonb_array_elements(case when jsonb_typeof(d.field_map -> 'fields') = 'array' then d.field_map -> 'fields' else '[]'::jsonb end) y
           where d.envelope_id = s.envelope_id and y ->> 'id' = k) then 'not_your_field' else 'unknown_field' end;
    elsif coalesce((f ->> 'read_only')::boolean, false) or (f ->> 'kind') = 'date_signed' then
      v_reason := 'field_read_only';
    else
      v_prob := esign._value_problem(f, p -> 'v');
      if v_prob is not null and esign._enforce('F3') then
        return jsonb_build_object('granted', false, 'reason', 'invalid_value',
                                  'field_id', k, 'expected', v_prob);
      end if;
    end if;
    if v_reason is not null then
      if esign._enforce('F3') then
        return jsonb_build_object('granted', false, 'reason', v_reason, 'field_id', k);
      end if;
      -- F3 is off: the value is not stored (it is not this signer's to fill) and the answer names it.
      v_ignored := v_ignored || jsonb_build_object('field_id', k, 'reason', v_reason);
      continue;
    end if;
    v_seq := coalesce((p ->> 'seq')::numeric, 0);
    if v_seq > coalesce((v_fv -> k ->> 'seq')::numeric, -1) then
      v_fv := v_fv || jsonb_build_object(k, jsonb_build_object('v', coalesce(p -> 'v', 'null'::jsonb), 'seq', v_seq, 'at', now()));
      if (f ->> 'kind') = 'radio' and p -> 'v' = 'true'::jsonb and nullif(f ->> 'group_id', '') is not null then
        for x in select y from jsonb_array_elements(v_mine) y
                  where y ->> 'group_id' = f ->> 'group_id' and y ->> 'id' <> k loop
          v_fv := v_fv || jsonb_build_object(x ->> 'id', jsonb_build_object('v', false, 'seq', v_seq, 'at', now()));
          v_cur := v_cur || jsonb_build_object(x ->> 'id', v_fv -> (x ->> 'id'));
        end loop;
      end if;
    end if;
    v_cur := v_cur || jsonb_build_object(k, v_fv -> k);
  end loop;

  perform esign._arm();
  update esign.envelope_signer set field_values = v_fv, values_saved_at = now() where id = s.id;
  perform esign._disarm();
  v_missing := esign._missing_required(s.id, esign._resolve_values(s.id, esign._plain_values(v_fv), null));
  return jsonb_build_object('granted', true, 'values_saved_at', now(),
                            'required_remaining', jsonb_array_length(v_missing),
                            'current', v_cur, 'ignored', v_ignored);
end $$;

create or replace function esign.esign_sign_save_values(p_signer_id uuid, p_values jsonb, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_save_values(c, p_values);
end $$;

create or replace function esign.esign_signer_save_values(p_session text, p_values jsonb, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_save_values(c, p_values);
end $$;

drop function if exists esign._act_sign(jsonb, jsonb, text);
create or replace function esign._act_sign(p_ctx jsonb, p_observed jsonb, p_action_id text,
    p_values jsonb default null, p_message_to_sender text default null, p_time_zone text default null)
 returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; d record; o jsonb;
        v_hashes jsonb := '[]'::jsonb; v_payload jsonb; v_hash text; v_done jsonb; v_now timestamptz := now();
        v_acts uuid[]; v_fields jsonb; v_merged jsonb; v_final jsonb; v_missing jsonb; v_fmh jsonb;
        v_sig_ck text; v_ini_ck text; v_msg text; v_has_sig boolean; v_has_init boolean; a uuid;
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
    return jsonb_build_object('granted', false, 'reason', 'document_not_previewed', 'detail', '§4.3 condition 2');
  end if;
  -- CONDITION 3 — the actor is authenticated.
  if not coalesce((p_ctx ->> 'verification_passed')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason', 'not_verified', 'detail', '§4.3 condition 3');
  end if;
  -- CONDITION 5 — the explicit Sign action.
  if coalesce(btrim(p_action_id),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'no_sign_action',
      'detail', '§4.3 condition 5 — a Sign action, never a Next that happens to also sign');
  end if;
  if p_observed is null or jsonb_typeof(p_observed) <> 'array' then
    return jsonb_build_object('granted', false, 'reason', 'no_observed_hashes',
      'detail', 'the signer''s client must supply the hash of the bytes it actually rendered (migration 03 decision 1)');
  end if;

  -- §2.3: the values on the signer's screen are the last write; then the final values.
  v_acts := esign._acts_for(s.id);
  v_fields := esign._my_fields(s.id);
  v_merged := esign._plain_values(s.field_values)
              || coalesce((select jsonb_object_agg(key, value -> 'v')
                             from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end)), '{}'::jsonb);
  v_final := esign._resolve_values(s.id, v_merged, p_time_zone);
  v_missing := esign._missing_required(s.id, v_final);
  if jsonb_array_length(v_missing) > 0 and esign._enforce('F2') then
    return jsonb_build_object('granted', false, 'reason', 'required_fields_missing', 'missing', v_missing);
  end if;
  -- §2.3 step 4 (A-F17): a signature mark when the signer has a signature field or no fields at all.
  v_has_sig := jsonb_array_length(v_fields) = 0
               or exists (select 1 from jsonb_array_elements(v_fields) x where x ->> 'kind' = 'signature');
  v_has_init := exists (select 1 from jsonb_array_elements(v_fields) x where x ->> 'kind' = 'initials');
  if v_has_sig and s.signature_kind is null then
    return jsonb_build_object('granted', false, 'reason', 'no_signature_adopted');
  end if;
  if v_has_init and s.initials_kind is null and esign._enforce('F2') then
    return jsonb_build_object('granted', false, 'reason', 'no_initials_adopted');
  end if;

  -- CONDITION 4 — every document's content_hash re-read at signing time equals the stored hash.
  perform esign._arm();
  for d in select * from esign.envelope_document where envelope_id = s.envelope_id order by position loop
    o := null;
    select el into o from jsonb_array_elements(p_observed) as el where el ->> 'document_id' = d.id::text limit 1;
    if o is null or lower(o ->> 'content_hash') is distinct from d.content_hash then
      perform esign._event(s.envelope_id, 'hash_mismatch', p_ctx ->> 'actor_type', p_signer_id => s.id,
                           p_document_id => d.id,
                           p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                           p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                           p_actor_label => p_ctx ->> 'actor_label',
                           p_auth_method => p_ctx ->> 'auth_method',
                           p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                           p_payload => jsonb_build_object('expected_hash', d.content_hash,
                             'actual_hash', o ->> 'content_hash', 'observed_supplied', o is not null));
      perform esign._disarm();
      return jsonb_build_object('granted', false, 'reason', 'document_hash_mismatch', 'document_id', d.id,
        'detail', 'the document presented is not the document that was frozen; the signer stays consented, not signed (§8.2 case 8)');
    end if;
    v_hashes := v_hashes || jsonb_build_array(d.content_hash);
  end loop;

  -- §2.4 — payload v2: what binds THIS PERSON'S INTENT to THESE EXACT BYTES AND VALUES.
  select coalesce(jsonb_agg(encode(sha256(convert_to(coalesce(x.field_map, 'null'::jsonb)::text, 'UTF8')), 'hex') order by x.position), '[]'::jsonb)
    into v_fmh from esign.envelope_document x where x.envelope_id = s.envelope_id;
  select checksum into v_sig_ck from files.files where id = s.signature_image_file_id;
  select checksum into v_ini_ck from files.files where id = s.initials_image_file_id;
  v_msg := nullif(left(btrim(coalesce(p_message_to_sender, '')), 2000), '');
  v_payload := jsonb_build_object(
    'payload_version', 2, 'envelope_id', s.envelope_id, 'signer_id', s.id, 'acts_for', to_jsonb(v_acts),
    'full_name', s.full_name, 'email', s.email,
    'document_hashes', v_hashes, 'field_map_hashes', v_fmh,
    'field_values_hash', encode(sha256(convert_to(v_final::text, 'UTF8')), 'hex'),
    'signature_kind', s.signature_kind, 'signature_source', s.signature_source,
    'typed_name', s.typed_name, 'typed_style', s.typed_style,
    'signature_image_file_id', s.signature_image_file_id, 'signature_image_checksum', v_sig_ck,
    'initials_kind', s.initials_kind, 'initials_text', s.initials_text, 'initials_style', s.initials_style,
    'initials_image_file_id', s.initials_image_file_id, 'initials_image_checksum', v_ini_ck,
    'consent_disclosure_id', s.consent_disclosure_id, 'consented_at', s.consented_at,
    'signed_at', v_now, 'auth_method', s.auth_method,
    'verification_factor', p_ctx ->> 'verification_factor', 'verified_at', p_ctx ->> 'verified_at',
    'actor_token_id', (p_ctx ->> 'actor_token_id')::uuid,
    'message_to_sender_hash', case when v_msg is null then null
                                   else encode(sha256(convert_to(v_msg, 'UTF8')), 'hex') end);
  v_hash := encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');

  update esign.envelope_signer
     set status = 'signed', signed_at = v_now, signature_payload_hash = v_hash,
         signed_content_hash = (v_hashes ->> 0), verification_passed = true,
         field_values = coalesce((select jsonb_object_agg(key, jsonb_build_object('v', value, 'seq', 9007199254740991, 'at', v_now))
                                    from jsonb_each(v_final)), '{}'::jsonb),
         values_saved_at = v_now, message_to_sender = v_msg,
         metadata = metadata || case when nullif(p_time_zone, '') is null then '{}'::jsonb
                                     else jsonb_build_object('time_zone', p_time_zone) end
   where id = s.id;
  -- The evidence of record (decision B): the append-only `signed` event carries the payload, its
  -- hash and the final values verbatim; the signed copy and certificate read THIS, never the row.
  perform esign._event(s.envelope_id, 'signed', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object(
                         'document_hash', v_hashes ->> 0, 'document_hashes', v_hashes,
                         'signature_payload_hash', v_hash, 'sign_action_id', p_action_id,
                         'verification_factor', p_ctx ->> 'verification_factor',
                         'payload_version', 2, 'payload', v_payload, 'payload_hash', v_hash,
                         'final_values', v_final, 'message_to_sender', v_msg,
                         'time_zone', p_time_zone));
  foreach a in array v_acts loop
    perform esign._cancel_scheduled_notices(s.envelope_id, a);
  end loop;
  if e.created_by is not null then
    perform esign._notify(s.envelope_id, 'esign.signer_signed', s.id, p_to_user => e.created_by,
                          p_subject => coalesce(s.full_name, 'A signer') || ' signed ' || coalesce(e.title, ''),
                          p_channel => 'email');
  end if;
  v_done := esign._maybe_complete(s.envelope_id);
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'signed_at', v_now,
                            'signature_payload_hash', v_hash, 'final_values', v_final, 'envelope', v_done,
                            'next', jsonb_build_object(
                              'everyone_signed', coalesce((v_done ->> 'completed')::boolean, false),
                              'remaining', coalesce((v_done ->> 'outstanding')::int, 0),
                              'sender_notified', true));
end $$;

create or replace function esign.esign_sign(p_signer_id uuid, p_observed jsonb, p_action_id text, p_ip inet default null, p_ua text default null,
    p_values jsonb default null, p_message_to_sender text default null, p_time_zone text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_sign(c, p_observed, p_action_id, p_values, p_message_to_sender, p_time_zone);
end $$;

create or replace function esign.esign_signer_sign(p_session text, p_observed jsonb, p_action_id text, p_ip inet default null, p_ua text default null,
    p_values jsonb default null, p_message_to_sender text default null, p_time_zone text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_sign(c, p_observed, p_action_id, p_values, p_message_to_sender, p_time_zone);
end $$;

drop function if exists esign._act_adopt(jsonb, text, text, text, uuid, jsonb);
create or replace function esign._act_adopt(p_ctx jsonb, p_kind text, p_typed_name text, p_typed_style text,
    p_image_file_id uuid, p_strokes jsonb, p_target text default 'signature', p_source text default 'this_device')
returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- §3.1: one adopted mark per target (signature | initials), from any source; every image is the
-- creator's PNG filed as envelope evidence by aidream before this door is called.
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; v_target text; v_source text; v_ck text;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  select * into e from esign.envelope where id = s.envelope_id;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  v_target := coalesce(nullif(p_target, ''), 'signature');
  v_source := coalesce(nullif(p_source, ''), 'this_device');
  if v_target not in ('signature','initials') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_target');
  end if;
  if v_source not in ('this_device','phone','saved') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_source');
  end if;
  if p_kind not in ('typed','drawn','uploaded') then
    return jsonb_build_object('granted', false, 'reason', 'unknown_signature_kind');
  end if;
  if p_kind = 'typed' and not coalesce((e.config_snapshot ->> 'allow_typed')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'typed_not_allowed');
  end if;
  if p_kind = 'drawn' and not coalesce((e.config_snapshot ->> 'allow_drawn')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'drawn_not_allowed');
  end if;
  if p_kind = 'uploaded' and not coalesce((e.config_snapshot ->> 'allow_uploaded')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'uploaded_not_allowed');
  end if;
  if v_source = 'phone' and not coalesce((e.config_snapshot ->> 'allow_phone')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'phone_not_allowed');
  end if;
  if p_kind = 'typed' and coalesce(btrim(p_typed_name),'') = '' then
    return jsonb_build_object('granted', false, 'reason', 'typed_name_required');
  end if;
  if p_kind <> 'typed' and p_image_file_id is null then
    return jsonb_build_object('granted', false, 'reason', 'signature_image_required');
  end if;
  select checksum into v_ck from files.files where id = p_image_file_id;

  perform esign._arm();
  if v_target = 'signature' then
    update esign.envelope_signer
       set signature_kind = p_kind, typed_name = p_typed_name, typed_style = p_typed_style,
           signature_image_file_id = p_image_file_id, signature_adopted_at = now(), signature_source = v_source,
           metadata = metadata || case when p_strokes is null then '{}'::jsonb
                                       else jsonb_build_object('signature_strokes', p_strokes) end
     where id = s.id;
  else
    update esign.envelope_signer
       set initials_kind = p_kind, initials_text = p_typed_name, initials_style = p_typed_style,
           initials_image_file_id = p_image_file_id, initials_adopted_at = now(),
           metadata = metadata || case when p_strokes is null then '{}'::jsonb
                                       else jsonb_build_object('initials_strokes', p_strokes) end
     where id = s.id;
  end if;
  perform esign._event(s.envelope_id, 'signature_adopted', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('signature_kind', p_kind, 'target', v_target,
                                                       'kind', p_kind, 'source', v_source,
                                                       'typed_style', p_typed_style, 'image_checksum', v_ck,
                                                       'phone_last4', (select h.phone_last4 from platform.device_handoff h
                                                                        where h.result_file_id = p_image_file_id limit 1)));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signature_kind', p_kind, 'target', v_target, 'kind', p_kind,
                            'source', v_source, 'image_file_id', p_image_file_id,
                            'detail', 'adoption is not signing — press Sign on the document screen (§4.2)');
end $$;

create or replace function esign.esign_sign_adopt_signature(p_signer_id uuid, p_kind text, p_typed_name text,
    p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet default null, p_ua text default null,
    p_target text default 'signature', p_source text default 'this_device')
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_adopt(c, p_kind, p_typed_name, p_typed_style, p_image_file_id, p_strokes, p_target, p_source);
end $$;

create or replace function esign.esign_signer_adopt_signature(p_session text, p_kind text, p_typed_name text,
    p_typed_style text, p_image_file_id uuid, p_strokes jsonb, p_ip inet default null, p_ua text default null,
    p_target text default 'signature', p_source text default 'this_device')
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_adopt(c, p_kind, p_typed_name, p_typed_style, p_image_file_id, p_strokes, p_target, p_source);
end $$;

create or replace function esign._act_load(p_ctx jsonb)
 returns jsonb language plpgsql security definer set search_path = esign, public as $$
-- §6.3 load answer v2 (the v1 keys signature_options and branding stay for the v1 page).
declare e esign.envelope%rowtype; s esign.envelope_signer%rowtype; v_can jsonb; v_first boolean;
        v_acts uuid[]; v_vals jsonb; v_missing jsonb; v_total int; v_org jsonb;
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
  perform esign._event(s.envelope_id, 'opened', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent');
  -- S3.6: the first load of each outsider session records how the person was authenticated.
  if p_ctx ->> 'session_id' is not null and not exists (
       select 1 from esign.envelope_event v where v.signer_id = s.id and v.event_type = 'authenticated'
          and v.payload ->> 'session_id' = p_ctx ->> 'session_id') then
    perform esign._event(s.envelope_id, 'authenticated', p_ctx ->> 'actor_type', p_signer_id => s.id,
                         p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                         p_actor_label => p_ctx ->> 'actor_label', p_auth_method => p_ctx ->> 'auth_method',
                         p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                         p_payload => jsonb_build_object('factor', p_ctx ->> 'verification_factor',
                                                         'verified_at', p_ctx ->> 'verified_at',
                                                         'session_id', p_ctx ->> 'session_id'));
  end if;
  perform esign._disarm();

  select * into s from esign.envelope_signer where id = s.id;
  v_acts := esign._acts_for(s.id);
  v_vals := esign._resolve_values(s.id, esign._plain_values(s.field_values), null);
  v_missing := esign._missing_required(s.id, v_vals);
  select count(*) into v_total from jsonb_array_elements(esign._my_fields(s.id)) x
   where x ->> 'kind' <> 'date_signed' and nullif(x ->> 'group_id', '') is null
     and ((x ->> 'schema_version')::int >= 2 and coalesce((x ->> 'required')::boolean, (x ->> 'kind') <> 'checkbox')
          or ((x ->> 'schema_version')::int = 1 and x ->> 'kind' not in ('signature','initials')));
  v_total := v_total + (select count(*) from jsonb_array_elements(esign._my_groups(s.id)) g
                         where coalesce((g ->> 'required')::boolean, g ->> 'kind' = 'radio'));
  select jsonb_build_object('id', o.id, 'name', o.name, 'logo_url', o.logo_url) into v_org
    from iam.organizations o where o.id = e.organization_id;

  return jsonb_build_object(
    'granted', true,
    'envelope', esign._project('esign_envelope', to_jsonb(e)),
    'sender', coalesce(esign.envelope_sender(e.id), jsonb_build_object('name', coalesce(v_org ->> 'name', 'AI Matrx'))),
    'organization', v_org,
    'me', esign._project('esign_envelope_signer', to_jsonb(s))
          || jsonb_build_object('acts_for', to_jsonb(v_acts), 'field_values', coalesce(s.field_values, '{}'::jsonb),
                                'company', s.company, 'job_title', s.job_title,
                                'color_index', coalesce(s.color_index, greatest(s.position - 1, 0)),
                                'private_message', s.private_message, 'signature_source', s.signature_source,
                                'typed_style', s.typed_style, 'initials_kind', s.initials_kind,
                                'initials_text', s.initials_text, 'initials_style', s.initials_style,
                                'values_saved_at', s.values_saved_at),
    -- aidream turns these file ids into my_marks/others_marks base64 (§6.3).
    'my_mark_files', jsonb_build_object('signature_image_file_id', s.signature_image_file_id,
                                        'initials_image_file_id', s.initials_image_file_id),
    'other_signers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order', o.position, 'role', o.role,
                                  'status', o.status, 'name', o.full_name,
                                  'color_index', coalesce(o.color_index, greatest(o.position - 1, 0))) order by o.position)
                                 from esign.envelope_signer o where o.envelope_id = e.id and o.id <> all (v_acts) and o.id <> s.id), '[]'::jsonb),
    -- L2: finished signers' values, from their append-only signed event.
    'others_filled', coalesce((select jsonb_agg(jsonb_build_object('field_id', fv.key, 'signer_id', v.signer_id, 'v', fv.value))
                                 from esign.envelope_event v
                                 cross join lateral jsonb_each(coalesce(v.payload -> 'final_values', '{}'::jsonb)) fv
                                where v.envelope_id = e.id and v.event_type = 'signed' and v.signer_id <> all (v_acts)), '[]'::jsonb),
    'others_mark_files', coalesce((select jsonb_object_agg(o.id, jsonb_build_object(
                                     'signature_image_file_id', o.signature_image_file_id,
                                     'initials_image_file_id', o.initials_image_file_id))
                                     from esign.envelope_signer o
                                    where o.envelope_id = e.id and o.status = 'signed' and o.id <> all (v_acts)), '{}'::jsonb),
    'documents', coalesce((select jsonb_agg(esign._project('esign_envelope_document', to_jsonb(d)) order by d.position)
                             from esign.envelope_document d where d.envelope_id = e.id), '[]'::jsonb),
    'consent', (select jsonb_build_object('disclosure_id', cd.id, 'version', cd.version_label,
                                          'title', cd.title, 'text', cd.body)
                  from esign.consent_disclosure cd
                 where cd.id = nullif(e.config_snapshot ->> 'consent_disclosure_id','')::uuid),
    'settings', jsonb_build_object(
      'signature_options', jsonb_build_object(
        'typed', coalesce((e.config_snapshot ->> 'allow_typed')::boolean, true),
        'drawn', coalesce((e.config_snapshot ->> 'allow_drawn')::boolean, true),
        'uploaded', coalesce((e.config_snapshot ->> 'allow_uploaded')::boolean, true),
        'phone', coalesce((e.config_snapshot ->> 'allow_phone')::boolean, true)),
      'fill_all_allowed', coalesce((e.config_snapshot ->> 'fill_all_allowed')::boolean, true),
      'delegation_allowed', coalesce((e.config_snapshot ->> 'delegation_allowed')::boolean, false),
      'message_to_sender_allowed', coalesce((e.config_snapshot ->> 'message_to_sender_allowed')::boolean, true),
      'form_view', coalesce(e.config_snapshot ->> 'form_view', 'available'),
      'date_format_default', coalesce(e.config_snapshot ->> 'date_format_default', 'MM/DD/YYYY')),
    'progress', jsonb_build_object('required_total', v_total,
                                   'required_done', greatest(v_total - jsonb_array_length(v_missing), 0)),
    'remaining_after_me', (select count(*) from esign.envelope_signer o
                            where o.envelope_id = e.id and o.id <> all (v_acts) and o.is_required
                              and o.role in ('signer','approver','viewer')
                              and o.status not in ('signed','acknowledged','delegated')),
    'signature_options', jsonb_build_object('typed', e.config_snapshot -> 'allow_typed',
                                            'drawn', e.config_snapshot -> 'allow_drawn'),
    'branding', e.config_snapshot -> 'branding');
end $$;
drop function if exists esign._act_download(jsonb, uuid);
CREATE OR REPLACE FUNCTION esign._act_download(p_ctx jsonb, p_document_id uuid, p_purpose text DEFAULT 'download'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
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
  -- ours #10: rendering the page is not a download; only 'download' writes the ledger row.
  if coalesce(p_purpose, 'download') <> 'render' then
  perform esign._event(s.envelope_id, 'downloaded', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_document_id => d.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label',
                       p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent',
                       p_payload => jsonb_build_object('document_hash', d.content_hash));
  end if;
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'document_id', d.id, 'name', d.name,
                            'content_file_id', d.content_file_id,
                            'content_file_version', d.content_file_version,
                            'content_hash', d.content_hash,
                            'ticket_expires_at', now() + make_interval(secs => v_ttl),
                            'detail', 'exchange this with the file service for a short-lived signed URL; an outsider never receives a durable file URL (§2.8)');
end $function$;

CREATE OR REPLACE FUNCTION esign.esign_sign_download(p_signer_id uuid, p_document_id uuid, p_ip inet DEFAULT NULL::inet, p_ua text DEFAULT NULL::text, p_purpose text DEFAULT 'download'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_download(c, p_document_id, p_purpose);
end $function$;

CREATE OR REPLACE FUNCTION esign.esign_signer_download_url(p_session text, p_document_id uuid, p_ip inet DEFAULT NULL::inet, p_ua text DEFAULT NULL::text, p_purpose text DEFAULT 'download'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'read', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  -- RECORDED DECISION 8 — the `download` verb, on the document, per §5.3 law 2. The helper RETURNS
  -- its refusal, so the result is checked; a raise here would be breakage, not refusal.
  begin
    if not coalesce((platform.assert_outsider_scope(
           p_session, 'esign_envelope_document', p_document_id, 'download', p_ip) ->> 'granted')::boolean, false) then
      return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
    end if;
  exception when others then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
  end;
  return esign._act_download(c, p_document_id, p_purpose);
end $function$;

CREATE OR REPLACE FUNCTION esign._can_act(p_signer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
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
  if s.status in ('signed','declined','delegated','expired','acknowledged') then
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
       and b.role <> 'cc_recipient' and b.status not in ('signed','acknowledged','delegated');   -- A-F3
    if v_blockers > 0 then
      return jsonb_build_object('can_act', false, 'reason', 'waiting_on_earlier_position',
                                'blockers', v_blockers, 'position', s.position);
    end if;
  end if;
  return jsonb_build_object('can_act', true, 'position', s.position, 'envelope_id', s.envelope_id);
end $function$;

CREATE OR REPLACE FUNCTION esign._maybe_complete(p_envelope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare e esign.envelope%rowtype; v_outstanding int; v_cert jsonb; r record;
begin
  select * into e from esign.envelope where id = p_envelope_id for update;   -- serialise the race
  if e.status = 'completed' then
    return jsonb_build_object('completed', true, 'already', true,
                              'certificate_id', e.certificate_id);
  end if;
  if e.status not in ('sent','in_progress') then
    return jsonb_build_object('completed', false, 'reason', 'envelope_' || e.status);
  end if;

  select count(*) into v_outstanding from esign.envelope_signer s
   where s.envelope_id = p_envelope_id and s.is_required
     and s.role in ('signer','approver','viewer') and s.status not in ('signed','acknowledged','delegated');   -- A-F3
  if v_outstanding > 0 then
    if e.status = 'sent' then
      update esign.envelope set status = 'in_progress' where id = p_envelope_id;
    end if;
    -- the ordered walk advances: notify exactly whoever may act now
    perform esign._notify_actionable(p_envelope_id, 'esign.signature_requested');
    return jsonb_build_object('completed', false, 'outstanding', v_outstanding);
  end if;

  update esign.envelope set status = 'completed', completed_at = now() where id = p_envelope_id;
  perform esign._cancel_scheduled_notices(p_envelope_id);
  -- (Decision I moves the certificate to aidream's finalize; until finalize ships (wave C) it is
  -- still generated here so no completed envelope is left without one.)
  v_cert := esign.generate_certificate(p_envelope_id);

  -- cc_recipient tokens are minted READ-ONLY AT COMPLETION, never at send (§3.3).
  for r in select * from esign.envelope_signer
            where envelope_id = p_envelope_id and role = 'cc_recipient'
              and actor_type = 'external' and actor_token_id is null loop
    perform platform.mint_outsider_token(
      p_consumer_key => 'esign.signer', p_subject_type => 'esign_envelope_signer',
      p_subject_id => r.id,
      p_scope => jsonb_build_object(
        'consumer_key','esign.signer',
        'subject', jsonb_build_object('type','esign_envelope_signer','id', r.id),
        'grants', jsonb_build_array(
          jsonb_build_object('resource','esign_envelope','id', p_envelope_id,'actions', jsonb_build_array('read')),
          jsonb_build_object('resource','esign_envelope_document','parent_id', p_envelope_id,'actions', jsonb_build_array('read','download')),
          jsonb_build_object('resource','esign_envelope_signer','id', r.id,'actions', jsonb_build_array('read')))),
      p_organization_id => e.organization_id,
      p_recipient => jsonb_build_object('name', r.full_name, 'email', r.email, 'verification_target', r.email),
      p_overrides => jsonb_build_object('expires_at', e.expires_at));
  end loop;

  perform esign._notify(p_envelope_id, 'esign.completed', p_to_user => e.created_by,
                        p_to_address => null,
                        p_subject => 'Signing complete: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('certificate_id', v_cert -> 'certificate_id',
                                                        'callback_key', e.callback_key));
  return jsonb_build_object('completed', true, 'certificate_id', v_cert -> 'certificate_id');
end $function$;

create or replace function esign._act_acknowledge(p_ctx jsonb) returns jsonb
language plpgsql security definer set search_path = esign, public as $$
-- D2.1 "Needs to view": a viewer's finished step.
declare s esign.envelope_signer%rowtype; v_can jsonb; v_done jsonb;
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v_can := esign._can_act(s.id);
  if not (v_can ->> 'can_act')::boolean then
    return jsonb_build_object('granted', false, 'reason', v_can ->> 'reason');
  end if;
  if s.role <> 'viewer' then
    return jsonb_build_object('granted', false, 'reason', 'not_a_viewer');
  end if;
  if s.document_previewed_at is null then
    return jsonb_build_object('granted', false, 'reason', 'document_not_previewed');
  end if;
  perform esign._arm();
  update esign.envelope_signer set status = 'acknowledged' where id = s.id;
  perform esign._event(s.envelope_id, 'acknowledged', p_ctx ->> 'actor_type', p_signer_id => s.id,
                       p_actor_user_id => (p_ctx ->> 'actor_user_id')::uuid,
                       p_actor_token_id => (p_ctx ->> 'actor_token_id')::uuid,
                       p_actor_label => p_ctx ->> 'actor_label', p_auth_method => p_ctx ->> 'auth_method',
                       p_ip => (p_ctx ->> 'ip')::inet, p_user_agent => p_ctx ->> 'user_agent');
  perform esign._cancel_scheduled_notices(s.envelope_id, s.id);
  v_done := esign._maybe_complete(s.envelope_id);
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'acknowledged_at', now(), 'envelope', v_done);
end $$;

create or replace function esign.esign_sign_acknowledge(p_signer_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_acknowledge(c);
end $$;

create or replace function esign.esign_signer_acknowledge(p_session text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'sign', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_acknowledge(c);
end $$;

create or replace function esign._act_history(p_ctx jsonb) returns jsonb
language plpgsql stable security definer set search_path = esign, public as $$
-- S9.6: the envelope-level milestones plus this signer's own events; never another person's address.
declare s esign.envelope_signer%rowtype; v_acts uuid[];
begin
  select * into s from esign.envelope_signer where id = (p_ctx ->> 'signer_id')::uuid;
  v_acts := esign._acts_for(s.id);
  return jsonb_build_object('granted', true, 'events', coalesce((
    select jsonb_agg(jsonb_build_object(
             'event', v.event_type, 'at', v.occurred_at,
             'label', case v.event_type
               when 'sent' then 'Sent' when 'completed' then 'Completed' when 'voided' then 'Cancelled'
               when 'expired' then 'Expired' when 'opened' then 'Opened' when 'viewed' then 'Viewed the document'
               when 'consent_given' then 'Agreed to sign electronically' when 'signature_adopted' then 'Adopted a signature'
               when 'signed' then 'Signed' when 'declined' then 'Declined' when 'delegated' then 'Assigned to someone else'
               when 'downloaded' then 'Downloaded a document' when 'authenticated' then 'Verified identity'
               when 'acknowledged' then 'Finished reviewing' when 'reminded' then 'Reminded'
               when 'signature_handoff_started' then 'Started signing on a phone'
               when 'signature_handoff_completed' then 'Signed on a phone'
               else initcap(replace(v.event_type, '_', ' ')) end,
             'mine', v.signer_id = any (v_acts)) order by v.occurred_at)
      from esign.envelope_event v
     where v.envelope_id = s.envelope_id
       and (v.event_type in ('sent','completed','voided','expired') or v.signer_id = any (v_acts))), '[]'::jsonb));
end $$;

create or replace function esign.esign_sign_history(p_signer_id uuid, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_history(c);
end $$;

create or replace function esign.esign_signer_history(p_session text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_outsider(p_session, 'read', p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c - 'true_reason'; end if;
  return esign._act_history(c);
end $$;
CREATE OR REPLACE FUNCTION esign._act_delegate(p_ctx jsonb, p_full_name text, p_email text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare s esign.envelope_signer%rowtype; e esign.envelope%rowtype; v_can jsonb; v_new uuid; v_tok jsonb; v_uid uuid;
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

  -- §5.4: a delegate who is a member of the envelope's organization signs with their account.
  v_uid := esign.org_member_by_email(s.organization_id, lower(btrim(p_email)));
  perform esign._arm();
  insert into esign.envelope_signer
    (organization_id, envelope_id, position, role, actor_type, signer_user_id, full_name, email,
     auth_method, status, is_required, verification_factor, color_index, delegated_from_signer_id)
  values (s.organization_id, s.envelope_id, s.position, s.role,
          case when v_uid is null then 'external' else 'internal_user' end, v_uid,
          p_full_name, lower(btrim(p_email)),
          case when v_uid is null then 'token_link' else 'session' end, 'pending', s.is_required,
          case when v_uid is null then trim(both '"' from (e.config_snapshot -> 'verification_factor')::text) end,
          s.color_index, s.id)
  returning id into v_new;

  -- A-F3: the delegator is no longer required, and `delegated` never blocks or stays outstanding.
  update esign.envelope_signer
     set status = 'delegated', delegated_to_signer_id = v_new, delegation_reason = p_reason,
         is_required = false
   where id = s.id;
  perform esign._cancel_scheduled_notices(s.envelope_id, s.id);
  if e.created_by is not null then
    perform esign._notify(s.envelope_id, 'esign.delegated', s.id, p_to_user => e.created_by,
                          p_subject => coalesce(s.full_name, 'A signer') || ' assigned ' || coalesce(e.title, ''),
                          p_channel => 'email');
  end if;
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
end $function$;

create or replace function esign.esign_sign_delegate(p_signer_id uuid, p_full_name text, p_email text, p_reason text, p_ip inet default null, p_ua text default null)
returns jsonb language plpgsql security definer set search_path = esign, public as $$
declare c jsonb; begin
  c := esign._ctx_internal(p_signer_id, p_ip, p_ua);
  if not (c ->> 'granted')::boolean then return c; end if;
  return esign._act_delegate(c, p_full_name, p_email, p_reason);
end $$;

CREATE OR REPLACE FUNCTION esign._act_decline(p_ctx jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
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
  perform esign._cancel_scheduled_notices(s.envelope_id);
  perform esign._notify(s.envelope_id, 'esign.declined', s.id, p_to_user => e.created_by,
                        p_subject => 'Signature declined: ' || coalesce(e.title,''),
                        p_payload => jsonb_build_object('reason', p_reason, 'signer', s.full_name));
  perform esign._disarm();
  return jsonb_build_object('granted', true, 'signer_id', s.id, 'envelope_status', 'declined',
                            'tokens_revoked', v_revoked);
end $function$;

create or replace function esign._session_end_reason(p_session text) returns text
language plpgsql stable security definer set search_path = esign, public as $$
-- §5.9 (A-F2): only a caller holding a once-valid session secret reaches this, so naming why the
-- SESSION ended is no oracle; anything about the token itself stays the uniform dead-link answer.
declare ses platform.actor_session%rowtype; t platform.actor_token%rowtype;
begin
  select * into ses from platform.actor_session
   where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
  if not found then return 'link_no_longer_valid'; end if;
  select * into t from platform.actor_token where id = ses.actor_token_id;
  if t.id is null or not t.is_active or t.revoked_at is not null or t.expires_at <= now() then
    return 'link_no_longer_valid';
  end if;
  if ses.revoked_at is not null and exists (
       select 1 from platform.actor_session n
        where n.actor_token_id = t.id and n.id <> ses.id and n.revoked_at is null and n.issued_at >= ses.issued_at) then
    return 'session_taken_over';
  end if;
  if ses.revoked_at is null and ses.expires_at <= now() then
    return 'session_expired';
  end if;
  return 'link_no_longer_valid';
end $$;

CREATE OR REPLACE FUNCTION esign._ctx_outsider(p_session text, p_action text, p_ip inet, p_ua text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'esign', 'public'
AS $function$
declare v_ctx jsonb; s esign.envelope_signer%rowtype; t platform.actor_token%rowtype;
        ses platform.actor_session%rowtype; v_token uuid; v_signer uuid;
begin
  -- THE SINGLE ENFORCEMENT POINT (§5.4, RECORDED DECISIONS 2 and 7). One call decides scope,
  -- session validity, `verified_at` and the IP pin, writes the true reason to the token ledger, and
  -- returns ONE uniform envelope. This door adds no second opinion; it resolves who the caller is.
  -- The `exception` arm remains for a genuine PROGRAMMING error (a malformed scope document, a
  -- missing session row) — refusal is data and comes back through `granted`, breakage is an
  -- exception, and neither may reach the caller as anything but the uniform message.
  begin
    select actor_token_id into v_token from platform.actor_session
     where session_hash = encode(extensions.digest(coalesce(p_session,''),'sha256'),'hex');
    select subject_id into v_signer from platform.actor_token
     where id = v_token and consumer_key = 'esign.signer';
    v_ctx := platform.assert_outsider_scope(p_session, 'esign_envelope_signer', v_signer, p_action, p_ip);
    if not coalesce((v_ctx ->> 'granted')::boolean, false) then
      return jsonb_build_object('granted', false, 'reason', esign._session_end_reason(p_session));
    end if;
  exception when others then
    return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid');
  end;

  select * into s from esign.envelope_signer where id = (v_ctx ->> 'subject_id')::uuid;
  if not found then return jsonb_build_object('granted', false, 'reason', 'link_no_longer_valid'); end if;
  select * into t from platform.actor_token where id = (v_ctx ->> 'actor_token_id')::uuid;
  select * into ses from platform.actor_session where id = (v_ctx ->> 'session_id')::uuid;
  -- §5.9: the session's idle time slides on every granted act (never past the token's own expiry).
  if exists (select 1 from platform.outsider_consumer c
              where c.consumer_key = t.consumer_key and c.session_sliding and c.is_active and c.deleted_at is null) then
    update platform.actor_session
       set expires_at = least(now() + make_interval(mins => coalesce(
             (select max(c.session_ttl_minutes) from platform.outsider_consumer c
               where c.consumer_key = t.consumer_key and c.is_active and c.deleted_at is null), 30)), t.expires_at)
     where id = ses.id;
  end if;

  -- `verification_passed` below is EVIDENCE, not a gate: it is what the certificate reports about
  -- how this person was authenticated. The gate lives in the helper, and only in the helper.
  return jsonb_build_object(
    'granted', true, 'signer_id', s.id, 'envelope_id', s.envelope_id,
    'organization_id', s.organization_id,
    'actor_type', 'external_signer', 'actor_user_id', null,
    'actor_token_id', t.id, 'session_id', ses.id,
    'actor_label', s.full_name || ' <' || s.email || '>',
    'auth_method', s.auth_method,
    'verification_factor', t.verification_factor,
    'verification_passed', (t.verification_factor = 'none') or (ses.verified_at is not null),
    'verified_at', ses.verified_at,
    'ip', host(coalesce(p_ip, ses.ip)), 'user_agent', coalesce(p_ua, ses.user_agent));
end $function$;

-- ═══ DOORS (generated) ═══

-- Every new SECURITY DEFINER function declares who may call it (§5.8; provision_shape_guard).
delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','_enforce'),
  ('esign','_acts_for'),
  ('esign','_my_fields'),
  ('esign','_my_groups'),
  ('esign','_plain_values'),
  ('esign','_resolve_values'),
  ('esign','_missing_required'),
  ('esign','_value_problem'),
  ('esign','_act_save_values'),
  ('esign','esign_signer_save_values'),
  ('esign','_act_sign'),
  ('esign','esign_signer_sign'),
  ('esign','_act_adopt'),
  ('esign','esign_signer_adopt_signature'),
  ('esign','_act_load'),
  ('esign','_act_download'),
  ('esign','esign_signer_download_url'),
  ('esign','_can_act'),
  ('esign','_maybe_complete'),
  ('esign','_act_acknowledge'),
  ('esign','esign_signer_acknowledge'),
  ('esign','_act_history'),
  ('esign','esign_signer_history'),
  ('esign','_act_delegate'),
  ('esign','_act_decline'),
  ('esign','_session_end_reason'),
  ('esign','_ctx_outsider'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Internal e-sign step; every id argument is a row the calling door already authorised.', 'esign_parity_04_signing_core',
       'server_only: called only by the e-sign signing doors, which authorise the caller first; no client calls it directly', false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','_enforce'),
  ('esign','_acts_for'),
  ('esign','_my_fields'),
  ('esign','_my_groups'),
  ('esign','_plain_values'),
  ('esign','_resolve_values'),
  ('esign','_missing_required'),
  ('esign','_value_problem'),
  ('esign','_act_save_values'),
  ('esign','esign_signer_save_values'),
  ('esign','_act_sign'),
  ('esign','esign_signer_sign'),
  ('esign','_act_adopt'),
  ('esign','esign_signer_adopt_signature'),
  ('esign','_act_load'),
  ('esign','_act_download'),
  ('esign','esign_signer_download_url'),
  ('esign','_can_act'),
  ('esign','_maybe_complete'),
  ('esign','_act_acknowledge'),
  ('esign','esign_signer_acknowledge'),
  ('esign','_act_history'),
  ('esign','esign_signer_history'),
  ('esign','_act_delegate'),
  ('esign','_act_decline'),
  ('esign','_session_end_reason'),
  ('esign','_ctx_outsider'))
   and p.prosecdef
on conflict do nothing;

delete from platform.client_callable_door d
 where (d.schema_name, d.function_name) in (
  ('esign','esign_sign_save_values'),
  ('esign','esign_sign'),
  ('esign','esign_sign_adopt_signature'),
  ('esign','esign_sign_download'),
  ('esign','esign_sign_acknowledge'),
  ('esign','esign_sign_history'),
  ('esign','esign_sign_delegate'))
   and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = d.schema_name and p.proname = d.function_name
                      and pg_get_function_identity_arguments(p.oid) = d.identity_args);
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, anonymous_purpose, argument_rules)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'Signed-in door; every id argument is checked against the callers own access inside the function (CONTRACT.md v2 §6).', 'esign_parity_04_signing_core', null, true, false,
       null,
       jsonb_build_object('version', 1, 'arguments', (
         select jsonb_object_agg(a.nm, jsonb_build_object(
                  'type', format_type(a.ty, null), 'position', a.pos,
                  'optional', a.pos > p.pronargs - p.pronargdefaults,
                  'foreign', case when format_type(a.ty, null) in ('uuid', 'uuid[]')
                                  then jsonb_build_object('bounded', true, 'note', case a.nm
                                    when 'p_signer_id' then 'esign._ctx_internal refuses any signer row whose user is not auth.uid() before any read or write.'
                                    when 'p_image_file_id' then 'Stored as a pointer on the caller''s own signer row only; nothing is read from it or returned.'
                                    when 'p_document_id' then 'Matched to a document on the caller''s own envelope before any read.'
                                    when 'p_organization_id' then 'esign.may_send_in refuses an organization the caller is not a member of.'
                                    else 'Checked against the caller''s own access inside the function before any read or write.' end)
                                  else jsonb_build_object('not_an_id', true) end))
           from unnest(p.proargnames[1:p.pronargs], p.proargtypes::oid[]) with ordinality a(nm, ty, pos)))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
  ('esign','esign_sign_save_values'),
  ('esign','esign_sign'),
  ('esign','esign_sign_adopt_signature'),
  ('esign','esign_sign_download'),
  ('esign','esign_sign_acknowledge'),
  ('esign','esign_sign_history'),
  ('esign','esign_sign_delegate'))
on conflict do nothing;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_save_values' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_adopt_signature' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_download' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_acknowledge' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_history' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
do $g$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'esign' and p.proname = 'esign_sign_delegate' loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop; end $g$;
