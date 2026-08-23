-- ============================================================================
-- THE OPEN LIBRARY, and NOTHING IS GIVEN AWAY UNLABELLED.
--
-- Arman, 2026-08-23:
--   "all of this is public information that we will even publish on our public
--    pages. So the only reason to have any kind of a filter in place is to
--    remove noise from people who don't need it. Because if I own a fashion
--    brand, there's absolutely no reason for me to see things related to the AMA
--    guides. However, if I want to see them, the system shouldn't stop me from
--    seeing it."
--
-- THE RULING: **industry opt-in is a NOISE FILTER, never a wall.** Anything the
-- Library has given to an INDUSTRY or to EVERYONE is readable by any signed-in
-- user, whether or not their organization opted in. The catalog shows you only
-- what is yours BY DEFAULT — that is the whole point of the filter — and the
-- "Show everything in the Library" switch beside it is a feature, not a leak.
--
-- What stays targeted, deliberately:
--   * audience='organization' grants — a PILOT with one named customer, or an
--     org's own subscription. Those were given to someone, not given away.
--   * Anything with NO grant at all — a draft in the Library is not published,
--     and stays admin/curator-only.
--
-- This is why the entitlement guard inside library_subscribe still matters even
-- though reading is open: it decides what an organization HAS (and what its
-- agents will therefore use), which is a different question from what a person
-- may LOOK AT.
--
-- SECOND HALF — the publish gate now demands the two labels from
-- `library_source_authority_and_assurance_2026_08_23.sql`. A Rulebook may be
-- "Not verified"; it may not be UNLABELLED, or the recipient has no way to tell
-- the AMA guide from a cleaned-up scrape.
--
-- Idempotent. Applied via Supabase MCP against brsgrqvjdzwihsvnfqkf 2026-08-23,
-- and live-verified with a rolled-back probe (unlabelled publish refused;
-- stranger with no entitlement can READ a globally-given Rulebook but not EDIT
-- the Library's row; catalog renders both labels).
-- ============================================================================

-- The two catalog functions gain columns, so they are dropped and recreated.
drop function if exists platform.rulebook_library_catalog(uuid);
drop function if exists public.library_catalog(uuid);

create or replace function public.library_is_open(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from platform.entity_grants g
     where g.entity_type = p_entity_type
       and g.entity_id = p_entity_id
       and g.audience in ('industry', 'global'));
$$;

comment on function public.library_is_open(text, uuid) is
  'Has this resource been GIVEN AWAY — to an industry or to everyone? Then anyone signed in may read it; the industry opt-in filters noise, it does not gate access (Arman, 2026-08-23). An organization-audience grant is a pilot/subscription and is deliberately NOT open.';

grant execute on function public.library_is_open(text, uuid) to authenticated, anon, service_role;

-- iam.has_access_for_base gains ONE arm (THE OPEN LIBRARY, marked below); the
-- rest of the body is unchanged from the curator-lane migration.
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

  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
  -- everyone is readable by anyone signed in. The opt-in decides what you are
  -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
  -- grants (pilots, subscriptions) are excluded and stay targeted.
  if p_required = 'viewer'::public.permission_level
     and public.library_is_open(p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
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

create or replace function public._library_publish_gate(
  p_entity_type text, p_entity_id uuid, p_audience text)
returns void
language plpgsql
security definer
set search_path to 'public', 'seo', 'platform'
as $$
declare v_status text; v_enforced integer; v_src text; v_assur text;
begin
  if p_entity_type = 'seo_starter_pack' then
    select status into v_status from seo.starter_pack where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'library: pack % not found', p_entity_id; end if;
    if p_audience in ('industry', 'global') and v_status <> 'ratified' then
      raise exception 'library: a pack must be ratified before it is published to an industry or everyone (status is %)', v_status
        using errcode = 'P0001';
    end if;
    if p_audience = 'organization' and v_status not in ('proposed', 'ratified') then
      raise exception 'library: only a proposed or ratified pack can be piloted with an organization (status is %)', v_status
        using errcode = 'P0001';
    end if;

  elsif p_entity_type = 'rulebook' then
    select status, source_authority, assurance_level
      into v_status, v_src, v_assur
      from platform.rulebook where id = p_entity_id and deleted_at is null;
    if v_status is null then raise exception 'library: rulebook % not found', p_entity_id; end if;
    if p_audience in ('industry', 'global') then
      if v_status <> 'active' then
        raise exception 'library: a Rulebook must be active before it is published to an industry or everyone (status is %)', v_status
          using errcode = 'P0001';
      end if;
      select count(*) into v_enforced
        from platform.rulebook rb, jsonb_array_elements(rb.rules) r
       where rb.id = p_entity_id
         and coalesce((r->>'draft')::boolean, false) is false
         and coalesce((r->>'retired')::boolean, false) is false;
      if coalesce(v_enforced, 0) = 0 then
        raise exception 'library: this Rulebook has no approved rules yet — there is nothing to give'
          using errcode = 'P0001';
      end if;
      if v_src is null or v_assur is null then
        raise exception 'library: say what this Rulebook IS before giving it away — it needs a source (where it came from) and an assurance level (what we did to it). "Not verified" is a fine answer; leaving it blank is not.'
          using errcode = 'P0001';
      end if;
    elsif p_audience = 'organization' and v_status = 'archived' then
      raise exception 'library: an archived Rulebook cannot be piloted with an organization'
        using errcode = 'P0001';
    end if;
  end if;
end $$;

create function platform.rulebook_library_catalog(p_organization_id uuid default null)
returns table(
  id uuid, name text, slug text, description text, item_count integer,
  subscribed boolean, entitled_via text, industry_name text, industry_slug text,
  subscriber_count integer, status text, updated_at timestamptz,
  source_authority text, source_authority_label text,
  assurance_level text, assurance_level_label text, assurance_level_blurb text)
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
    rb.updated_at,
    rb.source_authority, sa.label,
    rb.assurance_level,  al.label, al.blurb
  from platform.rulebook rb
  left join iam.industries i on i.id = rb.industry_id
  left join platform.source_authority sa on sa.slug = rb.source_authority
  left join platform.assurance_level  al on al.slug = rb.assurance_level
  where rb.deleted_at is null
    and rb.organization_id = public.system_org_id('library')
    and (public.is_admin()
         or public.is_rulebook_curator((select auth.uid()), rb.id)
         -- THE OPEN LIBRARY: everything given away is LISTED; `entitled_via`
         -- tells the surface whether it is YOURS, and the surface decides what
         -- to show by default.
         or public.library_is_open('rulebook', rb.id)
         or public.library_entitlement('rulebook', rb.id, p_organization_id) is not null);
$$;

grant execute on function platform.rulebook_library_catalog(uuid) to authenticated, service_role;

create function public.library_catalog(p_organization_id uuid default null)
returns table(entity_type text, entity_id uuid, name text, slug text, description text, kind text, item_count integer, subscribed boolean, entitled_via text, entitled_industry_name text, entitled_industry_slug text, subscriber_count integer, status text, updated_at timestamptz, source_authority text, source_authority_label text, assurance_level text, assurance_level_label text, assurance_level_blurb text)
language sql
stable security definer
set search_path to ''
as $$
  select
    'data_store'::text, s.id, s.name, s.short_code, s.description, s.kind,
    s.member_count::int, s.subscribed, s.entitled_via,
    s.entitled_industry_name, s.entitled_industry_slug,
    (select count(*)::int from platform.entity_grants g
      where g.entity_type = 'data_store' and g.entity_id = s.id and g.audience = 'organization'),
    null::text, null::timestamptz,
    null::text, null::text, null::text, null::text, null::text
  from rag.fn_list_library_catalog(p_organization_id) s

  union all

  select
    'seo_starter_pack'::text, p.id, p.name, p.slug,
    coalesce(nullif(p.summary, ''), p.description), 'starter_pack'::text,
    (p.topic_count + p.rule_count + p.value_band_count + p.geo_band_count + p.geo_area_count),
    p.subscribed, p.entitled_via, p.industry_name, p.industry_slug,
    p.subscriber_count, p.status, p.updated_at,
    null::text, null::text, null::text, null::text, null::text
  from seo.starter_pack_catalog(null, p_organization_id) p

  union all

  select
    'rulebook'::text, r.id, r.name, r.slug, r.description, 'rulebook'::text,
    r.item_count, r.subscribed, r.entitled_via, r.industry_name, r.industry_slug,
    r.subscriber_count, r.status, r.updated_at,
    r.source_authority, r.source_authority_label,
    r.assurance_level, r.assurance_level_label, r.assurance_level_blurb
  from platform.rulebook_library_catalog(p_organization_id) r
$$;

grant execute on function public.library_catalog(uuid) to authenticated, service_role;

-- The two canon Rulebooks move into the Library and are LABELLED HONESTLY:
-- published books (authoritative source), distilled by us and never checked.
update platform.rulebook
   set organization_id  = public.system_org_id('library'),
       visibility       = 'internal',
       source_authority = 'authoritative',
       assurance_level  = 'unverified'
 where id in ('e492a07f-a1d4-4a4b-98e7-bc929a0f40fd',   -- The Elements of Style
              'f6267bca-30c6-43cd-8e8e-64606af9b20f');  -- Scientific Advertising
