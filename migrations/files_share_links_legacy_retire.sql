-- files_share_links_legacy_retire.sql
-- ============================================================================
-- Wave F (share-link unification): retire the LEGACY per-feature file
-- share-link lane. The canonical system (platform.share_links + the
-- create_share_link / resolve_share_token / list_share_links /
-- revoke_share_link RPC family + /s/[token]) is the ONE share-link system.
--
-- Applied live 2026-07-15 (pre-launch; user approved that previously-issued
-- /share/... links stop working). Pre-flight found THREE delete-cascade
-- functions still touching files.share_links (soft_delete_file,
-- soft_delete_folder, hard_delete_file) — repointed to platform.share_links
-- here BEFORE the drops. Full applied SQL (including those three function
-- bodies verbatim) is recorded in supabase_migrations.schema_migrations under
-- migration name files_share_links_legacy_retire; current bodies in pg_proc.
--
-- Summary of applied statements:
--   CREATE OR REPLACE public.soft_delete_file   — share-link deactivation -> platform.share_links
--   CREATE OR REPLACE public.soft_delete_folder — cascade deactivation    -> platform.share_links
--   CREATE OR REPLACE public.hard_delete_file   — cascade delete          -> platform.share_links
--   DROP FUNCTION files.fn_list_share_links(text, uuid)
--   DROP FUNCTION files.fn_create_share_link(text, uuid, text, timestamptz, integer)
--   DROP FUNCTION files.fn_deactivate_share_link(text)
--   DROP FUNCTION public.consume_share_link(text)
--   ALTER TABLE files.share_links SET SCHEMA graveyard; RENAME TO files_share_links
--
-- Re-running this file is safe: it re-enforces the drops + graveyard move.
DROP FUNCTION IF EXISTS files.fn_list_share_links(p_resource_type text, p_resource_id uuid);
DROP FUNCTION IF EXISTS files.fn_create_share_link(p_resource_type text, p_resource_id uuid, p_permission_level text, p_expires_at timestamp with time zone, p_max_uses integer);
DROP FUNCTION IF EXISTS files.fn_deactivate_share_link(p_share_token text);
DROP FUNCTION IF EXISTS public.consume_share_link(p_token text);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='files' AND table_name='share_links') THEN
    ALTER TABLE files.share_links SET SCHEMA graveyard;
    ALTER TABLE graveyard.share_links RENAME TO files_share_links;
  END IF;
END $$;
