-- ============================================================================
-- Make the public-media-URL guard SCHEMA-AWARE, and repair the registrations
-- the 2026 schema reorg silently disabled.
--
-- WHAT WAS BROKEN (found 2026-08-11 by the durability-mismatch sweep):
--   mtx_public_url_guard_trigger() looked up the registry by TG_TABLE_NAME
--   alone. Two registry rows still carried PRE-REORG names:
--       'aga_apps'    → the table is now app.definition      (TG_TABLE_NAME 'definition')
--       'wf_template' → the table is now workflow.template   (TG_TABLE_NAME 'template')
--   The triggers were attached and firing, the lookup matched zero rows, and
--   the guard was a SILENT NO-OP on three columns — all three anon-facing:
--       app.definition.preview_image_url  (public /p/[slug] OG image)
--       app.definition.favicon_url        (public /p/[slug] favicon)
--       workflow.template.preview_image_url (published templates, all users)
--   A guard that reports nothing is indistinguishable from a guard that finds
--   nothing. That is the exact failure mode this file removes.
--
--   Bare table names are also now AMBIGUOUS: 'definition' exists in app,
--   agent, skill and workflow; 'template' in workflow and research. Renaming
--   the rows alone would leave the guard able to fire on the wrong table, so
--   the key becomes (schema_name, table_name).
--
-- Back-compat: schema_name IS NULL keeps the old "any schema with this table
-- name" behaviour, so nothing that relied on the loose match breaks.
-- ============================================================================

alter table public.mtx_public_url_guard
  add column if not exists schema_name text;

comment on column public.mtx_public_url_guard.schema_name is
  'Schema of the guarded table. NULL matches any schema (legacy loose behaviour). Set it — bare table names like "definition"/"template" exist in several schemas.';

-- Widen the uniqueness key so the same table name can be guarded in two schemas.
-- Drop the CONSTRAINT (which owns the index) — dropping the index directly is
-- rejected while the constraint depends on it.
alter table public.mtx_public_url_guard
  drop constraint if exists mtx_public_url_guard_table_name_column_name_key;
create unique index if not exists mtx_public_url_guard_unique_target
  on public.mtx_public_url_guard (coalesce(schema_name, ''), table_name, column_name);

-- Heal jobs must say WHICH schema they came from, for the same reason.
alter table public.mtx_media_heal_queue
  add column if not exists schema_name text;

-- ── Repair the two reorg-orphaned registrations ─────────────────────────────
update public.mtx_public_url_guard
   set table_name = 'definition', schema_name = 'app'
 where table_name = 'aga_apps';

update public.mtx_public_url_guard
   set table_name = 'template', schema_name = 'workflow'
 where table_name = 'wf_template';

-- ── Pin the schema on every other live registration ─────────────────────────
update public.mtx_public_url_guard set schema_name = 'podcast'
 where table_name in ('pc_episodes', 'pc_shows', 'pc_studio_runs') and schema_name is null;
update public.mtx_public_url_guard set schema_name = 'canvas'
 where table_name = 'shared_canvas_items' and schema_name is null;
update public.mtx_public_url_guard set schema_name = 'public'
 where table_name in ('custom_app_configs', 'custom_applet_configs', 'site_metadata')
   and schema_name is null;

-- ── Schema-aware trigger ────────────────────────────────────────────────────
create or replace function public.mtx_public_url_guard_trigger()
returns trigger
language plpgsql
as $$
declare
  guarded record;
  val text;
  row_json jsonb := to_jsonb(NEW);
begin
  for guarded in
    select column_name
      from public.mtx_public_url_guard
     where table_name = TG_TABLE_NAME
       and (schema_name is null or schema_name = TG_TABLE_SCHEMA)
  loop
    val := row_json ->> guarded.column_name;
    if not public.mtx_is_durable_media_url(val) then
      raise warning '[MEDIA-DURABILITY] %.%.% on row % received a NON-PUBLIC / expiring URL that must never have been written here (signed S3 link). value=%',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, guarded.column_name, (row_json ->> 'id'), left(val, 100);
      insert into public.mtx_media_heal_queue
             (schema_name, table_name, row_id, column_name, bad_value)
      values (TG_TABLE_SCHEMA, TG_TABLE_NAME, (row_json ->> 'id'), guarded.column_name, val)
      on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;
    end if;
  end loop;
  return NEW;
end;
$$;

comment on function public.mtx_public_url_guard_trigger() is
  'Generic AFTER INSERT/UPDATE trigger. Matches public.mtx_public_url_guard on (schema_name, table_name) — schema_name NULL matches any schema. A non-durable value raises a loud WARNING and enqueues a heal job. Non-blocking by design.';
