-- chair-step: the inverse of viewkeyssheet_a_copied_tables_default_view_names_the_sheet.sql. It takes
--   `layout` back off exactly the rows that file named (its mark in `metadata.layout_named_by`, and
--   only while the layout is still "sheet" — a layout a person chose since is theirs) and removes the
--   mark. Nothing is inserted or deleted.
-- lock: platform
-- lane: VIEW-KEYS-SHEET

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:viewkeyssheet_a_copied_tables_default_view_names_the_sheet_down';

do $back$
declare
  v_n integer := 0;
begin
  with b as (
    update platform.saved_view v
       set definition = v.definition - 'layout'::text,
           metadata   = v.metadata - 'layout_named_by'::text,
           updated_at = now()
     where v.surface_key = 'custom/records'
       and v.metadata ->> 'layout_named_by' = 'viewkeyssheet_a_copied_tables_default_view_names_the_sheet'
       and v.definition ->> 'layout' = 'sheet'
    returning 1
  )
  select count(*) into v_n from b;
  raise notice 'VIEW-KEYS-SHEET inverse: % view(s) say the Sheet by the mover''s mark again', v_n;
end
$back$;
