-- chair-step: a DATA REPAIR. It only INSERTS rows into platform.saved_view — one default view for each copy of an older
--   table that has none. No row is updated or deleted, no function, table, trigger, policy or grant
--   is touched. The inverse is
--   `migrations/inverse/datav2face2_a_copied_table_opens_as_the_sheet_it_was_down.sql` (it
--   withdraws exactly the rows this file made — soft, `deleted_at` + a note; nothing is deleted).
--   ORDER AT PRODUCTION: only AFTER oneview_every_view_bar_view_moves_into_the_one_store.sql (S0's
--   data move, window row S2) has landed: a copy whose default view still sits in the older
--   `records_ui_view` store would otherwise get a second default when S0 copies that one in. If the
--   window skips S0, skip this file too. Re-running is safe: a copy that already has a live default
--   view (this file's, the mover's, or one a person chose) is never given another.
-- lock: platform
-- lane: DATA-V2-FACE-2
--
-- LANE DATA-V2-FACE-2 — A COPY OF AN OLDER TABLE OPENS AS THE SHEET IT ALWAYS WAS.
--
-- THE USE CASE. Rincon Plumbing Co kept its service calls in the older data tables, where every
-- table simply WAS a sheet. The mover copied it into the record store; the office manager opens the
-- copy on /data-v2 and must see the Sheet — owner, 2026-09-24: "for something like my data tables,
-- which are predetermined with a default view of 'Sheet' I want to see … it just shows them the way
-- it should in the default view. That's how you take custom systems and fake like they're
-- hard-coded builtin systems."
--
-- THE DEFECT. The mover (aidream matrx_records/movers/attributes.py) made a copy's default view
-- only to hold a hand-set row order, so every copy without one had NO default view and the page
-- seeded a plain "All records" grid with the layout chooser. The mover is fixed (aidream 00ebaa0e33:
-- every copy gets `moved_from.kind = "default_view"`); this file repairs the copies already made.
--
-- THE ROW IT WRITES, per copy (a live custom.record Table whose id is an older
-- workbench.udt_datasets id — the mover keeps the older id) that has no live custom/records view
-- marked default (the column, or `definition.is_default`) and none carrying the mover's mark:
--   name "All records" (the page's own word) · surface custom/records · subject the Table ·
--   is_default true · visibility internal · organization the TABLE's · created_by the older
--   dataset's owner · definition {table_id, filters {}, is_default true,
--   moved_from {kind "default_view", dataset_id, repaired_by "DATA-V2-FACE-2"}} ·
--   metadata {made_by: this file}.
-- NO `layout` KEY, on purpose: `layout` is the view's package kind (grid · kanban · calendar ·
-- gallery), and the store's view-key guard (S1-PRIME, uichamp_s1_…) refuses any other word there.
-- records-ui `designatedLayoutOf` reads the mover's mark as the Sheet.
--
-- LOCKS. insert into platform.saved_view only (ROW EXCLUSIVE). No DDL. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:datav2face2_a_copied_table_opens_as_the_sheet_it_was';

do $sheet$
declare
  v_made integer := 0;
  v_copies integer := 0;
begin
  select count(*) into v_copies
    from custom.record t
    join workbench.udt_datasets d on d.id = t.id
   where t.data_class = 'table' and t.deleted_at is null;

  with copies as (
    select t.id as table_id, t.organization_id, d.user_id as owner
      from custom.record t
      join workbench.udt_datasets d on d.id = t.id
     where t.data_class = 'table' and t.deleted_at is null
       and not exists (
         select 1 from platform.saved_view v
          where v.surface_key = 'custom/records' and v.subject_id = t.id and v.deleted_at is null
            and (v.is_default
                 or v.definition -> 'is_default' = 'true'::jsonb
                 or v.definition -> 'moved_from' ->> 'kind' = 'default_view'))
  ), made as (
    insert into platform.saved_view
      (name, surface_key, subject_id, definition, is_default, organization_id, created_by, visibility, metadata)
    select 'All records', 'custom/records', c.table_id,
           jsonb_build_object(
             'table_id', c.table_id,
             'filters', '{}'::jsonb,
             'is_default', true,
             'moved_from', jsonb_build_object('kind', 'default_view', 'dataset_id', c.table_id,
                                              'repaired_by', 'DATA-V2-FACE-2')),
           true, c.organization_id, c.owner, 'internal'::platform.visibility,
           jsonb_build_object('made_by', 'datav2face2_a_copied_table_opens_as_the_sheet_it_was')
      from copies c
    returning 1
  )
  select count(*) into v_made from made;

  raise notice 'DATA-V2-FACE-2: % copies of older tables; % given their default view (the Sheet); % already had one',
    v_copies, v_made, v_copies - v_made;
end
$sheet$;
