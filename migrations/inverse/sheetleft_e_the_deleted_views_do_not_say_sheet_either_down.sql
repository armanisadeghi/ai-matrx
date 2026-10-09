-- chair-step: gives back the layout word "sheet" to the deleted views SHEET-LEFTOVERS item 2 rewrote (only those still deleted), then clears the mark
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_e_the_deleted_views_do_not_say_sheet_either_down';

update platform.saved_view
   set definition = jsonb_set(definition, '{layout}', '"sheet"'::jsonb),
       metadata = metadata - 'layout_before'
 where deleted_at is not null
   and metadata -> 'layout_before' ->> 'by' = 'SHEET-LEFTOVERS'
   and metadata -> 'layout_before' ->> 'layout' = 'sheet'
   and definition ->> 'layout' = 'grid';
