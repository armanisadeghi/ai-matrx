-- chair-step: an UPDATE of platform.saved_view rows (puts back the layout step 2 changed)
-- lock: platform
-- lane: ORDER-FIX
--
-- The inverse of orderfix_a_hand_ordered_view_opens_as_the_sheet.sql: each view it repaired goes
-- back to the layout its metadata says it had.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', to_jsonb(metadata ->> 'order_fix_layout_was'), true),
       metadata = metadata - 'order_fix_layout_was',
       updated_at = now()
 where metadata ? 'order_fix_layout_was';
