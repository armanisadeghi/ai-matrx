-- MERGE-7 — THE MERGED GRID IS A FEATURE KNOB.
--
-- One-grid merge, step 7 (common-docs projects/data-doctrine-adoption/v5/v2-readiness-audit/
-- MERGE-DESIGN.md §4). Every place in matrx-frontend that opens a record-store table by id (the
-- table window, the dataset overlay, a chat table artifact, the quick data sheet, the tables
-- picker, the chat "view table" modal) now mounts @ai-matrx/records-ui's table page. WHICH grid it
-- draws — the classic records-ui grid or the merged grid carrying the older /data grid's controls —
-- is this knob, read for the table's organization and the person (`useMergedGridKnob`,
-- features/data-tables/records-ui-host/mergedGridKnob.ts). The /data-v2 table page reads it too;
-- `?grid=merged` still forces the merged grid there for a walk.
--
-- Default OFF until merge step 8 flips the platform default. Overridable per organization and per
-- person, so a walk can turn it on for one account without touching anybody else.
--
-- Inverse: migrations/inverse/merge7_the_merged_grid_is_a_feature_knob_down.sql. Idempotent.

set lock_timeout = '3s';
set statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('data_tables', 'merged_grid',
   'false'::jsonb, 'false'::jsonb, 'boolean',
   'Tables use the new spreadsheet grid',
   'Which grid a table in the record store draws wherever it opens: its own page, a window, a '
   || 'chat, the quick data sheet or a picker''s preview. On, the grid carries the spreadsheet '
   || 'controls people know from the older data tables: the column menu, right-click menus for '
   || 'cells, rows and columns, bulk changes to many rows at once, undo, colour rules, summaries '
   || 'and every display format. Off, the simpler grid draws. The rows and columns are the same '
   || 'either way; only the controls change.',
   'agent',
   'One-grid merge step 7 (lane data-tables-grid-overhaul, 2026-09-26): the switch between '
   || 'records-ui RecordsUiHost.grid "classic" and "merged". Default off until merge step 8 makes '
   || 'the merged grid the only grid; this row is then retired with the switch (merge step 9). '
   || 'Read by matrx-frontend features/data-tables/records-ui-host/mergedGridKnob.ts through '
   || 'useEffectiveKnob.',
   (current_date + 30),
   array['organization','user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'data_tables' and key = 'merged_grid'
       and default_value = 'false'::jsonb and 'user' = any (overridable_by)
  ) then
    raise exception 'merge7: data_tables.merged_grid did not land as a user-overridable, default-off knob';
  end if;
end $$;
