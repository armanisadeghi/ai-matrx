-- chair-step: restores public.search_files to its pre-PAGE-SPEED-3 body (search_files asks files.is_listable_for per matching file again). No data touched.
-- inverse of campaign/pagespeed3_c_search_files_reads_the_shared_set_once.sql

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.search_files(p_user_id uuid, p_query text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_mime_prefix text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
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
