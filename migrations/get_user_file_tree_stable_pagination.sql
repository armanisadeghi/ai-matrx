-- get_user_file_tree: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- Here the sort is dynamic: `v_order` picks one of three sort keys, and NONE of
-- them is unique — duplicate file names are legal in different folders, and a
-- bulk upload stamps one created_at/updated_at across the whole batch. On top
-- of that the sorted set is a UNION ALL of files + folders, which makes the
-- top-N sort order especially unstable between executions.
--
-- FIX: append output-column ordinal `2` (the `id` column) as a final
-- tiebreaker to ALL THREE v_order branches, so every sort key is unique per row.
-- The tiebreakers are load-bearing. Do not remove any of them.

CREATE OR REPLACE FUNCTION public.get_user_file_tree(p_user_id uuid, p_limit integer DEFAULT 5000, p_offset integer DEFAULT 0, p_include_folders boolean DEFAULT true, p_include_deleted boolean DEFAULT false, p_order_by text DEFAULT 'name'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_result jsonb; v_order text;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden: p_user_id does not match auth.uid()' using errcode = '42501';
  end if;
  p_limit := least(greatest(p_limit, 1), 5000);
  -- ordinal 2 is `id` in the select list below — the unique tiebreaker that
  -- makes each of these a TOTAL order. Do not remove it from any branch.
  v_order := case lower(coalesce(p_order_by, 'name'))
    when 'updated_at_desc' then '13 DESC NULLS LAST, 2'
    when 'created_at_desc' then '12 DESC NULLS LAST, 2'
    when 'name' then '5, 2' else '5, 2' end;
  execute format($q$
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    from (
      select 'file'::text as kind, f.id, f.created_by,
        f.file_path as path, f.file_name as name, f.parent_folder_id as parent_id,
        f.mime_type, f.size_bytes, f.visibility, f.current_version,
        f.metadata, f.created_at, f.updated_at, f.deleted_at,
        case when files.has_access_for(%L, f.id, 'admin') then 'admin'
             when files.has_access_for(%L, f.id, 'editor') then 'editor'
             when files.has_access_for(%L, f.id, 'viewer') then 'viewer'
             else null end as effective_permission
      from files.files f
      where (%L or f.deleted_at is null)
        and f.parent_file_id is null
        and not is_system_path(f.file_path)
        and files.is_listable_for(%L, f.id)
      union all
      select 'folder'::text as kind, d.id, d.created_by,
        d.folder_path as path, d.folder_name as name, d.parent_id,
        null::text as mime_type, null::bigint as size_bytes,
        d.visibility, null::int as current_version,
        d.metadata, d.created_at, d.updated_at, d.deleted_at,
        case when d.created_by = %L then 'admin' else null end as effective_permission
      from files.folders d
      where %L and (%L or d.deleted_at is null) and d.created_by = %L
        and not is_system_path(d.folder_path)
      order by %s limit %s offset %s
    ) t
  $q$,
    p_user_id, p_user_id, p_user_id,
    p_include_deleted, p_user_id,
    p_user_id, p_include_folders, p_include_deleted, p_user_id,
    v_order, p_limit, p_offset
  ) into v_result;
  return v_result;
end;
$function$;
