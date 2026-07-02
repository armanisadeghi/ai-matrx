-- readable_processed_doc_for_file(p_file): if the caller lacks direct access to
-- a file but CAN read its processed library document (Shared-Knowledge grant,
-- org, owner, super-admin/curator — via the canonical can_read_processed_document),
-- return that doc id so the /files/f/<id> page can redirect them to the read-only
-- library viewer instead of a dead 404. Returns NULL when not readable (fail-closed).
--
-- Uses auth.uid() (JWT identity) — the caller cannot pass someone else's id.
-- SECURITY DEFINER: it must read files.files past RLS to resolve the doc id, but
-- it only ever returns an id the caller is independently authorized to read.
CREATE OR REPLACE FUNCTION public.readable_processed_doc_for_file(p_file uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, files, docproc
AS $$
  SELECT f.canonical_processed_document_id
  FROM files.files f
  WHERE f.id = p_file
    AND f.deleted_at IS NULL
    AND f.canonical_processed_document_id IS NOT NULL
    AND public.can_read_processed_document(f.canonical_processed_document_id, auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.readable_processed_doc_for_file(uuid) TO authenticated;
