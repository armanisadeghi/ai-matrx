-- Marketing URL keys (agency-model tree): human-readable slugs alongside ids.
-- brand.slug is globally unique (URL carries no org segment); site.slug is unique per brand.
-- Additive only: nullable columns, backfilled from names; creation flows start writing slugs in FE Phase 1.
-- Design: docs/handoffs/marketing-agency-restructure.md + the Marketing Tree artifact.

alter table web.brand add column if not exists slug text;
alter table web.site  add column if not exists slug text;

comment on column web.brand.slug is 'URL key, globally unique, kebab-case 3-50. Canonical /marketing/[slug] address; UUID URLs 308 to this.';
comment on column web.site.slug  is 'URL key, unique per brand, kebab-case 3-50.';

-- Backfill. Reserved words = static /marketing segments (current + planned agency plane) a brand slug may never shadow.
do $$
declare
  reserved text[] := array[
    'brands','reports','operations','tools','new','admin','ads','analytics','approvals','audience',
    'automations','backlink-valuation','calendar','capabilities','changes','competitors','connections',
    'content','content-plan','content-studio','cost','discovery','email','growth-loop','identity',
    'inbox','initiatives','intelligence','keyword-intelligence','keyword-research','local','locations',
    'marketing','monitoring','outreach','pages','planning','pr','properties','ranks','screenshots',
    'search-console','seo','settings','sites','snapshots','social','socials','websites','api','s'
  ];
  r record;
  base text;
  candidate text;
  n int;
begin
  -- brands: global uniqueness
  for r in select id, name from web.brand where slug is null order by created_at nulls last, id loop
    base := trim(both '-' from regexp_replace(lower(coalesce(nullif(trim(r.name), ''), 'brand')), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'brand'; end if;
    if char_length(base) < 3 then base := base || '-co'; end if;
    base := trim(both '-' from left(base, 50));
    if base = any(reserved) then base := trim(both '-' from left(base || '-co', 50)); end if;
    candidate := base; n := 1;
    while exists (select 1 from web.brand b where b.slug = candidate and b.id <> r.id) loop
      n := n + 1;
      candidate := trim(both '-' from left(base, 50 - char_length('-' || n::text))) || '-' || n::text;
    end loop;
    update web.brand set slug = candidate where id = r.id;
  end loop;

  -- sites: uniqueness per brand; prefer the domain as the natural key
  for r in select id, brand_id, coalesce(nullif(trim(domain), ''), nullif(trim(name), ''), 'site') as src from web.site where slug is null order by created_at nulls last, id loop
    base := trim(both '-' from regexp_replace(lower(r.src), '[^a-z0-9]+', '-', 'g'));
    if base = '' then base := 'site'; end if;
    if char_length(base) < 3 then base := base || '-site'; end if;
    base := trim(both '-' from left(base, 50));
    if base = any(reserved) then base := trim(both '-' from left(base || '-site', 50)); end if;
    candidate := base; n := 1;
    while exists (select 1 from web.site s where s.brand_id = r.brand_id and s.slug = candidate and s.id <> r.id) loop
      n := n + 1;
      candidate := trim(both '-' from left(base, 50 - char_length('-' || n::text))) || '-' || n::text;
    end loop;
    update web.site set slug = candidate where id = r.id;
  end loop;
end $$;

-- Format guards (NULL allowed until creation flows write slugs)
alter table web.brand drop constraint if exists brand_slug_format_chk;
alter table web.brand add constraint brand_slug_format_chk
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 50));
alter table web.site drop constraint if exists site_slug_format_chk;
alter table web.site add constraint site_slug_format_chk
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 50));

-- Uniqueness: brand global, site per brand
create unique index if not exists brand_slug_key on web.brand (slug) where slug is not null;
create unique index if not exists site_brand_slug_key on web.site (brand_id, slug) where slug is not null;

notify pgrst, 'reload schema';
