-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.member_level_justified(uuid, uuid, uuid) 239e5888edb9154977b75154dd78bc6311a8a14bf3ec5eaec8fd6555e0c0c2f8
--
-- LADDER-CAP — THE OVERREACH CENSUS LEARNS THE RUNG SHARED-ONLY ADDED.
--
-- `iam.member_level_overreach()` names every plain member who reaches a record more than her
-- grants and her organization's knob justify, and `iam.member_level_justified` is the half that
-- derives what IS justified, from the rungs, without ever calling the door it judges. That is
-- exactly right, and it is why the census is worth having.
--
-- IT IS MISSING A RUNG. `custom.has_visibility` has FOUR arms, and SHARED-ONLY added the fourth:
-- a TABLE you can see something inside is a Table you may KNOW — its name, its columns, that it
-- exists — "AT `viewer` AND NEVER ABOVE IT", and "IT DOES NOT CARRY". Without it
-- `custom.assert_may_know_table`, the first line of `custom.read_records`, `custom.applicable_fields`
-- and every screen door in the store, refuses a person the one table holding the record she was
-- deliberately given. The census never learned that rung, so it read every such Table row as
-- unjustified reach.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, on the exact rows the census named — the 12 rows
-- behind `Fairview Shared Services/test@test.com 11` and `ZZ WORK-DOORS two-seat 9ebdddb3/test@test.com 1`:
--
--     over_rows | are_table_rows | reached_by_arms_1_3 | arm4_says_yes | above_viewer
--            12 |             12 |                   0 |            12 |            0
--
-- Every one is a Table row; NOT ONE is reached by arms 1, 2 or 3 (`custom.reaches_directly` is
-- false for all twelve); every one is admitted by arm 4; and not one is answered above `viewer`.
-- The census was measuring a rung it did not model, and the reach it named is the product
-- behaving as SHARED-ONLY decided it should.
--
-- IT IS NOT WEAKENED. The rung is added with the door's own three conditions and no others — the
-- row must BE a Table (`custom.table_kernel_id()`), the person must actually be able to see
-- something inside it (`custom.table_has_a_visible_record`, the same body arm 4 calls), and it
-- contributes `viewer` and never a rung above it. A Table row answered above viewer, a row that
-- is not a Table, and a Table holding nothing this person may see are all still named exactly as
-- before. LADDER-CAP's own census, `custom.levels_raised_by_a_less_specific_rung()`, is the one
-- that judges the level ceiling and it is UNCHANGED and at zero.

create or replace function iam.member_level_justified(p_user_id uuid, p_organization_id uuid, p_record_id uuid)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  if coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and v_table = custom.table_kernel_id()
     and custom.table_has_a_visible_record(p_user_id, p_organization_id, p_record_id) then
    v_best := greatest(v_best, 'viewer'::public.permission_level);
  end if;

  return v_best;
end;
$function$;
