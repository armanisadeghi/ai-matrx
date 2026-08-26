-- platform.saved_view — ONE saved-views table for every list surface.
--
-- A saved view is a NAMED, RE-RUNNABLE view of a list: the query (search, sort,
-- filters) plus the presentation it implies (which columns, in what order, page
-- size). It turns a list from something you browse into something you return to.
--
-- WHY PLATFORM AND NOT A FEATURE SCHEMA. `crm.saved_view` already existed and is
-- well built — visibility, definition versioning, validate-on-read — and its
-- `list_key` was documented as "open set on purpose; each list brings its own
-- definition shape + parser". That design was always platform-shaped; only its
-- ADDRESS was CRM's. A data-table view living in the `crm` schema would be a lie
-- about ownership. CRM converges onto this table next; until it does, CRM keeps
-- working untouched, so neither surface is ever half-migrated.
--
-- `surface_key` says WHICH LIST a view belongs to; `subject_id` optionally
-- narrows it to ONE record of that list (the dataset, for data tables). A view
-- for one table must never surface on another.
--
-- Created via platform.create_entity_table (never hand DDL) with RLS from
-- iam.apply_rls; iam.canonical_certify_ok('platform','saved_view',
-- 'platform_saved_view') returns true.
--
-- APPLIED LIVE 2026-08-26 to brsgrqvjdzwihsvnfqkf via Supabase MCP as migration
-- `platform_saved_view`. Idempotent. The two indexes below carry the rules that
-- are not expressible as columns.
create index if not exists saved_view_surface_subject_idx
  on platform.saved_view (surface_key, subject_id);

-- ONE default per person per list. A second default is not a preference, it is
-- an ambiguity the UI would have to resolve arbitrarily on every page load.
create unique index if not exists saved_view_one_default_idx
  on platform.saved_view (created_by, surface_key, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default and deleted_at is null;

notify pgrst, 'reload schema';
