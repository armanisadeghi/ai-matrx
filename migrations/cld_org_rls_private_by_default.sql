-- Cloud Files — org RLS: private-by-default (P0-3 / K0-2 gate)
--
-- WHY: cld_files / cld_folders / cld_file_versions / cld_share_links carried
-- `*_org_member_select` and `*_org_member_update` policies that granted SELECT
-- (and, worse, UPDATE) to ANY `is_member_of_organization(organization_id)` member
-- with NO permission-level check. They were dormant only because every
-- cld_files.organization_id is NULL today. The Knowledge rollout populates
-- organization_id on every file (see cld_files_write_organization_id migration),
-- which would have instantly let any org member read AND overwrite/delete every
-- other member's files directly via supabase-js — bypassing the Python
-- permission manager entirely.
--
-- DECISION: files are private-by-default. Org membership alone grants NOTHING.
-- Access flows only through the existing, correct policies: owner_*, public_select,
-- shared_user_* (explicit grant via cld_user_has_permission_grant), and
-- folder_perm_select. A real "team drive" (org members get read) can be layered
-- on later as a deliberate, grant-backed opt-in — never bare membership.
--
-- This migration is DESTRUCTIVE to the named policies only; it adds no new access.
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-10.
--
-- NOTE: processed_documents_org_member_select is intentionally NOT touched here —
-- the Knowledge layer's org-shared visibility is a separate, deliberate decision
-- (tracked under the Knowledge plan); raw file privacy is handled here.

DROP POLICY IF EXISTS cld_files_org_member_select   ON public.cld_files;
DROP POLICY IF EXISTS cld_files_org_member_update   ON public.cld_files;

DROP POLICY IF EXISTS cld_folders_org_member_select ON public.cld_folders;
DROP POLICY IF EXISTS cld_folders_org_member_update ON public.cld_folders;

DROP POLICY IF EXISTS cld_file_versions_org_member_select ON public.cld_file_versions;

DROP POLICY IF EXISTS cld_share_links_org_member_select   ON public.cld_share_links;
