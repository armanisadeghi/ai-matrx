-- Brand asset primary authority + brand/site soft-delete lifecycle (2026-08-08)
--
-- Board bullets (docs/MARKETING_PROGRAM_BOARD.md):
--   1. "multiple assets can be primary without synchronizing brand/site
--      identity; wire canonical upload/rendering and enforce one atomic
--      primary per brand/type."
--   2. "deleting a site leaves its live property(kind='website') row, allowing
--      the owning brand to be deleted while a live property still points at
--      the hidden site; make the lifecycle transition atomic across both
--      authorities."
--
-- All enforcement lives at the DB so every writer (frontend, aidream,
-- promotion code, admin SQL) gets the same atomic behavior.

-- ============================================================================
-- 1a. One primary per (brand, kind) — demote live siblings BEFORE the row
--     lands, so the partial unique index below never rejects a legal set.
-- ============================================================================

create or replace function web.brand_asset_demote_sibling_primaries()
returns trigger
language plpgsql
as $$
begin
  update web.brand_asset
     set is_primary = false
   where brand_id = new.brand_id
     and kind = new.kind
     and id <> new.id
     and is_primary
     and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists _single_primary on web.brand_asset;
create trigger _single_primary
  before insert or update of is_primary, deleted_at, kind, brand_id
  on web.brand_asset
  for each row
  when (new.is_primary and new.deleted_at is null)
  execute function web.brand_asset_demote_sibling_primaries();

-- Clean up any pre-existing duplicates (keep the newest-updated one), then
-- guarantee the invariant against concurrent writers.
with ranked as (
  select id,
         row_number() over (
           partition by brand_id, kind
           order by updated_at desc, id desc
         ) as rn
    from web.brand_asset
   where is_primary and deleted_at is null
)
update web.brand_asset a
   set is_primary = false
  from ranked r
 where a.id = r.id and r.rn > 1;

create unique index if not exists brand_asset_one_primary_per_brand_kind
  on web.brand_asset (brand_id, kind)
  where is_primary and deleted_at is null;

-- ============================================================================
-- 1b. A primary logo / favicon / og_image asset with a public source URL
--     synchronizes the brand identity columns summary cards consume.
--     File-backed assets (file_id only) deliberately do NOT sync: identity
--     URLs are the brand's own public URLs, never our storage.
-- ============================================================================

create or replace function web.brand_asset_sync_brand_identity()
returns trigger
language plpgsql
as $$
begin
  update web.brand b
     set logo_url    = case when new.kind = 'logo' then new.source_url else b.logo_url end,
         favicon_url = case when new.kind = 'favicon' then new.source_url else b.favicon_url end,
         og_image_url = case when new.kind in ('og_image', 'twitter_image') then new.source_url else b.og_image_url end
   where b.id = new.brand_id
     and b.deleted_at is null
     and (case when new.kind = 'logo' then b.logo_url
               when new.kind = 'favicon' then b.favicon_url
               else b.og_image_url
          end) is distinct from new.source_url;
  return null;
end;
$$;

drop trigger if exists _sync_brand_identity on web.brand_asset;
create trigger _sync_brand_identity
  after insert or update of is_primary, source_url
  on web.brand_asset
  for each row
  when (
    new.is_primary
    and new.deleted_at is null
    and new.source_url is not null
    and new.kind in ('logo', 'favicon', 'og_image', 'twitter_image')
  )
  execute function web.brand_asset_sync_brand_identity();

-- ============================================================================
-- 2a. Site soft-delete/restore cascades to its website property row — the two
--     authorities (web.site, web.property kind='website') move atomically.
--     Restore only revives rows carrying the exact cascade stamp, so a
--     property the user deleted independently stays deleted.
-- ============================================================================

create or replace function web.site_cascade_website_property()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null then
    update web.property
       set deleted_at = new.deleted_at
     where site_id = new.id
       and kind = 'website'
       and deleted_at is null;
  elsif old.deleted_at is not null then
    update web.property
       set deleted_at = null
     where site_id = new.id
       and kind = 'website'
       and deleted_at = old.deleted_at;
  end if;
  return null;
end;
$$;

drop trigger if exists _cascade_website_property on web.site;
create trigger _cascade_website_property
  after update of deleted_at
  on web.site
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function web.site_cascade_website_property();

-- ============================================================================
-- 2b. A brand cannot be soft-deleted while live children remain. The FE
--     preflights the same checks for friendly copy; this closes the race.
-- ============================================================================

create or replace function web.brand_soft_delete_guard()
returns trigger
language plpgsql
as $$
declare
  live_sites integer;
  live_properties integer;
begin
  select count(*) into live_sites
    from web.site where brand_id = new.id and deleted_at is null;
  select count(*) into live_properties
    from web.property where brand_id = new.id and deleted_at is null;
  if live_sites > 0 or live_properties > 0 then
    raise exception
      'Brand still owns % live site(s) and % live propert(ies). Delete or move them first.',
      live_sites, live_properties;
  end if;
  return new;
end;
$$;

drop trigger if exists _soft_delete_guard on web.brand;
create trigger _soft_delete_guard
  before update of deleted_at
  on web.brand
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function web.brand_soft_delete_guard();

-- ============================================================================
-- 3. Backfill the existing drift: live website properties whose site (or
--    brand) is already soft-deleted inherit the parent's delete stamp.
-- ============================================================================

update web.property p
   set deleted_at = s.deleted_at
  from web.site s
 where p.site_id = s.id
   and p.kind = 'website'
   and p.deleted_at is null
   and s.deleted_at is not null;

update web.property p
   set deleted_at = b.deleted_at
  from web.brand b
 where p.brand_id = b.id
   and p.deleted_at is null
   and b.deleted_at is not null;
