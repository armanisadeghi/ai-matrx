-- seo.search_performance_daily — make the RLS org lane set-based.
--
-- Defect (2026-08-09), second half of the v_site_keyword_performance 500:
-- the SELECT policy read
--     created_by = (select auth.uid()) OR iam.has_org_access(organization_id)
-- `iam.has_org_access` is STABLE SECURITY DEFINER with `SET search_path`, so
-- Postgres cannot inline it and cannot hoist it: it is CALLED ONCE PER ROW.
-- Any user who is not the row creator therefore paid ~140,000 function calls
-- (850k buffer hits, ~15s) to read ONE site's 28-day window — a guaranteed
-- 57014 statement timeout against the authenticated role's 8s budget. The
-- site's owner never saw it, because `created_by = auth.uid()` short-circuits.
--
-- Fix: express the SAME org lane with the existing set-returning primitive
-- `iam.my_orgs()`. This is not a new or different check:
--     iam.has_org_access(o)  =  EXISTS (SELECT 1 FROM iam.organization_member
--                                       WHERE organization_id = o
--                                         AND user_id = auth.uid())
--     iam.my_orgs()          =  SELECT organization_id FROM iam.organization_member
--                                       WHERE user_id = auth.uid()
-- so `organization_id IN (SELECT iam.my_orgs())` is the identical predicate.
-- Verified equal for every org in the window, per user, before applying.
-- Being uncorrelated, it plans as a hashed SubPlan evaluated ONCE per query
-- instead of once per row.
--
-- Measured on site 38eff4c9 as a non-creator: 16,497 ms -> ~200 ms.
--
-- Scope note: 59 policies across this database share the per-row
-- `iam.has_org_access(...)` shape. This migration changes only the table in
-- the blast radius of the reported defect; the class is logged in
-- FOUND_DEFECTS.md.

DROP POLICY IF EXISTS std_select ON seo.search_performance_daily;

CREATE POLICY std_select ON seo.search_performance_daily
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR organization_id IN (SELECT iam.my_orgs())
  );
