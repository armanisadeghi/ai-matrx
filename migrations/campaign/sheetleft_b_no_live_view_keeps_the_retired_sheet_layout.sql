-- The old Sheet is gone (1c4e8b0d0d); its layout word "sheet" is not drawn by anything. Every LIVE
-- store view that still says `definition.layout = "sheet"` becomes a grid view — everything else in
-- its definition stays exactly as it is — and the word it had is kept in `metadata.layout_before`
-- with who changed it and when. Views their owners already deleted are left as the tombstones
-- they are. Aidream's Table API stops writing "sheet" in the same lane (an old client sending it
-- gets a grid). Re-running is safe: a view with no "sheet" is not touched.
-- Inverse: migrations/inverse/sheetleft_b_no_live_view_keeps_the_retired_sheet_layout_down.sql
-- lock: platform
-- lane: SHEET-LEFTOVERS
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_b_no_live_view_keeps_the_retired_sheet_layout';

do $rewrite$
declare
  v_before integer;
  v_done   integer;
begin
  select count(*) into v_before
    from platform.saved_view
   where deleted_at is null and definition ->> 'layout' = 'sheet';

  with up as (
    update platform.saved_view
       set definition = jsonb_set(definition, '{layout}', '"grid"'::jsonb),
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('layout_before', jsonb_build_object(
                           'layout', 'sheet', 'by', 'SHEET-LEFTOVERS', 'at', now()))
     where deleted_at is null and definition ->> 'layout' = 'sheet'
    returning 1
  )
  select count(*) into v_done from up;

  raise notice 'SHEET-LEFTOVERS B: % live view(s) said layout "sheet" before; % rewritten to "grid"; % still say sheet now',
    v_before, v_done,
    (select count(*) from platform.saved_view where deleted_at is null and definition ->> 'layout' = 'sheet');
end
$rewrite$;
