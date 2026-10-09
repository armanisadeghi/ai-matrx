-- SHEET-LEFTOVERS item 2: the deleted store views that still say layout "sheet" (8 when counted).
-- Live ones were rewritten by sheetleft_b; a deleted one would come back as "sheet" if restored.
-- They stay deleted; only the layout word becomes "grid", the old word kept in metadata.layout_before
-- exactly as for the live ones. Re-running is safe.
-- Inverse: migrations/inverse/sheetleft_e_the_deleted_views_do_not_say_sheet_either_down.sql
-- lock: platform
-- lane: SHEET-LEFTOVERS
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_e_the_deleted_views_do_not_say_sheet_either';

do $rewrite$
declare
  v_before integer;
  v_done   integer;
begin
  select count(*) into v_before from platform.saved_view where definition ->> 'layout' = 'sheet';
  with up as (
    update platform.saved_view
       set definition = jsonb_set(definition, '{layout}', '"grid"'::jsonb),
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('layout_before', jsonb_build_object(
                           'layout', 'sheet', 'by', 'SHEET-LEFTOVERS', 'at', now()))
     where deleted_at is not null and definition ->> 'layout' = 'sheet'
    returning 1
  )
  select count(*) into v_done from up;
  raise notice 'SHEET-LEFTOVERS E: % view(s) said layout "sheet" before (deleted ones: all of them); % rewritten to "grid"; % still say sheet now',
    v_before, v_done, (select count(*) from platform.saved_view where definition ->> 'layout' = 'sheet');
end
$rewrite$;
