-- files_storage_uri_rpc_isolation.sql (2026-07-06)
--
-- storage_uri (the native S3 location) is SERVER-ONLY. The FE eradication
-- (see features/files/FEATURE.md) plus the backend column-grant REVOKE close
-- the direct-read path, but two SECURITY DEFINER RPCs still RETURNED raw
-- s3:// locations to any authorized authenticated/anon caller:
--
--   * public.hard_delete_file(p_file_id)      -> {main, versions[]}
--   * public.prune_old_versions(p_file_id, n) -> {pruned, storage_uris[]}
--
-- Those payloads exist so the SERVICE-ROLE backend can purge the S3 objects
-- after the row delete. Keep that flow (auth.uid() IS NULL = service role /
-- python backend) and strip the locations for any end-user JWT caller, who
-- can do nothing with them (info disclosure only).
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.hard_delete_file(p_file_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_main_uri TEXT; v_version_uris TEXT[];
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'admin') THEN
        RAISE EXCEPTION 'forbidden: not authorized to permanently delete file %', p_file_id USING ERRCODE = '42501';
    END IF;
    SELECT storage_uri INTO v_main_uri FROM files.files WHERE id = p_file_id;
    IF v_main_uri IS NULL THEN
        RETURN jsonb_build_object('main', NULL, 'versions', '[]'::jsonb);
    END IF;
    SELECT array_agg(storage_uri) INTO v_version_uris FROM files.file_versions WHERE file_id = p_file_id;
    DELETE FROM files.share_links  WHERE resource_type = 'file' AND resource_id = p_file_id;
    DELETE FROM iam.permissions WHERE resource_type = 'file' AND resource_id = p_file_id;
    DELETE FROM files.file_versions WHERE file_id = p_file_id;
    DELETE FROM files.files         WHERE id = p_file_id;
    -- Storage locations are SERVER-ONLY: only the service-role caller (the
    -- Python backend, auth.uid() IS NULL) gets them, for the S3 purge. An
    -- end-user JWT caller gets the deletion result without the locations.
    IF auth.uid() IS NOT NULL THEN
        RETURN jsonb_build_object(
            'deleted', TRUE,
            'versions_deleted', COALESCE(array_length(v_version_uris, 1), 0)
        );
    END IF;
    RETURN jsonb_build_object('main', v_main_uri, 'versions', COALESCE(to_jsonb(v_version_uris), '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.prune_old_versions(p_file_id uuid, p_keep integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_pruned_uris TEXT[];
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to prune file %', p_file_id USING ERRCODE = '42501';
    END IF;
    IF p_keep IS NULL OR p_keep <= 0 THEN
        RETURN jsonb_build_object('pruned', 0, 'storage_uris', '[]'::jsonb);
    END IF;
    WITH ranked AS (
        SELECT id, storage_uri,
               row_number() OVER (PARTITION BY file_id ORDER BY version_number DESC) AS rn
          FROM files.file_versions WHERE file_id = p_file_id
    ),
    deleted AS (
        DELETE FROM files.file_versions
         WHERE id IN (SELECT id FROM ranked WHERE rn > p_keep)
        RETURNING storage_uri
    )
    SELECT array_agg(storage_uri) INTO v_pruned_uris FROM deleted;
    -- Storage locations are SERVER-ONLY (see hard_delete_file above).
    IF auth.uid() IS NOT NULL THEN
        RETURN jsonb_build_object(
            'pruned', COALESCE(array_length(v_pruned_uris, 1), 0)
        );
    END IF;
    RETURN jsonb_build_object(
        'pruned', COALESCE(array_length(v_pruned_uris, 1), 0),
        'storage_uris', COALESCE(to_jsonb(v_pruned_uris), '[]'::jsonb)
    );
END;
$function$;
