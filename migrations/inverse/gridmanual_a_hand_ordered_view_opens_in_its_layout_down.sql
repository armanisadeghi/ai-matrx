-- chair-step: an UPDATE of platform.saved_view rows (puts back the layout GRID-MANUAL restored)
-- lock: platform
-- lane: GRID-MANUAL
--
-- The inverse of migrations/campaign/gridmanual_a_hand_ordered_view_opens_in_its_layout.sql: each
-- view it moved goes back to the layout it held before (the Sheet), and carries ORDER-FIX's marker again.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', to_jsonb(metadata ->> 'grid_manual_layout_was'), true),
       metadata = (metadata - 'grid_manual_layout_was') || jsonb_build_object('order_fix_layout_was', definition ->> 'layout'),
       updated_at = now()
 where metadata ? 'grid_manual_layout_was';
