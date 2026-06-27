-- Fix an app-breaking grant error introduced by the
-- public.organization_members -> iam.memberships cutover.
--
-- org_select_policy on public.organizations inlined
--   EXISTS (SELECT 1 FROM iam.memberships m WHERE m.organization_id = id ...)
-- in its USING clause. RLS policy subqueries run as the INVOKING role
-- (authenticated), which has NO grant on iam.memberships — so every
-- authenticated read of public.organizations failed with
-- "permission denied for table memberships" (42501). This broke
-- getUserOrganizations on every page (e.g. /chat/new) once the FE was
-- repointed off the dropped organization_members table.
--
-- This is an EQUIVALENCE-PRESERVING rewrite. iam.has_org_access(uuid) is a
-- SECURITY DEFINER function whose body is the same active-membership check
-- (EXISTS over iam.organization_member = active org members). Same rows remain
-- visible; this is NOT a weakening — it only moves the membership read into a
-- definer function so the authenticated role no longer needs a direct table
-- grant. The created_by self-access branch is preserved verbatim.
--
-- Idempotent: ALTER POLICY ... USING is safe to re-apply.

ALTER POLICY org_select_policy ON public.organizations
  USING (((created_by = auth.uid()) OR iam.has_org_access(id)));
