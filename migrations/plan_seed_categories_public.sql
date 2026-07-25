-- Content Planning follow-up: make the plan seed category dimensions readable
-- by every organization, per the platform convention for system dimensions
-- (fc_card_kind and study_method ship visibility='public'; the plan_* seeds
-- were left 'internal' under the Matrx System org, which made every status /
-- page-type / person-role / source-type picker EMPTY for any user who is not
-- a member of that org — i.e. every real customer org).
--
-- Also aligns public.cat_list with the existing platform.categories pub_read
-- RLS policy: rows with visibility='public' are readable by anyone at the
-- table, but cat_list filtered on org membership only and hid them. This is
-- a widening to match the already-granted RLS ceiling, not a new authority.

UPDATE platform.categories
   SET visibility = 'public'
 WHERE dimension IN ('plan_page_type','plan_status','plan_person_role','plan_source_type')
   AND is_system
   AND deleted_at IS NULL
   AND visibility <> 'public';

CREATE OR REPLACE FUNCTION public.cat_list(p_dimension text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, organization_id uuid, dimension text, name text, slug text, parent_id uuid, is_system boolean, color text, icon text, "position" integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, organization_id, dimension, name, slug, parent_id, is_system, color, icon, "position"
    from platform.categories
   where deleted_at is null
     and (visibility = 'public'::platform.visibility
          or iam.has_org_access(organization_id))
     and (p_dimension is null or dimension = p_dimension)
   order by dimension, "position" nulls last, name;
$function$;
