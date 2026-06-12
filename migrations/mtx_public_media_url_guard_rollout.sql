-- ============================================================================
-- Public-media-URL guard — ROLLOUT across every public-read media column.
--
-- The reusable machinery (registry + generic trigger + classifier + heal queue)
-- lives in `mtx_public_media_url_guard.sql` and shipped registered on `pc_episodes`
-- only. This migration:
--   1. UPGRADES the generic trigger to also handle `text[]` (array) media columns
--      (e.g. pc_studio_runs.image_urls) — previously it only checked scalar text.
--   2. REGISTERS every other column that holds our media and is read by the public
--      web (anon), by cross-user authed surfaces, or feeds a public column.
--   3. BACKFILLS existing non-durable rows into `mtx_media_heal_queue`.
--
-- Risk classification (from RLS audit 2026-06-08):
--   anon-public      : pc_shows, aga_apps, shared_canvas_items, site_metadata,
--                      custom_app_configs, custom_applet_configs
--   cross-user authed: wf_template (published rows visible to all authenticated)
--   owner-only        : pc_studio_runs (feeds public pc_episodes; heal visibility)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Array-aware trigger. Backward compatible: scalar columns behave exactly as
--    before; a column whose JSON value is an array is checked element-by-element
--    and queued once (whole array as bad_value) if ANY element is non-durable.
-- ---------------------------------------------------------------------------
create or replace function public.mtx_public_url_guard_trigger()
returns trigger
language plpgsql
as $$
declare
  guarded   record;
  row_json  jsonb := to_jsonb(NEW);
  col_json  jsonb;
  val       text;
  bad       boolean;
begin
  for guarded in
    select column_name from public.mtx_public_url_guard where table_name = TG_TABLE_NAME
  loop
    col_json := row_json -> guarded.column_name;

    if col_json is null or jsonb_typeof(col_json) = 'null' then
      continue;
    end if;

    if jsonb_typeof(col_json) = 'array' then
      -- array media column (e.g. text[]): non-durable if ANY element is signed
      select bool_or(not public.mtx_is_durable_media_url(e))
        into bad
        from jsonb_array_elements_text(col_json) as e;
      val := col_json::text;
    else
      val := row_json ->> guarded.column_name;
      bad := not public.mtx_is_durable_media_url(val);
    end if;

    if coalesce(bad, false) then
      raise warning '[MEDIA-DURABILITY] %.% on row % received a NON-PUBLIC / expiring URL that must never have been written here (signed S3 link). value=%',
        TG_TABLE_NAME, guarded.column_name, (row_json ->> 'id'), left(val, 100);
      insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
        values (TG_TABLE_NAME, (row_json ->> 'id'), guarded.column_name, val)
        on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;
    end if;
  end loop;
  return NEW;
end;
$$;

comment on function public.mtx_public_url_guard_trigger() is
  'Generic AFTER INSERT/UPDATE trigger. For each (table,column) in mtx_public_url_guard matching this table, validates the new value via mtx_is_durable_media_url. Handles scalar text and text[] array columns (any non-durable element flags the row). A non-durable value raises a loud WARNING and enqueues a heal job. Non-blocking.';

-- ---------------------------------------------------------------------------
-- 2. Register columns + attach triggers.
-- ---------------------------------------------------------------------------
insert into public.mtx_public_url_guard (table_name, column_name, note) values
  -- anon-public --------------------------------------------------------------
  ('pc_shows',              'image_url',               'public show cover — anonymous discovery/show page'),
  ('pc_shows',              'og_image_url',            'social preview — must be permanent'),
  ('pc_shows',              'thumbnail_url',           'list thumbnail — must be permanent'),
  ('aga_apps',              'preview_image_url',       'public /p/[slug] OG image (anon, published+public)'),
  ('aga_apps',              'favicon_url',             'public /p/[slug] favicon (anon)'),
  ('shared_canvas_items',   'thumbnail_url',           'public canvas-share OG image (anon, public/unlisted)'),
  ('site_metadata',         'logo_url',                'site-wide logo — rendered everywhere incl. anon'),
  ('site_metadata',         'default_share_image_url', 'site-wide default OG image — anon social previews'),
  ('custom_app_configs',    'image_url',               'custom app image (RLS off → broadly readable)'),
  ('custom_applet_configs', 'image_url',               'custom applet image (RLS off → broadly readable)'),
  -- cross-user authed --------------------------------------------------------
  ('wf_template',           'preview_image_url',       'published templates visible to ALL authed users; non-owners cannot re-mint a creators signed URL'),
  -- owner-only (feeds public pc_episodes; heal visibility) --------------------
  ('pc_studio_runs',        'audio_url',               'studio run audio — copied into public pc_episodes'),
  ('pc_studio_runs',        'selected_cover_url',      'studio run selected cover — copied into public pc_episodes'),
  ('pc_studio_runs',        'image_urls',              'studio run generated images (text[]) — feed public episode'),
  ('pc_studio_runs',        'video_urls',              'studio run generated videos (text[]) — feed public episode')
on conflict (table_name, column_name) do nothing;

drop trigger if exists pc_shows_public_url_guard on public.pc_shows;
create trigger pc_shows_public_url_guard
  after insert or update on public.pc_shows
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists aga_apps_public_url_guard on public.aga_apps;
create trigger aga_apps_public_url_guard
  after insert or update on public.aga_apps
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists shared_canvas_items_public_url_guard on public.shared_canvas_items;
create trigger shared_canvas_items_public_url_guard
  after insert or update on public.shared_canvas_items
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists site_metadata_public_url_guard on public.site_metadata;
create trigger site_metadata_public_url_guard
  after insert or update on public.site_metadata
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists custom_app_configs_public_url_guard on public.custom_app_configs;
create trigger custom_app_configs_public_url_guard
  after insert or update on public.custom_app_configs
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists custom_applet_configs_public_url_guard on public.custom_applet_configs;
create trigger custom_applet_configs_public_url_guard
  after insert or update on public.custom_applet_configs
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists wf_template_public_url_guard on public.wf_template;
create trigger wf_template_public_url_guard
  after insert or update on public.wf_template
  for each row execute function public.mtx_public_url_guard_trigger();

drop trigger if exists pc_studio_runs_public_url_guard on public.pc_studio_runs;
create trigger pc_studio_runs_public_url_guard
  after insert or update on public.pc_studio_runs
  for each row execute function public.mtx_public_url_guard_trigger();

-- ---------------------------------------------------------------------------
-- 3. Backfill existing non-durable rows into the heal queue (one per table —
--    plain SQL can't scan a table named by a column value, so it's explicit).
--    Scalar columns: flag where the value is non-durable.
--    Array columns:  flag where any element is non-durable.
-- ---------------------------------------------------------------------------

-- pc_shows
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'pc_shows', t.id::text, c.col, left(c.val, 500)
from public.pc_shows t
cross join lateral (values
  ('image_url', t.image_url), ('og_image_url', t.og_image_url), ('thumbnail_url', t.thumbnail_url)
) as c(col, val)
where not public.mtx_is_durable_media_url(c.val)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- aga_apps
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'aga_apps', t.id::text, c.col, left(c.val, 500)
from public.aga_apps t
cross join lateral (values
  ('preview_image_url', t.preview_image_url), ('favicon_url', t.favicon_url)
) as c(col, val)
where not public.mtx_is_durable_media_url(c.val)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- shared_canvas_items
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'shared_canvas_items', t.id::text, 'thumbnail_url', left(t.thumbnail_url, 500)
from public.shared_canvas_items t
where not public.mtx_is_durable_media_url(t.thumbnail_url)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- site_metadata
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'site_metadata', t.id::text, c.col, left(c.val, 500)
from public.site_metadata t
cross join lateral (values
  ('logo_url', t.logo_url), ('default_share_image_url', t.default_share_image_url)
) as c(col, val)
where not public.mtx_is_durable_media_url(c.val)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- custom_app_configs
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'custom_app_configs', t.id::text, 'image_url', left(t.image_url, 500)
from public.custom_app_configs t
where not public.mtx_is_durable_media_url(t.image_url)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- custom_applet_configs
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'custom_applet_configs', t.id::text, 'image_url', left(t.image_url, 500)
from public.custom_applet_configs t
where not public.mtx_is_durable_media_url(t.image_url)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- wf_template
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'wf_template', t.id::text, 'preview_image_url', left(t.preview_image_url, 500)
from public.wf_template t
where not public.mtx_is_durable_media_url(t.preview_image_url)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

-- pc_studio_runs (scalar + array columns)
insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'pc_studio_runs', t.id::text, c.col, left(c.val, 500)
from public.pc_studio_runs t
cross join lateral (values
  ('audio_url', t.audio_url), ('selected_cover_url', t.selected_cover_url)
) as c(col, val)
where not public.mtx_is_durable_media_url(c.val)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;

insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
select 'pc_studio_runs', t.id::text, c.col, left(array_to_string(c.arr, ','), 500)
from public.pc_studio_runs t
cross join lateral (values
  ('image_urls', t.image_urls), ('video_urls', t.video_urls)
) as c(col, arr)
where exists (
  select 1 from unnest(c.arr) u where not public.mtx_is_durable_media_url(u)
)
on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;
