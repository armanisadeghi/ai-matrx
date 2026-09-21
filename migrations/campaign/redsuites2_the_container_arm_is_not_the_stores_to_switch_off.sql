-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.member_level_justified(uuid, uuid, uuid) 763d34570c97b7692d1a5798ff2de469e12009d5a1ba100f98ae1548b71649a8
--
-- RED-SUITES-2 — THE CONTAINER ARM IS NOT THE STORE'S TO SWITCH OFF (correcting this lane's
-- own first pass, `redsuites2_making_the_container_justifies_the_rung.sql`, applied 18:24:03Z).
--
-- That file taught `iam.member_level_justified` that making a container justifies the rung it
-- carries, and gated the new arm on `custom/system_enabled` because arm 4 below is gated that
-- way. MEASURED immediately afterwards, and the census had not moved:
--
--   iam.member_level_overreach()  ->  Ironclad Mobile Mechanic/test@test.com 4
--   custom.store_is_open(719980a1-…)                    ->  false
--   custom.effective_level(test@test.com, …, 'record')  ->  admin
--   iam.member_level_justified(test@test.com, …)        ->  editor
--
-- The ladder answers `admin` with the store switched OFF, so a justification that disappears
-- with the switch cannot mirror it. This function's own second line — "if v_created =
-- p_user_id then return iam.top_content_level()" — is ungated for the same reason: creating a
-- row is the top of the ladder whatever the store switch says. The gate is removed from THAT
-- ARM ONLY. Arm 4 keeps its gate, because "a Table you can see something inside is a Table you
-- may know" is a statement about the store's own contents and nothing else.
--
-- `v_system_enabled` stays: arm 4 reads it, it is still read ONCE through the ONE door
-- (`custom.store_is_open`), and it is still what makes this file's guard mechanically visible.
--
-- THIS GRANTS NOBODY ANYTHING. `iam.member_level_justified` decides no access; it is the
-- second opinion `iam.member_level_overreach()` compares the real ladder against.
--
-- ITS INVERSE: `migrations/inverse/redsuites2_the_container_arm_is_not_the_stores_to_switch_off_down.sql`.
-- THE SUITE: `scripts/campaign-tests/laddercap_green.sql` 4b, on the whole database.

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
    -- ── RED-SUITES-2, second pass, 2026-09-21: THIS ARM IS NOT THE STORE'S TO SWITCH OFF. ──
    -- The first pass gated this on `custom/system_enabled`, copying arm 4's precedent. That
    -- was wrong and the ladder itself says so: MEASURED on the main database, organization
    -- "Ironclad Mobile Mechanic" has `custom.store_is_open` = false, and
    -- `custom.effective_level` still answers `admin` on the records inside the Table that
    -- person made. Creating a row is the top of the ladder whatever the store switch says —
    -- this function's own second line is ungated for exactly that reason — so a justification
    -- that disappears when the switch is off would report an overreach for every organization
    -- with the store off, which is the false finding this arm exists to remove.
    --
    -- Arm 4 below is a different question and keeps its gate: "a Table you can see something
    -- inside is a Table you may know" is a statement about the store's own contents.
    if a.container_type = 'record'
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


