-- target: branch,production
-- chair-step: an UPDATE of platform.saved_view rows (production 2026-09-25: the one row ORDER-FIX step 2 moved)
-- lock: platform
-- lane: GRID-MANUAL
--
-- LANE GRID-MANUAL. A HAND-ORDERED VIEW OPENS IN ITS OWN LAYOUT.
--
-- ORDER-FIX step 2 (migrations/inverse/orderfix_a_hand_ordered_view_opens_as_the_sheet.sql) moved
-- every hand-ordered grid view to the Sheet because the records-ui Grid could not draw a hand-set
-- order. @ai-matrx/records-ui now draws it (lane GRID-MANUAL: the Grid reads the view through
-- custom.read_records_in_view_order, says "Sort: Manual · set by hand", sets the order aside under
-- a column sort, and Reorder saves through custom.view_record_order_set). So the view goes back to
-- the layout it had, which step 2 kept in metadata.order_fix_layout_was.
--
-- APPLY ONLY AFTER the records-ui release carrying GRID-MANUAL is published AND installed in
-- matrx-frontend AND live on www; before that the Grid would draw the table's sort over the order.
-- Inverse: migrations/inverse/gridmanual_a_hand_ordered_view_opens_in_its_layout_down.sql.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', to_jsonb(metadata ->> 'order_fix_layout_was'), true),
       metadata = (metadata - 'order_fix_layout_was') || jsonb_build_object('grid_manual_layout_was', definition ->> 'layout'),
       updated_at = now()
 where surface_key = 'custom/records' and deleted_at is null
   and metadata ? 'order_fix_layout_was';
