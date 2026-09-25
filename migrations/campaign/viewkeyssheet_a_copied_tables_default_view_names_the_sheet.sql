-- chair-step: a DATA REPAIR. It only UPDATES rows of platform.saved_view — the default view of each
--   copy of an older table that says "Sheet" only by the mover's mark (`moved_from.kind =
--   "default_view"`) and carries no `layout` gets `layout: "sheet"`, the registry's word. No row is
--   inserted or deleted, no other key is touched, no function, table, trigger, policy or grant is
--   touched. The inverse is
--   `migrations/inverse/viewkeyssheet_a_copied_tables_default_view_names_the_sheet_down.sql` (it
--   takes `layout` back off exactly the rows this file named, found by the mark it leaves in
--   `metadata`). Re-running is safe: a view that already has a `layout` is never touched.
--   Applies before or after viewkeyssheet_the_sheet_is_a_layout_a_view_may_name.sql (it writes the
--   rows directly, not through custom.view_declare); installed records-ui (0.85.4 and later) reads
--   `layout: "sheet"` as the Sheet today, so no screen changes.
-- lock: platform
-- lane: VIEW-KEYS-SHEET
--
-- LANE VIEW-KEYS-SHEET — ONE WAY TO SAY "THIS TABLE OPENS AS THE SHEET": `layout: "sheet"`.
--
-- THE USE CASE. Rincon Plumbing Co's "Service Calls" and every other copy of an older data table
-- (where every table simply WAS a sheet) must open on /data-v2 as the Sheet. DATA-V2-FACE-2's repair
-- (datav2face2_a_copied_table_opens_as_the_sheet_it_was.sql, on production since 2026-09-25
-- 00:24:47Z) gave 11 copies their default view marked only by where it came from, because S1-PRIME's
-- view-key guard then refused "sheet" as a layout. The registry now declares it
-- (viewkeyssheet_the_sheet_is_a_layout_a_view_may_name.sql); this file writes the registry's form
-- on those rows, so the Sheet is said one way on every table. `moved_from` stays, as provenance.
--
-- LOCKS. update of platform.saved_view rows only (ROW EXCLUSIVE). No DDL. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:viewkeyssheet_a_copied_tables_default_view_names_the_sheet';

do $sheet$
declare
  v_named integer := 0;
  v_left  integer := 0;
begin
  with named as (
    update platform.saved_view v
       set definition = v.definition || jsonb_build_object('layout', 'sheet'),
           metadata   = coalesce(v.metadata, '{}'::jsonb)
                        || jsonb_build_object('layout_named_by', 'viewkeyssheet_a_copied_tables_default_view_names_the_sheet'),
           updated_at = now()
     where v.surface_key = 'custom/records'
       and v.deleted_at is null
       and v.definition -> 'moved_from' ->> 'kind' = 'default_view'
       and not (v.definition ? 'layout')
    returning 1
  )
  select count(*) into v_named from named;

  select count(*) into v_left
    from platform.saved_view v
   where v.surface_key = 'custom/records' and v.deleted_at is null
     and v.definition -> 'moved_from' ->> 'kind' = 'default_view'
     and not (v.definition ? 'layout');
  if v_left > 0 then
    raise exception 'VIEW-KEYS-SHEET: % default view(s) of copies still say the Sheet only by the mover''s mark', v_left;
  end if;

  raise notice 'VIEW-KEYS-SHEET: % copied table default view(s) now name layout "sheet"', v_named;
end
$sheet$;
