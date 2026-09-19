-- chair-step: the inverse. Restores public.entity_access_summary's old org_readable, which tells a person that everyone in their organization can read a record when the organization has turned membership off as a way in. Rule 27 only.
--
CREATE OR REPLACE FUNCTION public.entity_access_summary(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_schema text;
  v_table text;
  v_vis platform.visibility;
  v_owner uuid;
  v_org uuid;
  v_found boolean;
  v_can_manage boolean;
  v_grant_count int := 0;
  v_grants jsonb := '[]'::jsonb;
  v_containers jsonb := '[]'::jsonb;
  v_member_count int := 0;
begin
  if v_uid is null then
    raise exception 'entity_access_summary: not authenticated';
  end if;
  if not iam.has_access(p_type, p_id, 'viewer') then
    raise exception 'entity_access_summary: no access to % %', p_type, p_id;
  end if;

  select schema_name, table_name into v_schema, v_table
  from platform.entity_types
  where token = p_type;

  if v_schema is null then
    raise exception 'entity_access_summary: unknown entity type %', p_type;
  end if;

  select * into v_vis, v_owner, v_org, v_found
  from platform.entity_row_access_attrs(v_schema, v_table, p_id);

  if not coalesce(v_found, false) then
    raise exception 'entity_access_summary: % % not found', p_type, p_id;
  end if;

  v_can_manage := iam.has_access(p_type, p_id, 'admin');

  select count(*)::int into v_grant_count
  from iam.permissions pm
  where pm.resource_type = p_type
    and pm.resource_id = p_id
    and pm.status = 'active'
    and coalesce(pm.is_public, false) = false
    and (pm.expires_at is null or pm.expires_at > now());

  if v_can_manage then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grantee_type', case when pm.granted_to_organization_id is not null
                               then 'organization' else 'user' end,
          'grantee_id', coalesce(pm.granted_to_organization_id, pm.granted_to_user_id),
          'grantee_label', case when pm.granted_to_organization_id is not null
                                then platform.entity_title('organization', pm.granted_to_organization_id)
                                else null end,
          'level', pm.permission_level::text,
          'expires_at', pm.expires_at
        )
        order by pm.created_at
      ),
      '[]'::jsonb
    )
    into v_grants
    from iam.permissions pm
    where pm.resource_type = p_type
      and pm.resource_id = p_id
      and pm.status = 'active'
      and coalesce(pm.is_public, false) = false
      and (pm.expires_at is null or pm.expires_at > now());
  end if;

  select coalesce(
    jsonb_agg(c.entry order by c.depth, c.container_type),
    '[]'::jsonb
  )
  into v_containers
  from (
    select
      r.depth,
      r.container_type,
      jsonb_build_object(
        'container_type', r.container_type,
        'container_id', r.container_id,
        'container_type_label', et.label,
        'label', platform.entity_title(r.container_type, r.container_id),
        'level', r.max_level::text,
        'depth', r.depth,
        'visibility', ca.o_vis::text,
        'organization_id', ca.o_org,
        'organization_name', platform.entity_title('organization', ca.o_org),
        'org_readable', (ca.o_vis >= 'internal'::platform.visibility and ca.o_org is not null),
        'member_count', (
          select count(distinct m.user_id)::int
          from iam.memberships m
          where m.container_type = r.container_type
            and m.container_id = r.container_id
            and m.deleted_at is null
        )
      ) as entry
    from platform.reachability r
    join platform.entity_types et on et.token = r.container_type
    cross join lateral platform.entity_row_access_attrs(et.schema_name, et.table_name, r.container_id) ca
    where r.item_type = p_type
      and r.item_id = p_id
      and ca.o_found
      and iam.has_access(r.container_type, r.container_id, 'viewer')
  ) c;

  select count(distinct m.user_id)::int into v_member_count
  from iam.memberships m
  where m.container_type = p_type
    and m.container_id = p_id
    and m.deleted_at is null;

  return jsonb_build_object(
    'entity_type', p_type,
    'entity_id', p_id,
    'visibility', v_vis::text,
    'owner_id', v_owner,
    'viewer_is_owner', (v_owner = v_uid),
    'organization_id', v_org,
    'organization_name', platform.entity_title('organization', v_org),
    'can_manage', v_can_manage,
    'is_public', (v_vis = 'public'::platform.visibility),
    'org_readable', (v_vis >= 'internal'::platform.visibility and v_org is not null),
    'direct_grant_count', v_grant_count,
    'direct_grants', v_grants,
    'member_count', v_member_count,
    'containers', v_containers,
    'container_count', jsonb_array_length(v_containers)
  );
end;
$function$

;
