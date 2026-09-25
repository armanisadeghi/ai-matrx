-- lock: platform
-- lane: DATA-V2-FACE-2
-- chair-step: the inverse of datav2face2_a_copied_table_opens_as_the_sheet_it_was.sql. It WITHDRAWS
--   exactly the default views that file made — found by `metadata.made_by` — soft: `deleted_at` set
--   and `metadata.withdrawn_by` noted; nothing is deleted. A view a person has since changed is
--   withdrawn too (it is still the row the file made); its edits stay on the withdrawn row.
--   WHAT THAT MEANS: those copies open with the layout chooser again (the page seeds its own
--   "All records"), exactly as before the file. Re-applying the file gives each a fresh default view.

set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:datav2face2_a_copied_table_opens_as_the_sheet_it_was_down';

do $back$
declare
  v_withdrawn integer := 0;
begin
  with gone as (
    update platform.saved_view
       set deleted_at = now(),
           metadata = metadata || jsonb_build_object('withdrawn_by',
                        'datav2face2_a_copied_table_opens_as_the_sheet_it_was_down')
     where metadata ->> 'made_by' = 'datav2face2_a_copied_table_opens_as_the_sheet_it_was'
       and deleted_at is null
    returning 1
  )
  select count(*) into v_withdrawn from gone;
  raise notice 'DATA-V2-FACE-2 inverse: % default views withdrawn', v_withdrawn;
end
$back$;
