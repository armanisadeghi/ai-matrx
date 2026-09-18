-- chair-step: replaces three of this lane's own bodies so their pgcrypto calls are schema-qualified — every door runs with `search_path = pg_catalog`, where `digest` and `gen_random_bytes` do not exist, so issuing a token, verifying one and landing an inbound delivery all raised `function gen_random_bytes(integer) does not exist`; replacements are judged by the allow-list, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.anon_inbound_land(text,text,jsonb,jsonb,text) 0ddce5f571924e0971639000cee52faa01ca1052236d2d628b43a35ca9a42912
-- based-on: custom.anon_token_issue(uuid,text,jsonb,uuid,uuid,uuid,timestamp with time zone) 718fced17b2c3c33d2d648d98de7091583bcd556cc497ee4a7d9403a5fa53c31
-- based-on: custom.anon_token_verify(text,text,text) a75ac0f001e0c4b5fff0978a06e9b2c9c0cf4ad843dfcefd5d4d6ce8c6c698b5
--
-- W4-ANON, file 3 — THE CRYPTO CALLS ARE QUALIFIED, FOR THE SAME REASON THE TYPES ARE.
--
-- WHAT THE GREEN SUITE FOUND, one line into PART 1:
--     ERROR: function gen_random_bytes(integer) does not exist
--
-- It is the same class as `permission_level` (W4-IO file 15) and it is worth saying twice: a
-- function pinned to `SET search_path TO 'pg_catalog'` — which every door here is, correctly —
-- must qualify EVERY name it uses that is not in `pg_catalog`. pgcrypto lives in `extensions`
-- on this database, so `digest(...)` and `gen_random_bytes(...)` resolve to nothing at run
-- time. All three bodies created cleanly and raised on their first call.
--
-- The three: `anon_token_issue` (mints the secret and stores its digest),
-- `anon_token_verify` (hashes the presented secret to find the token) and
-- `anon_inbound_land` (compares a webhook's shared secret). Census:
-- `prosrc ~ '[^.]digest\(' or prosrc ~ '[^.]gen_random_bytes\('` over `custom.anon_*`.
--
-- NOTHING ABOUT THE SECURITY MODEL MOVES. The secret is still minted once and returned once,
-- only its sha256 is stored, and a database read still cannot produce a working token.
--
-- THE INVERSE: `migrations/inverse/w4_anon_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.anon_inbound_land(p_address text, p_secret text, p_payload jsonb, p_raw_payload jsonb DEFAULT '{}'::jsonb, p_client_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_in  custom.anon_inbound;
  v_id  uuid;
  v_ex  uuid;
begin
  select * into v_in from custom.anon_inbound
   where address = p_address and deleted_at is null;
  if not found then
    raise exception 'No inbound address "%".', p_address
      using errcode = '42501',
            hint = 'The address is what authorises the delivery, so an unknown one is refused without saying whether it ever existed.';
  end if;
  if v_in.disabled_at is not null then
    raise exception 'The inbound address "%" is switched off.', p_address
      using errcode = '42501',
            hint = 'Whoever owns the Table disabled it. Everything that arrived before is still there.';
  end if;
  -- A webhook presents a shared secret; an email address IS the secret, so there is nothing to
  -- present. Saying that in one branch is clearer than pretending both are the same.
  if v_in.secret_hash is not null
     and v_in.secret_hash is distinct from encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') then
    raise exception 'That is not the secret for "%".', p_address
      using errcode = '42501';
  end if;

  perform custom.assert_store_door(v_in.organization_id, 'custom.anon_inbound_land');

  if p_client_key is not null then
    select s.id into v_ex from custom.anon_submission s
     where s.organization_id = v_in.organization_id and s.inbound_id = v_in.id
       and s.client_key = p_client_key;
    if v_ex is not null then return v_ex; end if;
  end if;

  -- The ORIGINATING PAYLOAD is kept, always. HubSpot's forwarding address is only useful
  -- because the message is still there when somebody asks why the record says what it says.
  insert into custom.anon_submission (organization_id, form_id, inbound_id, table_id, source,
                                      payload, raw_payload, client_key, state, remote_origin)
  values (v_in.organization_id, v_in.form_id, v_in.id, v_in.table_id, v_in.source,
          coalesce(p_payload, '{}'::jsonb), coalesce(p_raw_payload, '{}'::jsonb),
          p_client_key, 'quarantined', p_address)
  returning id into v_id;

  update custom.anon_inbound set last_received_at = now()
   where custom.anon_inbound.id = v_in.id
     and custom.anon_inbound.organization_id = v_in.organization_id;

  if v_in.form_id is not null then
    perform custom.anon_clear(v_in.organization_id, v_id);
  end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.anon_token_issue(p_organization_id uuid, p_mode text, p_allowed_origins jsonb, p_form_id uuid DEFAULT NULL::uuid, p_saved_view_id uuid DEFAULT NULL::uuid, p_record_id uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(token_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user   uuid := custom.query_principal();
  v_table  uuid;
  v_secret text;
  v_id     uuid;
  v_n      integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_issue');
  if coalesce(p_mode, '') not in ('read', 'write') then
    raise exception 'custom.anon_token_issue: mode is read or write, not "%". A token carrying both would be one credential holding two decisions, and the second is always the one nobody meant to grant.', p_mode
      using errcode = '22023';
  end if;

  select count(*) into v_n from jsonb_array_elements_text(coalesce(p_allowed_origins, '[]'::jsonb));
  if v_n = 0 then
    -- An empty origin list is refused at ISSUE rather than silently meaning "everywhere".
    raise exception 'custom.anon_token_issue: name the origins this token works from.'
      using errcode = '22004',
            hint = 'An embed token with no origin list is a token that works from any page on the internet, including an attacker''s. Pass the exact origins, scheme and host and port: ["https://example.com"].';
  end if;

  if p_mode = 'write' then
    if p_form_id is null then
      raise exception 'custom.anon_token_issue: a write token must name the form it writes to'
        using errcode = '22004';
    end if;
    select f.table_id into v_table from custom.anon_form f
     where f.organization_id = p_organization_id and f.id = p_form_id and f.deleted_at is null;
    if v_table is null then
      raise exception 'custom.anon_token_issue: no form % in this organization', p_form_id
        using errcode = '23503';
    end if;
    if not iam.has_access_for(v_user, 'record', v_table, 'admin'::public.permission_level) then
      raise exception 'You may not issue a write token for this form.'
        using errcode = '42501',
              hint = 'Issuing a write token hands a stranger a way in, so it needs the admin level on the Table the form writes into.';
    end if;
  elsif p_record_id is not null then
    if not iam.has_access_for(v_user, 'record', p_record_id, 'admin'::public.permission_level) then
      raise exception 'You may not issue a read token for this record.'
        using errcode = '42501',
              hint = 'A read token lets anyone holding it read the record from an allowed origin, so issuing one needs the admin level on that record.';
    end if;
  end if;

  -- The secret is minted here and returned ONCE. Only its digest is stored, so a database read
  -- — a backup, a support query, a leaked dump — cannot produce a working token.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into custom.anon_token (organization_id, form_id, saved_view_id, record_id, mode,
                                 secret_hash, allowed_origins, expires_at, created_by)
  values (p_organization_id, p_form_id, p_saved_view_id, p_record_id, p_mode,
          encode(extensions.digest(v_secret, 'sha256'), 'hex'),
          coalesce(p_allowed_origins, '[]'::jsonb), p_expires_at, v_user)
  returning id into v_id;

  token_id := v_id; secret := v_secret; return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.anon_token_verify(p_secret text, p_origin text, p_required_mode text)
 RETURNS TABLE(token_id uuid, organization_id uuid, form_id uuid, saved_view_id uuid, record_id uuid, mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_hash text := encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
  v_tok  custom.anon_token;
begin
  select * into v_tok from custom.anon_token t
   where t.secret_hash = v_hash and t.deleted_at is null;
  if not found then
    raise exception 'This embed link is not valid.'
      using errcode = '42501',
            hint = 'The token does not match any issued token. It may have been mistyped, or it may have been rotated — issue a new embed and replace the old one.';
  end if;
  if v_tok.revoked_at is not null then
    raise exception 'This embed link was revoked on %.', to_char(v_tok.revoked_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Whoever owns the form or view revoked it. A new embed has to be issued; the old link will never work again.';
  end if;
  if v_tok.expires_at is not null and v_tok.expires_at < now() then
    raise exception 'This embed link expired on %.', to_char(v_tok.expires_at, 'YYYY-MM-DD')
      using errcode = '42501',
            hint = 'Issue a new embed. The expiry is a property of the token, so extending it is not possible — that is what makes an expiry mean something.';
  end if;
  -- THE ORIGIN CHECK, AND IT IS EXACT. Not a suffix match, not a wildcard: an attacker's
  -- `https://example.com.evil.test` passes a suffix check and fails this one.
  if not exists (select 1 from jsonb_array_elements_text(v_tok.allowed_origins) o
                  where o = p_origin) then
    raise exception 'This embed does not work on %.', coalesce(p_origin, '(no origin)')
      using errcode = '42501',
            hint = 'The token names the exact sites it works from. Add this origin to the embed, or use the embed that was issued for this site.';
  end if;
  if p_required_mode is not null and v_tok.mode <> p_required_mode then
    raise exception 'This embed is a %-only link.', v_tok.mode
      using errcode = '42501',
            hint = 'A read token cannot write and a write token cannot read. Issue the one you need; a token carrying both would be one credential holding two decisions.';
  end if;

  update custom.anon_token set last_used_at = now()
   where custom.anon_token.id = v_tok.id
     and custom.anon_token.organization_id = v_tok.organization_id;

  token_id := v_tok.id; organization_id := v_tok.organization_id; form_id := v_tok.form_id;
  saved_view_id := v_tok.saved_view_id; record_id := v_tok.record_id; mode := v_tok.mode;
  return next;
end;
$function$
;

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
