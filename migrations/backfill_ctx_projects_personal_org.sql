-- Backfill org-less ctx_projects into each owner's personal org.
--
-- Root cause: createProject historically wrote organization_id = NULL for
-- "personal" projects (PERSONAL_PSEUDO_ORG_ID sentinel → NULL). That made
-- get_user_full_context synthesize a second "Personal" bucket alongside the
-- real personal org (organizations.is_personal = true), splitting the nav tree.
--
-- Idempotent: only touches rows where organization_id IS NULL.

UPDATE public.ctx_projects p
   SET organization_id = (
     SELECT o.id
       FROM public.organizations o
      WHERE o.is_personal = true
        AND o.created_by = p.created_by
      ORDER BY o.created_at ASC
      LIMIT 1
   )
 WHERE p.organization_id IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.organizations o
      WHERE o.is_personal = true
        AND o.created_by = p.created_by
   );
