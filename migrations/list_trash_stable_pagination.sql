-- list_trash: stable, total-order pagination.
--
-- DEFECT CLASS (found 2026-07-22, first confirmed on public.agx_get_list): a
-- paginated SECURITY DEFINER RPC whose ORDER BY is not a TOTAL order. Each
-- LIMIT/OFFSET page is a separate query execution and Postgres uses a bounded
-- top-N sort, so tied rows are ordered arbitrarily and differently on each page
-- — rows get duplicated onto one page and silently skipped from another. On
-- agx_get_list, paging a 365-row result 100 at a time returned only 306
-- DISTINCT ids.
--
-- Trash is the worst case for ties: deleting a folder stamps an identical
-- `deleted_at` on every row in it, so a whole batch shares one sort key. Rows
-- dropped from the paged result are files the user cannot see or restore.
--
-- FIX: append `id` as a final tiebreaker. This function paginates TWICE — the
-- files subquery and the folders subquery are independently LIMIT/OFFSET'd —
-- so BOTH ORDER BYs carry the tiebreaker.
-- The tiebreakers are load-bearing. Do not remove either one.

CREATE OR REPLACE FUNCTION public.list_trash(p_user_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    p_limit := LEAST(GREATEST(p_limit, 1), 1000);
    RETURN COALESCE((
        SELECT jsonb_build_object(
            'files', COALESCE((
                SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.deleted_at DESC)
                  FROM (
                    SELECT id, file_path, file_name, size_bytes, deleted_at
                      FROM files.files
                     WHERE created_by = p_user_id AND deleted_at IS NOT NULL
                       AND parent_file_id IS NULL
                       AND file_path NOT LIKE 'system-files/%'
                     -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
                     ORDER BY deleted_at DESC, id DESC LIMIT p_limit OFFSET p_offset
                  ) f
            ), '[]'::jsonb),
            'folders', COALESCE((
                SELECT jsonb_agg(row_to_json(d)::jsonb ORDER BY d.deleted_at DESC)
                  FROM (
                    SELECT id, folder_path, folder_name, deleted_at
                      FROM files.folders
                     WHERE created_by = p_user_id AND deleted_at IS NOT NULL AND NOT is_system
                     -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
                     ORDER BY deleted_at DESC, id DESC LIMIT p_limit OFFSET p_offset
                  ) d
            ), '[]'::jsonb)
        )
    ), jsonb_build_object('files', '[]'::jsonb, 'folders', '[]'::jsonb));
END;
$function$;
