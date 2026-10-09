-- chair-step: undo perfreview_a_views_come_back_in_a_total_order.sql - restores custom.views as perffix5_a left it
-- lane: PERF-REVIEW-FIX
-- based-on: custom.views(uuid, uuid) cda7378b569c70eda1639392247ebf3cc409909ef9dc7910068c320bcf90190b

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
     order by sv.name;
end;
$function$;
