-- Two constraint fixes surfaced by the first real production initialize run
-- (both captured by the Error Inspector, source marketing-crawler):
--
-- 1. web.screenshot.kind check predates the four initialize capture kinds
--    (desktop_full / desktop_fold / mobile_full / mobile_fold).
-- 2. discovered_item_dedup was NULLS NOT DISTINCT over
--    (brand_id, category, guessed_kind, url) — two DIFFERENT facts with no
--    url (e.g. two phone numbers) collapse to the same key and the second
--    insert dies. Fix: a stored value_hash generated column joins the key so
--    value-bearing rows dedup by their VALUE while url rows keep url dedup.
--    The scraper's ON CONFLICT target must include value_hash (aidream change
--    dispatched alongside this migration).

alter table web.screenshot drop constraint if exists screenshot_kind_valid;
alter table web.screenshot add constraint screenshot_kind_valid check (
  kind = any (array[
    'homepage'::text, 'page'::text, 'full'::text, 'viewport'::text,
    'desktop_full'::text, 'desktop_fold'::text,
    'mobile_full'::text, 'mobile_fold'::text
  ])
);

alter table web.discovered_item
  add column if not exists value_hash text
  generated always as (md5(value::text)) stored;

drop index if exists web.discovered_item_dedup;
create unique index if not exists discovered_item_dedup
  on web.discovered_item (brand_id, category, guessed_kind, url, value_hash)
  nulls not distinct;

notify pgrst, 'reload schema';
