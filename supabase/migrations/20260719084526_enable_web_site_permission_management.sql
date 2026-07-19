-- A site is the sole access root for the web module. Register that root with
-- the canonical permission store and allow the existing file/folder permission
-- RPC surface to manage web_site grants as documented by the web contract.
insert into platform.shareable_resource_registry (
  resource_type,
  schema_name,
  table_name,
  id_column,
  owner_column,
  is_public_column,
  display_label,
  url_path_template,
  rls_uses_has_permission,
  is_active,
  notes,
  content_role,
  is_scopeable,
  public_columns,
  is_link_shareable
)
values (
  'web_site',
  'web',
  'site',
  'id',
  'created_by',
  null,
  'Site',
  '/marketing/sites/{id}',
  true,
  true,
  'Site is the sole access root for every web crawler component.',
  'container',
  true,
  null,
  false
)
on conflict (resource_type) do update set
  schema_name = excluded.schema_name,
  table_name = excluded.table_name,
  id_column = excluded.id_column,
  owner_column = excluded.owner_column,
  is_public_column = excluded.is_public_column,
  display_label = excluded.display_label,
  url_path_template = excluded.url_path_template,
  rls_uses_has_permission = excluded.rls_uses_has_permission,
  is_active = excluded.is_active,
  notes = excluded.notes,
  content_role = excluded.content_role,
  is_scopeable = excluded.is_scopeable,
  public_columns = excluded.public_columns,
  is_link_shareable = excluded.is_link_shareable,
  updated_at = now();

create or replace function iam.fn_grant_resource_permission(
  p_resource_type text,
  p_resource_id uuid,
  p_grantee_id uuid,
  p_grantee_type text default 'user',
  p_level text default 'read',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, iam
as $function$
declare
  v_canonical_level public.permission_level;
  v_row iam.permissions%rowtype;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if p_grantee_type not in ('user', 'organization') then
    raise exception 'unsupported grantee_type %; the user-group ACL path is removed', p_grantee_type;
  end if;
  if p_level not in ('read', 'write', 'viewer', 'editor', 'admin') then
    raise exception 'unsupported permission level %', p_level;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  v_canonical_level := case p_level
    when 'read' then 'viewer'::public.permission_level
    when 'viewer' then 'viewer'::public.permission_level
    when 'write' then 'editor'::public.permission_level
    when 'editor' then 'editor'::public.permission_level
    when 'admin' then 'admin'::public.permission_level
  end;

  if p_grantee_type = 'organization' then
    insert into iam.permissions (
      resource_type, resource_id, granted_to_organization_id,
      permission_level, created_by, status, expires_at
    )
    values (
      p_resource_type, p_resource_id, p_grantee_id,
      v_canonical_level, auth.uid(), 'active', p_expires_at
    )
    on conflict (resource_type, resource_id, granted_to_organization_id)
    do update set
      permission_level = excluded.permission_level,
      created_by = excluded.created_by,
      status = 'active',
      expires_at = excluded.expires_at
    returning * into v_row;
  else
    insert into iam.permissions (
      resource_type, resource_id, granted_to_user_id,
      permission_level, created_by, status, expires_at
    )
    values (
      p_resource_type, p_resource_id, p_grantee_id,
      v_canonical_level, auth.uid(), 'active', p_expires_at
    )
    on conflict (resource_type, resource_id, granted_to_user_id)
    do update set
      permission_level = excluded.permission_level,
      created_by = excluded.created_by,
      status = 'active',
      expires_at = excluded.expires_at
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'resource_id', v_row.resource_id,
    'resource_type', v_row.resource_type,
    'grantee_id', coalesce(v_row.granted_to_organization_id, v_row.granted_to_user_id),
    'grantee_type', p_grantee_type,
    'permission_level', v_row.permission_level::text,
    'granted_by', v_row.created_by,
    'expires_at', v_row.expires_at
  );
end;
$function$;

create or replace function iam.fn_list_resource_permissions(
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, iam
as $function$
declare
  v_result jsonb;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'resource_id', p.resource_id,
        'resource_type', p.resource_type,
        'grantee_id', coalesce(p.granted_to_organization_id, p.granted_to_user_id),
        'grantee_type', case
          when p.granted_to_organization_id is not null then 'organization'
          else 'user'
        end,
        'permission_level', case
          when p_resource_type = 'web_site' then p.permission_level::text
          when p.permission_level = 'viewer' then 'read'
          when p.permission_level = 'editor' then 'write'
          else 'admin'
        end,
        'granted_by', p.created_by,
        'expires_at', p.expires_at
      )
      order by p.created_at
    ),
    '[]'::jsonb
  )
  into v_result
  from iam.permissions p
  where p.resource_type = p_resource_type
    and p.resource_id = p_resource_id
    and p.status = 'active'
    and (p.expires_at is null or p.expires_at > now());

  return v_result;
end;
$function$;

create or replace function iam.fn_revoke_resource_permission(
  p_resource_type text,
  p_resource_id uuid,
  p_grantee_id uuid,
  p_grantee_type text default 'user'
)
returns boolean
language plpgsql
security definer
set search_path = public, iam
as $function$
declare
  v_deleted integer;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if p_grantee_type not in ('user', 'organization') then
    raise exception 'unsupported grantee_type %; the user-group ACL path is removed', p_grantee_type;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  if p_grantee_type = 'organization' then
    delete from iam.permissions
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and granted_to_organization_id = p_grantee_id;
  else
    delete from iam.permissions
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and granted_to_user_id = p_grantee_id;
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$function$;
