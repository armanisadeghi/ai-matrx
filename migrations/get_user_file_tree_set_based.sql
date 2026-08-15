-- Production-first record: applied and verified on txzxabzwovsujtloxrus
-- 2026-08-15. The tree used to scan every active file and invoke the
-- SECURITY DEFINER listing predicate once per row. The dominant account has
-- 37,576 files but only 349 user-visible roots, so that shape cost 400-500ms
-- even for an empty offset page.

create index concurrently if not exists idx_files_tree_owner_name
  on files.files (created_by, file_name, id)
  where deleted_at is null
    and parent_file_id is null
    and not public.is_system_path(file_path);

create or replace function public.get_user_file_tree(
  p_user_id uuid,
  p_limit integer default 5000,
  p_offset integer default 0,
  p_include_folders boolean default true,
  p_include_deleted boolean default false,
  p_order_by text default 'name'::text
)
returns jsonb
language plpgsql
stable
security definer
as $function$
declare
  v_result jsonb;
  v_order text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()'
      using errcode = '42501';
  end if;

  p_limit := least(greatest(p_limit, 1), 5000);
  -- Ordinal 2 is the unique id tiebreaker in every ordering branch.
  v_order := case lower(coalesce(p_order_by, 'name'))
    when 'updated_at_desc' then '13 DESC NULLS LAST, 2'
    when 'created_at_desc' then '12 DESC NULLS LAST, 2'
    when 'name' then '5, 2'
    else '5, 2'
  end;

  execute format($q$
    with shared_file_ids as materialized (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = 'file'
        and coalesce(p.status, 'active') <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.permission_level in ('viewer', 'editor', 'admin')
        and (
          p.granted_to_user_id = %L
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = %L
          )
        )
      union
      select m.container_id
      from iam.memberships m
      join iam.membership_grant g
        on g.member_role = m.role
       and g.container_type in ('file', '*')
      where m.container_type = 'file'
        and m.user_id = %L
        and m.deleted_at is null
        and g.confers >= 'viewer'::public.permission_level
    ), visible_files as (
      -- The overwhelmingly common owner path is index-backed and requires no
      -- per-row access function: ownership always confers admin.
      select f.*, 'admin'::text as effective_permission
      from files.files f
      where f.created_by = %L
        and (%L or f.deleted_at is null)
        and f.parent_file_id is null
        and not is_system_path(f.file_path)
        and not files.is_crawl_artifact(f.id)

      union all

      -- Resolve the small explicit-grant candidate set first, then run the
      -- richer access kernel only for those rows.
      select f.*,
        case when files.has_access_for(%L, f.id, 'editor') then 'editor'
             when files.has_access_for(%L, f.id, 'viewer') then 'viewer'
             else null end as effective_permission
      from shared_file_ids s
      join files.files f on f.id = s.id
      where f.created_by <> %L
        and (%L or f.deleted_at is null)
        and f.parent_file_id is null
        and not is_system_path(f.file_path)
        and not files.is_crawl_artifact(f.id)
    )
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    from (
      select 'file'::text as kind, f.id, f.created_by,
        f.file_path as path, f.file_name as name,
        f.parent_folder_id as parent_id, f.mime_type, f.size_bytes,
        f.visibility, f.current_version, f.metadata, f.created_at,
        f.updated_at, f.deleted_at, f.effective_permission
      from visible_files f

      union all

      select 'folder'::text as kind, d.id, d.created_by,
        d.folder_path as path, d.folder_name as name, d.parent_id,
        null::text as mime_type, null::bigint as size_bytes,
        d.visibility, null::int as current_version,
        d.metadata, d.created_at, d.updated_at, d.deleted_at,
        case when d.created_by = %L then 'admin' else null end
          as effective_permission
      from files.folders d
      where %L
        and (%L or d.deleted_at is null)
        and d.created_by = %L
        and not is_system_path(d.folder_path)

      order by %s limit %s offset %s
    ) t
  $q$,
    p_user_id, p_user_id, p_user_id,
    p_user_id, p_include_deleted,
    p_user_id, p_user_id, p_user_id, p_include_deleted,
    p_user_id, p_include_folders, p_include_deleted, p_user_id,
    v_order, p_limit, p_offset
  ) into v_result;

  return v_result;
end;
$function$;

