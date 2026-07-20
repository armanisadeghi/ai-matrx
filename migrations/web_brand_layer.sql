-- Brand layer for the Marketing feature.
-- The anchor entity is the Brand (a company/brand an organization manages —
-- their own, or an agency client's). A website is ONE property of a brand;
-- social accounts, GBP, etc. are others. Machine discovery writes candidates
-- to web.discovered_item; humans promote them to web.brand_asset /
-- web.business_fact. Machine writes never touch confirmed truth.
--
-- Idempotent. RLS via iam.apply_rls (canonical generator) with registry rows
-- in platform.entity_types / platform.entity_relationships.

-- ============================================================ 1. brand (anchor)
create table if not exists web.brand (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  name text not null,
  description text,
  website_url text,
  logo_url text,
  favicon_url text,
  og_image_url text,
  industry text,
  notes text,
  status text not null default 'active',
  visibility platform.visibility not null default 'private',
  settings jsonb not null default '{}'::jsonb
);
create index if not exists brand_org_idx on web.brand (organization_id) where deleted_at is null;

-- ============================================================ 2. property (one presence of a brand)
create table if not exists web.property (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  brand_id uuid not null references web.brand(id) on delete cascade,
  kind text not null,
  url text,
  handle text,
  display_name text,
  status text not null default 'active',
  site_id uuid references web.site(id),
  connection jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  constraint property_kind_check check (kind in (
    'website','instagram','facebook','x','tiktok','youtube','linkedin',
    'pinterest','google_business_profile','other'
  )),
  constraint property_locator_check check (
    url is not null or handle is not null or site_id is not null
  )
);
create index if not exists property_brand_idx on web.property (brand_id) where deleted_at is null;
create unique index if not exists property_site_unique
  on web.property (site_id) where site_id is not null and deleted_at is null;

-- ============================================================ 3. brand_asset (confirmed)
create table if not exists web.brand_asset (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  brand_id uuid not null references web.brand(id) on delete cascade,
  kind text not null,
  file_id uuid,
  source_url text,
  title text,
  notes text,
  source text not null default 'manual',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  constraint brand_asset_kind_check check (kind in (
    'logo','logo_dark','favicon','wordmark','hero_image','image','video',
    'color','font','document','other'
  )),
  constraint brand_asset_source_check check (source in ('discovered','uploaded','manual')),
  constraint brand_asset_ref_check check (
    file_id is not null or source_url is not null or kind in ('color','font')
  ),
  constraint brand_asset_file_org_fkey
    foreign key (file_id, organization_id)
    references files.files (id, organization_id) on delete restrict
);
create index if not exists brand_asset_brand_idx on web.brand_asset (brand_id) where deleted_at is null;

-- ============================================================ 4. business_fact (confirmed)
create table if not exists web.business_fact (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  brand_id uuid not null references web.brand(id) on delete cascade,
  kind text not null,
  label text,
  value jsonb not null,
  source text not null default 'manual',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  constraint business_fact_kind_check check (kind in (
    'phone','email','address','hours','tagline','legal_name',
    'social_profile','service_area','registration','other'
  )),
  constraint business_fact_source_check check (source in ('discovered','manual'))
);
create index if not exists business_fact_brand_idx on web.business_fact (brand_id) where deleted_at is null;

-- ============================================================ 5. discovered_item (machine-written inbox)
create table if not exists web.discovered_item (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  brand_id uuid not null references web.brand(id) on delete cascade,
  site_id uuid references web.site(id),
  snapshot_id uuid references web.snapshot(id),
  source text not null,
  category text not null,
  guessed_kind text,
  url text,
  value jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  confidence numeric,
  status text not null default 'pending',
  resolved_asset_id uuid references web.brand_asset(id),
  resolved_fact_id uuid references web.business_fact(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  constraint discovered_item_category_check check (category in (
    'media','fact','social','link','identity','other'
  )),
  constraint discovered_item_status_check check (status in ('pending','confirmed','dismissed'))
);
create index if not exists discovered_item_brand_idx
  on web.discovered_item (brand_id, status) where deleted_at is null;
-- Re-running discovery must not duplicate URL-bearing candidates.
create unique index if not exists discovered_item_url_dedup
  on web.discovered_item (brand_id, category, coalesce(guessed_kind, ''), url)
  where url is not null and deleted_at is null;

-- ============================================================ 6. site gains brand + identity + initialization
alter table web.site add column if not exists brand_id uuid references web.brand(id);
alter table web.site add column if not exists description text;
alter table web.site add column if not exists favicon_url text;
alter table web.site add column if not exists logo_url text;
alter table web.site add column if not exists og_image_url text;
alter table web.site add column if not exists initialized_at timestamptz;
alter table web.site add column if not exists initialization jsonb not null default '{}'::jsonb;
create index if not exists site_brand_idx on web.site (brand_id) where deleted_at is null;

-- ============================================================ 7. base triggers (mirror web.site)
do $$
declare
  t text;
begin
  foreach t in array array['brand','property','brand_asset','business_fact','discovered_item'] loop
    execute format('drop trigger if exists _stamp_actor on web.%I', t);
    execute format('create trigger _stamp_actor before insert or update on web.%I for each row execute function platform._stamp_actor()', t);
    execute format('drop trigger if exists _stamp_org_default on web.%I', t);
    execute format('create trigger _stamp_org_default before insert on web.%I for each row execute function public._stamp_org_default()', t);
    execute format('drop trigger if exists _touch_row on web.%I', t);
    execute format('create trigger _touch_row before insert or update on web.%I for each row execute function platform._touch_row()', t);
  end loop;
end $$;

drop trigger if exists _version_capture on web.brand;
create trigger _version_capture after insert or delete or update on web.brand
  for each row execute function platform._version_capture('web_brand');
drop trigger if exists _gc_assoc_harddelete on web.brand;
create trigger _gc_assoc_harddelete after delete on web.brand
  for each row execute function platform._gc_entity_associations('web_brand');
drop trigger if exists _gc_assoc_softdelete on web.brand;
create trigger _gc_assoc_softdelete after update on web.brand
  for each row execute function platform._gc_entity_associations('web_brand');

-- ============================================================ 8. entity registry
insert into platform.entity_types
  (token, label, schema_name, table_name, table_ref, rls_variant, is_component,
   is_versioned, title_column, has_soft_delete, base_tier, is_active, is_listed,
   reference_pickable)
values
  ('web_brand', 'Brand', 'web', 'brand', 'web.brand', 'entity', false, true, 'name', true, 1, true, false, true),
  ('web_property', 'Brand Property', 'web', 'property', 'web.property', 'component', true, false, 'display_name', true, 1, true, false, false),
  ('web_brand_asset', 'Brand Asset', 'web', 'brand_asset', 'web.brand_asset', 'component', true, false, 'title', true, 1, true, false, false),
  ('web_business_fact', 'Business Fact', 'web', 'business_fact', 'web.business_fact', 'component', true, false, 'label', true, 1, true, false, false),
  ('web_discovered_item', 'Discovered Item', 'web', 'discovered_item', 'web.discovered_item', 'component', true, false, null, true, 1, true, false, false)
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
  ('web_brand', 'web_property', 'brand_id', 'composition', 'access derives from brand'),
  ('web_brand', 'web_brand_asset', 'brand_id', 'composition', 'access derives from brand'),
  ('web_brand', 'web_business_fact', 'brand_id', 'composition', 'access derives from brand'),
  ('web_brand', 'web_discovered_item', 'brand_id', 'composition', 'access derives from brand')
on conflict do nothing;

-- ============================================================ 9. canonical RLS
select iam.apply_rls('web', 'brand', 'web_brand', 'entity');
select iam.apply_rls('web', 'property', 'web_property', 'component');
select iam.apply_rls('web', 'brand_asset', 'web_brand_asset', 'component');
select iam.apply_rls('web', 'business_fact', 'web_business_fact', 'component');
select iam.apply_rls('web', 'discovered_item', 'web_discovered_item', 'component');

-- ============================================================ 10. grants
grant select, insert, update, delete on
  web.brand, web.property, web.brand_asset, web.business_fact, web.discovered_item
  to authenticated;
grant select on web.brand to anon;
grant select, insert, update, delete on
  web.brand, web.property, web.brand_asset, web.business_fact, web.discovered_item
  to service_role;
-- The site page edits identity/settings directly under RLS; the old
-- SELECT-only grant made every documented direct update impossible.
grant insert, update, delete on web.site to authenticated;

-- ============================================================ 11. backfill: one brand per existing site
insert into web.brand (organization_id, created_by, name, website_url, status, visibility)
select s.organization_id, s.created_by, s.name, s.root_url, 'active', s.visibility
from web.site s
where s.deleted_at is null
  and s.brand_id is null
  and not exists (
    select 1 from web.brand b
    where b.organization_id = s.organization_id
      and lower(b.name) = lower(s.name)
      and b.deleted_at is null
  );

update web.site s
set brand_id = b.id
from web.brand b
where s.brand_id is null
  and s.deleted_at is null
  and b.organization_id = s.organization_id
  and lower(b.name) = lower(s.name)
  and b.deleted_at is null;

insert into web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
select s.organization_id, s.created_by, s.brand_id, 'website', s.root_url, s.name, s.id
from web.site s
where s.brand_id is not null
  and s.deleted_at is null
  and not exists (
    select 1 from web.property p where p.site_id = s.id and p.deleted_at is null
  );

notify pgrst, 'reload schema';
