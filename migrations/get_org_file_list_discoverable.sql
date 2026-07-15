-- get_org_file_list_discoverable.sql
--
-- Closes a latent private-file access leak in the Org Files list.
--
-- The org files page (matrx-frontend app/(core)/organizations/[orgId]/files)
-- listed org files with a bare files.files table read authorized ONLY by RLS
-- std_select, which is intentionally conveyance-INCLUSIVE
-- (created_by = auth.uid() OR iam.has_access('file', id, 'viewer')) so that the
-- in-chat single-row read of a chat-conveyed file works. As a LISTING surface,
-- that read enumerated files a member could reach only via a shared conversation
-- (chat-conveyance) — the exact leak migration 0177 closed for the canonical
-- file-list RPCs (get_user_file_tree / count_user_files / search_files).
--
-- FIX: a SECURITY DEFINER enumeration RPC that mirrors get_user_file_tree's
-- shape/security and gates every row on iam.is_discoverable (owner + direct
-- share + membership; NO chat-conveyance / reachability). Preserves the page's
-- existing behavior: org-scoped, deleted_at IS NULL, columns
-- (id, file_name, mime_type, size_bytes, updated_at), ordered updated_at DESC.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_org_file_list(
    p_user_id uuid,
    p_org_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_result jsonb;
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'forbidden: p_user_id does not match auth.uid()' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_result
    FROM (
        SELECT f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at
          FROM files.files f
         WHERE f.organization_id = p_org_id
           AND f.deleted_at IS NULL
           AND (f.created_by = p_user_id
                OR iam.is_discoverable(p_user_id, 'file', f.id, 'viewer'))
         ORDER BY f.updated_at DESC NULLS LAST
    ) t;

    RETURN v_result;
END;
$function$;
