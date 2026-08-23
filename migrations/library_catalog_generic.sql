-- The WHOLE Matrx Library in one list.
--
-- `/knowledge/library-catalog` used to call `rag.fn_list_library_catalog`, which
-- returns data stores only — so an org that had been GIVEN an industry starter
-- pack had nowhere to see that it was given anything (Library STATE.md § Known
-- gaps, item 3). This is the generic front-door read: one row per Library
-- resource of ANY registered entity_type, each already entitlement-filtered by
-- the per-type reader it delegates to. It adds NO new grant mechanism — every
-- arm is an existing catalog function over `platform.entity_grants`.
--
-- Registering a fourth type = add its arm here (step 5 of the Library recipe).
create or replace function public.library_catalog(p_organization_id uuid default null)
returns table (
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
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  -- Data stores: subscribe conveys a REFERENCE. Discoverable-but-not-entitled
  -- rows are included deliberately — the catalog is where a tenant discovers
  -- what it could subscribe to.
  select
    'data_store'::text,
    s.id,
    s.name,
    s.short_code,
    s.description,
    s.kind,
    s.member_count::int,
    s.subscribed,
    s.entitled_via,
    s.entitled_industry_name,
    s.entitled_industry_slug,
    (select count(*)::int
       from platform.entity_grants g
      where g.entity_type = 'data_store'
        and g.entity_id = s.id
        and g.audience = 'organization'),
    null::text,
    null::timestamptz
  from rag.fn_list_library_catalog(p_organization_id) s

  union all

  -- Starter packs: subscribe COPIES onto a site, so the catalog only lists what
  -- the caller is already entitled to (`seo.starter_pack_catalog` filters on
  -- `entitled_via is not null` and hides unratified packs without a pilot grant).
  select
    'seo_starter_pack'::text,
    p.id,
    p.name,
    p.slug,
    coalesce(nullif(p.summary, ''), p.description),
    'starter_pack'::text,
    (p.topic_count + p.rule_count + p.value_band_count + p.geo_band_count + p.geo_area_count),
    p.subscribed,
    p.entitled_via,
    p.industry_name,
    p.industry_slug,
    p.subscriber_count,
    p.status,
    p.updated_at
  from seo.starter_pack_catalog(null, p_organization_id) p
$$;

comment on function public.library_catalog(uuid) is
  'Every Matrx Library resource the caller can see, across registered entity types. Delegates to each type''s own entitlement-filtered catalog reader; never a second grant mechanism.';

grant execute on function public.library_catalog(uuid) to authenticated;
