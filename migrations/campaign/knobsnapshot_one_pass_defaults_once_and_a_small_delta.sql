-- lane: KNOB-SNAPSHOT
--
-- based-on: platform.knob_snapshot(uuid, uuid, jsonb) 7b1ae9c6a36d6a43d5facd477a1b3628d94452223650075bc925ac03fb234b9f
--
-- KNOB SNAPSHOT: 2.5-3.9 s and 214 kB for one person in one organization, down to a few ms and a few kB.
--
-- WHY IT WAS SLOW (EXPLAIN ANALYZE as admin@admin.com, 2026-10-08): `knob_snapshot` called
-- `platform.knob_resolve` once per register row - 3,867 plpgsql calls, each opening its own register
-- lookup, override lookup, rung-lock probe and person check (23k buffers, 2.7 s; 74k buffers / 3.9 s with
-- the memo bypassed). The indexes are fine ((feature,key) pkey, (organization_id,feature)); the payload
-- is not the cost, the per-knob function call is. And 3,846 of the 3,867 answers were simply the platform
-- value, because an organization carries at most a few dozen override rows.
--
-- WHAT IT IS NOW. The ladder is still resolved by ONE rule - `platform.knob_resolve` - but only for the keys
-- that have an override row in THIS organization (a superset of every key a rung can move; a key without a
-- candidate row provably resolves to coalesce(value, default_value)). Everything else is the platform value,
-- read in one set-based aggregate.
--   * platform.knob_defaults(p_known_version)  - the platform values, once, with a version = md5 of the
--     content; "unchanged" without the payload when the caller already holds that version.
--   * platform.knob_snapshot_delta(org, user, scopes, p_etag) - only the keys whose resolved value differs
--     from the platform value, an etag over (defaults version, delta), and "unchanged" when p_etag matches.
--   * platform.knob_snapshot(...) keeps its exact shape and guards (server twin, other callers) and is the
--     merge of the two, so it cannot drift from them.
--
-- Guards copied verbatim from knob_snapshot (org membership, person addressability).
-- Inverse: migrations/inverse/knobsnapshot_one_pass_defaults_once_and_a_small_delta_down.sql

set local lock_timeout = '2s';

create or replace function platform.knob_defaults(p_known_version text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_defaults jsonb;
  v_version  text;
begin
  select coalesce(jsonb_object_agg(k.feature || '.' || k.key, coalesce(k.value, k.default_value)), '{}'::jsonb)
    into v_defaults
    from platform.feature_knob k;
  v_version := md5(v_defaults::text);
  if p_known_version is not null and p_known_version = v_version then
    return jsonb_build_object('version', v_version, 'unchanged', true);
  end if;
  return jsonb_build_object('version', v_version, 'unchanged', false, 'defaults', v_defaults);
end
$function$;

create or replace function platform.knob_snapshot_delta(
  p_organization_id uuid,
  p_user_id uuid default null,
  p_scopes jsonb default null,
  p_etag text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_org      uuid := p_organization_id;
  v_defaults jsonb;
  v_version  text;
  v_over     jsonb;
  v_etag     text;
begin
  -- Same two access decisions, same words, as platform.knob_snapshot (RCA-8 / ARGS-RULED / CHAIR-WORLD).
  if p_organization_id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(p_organization_id) then
    if (select auth.uid()) is not null and custom.organization_has_a_public_table(p_organization_id) then
      v_org := null;
    else
      raise exception 'platform.knob_snapshot: not a member of that organization'
        using errcode = '42501';
    end if;
  end if;

  if p_user_id is not null
     and not iam.is_trusted_backend()
     and p_user_id is distinct from (select auth.uid())
     and not iam.may_address_user_in_org(p_user_id, p_organization_id) then
    raise exception 'platform.knob_snapshot: that is not your configuration to read'
      using errcode = '42501',
            hint = 'A snapshot resolves the USER rung as well as the organization rung, so it answers one person''s own settings. Ask for your own, or for somebody in an organization you are both in.';
  end if;

  select coalesce(jsonb_object_agg(k.feature || '.' || k.key, coalesce(k.value, k.default_value)), '{}'::jsonb)
    into v_defaults
    from platform.feature_knob k;
  v_version := md5(v_defaults::text);

  -- Candidate keys: every key with an override row in this organization (empty when v_org is null).
  -- The ONE resolver decides each; a key equal to its platform value is not sent.
  select coalesce(jsonb_object_agg(c.feature || '.' || c.key, r.v), '{}'::jsonb)
    into v_over
    from (select distinct o.feature, o.key
            from platform.knob_override o
            join platform.feature_knob f on f.feature = o.feature and f.key = o.key
           where o.organization_id = v_org) c
   cross join lateral (select platform.knob_resolve(c.feature, c.key, v_org, p_user_id, p_scopes) as v) r
   where r.v is distinct from (v_defaults -> (c.feature || '.' || c.key));

  v_etag := md5(v_version || '|' || v_over::text);
  if p_etag is not null and p_etag = v_etag then
    return jsonb_build_object('etag', v_etag, 'defaults_version', v_version, 'unchanged', true);
  end if;
  return jsonb_build_object('etag', v_etag, 'defaults_version', v_version, 'unchanged', false,
                            'organization_id', p_organization_id, 'user_id', p_user_id,
                            'overrides', v_over);
end
$function$;

-- knob_snapshot: same signature, same guards, same output shape - now the merge of the two above.
create or replace function platform.knob_snapshot(p_organization_id uuid, p_user_id uuid default null::uuid, p_scopes jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'platform', 'iam', 'public'
as $function$
declare
  v_stamp    timestamptz;
  v_org      uuid := p_organization_id;
  v_defaults jsonb;
  v_over     jsonb;
begin
  if p_organization_id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(p_organization_id) then
    if (select auth.uid()) is not null and custom.organization_has_a_public_table(p_organization_id) then
      v_org := null;
    else
      raise exception 'platform.knob_snapshot: not a member of that organization'
        using errcode = '42501';
    end if;
  end if;

  if p_user_id is not null
     and not iam.is_trusted_backend()
     and p_user_id is distinct from (select auth.uid())
     and not iam.may_address_user_in_org(p_user_id, p_organization_id) then
    raise exception 'platform.knob_snapshot: that is not your configuration to read'
      using errcode = '42501',
            hint = 'A snapshot resolves the USER rung as well as the organization rung, so it answers one person''s own settings. Ask for your own, or for somebody in an organization you are both in.';
  end if;

  -- `stamp` is the cache key: the newest write across the register and THIS org's overrides and rung locks.
  select greatest(
           coalesce((select max(updated_at) from platform.feature_knob), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_override
                      where organization_id is not distinct from v_org), 'epoch'::timestamptz),
           coalesce((select max(updated_at) from platform.knob_rung_lock
                      where organization_id is not distinct from v_org), 'epoch'::timestamptz))
    into v_stamp;

  select coalesce(jsonb_object_agg(k.feature || '.' || k.key, coalesce(k.value, k.default_value)), '{}'::jsonb)
    into v_defaults
    from platform.feature_knob k;

  select coalesce(jsonb_object_agg(c.feature || '.' || c.key, r.v), '{}'::jsonb)
    into v_over
    from (select distinct o.feature, o.key
            from platform.knob_override o
            join platform.feature_knob f on f.feature = o.feature and f.key = o.key
           where o.organization_id = v_org) c
   cross join lateral (select platform.knob_resolve(c.feature, c.key, v_org, p_user_id, p_scopes) as v) r;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'user_id',         p_user_id,
    'stamp',           to_jsonb(v_stamp),
    'count',           (select count(*) from jsonb_object_keys(v_defaults)),
    'resolved',        v_defaults || v_over);
end
$function$;

-- DECLARE, THEN GRANT (the grant guard takes back an undeclared client grant inside the same transaction).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, signed_in_callers, anonymous_callers,
   declared_by, reason, argument_rules)
select 'platform', p.proname, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/knobsnapshot_one_pass_defaults_once_and_a_small_delta.sql (lane KNOB-SNAPSHOT)',
       case p.proname
         when 'knob_defaults' then 'The platform values of the whole knob register, which every signed-in client already receives inside knob_snapshot. It takes no organization and no person, so there is no tenant row in it; p_known_version only lets the caller skip the payload.'
         else 'knob_snapshot answered as a difference from the platform values, with an etag. Same two access decisions as knob_snapshot, copied verbatim: iam.has_org_access on the organization (a foreign id is refused identically to an invented one) and iam.may_address_user_in_org on the person.'
       end,
       case p.proname
         when 'knob_defaults' then
           '{"version":1,"arguments":{"p_known_version":{"type":"text","unchecked":true,"reason":"a cache version the caller already holds; it can only shorten the answer","position":1}},"declared_at":"2026-10-08 lane KNOB-SNAPSHOT","declared_by":"knobsnapshot_one_pass_defaults_once_and_a_small_delta.sql"}'::jsonb
         else
           '{"version":1,"arguments":{"p_etag":{"type":"text","unchecked":true,"reason":"a cache version the caller already holds; it can only shorten the answer","position":4},"p_user_id":{"type":"uuid","check":"iam.may_address_user_in_org(p_user_id, p_organization_id) unless it IS the caller or a trusted backend","access":"both the caller and the named person are in that organization","entity":"user_profile","foreign":{"sqlstate":"42501","same_as_invented":true},"position":2,"verified":"copied verbatim from platform.knob_snapshot"},"p_organization_id":{"type":"uuid","check":"iam.has_org_access(p_organization_id) (or iam.is_trusted_backend) raises 42501 before the first read","access":"member","entity":"organization","foreign":{"sqlstate":"42501","same_as_invented":true},"position":1,"verified":"copied verbatim from platform.knob_snapshot"}},"declared_at":"2026-10-08 lane KNOB-SNAPSHOT","declared_by":"knobsnapshot_one_pass_defaults_once_and_a_small_delta.sql"}'::jsonb
       end
  from pg_proc p
 where p.pronamespace = 'platform'::regnamespace and p.proname in ('knob_defaults', 'knob_snapshot_delta')
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'platform' and d.function_name = p.proname
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function platform.knob_defaults(text) to authenticated, service_role;
grant execute on function platform.knob_snapshot_delta(uuid, uuid, jsonb, text) to authenticated, service_role;
