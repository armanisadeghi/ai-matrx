-- chair-step: gives back the layout word "sheet" to exactly the views SHEET-LEFTOVERS item 2 rewrote, then clears the mark
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_b_no_live_view_keeps_the_retired_sheet_layout_down';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', '"sheet"'::jsonb),
       metadata = metadata - 'layout_before'
 where metadata -> 'layout_before' ->> 'by' = 'SHEET-LEFTOVERS'
   and metadata -> 'layout_before' ->> 'layout' = 'sheet';
