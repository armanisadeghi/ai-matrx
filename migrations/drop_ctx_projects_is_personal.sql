-- Drop ctx_projects.is_personal (applied via Supabase MCP, 2026-06-06).
--
-- Rationale: every user has a personal org (organizations.is_personal = true).
-- The project-level is_personal flag was redundant with org membership and drifted
-- (projects could have BOTH an org AND is_personal=true, mislabeling them "Personal").
-- A project is now "personal" iff its owning org is the personal org.
--
-- organizations.is_personal and ctx_templates.is_personal are KEPT (different concepts).
--
-- This file is an archive of the change set; the RPC bodies were applied as the
-- Supabase migration `drop_is_personal_step1_rpcs` (get_user_full_context,
-- get_user_hierarchy, get_user_nav_tree rewritten to derive project is_personal
-- from the org; dead duplicates agx_get_user_context_tree / get_user_projects /
-- get_user_scopes_with_projects dropped — no FE or DB callers).

-- Step 0 — backfill: org-less projects adopt their owner's personal org.
UPDATE public.ctx_projects p
SET organization_id = (
  SELECT o.id FROM public.organizations o
  WHERE o.is_personal = true AND o.created_by = p.created_by
  ORDER BY o.created_at ASC
  LIMIT 1
)
WHERE p.organization_id IS NULL;

-- Step 1 — RPCs no longer read ctx_projects.is_personal (see migration
--          drop_is_personal_step1_rpcs in Supabase migration history).

-- Step 2 — drop the column.
ALTER TABLE public.ctx_projects DROP COLUMN IF EXISTS is_personal;
