-- chair-step: it DROPS and recreates `custom.views(uuid, uuid)` — a drop, because the change
--   is to the function's OUT columns and `create or replace` cannot move those — and re-grants
--   its client EXECUTE. THE DROP IS SAFE AND HERE IS THE EVIDENCE: that door landed earlier
--   today ("a saved view finally has a door"), and a grep of every consuming surface —
--   matrx-frontend `lib/` and `app/`, `@ai-matrx/records`, `@ai-matrx/records-ui` and
--   `matrx-records` — finds not one caller of `custom.views` or `custom.view_declare`
--   (measured 2026-09-20 20:0xZ; the single hit is a demo route id, not a call). No app code
--   loses anything. The door row it already carries is left in place, so the re-grant sticks.
--   The inverse is `migrations/inverse/pipelines_a_saved_view_answers_what_it_stores_down.sql`.
-- guard: custom/system_enabled
--
-- PIPELINES — A SAVED VIEW HAS TO ANSWER WHAT IT STORES.
--
-- `custom.view_declare` accepts a whole `definition` — SCR-6's four layouts, the Field a
-- kanban makes its columns from, the Field a calendar reads, the sorts — and `custom.views`
-- hands back `(view_id, name, table_id, filters, created_at)`. The layout is not in there.
-- The group field is not in there. So a person who saves "Deals by stage" as a board grouped
-- by Stage, closes the tab, and comes back is given a name and a filter, and the screen has
-- to guess what kind of view it was.
--
-- That is the whole of PRODUCTS row 7's last clause — "a saved Kanban view grouped by it, and
-- the link" — and it could not be met by a door that forgets the layout on the way out.
--
-- `definition` is the stored document itself, unchanged and unsummarised, because the screen
-- that drew it is the one thing that knows which keys it needs, and a door that picks out
-- three of them has to be edited again for the fourth.

drop function if exists custom.views(uuid, uuid);

create or replace function custom.views(p_organization_id uuid, p_table_id uuid default null)
  returns table (view_id uuid, name text, table_id uuid, filters jsonb,
                 definition jsonb, created_at timestamp with time zone)
  language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb),
           -- THE WHOLE DOCUMENT. The layout, the Field the board groups by, the Field the
           -- calendar reads, the sorts and the look all live in here, and the screen that
           -- drew it is the one thing that knows which of them it needs.
           coalesce(sv.definition, '{}'::jsonb),
           sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: narrowed in SQL, as
       -- the definer, to Tables this caller can already open — so the list of views
       -- can never reveal a Table.
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$fn$;

grant execute on function custom.views(uuid, uuid) to authenticated;
