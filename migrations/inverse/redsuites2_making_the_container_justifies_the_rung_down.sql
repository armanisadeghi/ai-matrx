-- chair-step: it restores `iam.member_level_justified` to the body it had before RED-SUITES-2,
--   in which making a container justified nothing about the rows inside it. It replaces one
--   function body and nothing else; no row is deleted, no grant moves, no table changes. It is
--   the inverse half of
--   `migrations/campaign/redsuites2_making_the_container_justifies_the_rung.sql`.
--
-- Running this re-opens a false finding: `iam.member_level_overreach()` will again report
-- every member who made a Table somebody else writes into as reaching past her grants.

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

  -- THE FOURTH RUNG (SHARED-ONLY, taught to the census by LADDER-CAP). A Table you can see
  -- something inside is a Table you may KNOW. The three conditions are arm 4's own, character
  -- for character: the row must BE a Table, the person must actually reach something in it, and
  -- it justifies `viewer` and nothing above. It does not carry: this says only that the person
  -- may know THIS Table row, never that she may reach the rows inside it, which is what every
  -- clause above is for.
  -- It is gated on the store's OWN SWITCH, exactly as arm 4 is: where `custom/system_enabled`
  -- resolves false for this organization the store answers nobody anything and no arm of it
  -- runs, so this file changes NOTHING there.
  if custom.store_is_open(p_organization_id)
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, p_organization_id, p_record_id) then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  return v_best;
end;
$function$


