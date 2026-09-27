-- additive: yes
-- based-on: custom.tables_i_can_open() 80f8651353bfc678ea08dea2b5bc4a3f662ec85575a12e1d75514f53d2fa23c4
--
-- HANDOVER (2026-09-27) — "ALL MY ORGANIZATIONS" ANSWERS IN ONE QUERY.
--
-- Replaces ONE live body, `custom.tables_i_can_open()`, with the same signature, grants and door
-- row (CREATE OR REPLACE keeps both). Nothing is dropped, granted or revoked; no row is touched.
--
-- What a person met (admin@admin.com, the data home at /data-v2, 2026-09-27): "All my
-- organizations" read "Reading the tables in every organization you can open…" and the door
-- answered 500. The body looped over the person's organizations (46 for this seat) and ran one
-- RETURN QUERY per organization; measured on production as the person it took 11,787 ms, over the
-- 8 s a signed-in request may run. Profiled on the clone (2.9 s there): 2.6 s of it was ONE call,
-- `custom.query_visible_ids` for the one organization she is not a member of (Arman's Org, where a
-- single table is shared with her): the visibility door works out that whole organization to find
-- the one table. Now an organization she is not in lists the tables shared with her directly, which
-- is what that door answers there; a member's organization still asks the door. The portal question
-- is asked only when the organization's own door says no. One statement. Same rows, same columns.
-- Guard: matrx-frontend/scripts/campaign-tests/handover_all_my_organizations_answers_in_one_query.sql
-- Inverse: migrations/inverse/handover_all_my_organizations_answers_in_one_query_down.sql

CREATE OR REPLACE FUNCTION custom.tables_i_can_open()
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  if v_me is null then
    return;
  end if;

  -- ONE STATEMENT (lane HANDOVER): a RETURN QUERY per organization took 11.8 s for a person in 46
  -- organizations; the same question asked once takes under half a second.
  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      -- THE WALL, as custom.assert_client_may_reach admits a signed-in person; and A STORE THAT IS
      -- OFF HAS NOTHING TO OPEN. The portal question is asked only when the organization's own door
      -- said no: written as `a or b` it was asked of every organization (a CASE fixes the order),
      -- and at ~55 ms a call it was 2.5 of the 2.9 s measured on the clone.
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
    ),
    visible as materialized (
      -- A MEMBER'S organization: the store's own visibility door.
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      -- AN ORGANIZATION SHE IS NOT IN, listed only because a table there was shared with her: the
      -- tables shared with her, which is what the visibility door answers there too. Asked through
      -- that door, one table shared from Arman's Org cost 2.6 s on the clone (10 s on production
      -- under load): the door works out the whole organization's visibility to find the one row.
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
     where not coalesce((t.data ->> 'kept_by_the_app')::boolean, false);
end;
$function$;
