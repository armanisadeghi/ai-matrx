-- Sitemaps become first-class, manageable objects (Wave 1 of the coverage
-- model). web.sitemap is one discovered sitemap document; web.page_sitemap is
-- page membership evidence. The scraper upserts both AND upserts canonical
-- pages (provenance 'sitemap') — the page registry is the anchor every source
-- feeds. ON CONFLICT arbiters are plain NULLS NOT DISTINCT uniques (the
-- discovered_item lesson: partial/expression indexes cannot arbiter upserts).

create table if not exists web.sitemap (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  site_id uuid not null references web.site(id),
  url text not null,
  kind text not null default 'unknown',
  parent_sitemap_id uuid references web.sitemap(id),
  status_code integer,
  url_count integer,
  child_count integer,
  is_active boolean not null default true,
  first_seen timestamptz not null default now(),
  last_seen timestamptz,
  last_fetched_at timestamptz,
  fetch_error text,
  constraint sitemap_kind_check check (kind in ('sitemapindex', 'urlset', 'unknown'))
);
create unique index if not exists sitemap_site_url_unique
  on web.sitemap (site_id, url) nulls not distinct;
create index if not exists sitemap_site_idx
  on web.sitemap (site_id) where deleted_at is null;

create table if not exists web.page_sitemap (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  site_id uuid not null references web.site(id),
  page_id uuid not null references web.page(id) on delete cascade,
  sitemap_id uuid not null references web.sitemap(id) on delete cascade,
  lastmod timestamptz,
  changefreq text,
  priority numeric,
  first_seen timestamptz not null default now(),
  last_seen timestamptz
);
create unique index if not exists page_sitemap_membership_unique
  on web.page_sitemap (page_id, sitemap_id) nulls not distinct;
create index if not exists page_sitemap_site_idx
  on web.page_sitemap (site_id) where deleted_at is null;
create index if not exists page_sitemap_sitemap_idx
  on web.page_sitemap (sitemap_id) where deleted_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['sitemap','page_sitemap'] loop
    execute format('drop trigger if exists _stamp_actor on web.%I', t);
    execute format('create trigger _stamp_actor before insert or update on web.%I for each row execute function platform._stamp_actor()', t);
    execute format('drop trigger if exists _stamp_org_default on web.%I', t);
    execute format('create trigger _stamp_org_default before insert on web.%I for each row execute function public._stamp_org_default()', t);
    execute format('drop trigger if exists _touch_row on web.%I', t);
    execute format('create trigger _touch_row before insert or update on web.%I for each row execute function platform._touch_row()', t);
  end loop;
end $$;

insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed,
   reference_pickable)
values
  ('web_sitemap', 'Sitemap', 'web', 'sitemap', 'web.sitemap', 'component', true, false, 'url', true, 1, true, false, false),
  ('web_page_sitemap', 'Page Sitemap Membership', 'web', 'page_sitemap', 'web.page_sitemap', 'component', true, false, null, true, 1, true, false, false)
on conflict (token) do update set
  label = excluded.label,
  schema_name = excluded.schema_name,
  table_name = excluded.table_name,
  table_ref = excluded.table_ref,
  rls_variant = excluded.rls_variant,
  is_component = excluded.is_component,
  is_versioned = excluded.is_versioned,
  title_column = excluded.title_column,
  has_soft_delete = excluded.has_soft_delete,
  is_active = true;

insert into platform.entity_relationships (parent_type, child_type, fk_column, kind, note)
values
  ('web_site', 'web_sitemap', 'site_id', 'composition', 'access derives from site'),
  ('web_site', 'web_page_sitemap', 'site_id', 'composition', 'access derives from site')
on conflict do nothing;

select iam.apply_rls('web', 'sitemap', 'web_sitemap', 'component');
select iam.apply_rls('web', 'page_sitemap', 'web_page_sitemap', 'component');

grant select, update on web.sitemap to authenticated;
grant select on web.page_sitemap to authenticated;
grant select, insert, update, delete on web.sitemap, web.page_sitemap to service_role;

notify pgrst, 'reload schema';
