-- chair-step: an UPDATE of platform.saved_view rows (a data repair; production 2026-09-25: one row)
-- lock: platform
-- lane: ORDER-FIX
--
-- LANE ORDER-FIX, step 2. A HAND-ORDERED VIEW OPENS AS THE SHEET.
--
-- A view whose order is hand-set but whose layout is the records-ui grid opens a tab that draws the
-- table's sort — the grid has no hand-set order — so the tab lies (VERIFIER-19: admin's Rooms,
-- "Hand-set order" tab, Room A→Z after the save). The Sheet is the layout that draws a hand-set
-- order, so the view opens as the Sheet; its metadata keeps the layout it had
-- (`order_fix_layout_was`) so the inverse puts it back. The Sheet itself now declares a hand-ordered
-- view as layout "sheet" (matrx-frontend record-store.ts), so no new one arrives laid out as the grid.
-- Inverse: migrations/inverse/orderfix_a_hand_ordered_view_opens_as_the_sheet_down.sql.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', '"sheet"'::jsonb, true),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('order_fix_layout_was', definition ->> 'layout'),
       updated_at = now()
 where surface_key = 'custom/records' and deleted_at is null
   and definition ->> 'order' = 'manual' and definition ->> 'layout' = 'grid';
