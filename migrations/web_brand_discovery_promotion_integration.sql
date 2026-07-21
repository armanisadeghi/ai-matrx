-- Connect reviewed discovery candidates to the domain records and identity
-- fields consumed by the brand cockpit. Idempotent repair + schema extension.

alter table web.discovered_item
  add column if not exists resolved_property_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'web.discovered_item'::regclass
      and conname = 'discovered_item_resolved_property_id_fkey'
  ) then
    alter table web.discovered_item
      add constraint discovered_item_resolved_property_id_fkey
      foreign key (resolved_property_id) references web.property(id);
  end if;
end
$$;

create index if not exists discovered_item_resolved_property_idx
  on web.discovered_item (resolved_property_id)
  where resolved_property_id is not null;

-- Earlier clients demoted newly-supported guesses to Other. Restore the
-- reviewed user's original type without changing the reviewed value.
update web.business_fact as fact
set kind = item.guessed_kind
from web.discovered_item as item
where item.resolved_fact_id = fact.id
  and fact.kind = 'other'
  and item.guessed_kind in ('fax', 'title', 'description', 'site_name');

update web.brand_asset as asset
set kind = item.guessed_kind
from web.discovered_item as item
where item.resolved_asset_id = asset.id
  and asset.kind = 'other'
  and item.guessed_kind in ('og_image', 'twitter_image');

-- Social discoveries are brand properties, not business facts. Preserve a
-- source-discovery marker so rerunning this migration cannot duplicate rows.
insert into web.property (
  organization_id,
  brand_id,
  kind,
  url,
  display_name,
  status,
  metadata
)
select
  item.organization_id,
  item.brand_id,
  case
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?instagram\.com/' then 'instagram'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?(facebook|fb)\.com/' then 'facebook'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?(x|twitter)\.com/' then 'x'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?tiktok\.com/' then 'tiktok'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?(youtube\.com|youtu\.be)/' then 'youtube'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?linkedin\.com/' then 'linkedin'
    when lower(coalesce(item.url, '')) ~ '(^|//)(www\.)?(pinterest\.com|pin\.it)/' then 'pinterest'
    else 'other'
  end,
  item.url,
  null,
  'active',
  jsonb_build_object('source_discovery_id', item.id)
from web.discovered_item as item
where item.category = 'social'
  and item.status = 'confirmed'
  and item.deleted_at is null
  and item.url is not null
  and item.resolved_property_id is null
  and not exists (
    select 1
    from web.property as existing
    where existing.brand_id = item.brand_id
      and existing.deleted_at is null
      and (
        existing.metadata ->> 'source_discovery_id' = item.id::text
        or existing.url = item.url
      )
  );

update web.business_fact as fact
set deleted_at = coalesce(fact.deleted_at, now())
where fact.id in (
  select item.resolved_fact_id
  from web.discovered_item as item
  where item.category = 'social'
    and item.status = 'confirmed'
    and item.resolved_fact_id is not null
);

update web.discovered_item as item
set resolved_property_id = property.id,
    resolved_fact_id = null
from web.property as property
where item.category = 'social'
  and item.status = 'confirmed'
  and item.resolved_property_id is null
  and property.brand_id = item.brand_id
  and property.deleted_at is null
  and (
    property.metadata ->> 'source_discovery_id' = item.id::text
    or property.url = item.url
  );

-- Explicitly confirmed identity assets feed the denormalized identity columns
-- rendered by brand and site summary cards. Existing manual values win.
update web.site as site
set favicon_url = coalesce(
      site.favicon_url,
      (
        select asset.source_url
        from web.discovered_item as item
        join web.brand_asset as asset on asset.id = item.resolved_asset_id
        where item.site_id = site.id
          and asset.kind = 'favicon'
          and asset.deleted_at is null
          and asset.source_url is not null
        order by asset.confirmed_at desc nulls last, asset.created_at desc
        limit 1
      )
    ),
    logo_url = coalesce(
      site.logo_url,
      (
        select asset.source_url
        from web.discovered_item as item
        join web.brand_asset as asset on asset.id = item.resolved_asset_id
        where item.site_id = site.id
          and asset.kind = 'logo'
          and asset.deleted_at is null
          and asset.source_url is not null
        order by asset.confirmed_at desc nulls last, asset.created_at desc
        limit 1
      )
    ),
    og_image_url = coalesce(
      site.og_image_url,
      (
        select asset.source_url
        from web.discovered_item as item
        join web.brand_asset as asset on asset.id = item.resolved_asset_id
        where item.site_id = site.id
          and asset.kind in ('og_image', 'twitter_image')
          and asset.deleted_at is null
          and asset.source_url is not null
        order by (asset.kind = 'og_image') desc, asset.confirmed_at desc nulls last
        limit 1
      )
    )
where site.deleted_at is null;

update web.brand as brand
set favicon_url = coalesce(
      brand.favicon_url,
      (
        select asset.source_url
        from web.brand_asset as asset
        where asset.brand_id = brand.id
          and asset.kind = 'favicon'
          and asset.deleted_at is null
          and asset.source_url is not null
        order by asset.is_primary desc, asset.confirmed_at desc nulls last, asset.created_at desc
        limit 1
      )
    ),
    logo_url = coalesce(
      brand.logo_url,
      (
        select asset.source_url
        from web.brand_asset as asset
        where asset.brand_id = brand.id
          and asset.kind = 'logo'
          and asset.deleted_at is null
          and asset.source_url is not null
        order by asset.is_primary desc, asset.confirmed_at desc nulls last, asset.created_at desc
        limit 1
      )
    ),
    og_image_url = coalesce(
      brand.og_image_url,
      (
        select asset.source_url
        from web.brand_asset as asset
        where asset.brand_id = brand.id
          and asset.kind in ('og_image', 'twitter_image')
          and asset.deleted_at is null
          and asset.source_url is not null
        order by (asset.kind = 'og_image') desc, asset.is_primary desc,
          asset.confirmed_at desc nulls last, asset.created_at desc
        limit 1
      )
    )
where brand.deleted_at is null;
