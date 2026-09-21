-- INVERSE of migrations/campaign/laddercap_a_ceiling_cannot_refuse_at_the_floor.sql
--
-- Puts the cap back in front of every question including the ones asked at the lowest content
-- level, where it can never refuse. Every answer is the same; what comes back is the cost,
-- measured at +68.5% on a Table row whose answer comes from arm 4's per-candidate walk.
--
-- 🚨 WHICH ONE RUNS, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The body this file restores calls custom.addressed_cap, and the sibling
-- inverse `laddercap_the_most_specific_grant_decides_the_level_down.sql` REMOVES
-- that function. They are not two independent undos: they are two halves of one lane's
-- teardown, and the pair has exactly one safe order.
--   · THIS FILE ALONE is what puts THIS file's defect back, and it is what the red twin beside
--     it runs. custom.addressed_cap is still there, so the body it restores still resolves.
--   · `laddercap_the_most_specific_grant_decides_the_level_down.sql` is the DEEPER teardown — it takes
--     custom.addressed_cap itself away — so it may never run with this file's restore standing in
--     front of it. Run it on its own, against the lane's shipped bodies, never after this one.
-- Running the sibling FIRST and this one SECOND is the one order that leaves the access kernel
-- calling a function that is gone, and it is the order this note exists to forbid.
-- ground-standing-ok: b — the order above is stated, and neither half is run on top of the other.
--

create or replace function custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level default 'viewer'::permission_level)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
-- DOES SOMETHING REACH THIS ROW? Arms 1, 2 and 3 of the one ladder, and nothing else. This is
-- not a second ladder: `custom.has_visibility` has no copy of these arms any more, it calls
-- this. The split exists because a Table answers YES to a fourth question — "may this person
-- know it" — that must never be read as "it carries everything inside it".
declare
  rec         record;
  v_org       uuid;
  v_table     uuid;
  v_cap       public.permission_level;
  v_cap_asked boolean := false;
begin
  if p_user_id is null or p_id is null then return false; end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership, grant
  -- rows, the organization lanes (which honour the row's own `visibility`, DD-136), the
  -- containment walk, the public and global-readable system-organization arms.
  --
  -- IT IS GOVERNED BY THE CAP TOO (LADDER-CAP). One of the lanes inside it IS the organization
  -- default — the least specific rung there is — and leaving arm 1 alone let that lane overrule
  -- a grant somebody addressed to this person on the record's TABLE or on a home of it. The cap
  -- carries the lanes addressed to nobody (ownership, the admin lanes, public grants) at the top
  -- level, so nothing arm 1 exists for is taken away.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19), under the same
  -- cap. It is a VETO and never turns a no into a yes, so it is asked where an arm would say
  -- yes and not on a walk that ends in no. A refusal ENDS the walk: arm 3 is less specific still
  -- and is governed by the same cap, so it could only be refused as well.
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true — subject to the same cap.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if (rec.container_type = 'record' and rec.container_id = v_table
        and custom.table_carries_its_rows(p_user_id, rec.container_id, p_required))
       or (not (rec.container_type = 'record' and rec.container_id = v_table)
           and iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required))
    then
      if not v_cap_asked then
        v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
        v_cap_asked := true;
      end if;
      return v_cap is null or p_required <= v_cap;
    end if;
  end loop;

  return false;
end;
$function$;

drop function if exists custom.level_floor();
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'level_floor';
