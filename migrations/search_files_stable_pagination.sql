-- search_files: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- Bulk uploads share an `updated_at`, so paging search results dropped files
-- the user could never find by search even though they exist.
--
-- FIX: append `id` as a final tiebreaker so the sort key is unique per row.
-- The tiebreaker is load-bearing. Do not remove it.

CREATE OR REPLACE FUNCTION public.search_files(p_user_id uuid, p_query text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_mime_prefix text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_limit := least(greatest(p_limit, 1), 200);
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select id, file_path, file_name, mime_type, size_bytes, visibility,
             current_version, parent_folder_id, created_by, created_at, updated_at
      from files.files
      where deleted_at is null
        and parent_file_id is null
        and file_path not like 'system-files/%'
        and file_path not like 'generations/%'
        and (p_mime_prefix is null or mime_type like p_mime_prefix || '%')
        and (lower(file_name) like '%' || lower(p_query) || '%'
             or lower(file_path) like '%' || lower(p_query) || '%')
        and files.is_listable_for(p_user_id, id)
      -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
      order by updated_at desc, id
      limit p_limit offset p_offset
    ) t
  ), '[]'::jsonb);
end;
$function$;
