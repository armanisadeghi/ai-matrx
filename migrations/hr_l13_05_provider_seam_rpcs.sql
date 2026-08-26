-- HR L13 — migration 5 (register item HRB-025, lane lane-l13-export).
--
-- THE PROVIDER SEAM'S SQL SURFACE — five functions, and one of them is a unique violation caught
-- on purpose.
--
-- Authority: SPEC-CONTRACTS §3.6 (the seam, its four invariants, the MCP rules, E-27…E-31),
-- readiness §2.2, D12/D22. Applied live as `hr_l13_05_provider_seam_rpcs`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 WEBHOOK IDEMPOTENCY IS AN INSERT THAT CATCHES A UNIQUE VIOLATION, NOT A CHECK-THEN-INSERT.
--    §3.6: "a provider that retries five times produces one state change." A SELECT followed by an
--    INSERT is a race whose loser double-applies the provider's state change; `ON CONFLICT DO
--    NOTHING` against the partial unique index on
--    (organization_id, provider_key, provider_event_id) cannot lose it. The function reports
--    `duplicate = true` so the caller can answer the provider 200 either way — a provider that
--    sees an error for a retry it was told to make will keep retrying forever.
--
-- 2. 🚨 THE WEBHOOK ROUTE RESOLVES ITS ORGANIZATION FROM THE BINDING THE SIGNATURE IDENTIFIES —
--    NEVER FROM THE BODY. `hr.provider_webhook_candidates` takes only (seam, provider_key), which
--    are PATH segments, and returns every candidate binding with its SECRET REFERENCE. The caller
--    resolves each ref and compares HMACs; whichever binding validates supplies the org. There is
--    deliberately no `p_organization_id` argument on this function: an unauthenticated route that
--    accepts a caller-supplied tenant is a tenant-crossing hole with a friendly name (readiness
--    U-12).
--
-- 3. THE SECRET ITSELF NEVER APPEARS IN A RESULT SET. The candidates function returns
--    `webhook_secret_ref`, a pointer, and the aidream side resolves it through the org secrets
--    battery. Returning plaintext here would put every candidate binding's shared secret into a
--    query result — and into any log, plan, or error that ever captured one — for the sake of
--    saving one lookup.
--
-- 4. E-27's PROJECTION IS FIXED IN SQL, in one function whose whole job is to say no to secrets.
--    §3.6: "GET /hr/providers/{seam}/bindings returns {provider_key, display_name, is_active,
--    capabilities[], bound_at} and no secret material." Assembling that list in Python would put
--    the decision in the same file as the code that has the secrets in scope.
--
-- 5. `provider_sync_targets` DEFINES "OUTSTANDING" AS A LEDGER FACT, not a status column: an
--    outbound event with an external_ref and no inbound event carrying a terminal state for the
--    same subject. That keeps E-30 honest for a binding whose consumer table this seam has never
--    heard of — which is the whole promise of building the seam once for five seams.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ---------------------------------------------------------------------------------
-- 1. hr.provider_bindings_list — E-27's projection (RECORDED DECISION 4).
-- ---------------------------------------------------------------------------------
create or replace function hr.provider_bindings_list(
  p_organization_id uuid,
  p_seam            text)
returns table (
  binding_id      uuid,
  organization_id uuid,
  seam            text,
  provider_key    text,
  display_name    text,
  connector_kind  text,
  is_active       boolean,
  capabilities    text[],
  bound_at        timestamptz)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  -- No credential_ref. No webhook_secret_ref. No connector. Provider credentials never reach a
  -- client, and this column list is the enforcement, not a filter applied later.
  select pb.id, pb.organization_id, pb.seam, pb.provider_key, pb.display_name,
         pb.connector_kind, pb.is_active, pb.capabilities, pb.bound_at
    from hr.provider_binding pb
   where pb.organization_id = p_organization_id
     and pb.seam = p_seam
     and pb.deleted_at is null
   order by pb.is_active desc, pb.display_name;
$function$;

-- ---------------------------------------------------------------------------------
-- 2. hr.provider_binding_resolve — what a dispatch needs. Still no secrets.
-- ---------------------------------------------------------------------------------
create or replace function hr.provider_binding_resolve(
  p_organization_id uuid,
  p_seam            text,
  p_provider_key    text default null)
returns table (
  binding_id         uuid,
  organization_id    uuid,
  seam               text,
  provider_key       text,
  display_name       text,
  connector_kind     text,
  is_active          boolean,
  capabilities       text[],
  server_version_pin text,
  connector          jsonb)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  -- `connector` carries routes and tool maps, and `token_ref` POINTERS — never token values.
  -- The adapter resolves a pointer at the moment of use.
  select pb.id, pb.organization_id, pb.seam, pb.provider_key, pb.display_name,
         pb.connector_kind, pb.is_active, pb.capabilities, pb.server_version_pin,
         pb.connector - 'credentials'
    from hr.provider_binding pb
   where pb.organization_id = p_organization_id
     and pb.seam = p_seam
     and pb.is_active
     and pb.deleted_at is null
     and (p_provider_key is null or pb.provider_key = p_provider_key)
   order by pb.bound_at desc;
$function$;

-- ---------------------------------------------------------------------------------
-- 3. hr.provider_webhook_candidates — (seam, provider_key) only (DECISIONS 2 + 3).
-- ---------------------------------------------------------------------------------
create or replace function hr.provider_webhook_candidates(
  p_seam         text,
  p_provider_key text)
returns table (
  binding_id         uuid,
  organization_id    uuid,
  seam               text,
  provider_key       text,
  display_name       text,
  connector_kind     text,
  is_active          boolean,
  capabilities       text[],
  server_version_pin text,
  connector          jsonb,
  webhook_secret_ref text)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  -- §3.6 MCP rule 3: "No webhook lane. E-33 does not accept MCP traffic." An MCP binding is
  -- excluded here rather than merely refused later, so its secret is never even a candidate.
  select pb.id, pb.organization_id, pb.seam, pb.provider_key, pb.display_name,
         pb.connector_kind, pb.is_active, pb.capabilities, pb.server_version_pin,
         pb.connector - 'credentials',
         pb.webhook_secret_ref
    from hr.provider_binding pb
   where pb.seam = p_seam
     and pb.provider_key = p_provider_key
     and pb.is_active
     and pb.deleted_at is null
     and pb.connector_kind <> 'mcp'
     and pb.webhook_secret_ref is not null
   order by pb.bound_at desc;
$function$;

-- ---------------------------------------------------------------------------------
-- 4. hr.provider_event_record — 🚨 five retries, one state change (RECORDED DECISION 1).
-- ---------------------------------------------------------------------------------
create or replace function hr.provider_event_record(
  p_organization_id   uuid,
  p_binding_id        uuid,
  p_seam              text,
  p_provider_key      text,
  p_direction         text,
  p_path              text,
  p_subject_token     text,
  p_subject_id        uuid,
  p_provider_event_id text,
  p_external_ref      text,
  p_external_status   text,
  p_mapped_state      text,
  p_result_summary    text,
  p_payload_summary   jsonb,
  p_artifact_file_id  uuid,
  p_signature_verified boolean,
  p_occurred_at       timestamptz)
returns table (event_id uuid, duplicate boolean)
language plpgsql
volatile security definer
set search_path to 'hr', 'public'
as $function$
declare v_id uuid;
begin
  perform hr.arm_write();

  insert into hr.provider_event (
    binding_id, seam, provider_key, direction, path, subject_token, subject_id,
    provider_event_id, external_ref, external_status, mapped_state, result_summary,
    payload_summary, artifact_file_id, signature_verified, occurred_at, received_at,
    processed_at, organization_id, created_by)
  values (
    p_binding_id, p_seam, p_provider_key, p_direction, p_path, p_subject_token, p_subject_id,
    p_provider_event_id, p_external_ref, p_external_status, p_mapped_state, p_result_summary,
    coalesce(p_payload_summary, '{}'::jsonb), p_artifact_file_id, p_signature_verified,
    p_occurred_at, now(), now(), p_organization_id, auth.uid())
  on conflict (organization_id, provider_key, provider_event_id)
    where provider_event_id is not null
    do nothing
  returning id into v_id;

  perform set_config('hr.privileged_write', '', true);

  if v_id is null then
    -- The conflict fired: this provider event is already recorded. That is a SUCCESS for the
    -- caller and a 200 for the provider — a retry that sees an error retries forever.
    select pe.id into v_id from hr.provider_event pe
     where pe.organization_id = p_organization_id
       and pe.provider_key = p_provider_key
       and pe.provider_event_id = p_provider_event_id
     limit 1;
    return query select v_id, true;
    return;
  end if;

  return query select v_id, false;
end
$function$;

-- ---------------------------------------------------------------------------------
-- 5. hr.provider_sync_targets — "outstanding" as a ledger fact (RECORDED DECISION 5).
-- ---------------------------------------------------------------------------------
create or replace function hr.provider_sync_targets(
  p_organization_id uuid,
  p_seam            text,
  p_binding_id      uuid default null,
  p_subject_ids     uuid[] default null)
returns table (
  binding_id         uuid,
  organization_id    uuid,
  seam               text,
  provider_key       text,
  display_name       text,
  connector_kind     text,
  is_active          boolean,
  capabilities       text[],
  server_version_pin text,
  connector          jsonb,
  subject_token      text,
  subject_id         uuid,
  external_ref       text)
language sql
stable security definer
set search_path to 'hr', 'public'
as $function$
  select pb.id, pb.organization_id, pb.seam, pb.provider_key, pb.display_name,
         pb.connector_kind, pb.is_active, pb.capabilities, pb.server_version_pin,
         pb.connector - 'credentials',
         out_e.subject_token, out_e.subject_id, out_e.external_ref
    from hr.provider_event out_e
    join hr.provider_binding pb on pb.id = out_e.binding_id
   where out_e.organization_id = p_organization_id
     and out_e.seam = p_seam
     and out_e.direction = 'outbound'
     and out_e.external_ref is not null
     and pb.is_active
     and pb.deleted_at is null
     and (p_binding_id is null or pb.id = p_binding_id)
     and (p_subject_ids is null or out_e.subject_id = any (p_subject_ids))
     -- Outstanding = no inbound event for this subject has reached a terminal state yet.
     and not exists (
       select 1 from hr.provider_event in_e
        where in_e.organization_id = out_e.organization_id
          and in_e.seam = out_e.seam
          and in_e.subject_token = out_e.subject_token
          and in_e.subject_id = out_e.subject_id
          and in_e.direction = 'inbound'
          and in_e.mapped_state in ('completed','failed','cancelled'))
   order by out_e.occurred_at;
$function$;

-- ---------------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr.provider_bindings_list(uuid,text)',
    'hr.provider_binding_resolve(uuid,text,text)',
    'hr.provider_webhook_candidates(text,text)',
    'hr.provider_event_record(uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,text,jsonb,uuid,boolean,timestamptz)',
    'hr.provider_sync_targets(uuid,text,uuid,uuid[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- The webhook candidates function is reached by the anon-lane HTTP route, but aidream calls it
-- with the SERVICE connection, not as `anon` — the route has no user principal at all. `anon`
-- therefore gets nothing here, and the route's authentication is the HMAC, not a database role.

-- ---------------------------------------------------------------------------------
-- 7. ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
declare f text; v_bad int;
begin
  foreach f in array ARRAY[
    'hr.provider_bindings_list(uuid,text)',
    'hr.provider_binding_resolve(uuid,text,text)',
    'hr.provider_webhook_candidates(text,text)',
    'hr.provider_event_record(uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,text,jsonb,uuid,boolean,timestamptz)',
    'hr.provider_sync_targets(uuid,text,uuid,uuid[])'] loop
    if to_regprocedure(f) is null then raise exception 'hr_l13_05: % did not land', f; end if;
    if has_function_privilege('anon', f, 'execute') then
      raise exception 'hr_l13_05: anon can execute %', f;
    end if;
  end loop;

  -- RECORDED DECISION 4 — E-27's projection must not name a secret column. Checked against the
  -- function's own declared OUT parameters rather than by reading its body.
  -- Matched as `<name> <type>` pairs, not as bare substrings: `connector_kind text` is a
  -- perfectly good column in this projection and a naive LIKE '%connector%' flags it. A guard
  -- that cries wolf gets loosened by the next person, so it is precise here.
  select count(*) into v_bad
    from unnest(ARRAY['credential_ref text','webhook_secret_ref text','connector jsonb']) c
   where pg_get_function_result(to_regprocedure('hr.provider_bindings_list(uuid,text)')) like '%' || c || '%';
  if v_bad > 0 then
    raise exception 'hr_l13_05: the E-27 projection names % secret-bearing column(s)', v_bad;
  end if;

  -- RECORDED DECISION 1 — the idempotency index the ON CONFLICT targets must exist, or the
  -- conflict clause silently never fires and five retries become five state changes.
  if not exists (select 1 from pg_indexes
                  where schemaname='hr' and tablename='provider_event'
                    and indexname='provider_event_once_per_provider_event') then
    raise exception 'hr_l13_05: the webhook idempotency index is missing — ON CONFLICT would never fire';
  end if;
end $$;
