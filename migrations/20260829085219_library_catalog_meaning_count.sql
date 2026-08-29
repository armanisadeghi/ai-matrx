-- Keep the generic Library catalog aligned with the starter-pack read model.
-- seo.starter_pack_catalog renamed rule_count to meaning_count in KI-030; the
-- generic wrapper retained the removed field and made every catalog load fail
-- with PostgreSQL 42703.

create or replace function public.library_catalog(p_organization_id uuid default null)
returns table(
  entity_type text,
  entity_id uuid,
  name text,
  slug text,
  description text,
  kind text,
  item_count integer,
  subscribed boolean,
  entitled_via text,
  entitled_industry_name text,
  entitled_industry_slug text,
  subscriber_count integer,
  status text,
  updated_at timestamptz,
  source_authority text,
  source_authority_label text,
  assurance_level text,
  assurance_level_label text,
  assurance_level_blurb text
)
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
    (p.topic_count + p.meaning_count + p.value_band_count + p.geo_band_count + p.geo_area_count),
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

comment on function public.library_catalog(uuid) is
  'Every Matrx Library resource the caller can see, across registered entity types. Delegates to each type''s own entitlement-filtered catalog reader; never a second grant mechanism.';

grant execute on function public.library_catalog(uuid) to authenticated, service_role;
