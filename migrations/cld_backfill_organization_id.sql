-- Cloud Files — backfill organization_id from each owner's personal org (K0-1)
--
-- WHY: every cld_files / cld_folders / cld_file_versions row must carry a
-- non-NULL organization_id so Files can participate in the Knowledge/Scope
-- system (structural search, org-scoped RAG, scope tagging). The write path
-- (managed_write_async) now stamps it on new rows; this backfills the ~8.5k
-- existing rows that predate that change.
--
-- SAFE: verified 0 dedup-index collisions before applying — no two root
-- non-deleted rows share (personal_org, owner, checksum). The
-- `organization_id IS NULL` guards make this idempotent (re-run = no-op).
--
-- The org-member RLS policies that would have made org-population an access
-- hole were already removed (cld_org_rls_private_by_default.sql), so this
-- changes Knowledge scoping ONLY, never who can read/write a file.
--
-- Owners not present in auth.users (guests / deleted accounts) have no
-- personal org and cannot get one (ensure_personal_organization requires a
-- real user); their rows stay NULL by design — a small, known guest tail.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) via apply_migration on 2026-06-10.

UPDATE public.cld_files f
   SET organization_id = g.id
  FROM public.organizations g
 WHERE f.organization_id IS NULL
   AND g.created_by = f.owner_id
   AND g.is_personal = true;

UPDATE public.cld_folders fo
   SET organization_id = g.id
  FROM public.organizations g
 WHERE fo.organization_id IS NULL
   AND g.created_by = fo.owner_id
   AND g.is_personal = true;

UPDATE public.cld_file_versions v
   SET organization_id = f.organization_id
  FROM public.cld_files f
 WHERE v.organization_id IS NULL
   AND v.file_id = f.id
   AND f.organization_id IS NOT NULL;
