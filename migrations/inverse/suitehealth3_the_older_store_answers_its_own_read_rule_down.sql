-- inverse of migrations/campaign/suitehealth3_the_older_store_answers_its_own_read_rule.sql — restores custom.where_tables_live as applied by
-- suitehealth3_where_a_table_lives_is_told_only_to_who_may_open_it.sql, then drops the helper nothing else calls.

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.where_tables_live(p_table_ids uuid[])
 RETURNS TABLE(table_id uuid, lives_in text, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_me     uuid  := auth.uid();
begin
  if v_me is null and v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
    raise exception 'Sign in to ask where a table lives.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_table_ids), 0) > 1000 then
    raise exception 'Ask about at most 1000 tables at once (% were asked).', cardinality(p_table_ids) using errcode = '22023';
  end if;
  return query
    select i.id,
           h.lives_in,
           case h.lives_in
             when 'older' then 'It is an older table, and the older table is the one in use: its copy in the new system (if it has one) is read-only until an owner switches Data tables on the organization''s settings page.'
             else 'It lives in the new system (the record store); the store''s own doors decide whether you may open it.'
           end
      from (select distinct u.id from unnest(coalesce(p_table_ids, '{}'::uuid[])) as u(id) where u.id is not null) i
      cross join lateral (select platform.table_lives_in(i.id) as lives_in) l
      -- WHO MAY BE TOLD `older` (SUITE-HEALTH-3). A person is told an older table's home only
      -- when she may open it: the older store's own read rule for her, or the one ladder on its
      -- record-store copy. Anyone else hears `record` — the word an id nobody minted answers —
      -- and the store's doors then say "not found" for it exactly as for that id. No person
      -- (the service lane, the store owner) is answered as before.
      cross join lateral (
        select case
                 when l.lives_in is distinct from 'older' or v_me is null then l.lives_in
                 when exists (select 1 from workbench.udt_datasets d
                               where d.id = i.id
                                 and (d.created_by = v_me
                                      or d.visibility = 'public'::platform.visibility
                                      or iam.has_access_for(v_me, 'dataset', d.id, 'viewer'::public.permission_level)
                                      or public.is_platform_admin()))
                   then l.lives_in
                 when custom.has_visibility(v_me, 'record', i.id, 'viewer'::public.permission_level) then l.lives_in
                 else 'record'
               end as lives_in) h;
end;
$function$;


drop function workbench.dataset_readable_by(uuid, uuid);
