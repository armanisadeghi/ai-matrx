-- lane: PERF-REVIEW-FIX
-- based-on: custom.views(uuid, uuid) 0580dc54418abb38878d4fdb9d2f7d8c66eb79ee0d6113b2230a0c25f157c7c1
--
-- PERF-REVIEW-FIX (2026-10-08). custom.views ordered only by name: two views with one name (table af3bfff6, "Jobs",
-- two views called "All records") came back in plan order, so the bundle's seeded first paint and a later door read
-- could disagree. Now name, then the default view (definition.is_default) first, then id. Same rows. Any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.views(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(view_id uuid, name text, table_id uuid, filters jsonb, definition jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  -- CHAIR-WORLD-LANE: a person admitted only through the world lane lists the views of one Public Table.
  perform custom.assert_public_reader_names_a_public_table(p_organization_id, p_table_id, 'custom.views');
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
             (select v from (
                -- PERF-FIX-5: one Table named = asked among that Table (custom.tables_listed_among: the list's own
                -- answer restricted to it, without walking every Table of the organization); none named = the list, as before.
                select t from custom.tables_listed_among(p_organization_id, array[p_table_id]) t
                 where p_table_id is not null and coalesce(current_setting('mx.read_by_ids_set', true), '') <> 'off'
                union all
                select q from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) q
                 where p_table_id is null or coalesce(current_setting('mx.read_by_ids_set', true), '') = 'off'
              ) v(v))
     -- PERF-REVIEW-FIX 2: a total order. Two views named alike (Jobs: two "All records") came back in plan order, so the
     -- seeded first paint and a later read could disagree about which is first. Name, the default view first, then id.
     order by sv.name, coalesce((sv.definition ->> 'is_default')::boolean, false) desc, sv.id;
end;
$function$;
