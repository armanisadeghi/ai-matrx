-- INVERSE of migrations/campaign/pipelines_a_saved_view_answers_what_it_stores.sql
-- (lane PIPELINES). Puts back the door that forgets a saved view's layout on the way out.
drop function if exists custom.views(uuid, uuid);

create function custom.views(p_organization_id uuid, p_table_id uuid default null)
  returns table (view_id uuid, name text, table_id uuid, filters jsonb,
                 created_at timestamp with time zone)
  language plpgsql stable security definer set search_path = pg_catalog as $fn$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb), sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$fn$;

grant execute on function custom.views(uuid, uuid) to authenticated;
