-- chair-step: drops only the two-argument private helper this lane created an hour earlier (no door, no client grant); its three callers are replaced in this same file.
-- based-on: platform.search_engine_indexed(text, text) a6664cedd00d997d560a640df07e72d6ac107ce6a026d5a6cb2a5f7ab82eb80a
-- based-on: platform.search_engine_indexed_records(text, integer) 50b81ee9f51037d0ca59c1d6ba2bed173d9a9e573a81072279c0dacd2428effd
-- based-on: platform.search_engine_indexed_state(text, uuid) 45c3298503f4bddf50d3e49d2cc419a0708f2e437e550a0dbf4f704b078a247f
-- lane: access-ladder T-12 (the indexed switch), part c: "Indexed by default" is a full feature
-- knob — system default (admin dashboard) -> organization -> PERSON. The person rung is the
-- record's creator: their own default decides a record they have not set by hand.
set local lock_timeout = '2s';

update platform.feature_knob
   set overridable_by = '{organization,user}'
 where feature = 'access.indexed_by_default';

create or replace function platform._search_engine_indexed_default(p_resource_type text, p_organization_id uuid, p_creator uuid)
returns boolean language sql stable set search_path = '' as $fn$
  select coalesce((platform.knob_resolve('access.indexed_by_default', p_resource_type, p_organization_id, p_creator) #>> '{}')::boolean, false);
$fn$;
revoke all on function platform._search_engine_indexed_default(text, uuid, uuid) from public, anon, authenticated;

create or replace function platform.search_engine_indexed(p_resource_type text, p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare
  t record;
  v_is_uuid boolean := p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_val boolean; v_org uuid; v_by uuid;
begin
  if p_key is null or btrim(p_key) = '' then return null; end if;
  select * into t from platform._search_engine_indexed_table(p_resource_type);
  if not v_is_uuid and not t.has_slug then return null; end if;
  -- Access decision for a signed-out caller: only a row whose visibility = 'public' (published
  -- to the web) answers at all; anything else answers exactly like a missing row.
  execute format(
    $q$select r.search_engine_indexed, r.organization_id, r.created_by from %I.%I r where %s and %s limit 1$q$,
    t.s, t.tb, platform._published_to_web_sql(t.has_is_published, t.has_status),
    case when v_is_uuid then 'r.id = $1::uuid' else 'r.slug = $1' end)
    into v_val, v_org, v_by using p_key;
  if v_org is null then return null; end if;
  return coalesce(v_val, platform._search_engine_indexed_default(p_resource_type, v_org, v_by));
end $fn$;

create or replace function platform.search_engine_indexed_records(p_resource_type text, p_limit integer default 5000)
returns table(id uuid, slug text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
declare t record;
begin
  select * into t from platform._search_engine_indexed_table(p_resource_type);
  -- Only rows whose visibility = 'public' (published to the web) are ever returned.
  return query execute format(
    $q$with rows as (
         select r.id, %s as slug, r.updated_at, r.search_engine_indexed as v, r.organization_id as org, r.created_by as by_user
           from %I.%I r where %s),
       defs as (
         select o.org, o.by_user, platform._search_engine_indexed_default($1, o.org, o.by_user) as d
           from (select distinct org, by_user from rows) o)
       select rows.id, rows.slug, rows.updated_at
         from rows join defs on defs.org = rows.org and defs.by_user is not distinct from rows.by_user
        where coalesce(rows.v, defs.d)
        order by rows.updated_at desc nulls last
        limit $2$q$,
    case when t.has_slug then 'r.slug' else 'null::text' end,
    t.s, t.tb, platform._published_to_web_sql(t.has_is_published, t.has_status))
    using p_resource_type, least(greatest(coalesce(p_limit, 5000), 1), 50000);
end $fn$;

create or replace function platform.search_engine_indexed_state(p_resource_type text, p_resource_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare t record; v_val boolean; v_org uuid; v_by uuid; v_pub boolean; v_def boolean;
begin
  if not iam.has_access(p_resource_type, p_resource_id, 'viewer'::public.permission_level) then
    raise exception 'You cannot open this record.' using errcode = '42501';
  end if;
  begin
    select * into t from platform._search_engine_indexed_table(p_resource_type);
  exception when sqlstate '22023' then
    return jsonb_build_object('enrolled', false);
  end;
  execute format(
    $q$select r.search_engine_indexed, r.organization_id, r.created_by, (%s) from %I.%I r where r.id = $1$q$,
    platform._published_to_web_sql(t.has_is_published, t.has_status), t.s, t.tb)
    into v_val, v_org, v_by, v_pub using p_resource_id;
  v_def := platform._search_engine_indexed_default(p_resource_type, v_org, v_by);
  return jsonb_build_object(
    'enrolled', true,
    'published_to_web', coalesce(v_pub, false),
    'value', v_val,
    'type_default', v_def,
    'effective', coalesce(v_pub, false) and coalesce(v_val, v_def),
    'can_change', iam.has_access(p_resource_type, p_resource_id, 'editor'::public.permission_level));
end $fn$;

drop function platform._search_engine_indexed_default(text, uuid);
