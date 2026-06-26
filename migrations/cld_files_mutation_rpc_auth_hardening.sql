-- cld_files_mutation_rpc_auth_hardening.sql
--
-- Phase C of the cloud-files canonical-direct-path work
-- (features/files/CLOUD_FILES_RPC_DISPOSITIONS.md).
--
-- PROBLEM: the cloud-files MUTATION RPCs are SECURITY DEFINER (bypass RLS) but
-- performed a bare `UPDATE ... WHERE id = p_id` with NO ownership check. Today
-- authorization lives only in the Python PermissionsManager that runs *before*
-- the RPC. The moment the browser calls these directly (the canonical path we
-- are moving to), any authenticated user could mutate ANY file/folder by UUID —
-- a severe IDOR hole.
--
-- FIX: add a JWT-scoped ownership guard, mirroring the read RPCs
-- (search_files / list_trash / ...): enforce `iam.has_access(...)` ONLY when
-- auth.uid() IS NOT NULL. The service-role backend has auth.uid() = NULL, so the
-- guard is skipped and its existing behavior + PermissionsManager authority are
-- 100% unchanged. iam.has_access() is the canonical access primitive; the owner
-- always passes, plus explicit editor/admin grants.
--
-- Idempotent: CREATE OR REPLACE only. Bodies are byte-for-byte the live
-- definitions with the guard prepended (and the stale 'cld_bump_version' error
-- label corrected). Levels: editor for modify/restore, admin for irreversible
-- hard delete.

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_version(p_file_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to modify file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files
       SET current_version = current_version + 1,
           updated_at = now()
     WHERE id = p_file_id
       AND deleted_at IS NULL
    RETURNING current_version INTO v_new;
    IF v_new IS NULL THEN
        RAISE EXCEPTION 'bump_version: file % not found or deleted', p_file_id
            USING ERRCODE = 'no_data_found';
    END IF;
    RETURN v_new;
END;
$function$;

-- ---------------------------------------------------------------------------
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
    DELETE FROM public.permissions WHERE resource_type = 'file' AND resource_id = p_file_id;
    DELETE FROM files.file_versions WHERE file_id = p_file_id;
    DELETE FROM files.files         WHERE id = p_file_id;
    RETURN jsonb_build_object('main', v_main_uri, 'versions', COALESCE(to_jsonb(v_version_uris), '[]'::jsonb));
END;
$function$;

-- ---------------------------------------------------------------------------
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
    RETURN jsonb_build_object(
        'pruned', COALESCE(array_length(v_pruned_uris, 1), 0),
        'storage_uris', COALESCE(to_jsonb(v_pruned_uris), '[]'::jsonb)
    );
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_folder(p_folder_id uuid, p_new_path text, p_new_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_owner UUID;
    v_old_path TEXT;
    v_new_name TEXT;
    v_descendants_files INT;
    v_descendants_folders INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to rename folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    SELECT created_by, folder_path INTO v_owner, v_old_path
      FROM files.folders WHERE id = p_folder_id AND deleted_at IS NULL;
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'folder % not found', p_folder_id USING ERRCODE = 'no_data_found';
    END IF;

    p_new_path := trim(both '/' from p_new_path);
    v_new_name := split_part(p_new_path, '/', GREATEST(array_length(string_to_array(p_new_path, '/'), 1), 1));

    UPDATE files.folders
       SET folder_path = p_new_path,
           folder_name = v_new_name,
           parent_id   = COALESCE(p_new_parent_id, parent_id),
           updated_at  = now()
     WHERE id = p_folder_id;

    -- Re-prefix child folder paths
    UPDATE files.folders
       SET folder_path = p_new_path || substring(folder_path FROM length(v_old_path) + 1),
           updated_at  = now()
     WHERE created_by = v_owner
       AND folder_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL
    RETURNING id INTO v_descendants_folders;
    GET DIAGNOSTICS v_descendants_folders = ROW_COUNT;

    -- Re-prefix child file paths
    UPDATE files.files
       SET file_path  = p_new_path || substring(file_path FROM length(v_old_path) + 1),
           updated_at = now()
     WHERE created_by = v_owner
       AND file_path LIKE v_old_path || '/%'
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_descendants_files = ROW_COUNT;

    RETURN jsonb_build_object(
        'old_path', v_old_path,
        'new_path', p_new_path,
        'descendant_folders', v_descendants_folders,
        'descendant_files', v_descendants_files
    );
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_file(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_ok BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to restore file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files SET deleted_at = NULL
     WHERE id = p_file_id AND deleted_at IS NOT NULL
    RETURNING true INTO v_ok;
    RETURN COALESCE(v_ok, false);
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_folder(p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_folders INT;
    v_files INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to restore folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    WITH RECURSIVE descendants AS (
        SELECT id FROM files.folders WHERE id = p_folder_id
        UNION ALL
        SELECT d.id FROM files.folders d JOIN descendants ds ON d.parent_id = ds.id
    ),
    restored_folders AS (
        UPDATE files.folders SET deleted_at = NULL
         WHERE id IN (SELECT id FROM descendants) AND deleted_at IS NOT NULL
        RETURNING id
    ),
    restored_files AS (
        UPDATE files.files SET deleted_at = NULL
         WHERE parent_folder_id IN (SELECT id FROM restored_folders) AND deleted_at IS NOT NULL
        RETURNING id
    )
    SELECT (SELECT count(*) FROM restored_folders), (SELECT count(*) FROM restored_files)
    INTO v_folders, v_files;
    RETURN jsonb_build_object('folders', v_folders, 'files', v_files);
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_file(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_ok BOOLEAN := false;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to delete file %', p_file_id USING ERRCODE = '42501';
    END IF;
    UPDATE files.files SET deleted_at = now()
     WHERE id = p_file_id AND deleted_at IS NULL
    RETURNING true INTO v_ok;
    IF v_ok THEN
        UPDATE files.share_links SET is_active = false
         WHERE resource_type = 'file' AND resource_id = p_file_id;
    END IF;
    RETURN COALESCE(v_ok, false);
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_folder(p_folder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_owner UUID;
    v_folders INT;
    v_files INT;
    v_links INT;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('folder', p_folder_id, 'editor') THEN
        RAISE EXCEPTION 'forbidden: not authorized to delete folder %', p_folder_id USING ERRCODE = '42501';
    END IF;
    SELECT created_by INTO v_owner FROM files.folders WHERE id = p_folder_id AND deleted_at IS NULL;
    IF v_owner IS NULL THEN
        RETURN jsonb_build_object('folders', 0, 'files', 0, 'links', 0);
    END IF;

    -- Walk the descendant folder tree
    WITH RECURSIVE descendants AS (
        SELECT id FROM files.folders WHERE id = p_folder_id
        UNION ALL
        SELECT d.id
          FROM files.folders d
          JOIN descendants ds ON d.parent_id = ds.id
         WHERE d.deleted_at IS NULL
    ),
    deleted_folders AS (
        UPDATE files.folders
           SET deleted_at = now()
         WHERE id IN (SELECT id FROM descendants)
           AND deleted_at IS NULL
        RETURNING id
    ),
    deleted_files AS (
        UPDATE files.files
           SET deleted_at = now()
         WHERE parent_folder_id IN (SELECT id FROM deleted_folders)
           AND deleted_at IS NULL
        RETURNING id
    ),
    deactivated_links AS (
        UPDATE files.share_links
           SET is_active = false
         WHERE (resource_type = 'folder' AND resource_id IN (SELECT id FROM deleted_folders))
            OR (resource_type = 'file'   AND resource_id IN (SELECT id FROM deleted_files))
        RETURNING id
    )
    SELECT
        (SELECT count(*) FROM deleted_folders),
        (SELECT count(*) FROM deleted_files),
        (SELECT count(*) FROM deactivated_links)
    INTO v_folders, v_files, v_links;

    RETURN jsonb_build_object('folders', v_folders, 'files', v_files, 'links', v_links);
END;
$function$;
