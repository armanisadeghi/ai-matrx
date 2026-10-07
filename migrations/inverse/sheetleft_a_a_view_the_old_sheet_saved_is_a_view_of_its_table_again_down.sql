-- chair-step: withdraws the copies SHEET-LEFTOVERS item 1 made (soft: they are archived, never deleted) and clears the moved_to mark on the originals
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_a_a_view_the_old_sheet_saved_is_a_view_of_its_table_again_down';

update platform.saved_view
   set deleted_at = now()
 where surface_key = 'custom/records'
   and definition -> 'moved_from' ->> 'by' = 'SHEET-LEFTOVERS'
   and definition -> 'moved_from' ->> 'store' = 'platform.saved_view/matrx-user/data-tables'
   and deleted_at is null;

update platform.saved_view
   set metadata = metadata - 'moved_to'
 where surface_key = 'matrx-user/data-tables'
   and metadata -> 'moved_to' ->> 'by' = 'SHEET-LEFTOVERS';
