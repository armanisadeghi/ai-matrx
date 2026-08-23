-- Rulebook in the Matrx Library, part 2 — the curator lane, the catalog arm,
-- and a security fix the registration probe found in the shipped spine.
--
-- Companion to `rulebook_in_the_library_2026_08_23.sql`. Applied via Supabase
-- MCP against brsgrqvjdzwihsvnfqkf on 2026-08-23 and live-verified with a
-- rolled-back probe (stranger / industry-opt-in / entitlement / copy /
-- idempotency / purge).
--
-- SoR: common-docs/systems/platform/library/STATE.md (steps 4–5)

-- ---------------------------------------------------------------------------
-- 1. THE CURATOR LANE reaches the access resolver.
--    A Rulebook's industry curator (the outside expert) READS it always and
--    AUTHORS it only while it is still a draft — a curator never edits a
--    Rulebook the Library has already given away. Mirrors the pack curator arm
--    directly above it; the rest of the function is unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
begin
  if v_uid is null then return false; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;

  -- THE LIBRARY LANE (generic since 2026-08-22; was a data_store-only arm). A grant on
  -- (entity_type, entity_id) reaching the user conveys viewer — and viewer only.
  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  -- A Rulebook's industry curator (the outside expert) READS it always and
  -- AUTHORS it only while it is still a draft — curators never edit a Rulebook
  -- the Library has already given away. Added 2026-08-23 with the rulebook type.
  if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
    if p_required = 'viewer'::public.permission_level then return true; end if;
    if exists (select 1 from platform.rulebook rb
                where rb.id = p_id and rb.status = 'draft' and rb.deleted_at is null)
    then return true; end if;
  end if;

  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;
  if v_owner = v_uid then return true; end if;
  if p_required = 'viewer'::public.permission_level and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  if p_include_public and p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
  if v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required) then return true; end if;
  if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then return true; end if;
  for rec in
    select r.container_type, r.container_id from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility))
    then return true; end if;
  end loop;
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
    if v_is_org_admin then return true; end if;
    if p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public)
    then return true; end if;
  end loop;
  return false;
end; $function$;

-- The grants list answers a Rulebook's own author and its industry curator.
CREATE OR REPLACE FUNCTION public.library_list_grants(p_entity_type text, p_entity_id uuid)
 RETURNS TABLE(id uuid, audience text, industry_id uuid, industry_name text, industry_slug text, organization_id uuid, organization_name text, granted_by uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'rag', 'iam', 'seo'
AS $function$
declare v_user uuid := auth.uid();
begin
  if not (auth.role() = 'service_role' or public.is_admin()
          or (p_entity_type = 'data_store' and exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.created_by = v_user))
          or (p_entity_type = 'seo_starter_pack' and public.is_pack_curator(v_user, p_entity_id))
          or (p_entity_type = 'rulebook' and (
                exists (select 1 from platform.rulebook rb where rb.id = p_entity_id and rb.created_by = v_user)
                or public.is_rulebook_curator(v_user, p_entity_id)))) then
    raise exception 'insufficient permission on %', p_entity_type using errcode = '42501';
  end if;
  return query
  select g.id, g.audience, g.industry_id, i.name, i.slug, g.organization_id, o.name, g.granted_by, g.created_at
  from platform.entity_grants g
  left join iam.industries i on i.id = g.industry_id
  left join iam.organizations o on o.id = g.organization_id
  where g.entity_type = p_entity_type and g.entity_id = p_entity_id
  order by g.audience, g.created_at;
end $function$;

-- ---------------------------------------------------------------------------
-- 2. THE CATALOG ARM — the tenant front door already exists
--    (public.library_catalog → useLibraryResources → /knowledge/library-catalog).
--    Rulebooks join it; no second catalog surface.
-- ---------------------------------------------------------------------------

create or replace function platform.rulebook_library_catalog(p_organization_id uuid default null)
returns table(
  id uuid, name text, slug text, description text, item_count integer,
  subscribed boolean, entitled_via text, industry_name text, industry_slug text,
  subscriber_count integer, status text, updated_at timestamptz)
language sql
stable security definer
set search_path to ''
as $$
  select
    rb.id,
    rb.name,
    rb.slug,
    rb.description,
    coalesce(jsonb_array_length(rb.rules), 0)::int,
    exists (select 1 from platform.entity_grants g
             where g.entity_type = 'rulebook' and g.entity_id = rb.id
               and g.audience = 'organization' and g.organization_id = p_organization_id),
    coalesce(
      public.library_entitlement('rulebook', rb.id, p_organization_id),
      case when public.is_rulebook_curator((select auth.uid()), rb.id) then 'curator'
           when public.is_admin() then 'admin' end),
    i.name,
    i.slug,
    (select count(*)::int from platform.entity_grants g
      where g.entity_type = 'rulebook' and g.entity_id = rb.id and g.audience = 'organization'),
    rb.status,
    rb.updated_at
  from platform.rulebook rb
  left join iam.industries i on i.id = rb.industry_id
  where rb.deleted_at is null
    and rb.organization_id = public.system_org_id('library')
    and (public.is_admin()
         or public.is_rulebook_curator((select auth.uid()), rb.id)
         or public.library_entitlement('rulebook', rb.id, p_organization_id) is not null);
$$;

comment on function platform.rulebook_library_catalog(uuid) is
  'Rulebooks the Matrx Library has given this organization (plus everything an admin or the industry''s curator may see). Read by public.library_catalog — never called directly by a surface.';

grant execute on function platform.rulebook_library_catalog(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.library_catalog(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(entity_type text, entity_id uuid, name text, slug text, description text, kind text, item_count integer, subscribed boolean, entitled_via text, entitled_industry_name text, entitled_industry_slug text, subscriber_count integer, status text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    'data_store'::text, s.id, s.name, s.short_code, s.description, s.kind,
    s.member_count::int, s.subscribed, s.entitled_via,
    s.entitled_industry_name, s.entitled_industry_slug,
    (select count(*)::int from platform.entity_grants g
      where g.entity_type = 'data_store' and g.entity_id = s.id and g.audience = 'organization'),
    null::text, null::timestamptz
  from rag.fn_list_library_catalog(p_organization_id) s

  union all

  select
    'seo_starter_pack'::text, p.id, p.name, p.slug,
    coalesce(nullif(p.summary, ''), p.description), 'starter_pack'::text,
    (p.topic_count + p.rule_count + p.value_band_count + p.geo_band_count + p.geo_area_count),
    p.subscribed, p.entitled_via, p.industry_name, p.industry_slug,
    p.subscriber_count, p.status, p.updated_at
  from seo.starter_pack_catalog(null, p_organization_id) p

  union all

  select
    'rulebook'::text, r.id, r.name, r.slug, r.description, 'rulebook'::text,
    r.item_count, r.subscribed, r.entitled_via, r.industry_name, r.industry_slug,
    r.subscriber_count, r.status, r.updated_at
  from platform.rulebook_library_catalog(p_organization_id) r
$function$;

-- ---------------------------------------------------------------------------
-- 3. 🚨 SECURITY FIX found by this registration's probe — and NOT introduced by
--    it. The entitlement guard in public.library_subscribe read
--        if not (public.is_admin() or v_via = 'organization'
--                or (v_via in ('industry','global') and v_status = 'ratified'))
--    and public.library_entitlement returns NULL when the caller's org is
--    entitled by nothing at all. `false or false or NULL` is NULL, `not NULL`
--    is NULL, and `if NULL then` does not fire — so THE UNENTITLED CASE, the
--    only case the guard exists for, fell through and subscribed.
--
--    Proven live before the fix: an organization that had NOT opted into the
--    `legal` industry successfully adopted an industry-only resource, and the
--    same probe adopted a ratified SEO starter pack it had no entitlement to
--    (that arm shipped 2026-08-22). Proven refused after it, both arms, with
--    the entitled path unchanged.
--
--    Fix: coalesce the whole predicate to false.
-- ---------------------------------------------------------------------------

create or replace function public.library_subscribe(
  p_entity_type text, p_entity_id uuid, p_organization_id uuid default null,
  p_target jsonb default null, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'platform', 'rag', 'iam', 'seo', 'web'
as $$
declare v_actor uuid; v_row platform.entity_grants; v_status text; v_result jsonb := '{}'::jsonb; v_via text; v_org uuid := p_organization_id;
begin
  v_actor := coalesce(auth.uid(), p_actor);
  -- A pack target names a site; the org is the site's (callers need not resolve it twice).
  if v_org is null and p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    select s.organization_id into v_org from web.site s where s.id = (p_target->>'site_id')::uuid and s.deleted_at is null;
  end if;
  if v_org is null then raise exception 'library: organization required' using errcode = '22023'; end if;
  if v_actor is null or not exists (
      select 1 from iam.organization_member om where om.organization_id = v_org and om.user_id = v_actor) then
    raise exception 'not authorized: caller is not a member of org %', v_org using errcode = '42501';
  end if;

  if p_entity_type = 'data_store' then
    if not exists (select 1 from rag.data_stores s where s.id = p_entity_id and s.discoverable) then
      raise exception 'store % is not discoverable', p_entity_id;
    end if;

  elsif p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'seo_pack_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('seo_starter_pack', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'                                   -- pilot or prior subscription
            or (v_via in ('industry', 'global') and v_status = 'ratified'), false) then
      raise exception 'library: organization % is not entitled to pack % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status into v_status from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'rulebook_not_found: %', p_entity_id; end if;
    v_via := public.library_entitlement('rulebook', p_entity_id, v_org);
    if not coalesce(public.is_admin()
            or v_via = 'organization'                                   -- pilot or prior subscription
            or (v_via in ('industry', 'global') and v_status = 'active'), false) then
      raise exception 'library: organization % is not entitled to Rulebook % (status %, via %)',
        v_org, p_entity_id, v_status, coalesce(v_via, 'none') using errcode = '42501';
    end if;

  else
    raise exception 'library: % cannot be subscribed to', p_entity_type;
  end if;

  select * into v_row from platform.entity_grants
   where entity_type = p_entity_type and entity_id = p_entity_id and audience = 'organization' and organization_id = v_org
   limit 1;
  if v_row.id is null then
    insert into platform.entity_grants(entity_type, entity_id, audience, organization_id, granted_by)
    values (p_entity_type, p_entity_id, 'organization', v_org, v_actor)
    returning * into v_row;
  end if;

  if p_entity_type = 'seo_starter_pack' and p_target ? 'site_id' then
    v_result := seo.adopt_starter_pack(
      (p_target->>'site_id')::uuid, p_entity_id,
      case when p_target ? 'include' then (select array_agg(x) from jsonb_array_elements_text(p_target->'include') x) end,
      case when p_target ? 'topic_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'topic_ids') x) end,
      coalesce((p_target->>'seed_guidelines')::boolean, true),
      p_target->'geo_places', p_target->'geo_place_ids',
      case when p_target ? 'item_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'item_ids') x) end,
      case when p_target ? 'rule_ids' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_target->'rule_ids') x) end,
      coalesce((p_target->>'reset')::boolean, false));
  elsif p_entity_type = 'rulebook' then
    v_result := platform.materialize_library_rulebook(p_entity_id, v_org, v_actor, coalesce(p_target, '{}'::jsonb));
  end if;

  perform public._library_audit(v_actor, 'self_subscribe', p_entity_type, p_entity_id, null, v_org,
                                jsonb_build_object('target', coalesce(p_target, '{}'::jsonb) - 'geo_places' - 'geo_place_ids'));
  return v_result || jsonb_build_object('grant_id', v_row.id, 'subscribed', true, 'organization_id', v_org);
end $$;
