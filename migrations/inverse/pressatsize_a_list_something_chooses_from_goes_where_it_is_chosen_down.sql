-- inverse of migrations/campaign/pressatsize_a_list_something_chooses_from_goes_where_it_is_chosen.sql (lane PRESS-AT-SIZE): the body as it was (acc2e6aa…).
-- lane: PRESS-AT-SIZE
-- based-on: platform._final_switch_orphan_lists() b6057a3928a6dfc7da7b7d837c253b8173828895408e02d9d16e99804ccae14b

CREATE OR REPLACE FUNCTION platform._final_switch_orphan_lists()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'name', coalesce(nullif(btrim(l.list_name), ''), 'Untitled list'),
           'maker', coalesce((select u.email::text from auth.users u where u.id = l.user_id), 'nobody'),
           'resolution', case when m.n = 1 then 'organization' else 'no_owner' end,
           'organization_id', case when m.n = 1 then m.org end,
           'organization_name', case when m.n = 1 then (select o.name::text from iam.organizations o where o.id = m.org) end,
           'why', case when l.user_id is null then 'it has no maker'
                       when m.n = 0 then 'its maker belongs to no organization'
                       when m.n = 1 then 'its maker belongs to one organization'
                       else format('its maker belongs to %s organizations', m.n) end)
         order by l.list_name, l.id), '[]'::jsonb)
    from workbench.udt_structured_lists l
    cross join lateral (
      select count(*)::int as n, (array_agg(x.organization_id))[1] as org
        from iam.organization_member x
        join iam.organizations o on o.id = x.organization_id and o.archived_at is null
       where x.user_id = l.user_id) m
   where l.organization_id is null and l.deleted_at is null;
$function$

;
