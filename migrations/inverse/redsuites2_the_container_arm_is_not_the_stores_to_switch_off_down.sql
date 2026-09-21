-- chair-step: it restores `iam.member_level_justified` to the body it had between this lane's
--   two passes, in which the container arm was gated on `custom/system_enabled`. One function
--   body, nothing else.
--
-- Running this re-opens a false finding for every organization with the store switched off.

CREATE OR REPLACE FUNCTION iam.member_level_justified(p_user_id uuid, p_organization_id uuid, p_record_id uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- `custom/system_enabled` — THIS ORGANIZATION'S STORE SWITCH, read ONCE through the ONE
  -- door (`custom.store_is_open`) and never by a second inlined copy of its body. That rule
  -- is RED-SUITES' (`redsuites_one_store_switch.sql`, 2026-09-21): seventeen bodies had
  -- spelled the knob read out for themselves and sixteen of them were left behind when the
  -- switch's meaning changed. Holding it in a named local is also what makes the guard this
  -- file is headed with mechanically visible instead of a comment.
  v_system_enabled boolean;
  v_created uuid;
  v_table   uuid;
  v_best    public.permission_level;
  v_anc     public.permission_level;
  a         record;
begin
  v_system_enabled := custom.store_is_open(p_organization_id);

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
    -- ── RED-SUITES-2, 2026-09-21: MAKING THE CONTAINER IS A JUSTIFICATION FOR IT TOO. ──────
    -- This loop asked `iam.access_arms_from_sources` what justifies the person on the
    -- CONTAINER, and that function knows about grants, shares and the organization's knob —
    -- it does not know who MADE the row. The real ladder, `custom.effective_level`, carries
    -- the container at its EFFECTIVE level, and creating a row is the top of it: this
    -- function's own second line says so (`if v_created = p_user_id then return
    -- iam.top_content_level()`), for the record itself and never for anything above it.
    --
    -- So an ordinary thing — a member makes a Table, somebody else puts records in it —
    -- answered `admin` on the real ladder and `editor` here, and
    -- `iam.member_level_overreach()` reported it as a member reaching past her grants.
    -- MEASURED on the main database 2026-09-21: organization "Ironclad Mobile Mechanic",
    -- test@test.com, 4 records, actual `admin` vs justified `editor`; the Table row those
    -- four sit in carries `created_by = ` that same person. Nothing was over-reached.
    --
    -- A DETECTOR THAT CRIES WOLF IS WORSE THAN NO DETECTOR: `laddercap_green` 4b is the guard
    -- over this census, and it was permanently red for a non-reason, which is exactly where a
    -- REAL overreach in the same organization would have hidden.
    if v_system_enabled
       and a.container_type = 'record'
       and exists (select 1 from custom.record c
                    where c.organization_id = p_organization_id
                      and c.id = a.container_id
                      and c.created_by = p_user_id) then
      v_anc := iam.top_content_level();
    end if;
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
  if v_system_enabled
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, p_organization_id, p_record_id) then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  return v_best;
end;
$function$


