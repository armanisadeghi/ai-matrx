-- Cloud Files — search: include shared-with-me + trigram index (P1-9)
--
-- WHY (two problems, one migration):
-- 1. cld_search_files filtered `owner_id = p_user_id`, so files SHARED with
--    the user were unsearchable (the workspace tree shows them, but search
--    silently omitted them). Now it also returns files the user has an
--    effective read permission on (public / explicit grant), still excluding
--    system paths and derivative rows.
-- 2. The ILIKE '%q%' substring match could not use a btree index → full scan
--    per search at scale. Add a pg_trgm GIN index on lower(file_name) so the
--    substring search is index-backed.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-10.

CREATE INDEX IF NOT EXISTS idx_cld_files_name_trgm
  ON public.cld_files USING gin (lower(file_name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.cld_search_files(
    p_user_id uuid,
    p_query text,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_mime_prefix text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    p_limit := LEAST(GREATEST(p_limit, 1), 200);
    RETURN COALESCE((
        SELECT jsonb_agg(row_to_json(t)::jsonb)
        FROM (
            SELECT id, file_path, file_name, mime_type, size_bytes, visibility,
                   current_version, parent_folder_id, owner_id, created_at, updated_at
              FROM cld_files
             WHERE deleted_at IS NULL
               AND parent_file_id IS NULL
               AND file_path NOT LIKE 'system-files/%'
               AND file_path NOT LIKE 'generations/%'
               AND (p_mime_prefix IS NULL OR mime_type LIKE p_mime_prefix || '%')
               AND (
                     lower(file_name) LIKE '%' || lower(p_query) || '%'
                  OR lower(file_path) LIKE '%' || lower(p_query) || '%'
               )
               -- owner OR an effective read permission (public / shared grant)
               AND (
                     owner_id = p_user_id
                  OR cld_get_effective_permission(id, p_user_id) IS NOT NULL
               )
             ORDER BY updated_at DESC
             LIMIT p_limit OFFSET p_offset
        ) t
    ), '[]'::jsonb);
END;
$function$;
