-- chair-step: it REPLACES the bodies of iam.api_key_identity_must_be_minted() (the CRITICAL-1 trigger) and iam.api_key_revoke(uuid), adds three iam doors and one server-only iam function, one restrictive SELECT policy on iam.api_keys and four platform.feature_knob rows. No table is created or altered and no existing key changes: the three live keys are revoked service keys and stay exactly as they are.
-- lane: TABLE-API-1
-- based-on: iam.api_key_identity_must_be_minted() c7899d3160c2799b2d3a1471e83d0f9bbd53a7ae5a3e56c2c5ddfe2a0c571c07
-- based-on: iam.api_key_revoke(uuid) bec1b212d638fcce4a1b0005003c181df430d8c868d97c0990a6cc8a0aec45c3
-- lock: iam,platform
--
-- TABLE-API-1 — A PERSON CAN HOLD A KEY THAT IS THEM.
--
-- WHY. Arman, 2026-09-29, case 1: "one personal API key from settings that IS the person with
-- their full access everywhere; no app registration, no scope choices at creation." Until now a
-- key could only be an organization's SERVICE identity: iam.api_key_create mints a dedicated
-- anonymous-shaped auth.users row per key, and the CRITICAL-1 trigger (2026-09-21) refuses any
-- key whose identity is not such a minted principal, because a client once wrote a key pointing
-- at the organization owner and was authenticated as him. A service identity cannot open the
-- person's own tables, so it cannot be what Arman asked for.
--
-- WHAT CHANGES.
--   1. The trigger blesses a SECOND identity kind, `personal_key`, and only this one way: the
--      writer's own verified sign-in (auth.uid(), read off the request's JWT claims — never
--      app.user_id, never a column the writer supplies) is present AND equals both
--      service_user_id and created_by, AND that account is a real person (not anonymous, not a
--      minted service principal). A service-role or privileged-pool insert has no auth.uid(),
--      so it can never mint a personal key for anybody; a signed-in person can only mint one
--      for themselves. Every other row is refused exactly as before.
--   2. iam.personal_api_key_create(name, organization, expires_at) — the only door that mints
--      one. It refuses a token issued to an OAuth app (the JWT carries `client_id`), so no
--      connected app or agent can turn a revocable sign-in into a permanent key; refuses
--      anonymous and service identities; requires an active membership of the organization
--      the key files its work in by default; mints the secret server-side and returns it ONCE.
--      Its age is capped by the knob api_keys/personal_key_max_age_days (0 = never expires);
--      a later date asked for is brought down to the cap and the answer says so.
--   3. iam.personal_api_key_list() / iam.personal_api_key_revoke(id) — the person's own keys
--      and nobody else's. Revoking flips the status; it touches no membership.
--   4. iam.api_key_revoke(id) — the org-owner door — REFUSES a personal key. Its body
--      soft-deletes every membership of the key's identity, and on a personal key that identity
--      is the person: an owner revoking it would have removed that person from the
--      organization (plan-attack BLOCKER, 2026-09-29).
--   5. A RESTRICTIVE SELECT policy: a personal-key row is visible only to the person it is
--      (and to platform admins — our own admin access is never removed). The org-settings
--      screen's plain table read therefore never lists a member's personal key.
--   6. Knobs: api_keys/personal_key_max_age_days, table_api/requests_per_minute_per_server,
--      table_api/bulk_max_rows, mcp/oauth_dynamic_clients_enabled.

set local lock_timeout = '30s';

-- ── 1. the minted-identity trigger learns the personal kind ────────────────────────────────
create or replace function iam.api_key_identity_must_be_minted()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_signed_in uuid := auth.uid();
begin
  if new.service_user_id is null then
    raise exception 'api_keys: service_user_id is required'
      using errcode = '23502';
  end if;

  -- A SERVICE key: the identity is a principal iam.api_key_create minted for this key alone.
  if exists (
    select 1 from auth.users u
     where u.id = new.service_user_id
       and u.raw_app_meta_data->>'provider' = 'api_key'
  ) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('identity_kind', 'api_key_service');
    return new;
  end if;

  -- A PERSONAL key: the identity is the signed-in person writing the row, and nobody else.
  -- auth.uid() is the request's own verified sign-in; created_by and service_user_id are
  -- columns a writer supplies, so each must EQUAL it — never stand in for it.
  if v_signed_in is not null
     and new.service_user_id = v_signed_in
     and new.created_by = v_signed_in
     and exists (
       select 1 from auth.users u
        where u.id = v_signed_in
          and coalesce(u.is_anonymous, false) = false
          and coalesce(u.raw_app_meta_data->>'provider', '') <> 'api_key'
          and u.deleted_at is null
     ) then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('identity_kind', 'personal_key');
    return new;
  end if;

  raise exception 'api_keys: service_user_id is not an API-key service identity, and it is not the signed-in person minting their own key, so this key would authenticate as somebody who never issued it' using errcode = '42501',
          hint = 'A service key''s identity is minted by iam.api_key_create; a personal key is minted by iam.personal_api_key_create for the signed-in person alone. A key may never point at anyone else. CRITICAL-1, 2026-09-21; personal keys TABLE-API-1, 2026-09-29.',
          detail = jsonb_build_object('service_user_id', new.service_user_id)::text;
end;
$function$;

-- ── 4. the org-owner revoke door refuses a personal key ──────────────────────────────────
create or replace function iam.api_key_revoke(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row iam.api_keys%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'api_key_revoke: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM iam.api_keys WHERE id = p_id;
  IF NOT FOUND THEN
    raise exception 'api_key_revoke: unknown API key' using errcode = 'P0001', detail = jsonb_build_object('id', p_id)::text;
  END IF;

  -- A personal key's identity IS its person. The membership step below would remove that
  -- person from the organization, so this door never touches one (TABLE-API-1).
  IF coalesce(v_row.metadata->>'identity_kind', '') = 'personal_key' THEN
    RAISE EXCEPTION 'api_key_revoke: that is a personal key. Only the person it belongs to revokes it, from their own settings.'
      USING ERRCODE = '42501',
            HINT = 'Removing that person from the organization also stops the key from reaching it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM iam.memberships m
    WHERE m.user_id = v_caller
      AND m.container_type = 'organization'
      AND m.container_id = v_row.organization_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'api_key_revoke: only an organization OWNER may revoke API keys'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.status = 'revoked' THEN
    RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
  END IF;

  UPDATE iam.api_keys
     SET status = 'revoked', revoked_at = now(), updated_by = v_caller
   WHERE id = p_id
  RETURNING * INTO v_row;

  UPDATE iam.memberships
     SET deleted_at = now(), updated_by = v_caller
   WHERE user_id = v_row.service_user_id
     AND container_type = 'organization'
     AND container_id = v_row.organization_id
     AND deleted_at IS NULL;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
END;
$function$;

-- ── 2. the one door that mints a personal key ────────────────────────────────────────────
create function iam.personal_api_key_create(
  p_name text,
  p_organization_id uuid,
  p_expires_at timestamp with time zone default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'extensions'
as $function$
declare
  v_caller uuid := auth.uid();
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  v_max_days integer;
  v_cap timestamptz;
  v_expires timestamptz := p_expires_at;
  v_capped boolean := false;
  v_key_id text;
  v_secret text;
  v_api_key text;
  v_display text;
  v_row iam.api_keys%rowtype;
  v_attempts integer := 0;
begin
  if v_caller is null then
    raise exception 'Sign in to AI Matrx to make a personal API key.' using errcode = '42501';
  end if;
  -- A token an OAuth app holds carries the app's client_id. An app — or an agent working
  -- through one — may act for the person while that sign-in lasts; it may never mint the
  -- person a permanent key of its own.
  if v_claims ? 'client_id' then
    raise exception 'A personal API key can only be made by you, signed in to AI Matrx itself — not by an app you connected.'
      using errcode = '42501',
            hint = 'Open your own Settings, API keys, and make it there.';
  end if;
  if exists (
    select 1 from auth.users u
     where u.id = v_caller
       and (coalesce(u.is_anonymous, false) or coalesce(u.raw_app_meta_data->>'provider', '') = 'api_key')
  ) then
    raise exception 'Only a signed-in person can make a personal API key; a guest or a service key cannot.'
      using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Give the key a name, so you can tell it apart later (for example "usage tracker").'
      using errcode = '22023';
  end if;
  if p_organization_id is null then
    raise exception 'Choose the organization this key works in when a request names none.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from iam.memberships m
     where m.user_id = v_caller
       and m.container_type = 'organization'
       and m.container_id = p_organization_id
       and m.status = 'active'
       and m.deleted_at is null
  ) then
    raise exception 'You are not a member of that organization, so a key cannot work there on your behalf.'
      using errcode = '42501',
            detail = jsonb_build_object('organization_id', p_organization_id)::text;
  end if;
  if v_expires is not null and v_expires <= now() then
    raise exception 'The expiry date has already passed; choose a date in the future, or leave it empty.'
      using errcode = '22023';
  end if;

  v_max_days := coalesce((platform.knob_resolve('api_keys', 'personal_key_max_age_days', p_organization_id, v_caller))::text::integer, 0);
  if v_max_days > 0 then
    v_cap := now() + make_interval(days => v_max_days);
    if v_expires is null or v_expires > v_cap then
      v_capped := v_expires is not null;
      v_expires := v_cap;
    end if;
  end if;

  loop
    v_key_id := iam._api_key_base62(extensions.gen_random_bytes(9));
    exit when not exists (select 1 from iam.api_keys k where k.key_id = v_key_id);
    v_attempts := v_attempts + 1;
    if v_attempts > 5 then
      raise exception 'personal_api_key_create: could not allocate a unique key id; try again.';
    end if;
  end loop;

  v_secret  := iam._api_key_base62(extensions.gen_random_bytes(32));
  v_api_key := 'mx_live_' || v_key_id || '_' || v_secret;
  v_display := left(v_api_key, 12) || '…' || right(v_api_key, 4);

  insert into iam.api_keys (
    organization_id, key_id, secret_hash, display_prefix, name,
    service_user_id, status, expires_at, created_by
  ) values (
    p_organization_id, v_key_id,
    encode(extensions.digest(convert_to(v_api_key, 'utf8'), 'sha256'), 'hex'),
    v_display, btrim(p_name), v_caller, 'active', v_expires, v_caller
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'api_key', v_api_key,
    'key_id', v_row.key_id,
    'kind', 'personal',
    'display_prefix', v_row.display_prefix,
    'name', v_row.name,
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'expires_at', v_row.expires_at,
    'expiry_capped', v_capped,
    'created_at', v_row.created_at
  );
end;
$function$;

-- ── 3. the person's own keys, and only theirs ────────────────────────────────────────────
create function iam.personal_api_key_list()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id,
           'key_id', k.key_id,
           'name', k.name,
           'display_prefix', k.display_prefix,
           'organization_id', k.organization_id,
           'organization_name', o.name,
           'status', k.status,
           'created_at', k.created_at,
           'last_used_at', k.last_used_at,
           'expires_at', k.expires_at,
           'revoked_at', k.revoked_at
         ) order by k.created_at desc), '[]'::jsonb)
    from iam.api_keys k
    left join iam.organizations o on o.id = k.organization_id
   where auth.uid() is not null
     and k.service_user_id = auth.uid()
     and k.created_by = auth.uid()
     and k.metadata->>'identity_kind' = 'personal_key'
     and k.deleted_at is null;
$function$;

create function iam.personal_api_key_revoke(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_caller uuid := auth.uid();
  v_row iam.api_keys%rowtype;
begin
  if v_caller is null then
    raise exception 'Sign in to AI Matrx to revoke your key.' using errcode = '42501';
  end if;
  select * into v_row from iam.api_keys
   where id = p_id
     and service_user_id = v_caller
     and created_by = v_caller
     and metadata->>'identity_kind' = 'personal_key';
  if not found then
    raise exception 'You have no personal key with that id.' using errcode = '02000',
          detail = jsonb_build_object('id', p_id)::text;
  end if;
  if v_row.status = 'revoked' then
    return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
  end if;
  update iam.api_keys
     set status = 'revoked', revoked_at = now(), updated_by = v_caller
   where id = p_id
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
end;
$function$;

revoke all on function iam.personal_api_key_create(text, uuid, timestamp with time zone) from public, anon;
revoke all on function iam.personal_api_key_list() from public, anon;
revoke all on function iam.personal_api_key_revoke(uuid) from public, anon;
grant execute on function iam.personal_api_key_create(text, uuid, timestamp with time zone) to authenticated;
grant execute on function iam.personal_api_key_list() to authenticated;
grant execute on function iam.personal_api_key_revoke(uuid) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers)
values
  ('iam', 'personal_api_key_create', 'p_name text, p_organization_id uuid, p_expires_at timestamp with time zone',
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'timestamptz'::regtype::oid],
   'migrations/campaign/tableapi1_a_person_can_hold_a_key_that_is_them.sql (lane TABLE-API-1)',
   'A signed-in person mints a personal API key that IS them (Arman 2026-09-29, case 1). Refuses OAuth-app tokens, guests and service identities; requires an active membership of the default organization; the secret is minted server-side and returned once.',
   false, true),
  ('iam', 'personal_api_key_list', '', array[]::oid[],
   'migrations/campaign/tableapi1_a_person_can_hold_a_key_that_is_them.sql (lane TABLE-API-1)',
   'The signed-in person''s own personal keys (never the secret or its hash); nobody else''s.',
   false, true),
  ('iam', 'personal_api_key_revoke', 'p_id uuid', array['uuid'::regtype::oid],
   'migrations/campaign/tableapi1_a_person_can_hold_a_key_that_is_them.sql (lane TABLE-API-1)',
   'The signed-in person revokes one of their own personal keys; touches no membership.',
   false, true);

-- ── 5b. is this OAuth client one that registered itself? (server lane only) ───────────────
-- The AI Matrx MCP and the table API refuse sign-ins held by self-registered apps when the
-- knob mcp/oauth_dynamic_clients_enabled is off; this is how they tell one from an app we
-- registered ourselves. Read on the server's own pool; no client may call it.
create function iam.oauth_client_is_dynamic(p_client_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
  select exists (
    select 1 from auth.oauth_clients c
     where c.id = p_client_id
       and c.registration_type::text = 'dynamic'
  );
$function$;

revoke all on function iam.oauth_client_is_dynamic(uuid) from public, anon, authenticated;
grant execute on function iam.oauth_client_is_dynamic(uuid) to service_role;

-- ── 5. a personal key's row is its person's alone ────────────────────────────────────────
create policy api_keys_personal_rows_are_their_owners on iam.api_keys
  as restrictive
  for select
  to authenticated
  using (
    coalesce(metadata->>'identity_kind', '') <> 'personal_key'
    or created_by = (select auth.uid())
    or (select public.is_platform_admin())
  );

-- ── 6. knobs ─────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('api_keys', 'personal_key_max_age_days', '365'::jsonb, '365'::jsonb, 'integer', 'days', 0, 3650,
   'Longest a personal API key lasts',
   'A personal API key stops working this many days after it is made. 0 means it never expires. A person may choose an earlier date; a later one is brought down to this.',
   'agent', 'Agent-set limit (blind approval), lane TABLE-API-1 2026-09-29: GitHub fine-grained tokens allow at most a year; a year keeps a tracker running without a yearly surprise while a leaked key still dies on its own.',
   '2026-12-29', array['organization'], 'lower_only', 'next_load', '50be609f-768d-4509-a30d-cbd3e849a43a'),
  ('table_api', 'requests_per_minute_per_server', '600'::jsonb, '600'::jsonb, 'integer', 'requests', 10, 100000,
   'Table API requests per minute, per person, per server',
   'How many table API and MCP table calls one person may make in a minute, counted by each server process on its own. With several servers running, the platform-wide ceiling is that many times this number.',
   'agent', 'Agent-set limit (blind approval), lane TABLE-API-1 2026-09-29: Airtable allows 5 requests a second per base; 10 a second per person per server is generous for a tracker and a sync job and still stops a runaway loop.',
   '2026-12-29', array['organization'], 'any', 'next_load', 'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93'),
  ('table_api', 'bulk_max_rows', '200'::jsonb, '200'::jsonb, 'integer', 'rows', 1, 1000,
   'Rows one bulk upsert may carry',
   'The most rows one bulk upsert call may carry. The store''s own page ceiling still applies on top of this.',
   'agent', 'Agent-set limit (blind approval), lane TABLE-API-1 2026-09-29: matches the store''s write batch (MAX_WRITE_BATCH 200); one refused row rolls the whole batch back, so a batch must stay small enough to read the failure of.',
   '2026-12-29', array['organization'], 'any', 'next_load', 'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93'),
  ('mcp', 'oauth_dynamic_clients_enabled', 'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null,
   'Apps that registered themselves may reach AI Matrx',
   'When on, an app that registered itself through our OAuth server (Claude, Cursor, ChatGPT and other MCP clients) can use the sign-in a person gave it on the AI Dream MCP and the table API. When off, those sign-ins are refused there at once; apps we registered ourselves keep working. Registration itself is the Supabase OAuth server''s own switch.',
   'agent', 'Lane TABLE-API-1 2026-09-29, Arman: dynamic registration on, behind a switch that turns it off in one move. Default on because 99 self-registered clients already sign people in.',
   '2026-12-29', array[]::text[], 'any', 'next_load', '50be609f-768d-4509-a30d-cbd3e849a43a');
