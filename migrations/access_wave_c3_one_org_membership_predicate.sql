-- C3: ONE org-membership predicate body (audit gap G4). iam.has_org_access_for stays
-- the canonical implementation; the three duplicates become thin deprecated wrappers
-- (identical semantics — all were EXISTS over iam.organization_member). The 20 live
-- policies referencing public.is_member_of_organization keep working unchanged and
-- get repointed opportunistically as their tables canonicalize.
CREATE OR REPLACE FUNCTION public.is_member_of_organization(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- DEPRECATED wrapper: use iam.has_org_access / iam.has_org_access_for.
  SELECT iam.has_org_access_for((SELECT auth.uid()), p_org_id);
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- DEPRECATED wrapper: use iam.has_org_access / iam.has_org_access_for.
  SELECT iam.has_org_access_for((SELECT auth.uid()), p_org_id);
$function$;

CREATE OR REPLACE FUNCTION iam.is_org_member(p_user uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- DEPRECATED wrapper: use iam.has_org_access_for.
  SELECT iam.has_org_access_for(p_user, p_org);
$function$;
