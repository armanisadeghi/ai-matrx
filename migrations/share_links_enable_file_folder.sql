-- share_links_enable_file_folder.sql
-- ============================================================================
-- Wave F (share-link unification): enable the CANONICAL no-login share-link
-- system (platform.share_links + create_share_link / resolve_share_token /
-- list_share_links / revoke_share_link + /s/[token]) for files and folders,
-- replacing the legacy files.share_links lane.
--
-- public_columns is the ANON allowlist resolve_share_token projects to.
-- NEVER add storage_uri, file_path, checksum, metadata, or any storage key /
-- signed URL — bytes are served exclusively by aidream's token-validated
-- GET /share/{token}/download endpoint.
--
-- Folder links resolve to metadata only (folder_name + timestamps); anonymous
-- child listing is not part of this wave.
--
-- Idempotent.
-- ============================================================================

UPDATE platform.shareable_resource_registry
SET is_link_shareable = true,
    public_columns = ARRAY[
      'id', 'file_name', 'mime_type', 'size_bytes',
      'width', 'height', 'duration_ms',
      'created_at', 'updated_at'
    ]
WHERE resource_type = 'file';

UPDATE platform.shareable_resource_registry
SET is_link_shareable = true,
    public_columns = ARRAY['id', 'folder_name', 'created_at', 'updated_at']
WHERE resource_type = 'folder';

-- The files realtime middleware now subscribes to platform.share_links
-- (owner-only RLS bounds delivery). Ensure the table is in the realtime
-- publication (idempotent; ignore duplicate_object).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE platform.share_links;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
