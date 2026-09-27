-- Inverse of handover_all_my_organizations_answers_in_one_query.sql: the body it replaced, byte for byte.
-- based-on: custom.tables_i_can_open() 58d85d5b3c988410ed375b86edb92527d5a703e5b61f0dc72c1b086fb17dbe80
-- chair-step: restores the per-organization loop body of custom.tables_i_can_open() that handover_all_my_organizations_answers_in_one_query.sql replaced

CREATE OR REPLACE FUNCTION custom.tables_i_can_open()
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_org    record;
begin
  if v_me is null then
    return;
  end if;

  for v_org in
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
  loop
    -- THE WALL, as custom.assert_client_may_reach admits a signed-in person.
    if not (iam.has_org_access(v_org.id) or custom.portal_admits(v_org.id)) then
      continue;
    end if;
    -- A STORE THAT IS OFF HAS NOTHING TO OPEN.
    if not custom.store_is_open(v_org.id) then
      continue;
    end if;
    return query
      select t.id,
             coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
             v_org.id,
             v_org.name,
             v_org.member,
             t.visibility::text,
             t.updated_at
        from custom.record t
       where t.organization_id = v_org.id
         and t.table_id = v_kernel
         and t.deleted_at is null
         and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
         and t.id in (select v from custom.query_visible_ids(v_org.id, v_kernel) v);
  end loop;
end;
$function$;
