-- files_authenticated_table_select_grants.sql (2026-07-07)
--
-- PostgREST returns 42501 "permission denied for table files" when
-- `authenticated` lacks table-level SELECT on files.files — even though
-- column-level SELECT grants existed for the client-safe column list.
-- Restore table-level SELECT/INSERT/UPDATE (RLS + iam.has_access gate rows),
-- then re-revoke storage_uri (server-only S3 location; see filesDb.ts).
-- Idempotent.

GRANT SELECT, INSERT, UPDATE ON files.files TO authenticated;
GRANT SELECT, INSERT, UPDATE ON files.file_versions TO authenticated;

REVOKE SELECT (storage_uri) ON files.files FROM authenticated, anon, PUBLIC;
REVOKE SELECT (storage_uri) ON files.file_versions FROM authenticated, anon, PUBLIC;
