-- INVERSE of migrations/campaign/laddercap_the_overreach_census_knows_the_fourth_rung.sql
--
-- Puts iam.member_level_justified back to the body that did NOT know SHARED-ONLY's fourth
-- rung, so iam.member_level_overreach() names the 12 Table rows again — which is what the
-- red twin executes it to prove.

CREATE OR REPLACE FUNCTION iam.member_level_justified(p_user_id uuid, p_organization_id uuid, p_record_id uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created uuid;
  v_table   uuid;
  v_best    public.permission_level;
  v_anc     public.permission_level;
  a         record;
begin
  select r.created_by, r.table_id into v_created, v_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if not found then return null; end if;

  -- VIS-25 and VIS-20, the two rungs a role justifies on its own.
  if v_created = p_user_id then return iam.top_content_level(); end if;
  if public.is_org_admin_for(p_user_id, p_organization_id) then return iam.top_content_level(); end if;

  v_best := iam.access_arms_from_sources(p_user_id, p_organization_id, 'record', p_record_id, v_table);

  for a in select c.container_type, c.container_id, c.max_level
             from custom.visibility_ancestors('record', p_record_id) c
  loop
    v_anc := iam.access_arms_from_sources(p_user_id, p_organization_id, a.container_type, a.container_id, null);
    if v_anc is not null then
      v_best := greatest(v_best, least(a.max_level, v_anc));
    end if;
  end loop;

  return v_best;
end;
$function$

;
