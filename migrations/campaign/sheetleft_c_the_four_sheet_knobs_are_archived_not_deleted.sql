-- The old Sheet read four organization knobs; custom/grid_layout (GRID-PRIMITIVES G1) replaced them:
-- the platform default, the organization's override and the saved view's own choice, answered by
-- custom.grid_layout. The Sheet's code is deleted (1c4e8b0d0d). Census before this file, all read
-- on 2026-10-07: no database function quotes any of the four addresses
-- (platform.knob_live_readers is null for each, and pg_proc matches nothing), and no TypeScript or
-- Python reads them — what remains is two code COMMENTS (features/data-tables/table-view-url.ts,
-- lib/field-formats/FieldFormatPicker.tsx) and files generated from the registry.
--   extensibility / user_tables.default_layout
--   extensibility / user_tables.default_row_height
--   extensibility / user_tables.fit_max_columns
--   data_tables.relation / relation_columns_enabled
-- Each is ARCHIVED through the registry's own archive columns (SETTINGS-3), the way the six knobs
-- SETTINGS-3 retired were: soft, reversible with platform.knob_unarchive, and it stops being offered.
-- Written straight into the columns, not through platform.knob_archive, because the door is
-- admin-gated on auth.uid() and a migration has no signed-in caller (SETTINGS-3 did the same).
-- Organization 884d1ce8's two overrides (fit_max_columns = 7, relation_columns_enabled = true) are
-- KEPT, never deleted, and marked metadata.retired so nobody reads them as live.
-- Inverse: migrations/inverse/sheetleft_c_the_four_sheet_knobs_are_archived_not_deleted_down.sql
-- lock: platform
-- lane: SHEET-LEFTOVERS
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_c_the_four_sheet_knobs_are_archived_not_deleted';

do $retire$
declare
  v_knobs integer;
  v_overrides integer;
begin
  update platform.feature_knob set
    archived_at = now(), updated_at = now(), archived_by = 'SHEET-LEFTOVERS (2026-10-07)',
    archived_reason = 'The old Sheet that read this knob is deleted (1c4e8b0d0d); how a Table''s grid opens is now the custom/grid_layout knob, answered by custom.grid_layout, and nothing reads this row.'
   where ((feature = 'extensibility' and key in ('user_tables.default_layout', 'user_tables.default_row_height', 'user_tables.fit_max_columns'))
       or (feature = 'data_tables.relation' and key = 'relation_columns_enabled'))
     and archived_at is null;
  get diagnostics v_knobs = row_count;

  update platform.knob_override set
    metadata = coalesce(metadata, '{}'::jsonb)
               || jsonb_build_object('retired', jsonb_build_object(
                    'by', 'SHEET-LEFTOVERS', 'at', now(),
                    'why', 'its knob is archived; the old Sheet that read it is deleted'))
   where organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
     and ((feature = 'extensibility' and key = 'user_tables.fit_max_columns')
       or (feature = 'data_tables.relation' and key = 'relation_columns_enabled'))
     and not (metadata ? 'retired');
  get diagnostics v_overrides = row_count;

  raise notice 'SHEET-LEFTOVERS C: % knob(s) archived; % override row(s) marked retired and kept', v_knobs, v_overrides;
end
$retire$;
