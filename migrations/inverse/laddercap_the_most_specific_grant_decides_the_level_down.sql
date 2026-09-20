-- INVERSE of migrations/campaign/laddercap_the_most_specific_grant_decides_the_level.sql
--
-- Puts `custom.reaches_directly` back to the body that was live before LADDER-CAP — the one
-- where a less specific rung could RAISE a person above the grant addressed to her — and
-- removes the level resolution and its census. Running this makes `levelfix_green.sql` PART 5b
-- red again, which is what the red twin executes it to prove.

drop function if exists custom.levels_raised_by_a_less_specific_rung();

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
  rec     record;
  v_org   uuid;
  v_table uuid;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership,
  -- grant rows, the organization lanes (which honour the row's own `visibility`, DD-136),
  -- the containment walk, the public and global-readable system-organization arms. This is
  -- the arm the WRITE doors used to ask on their own; asking it here is what makes reading
  -- and writing the same question.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19).
  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    return true;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true.
  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if rec.container_type = 'record' and rec.container_id = v_table then
      if custom.table_carries_its_rows(p_user_id, rec.container_id, p_required) then
        return true;
      end if;
    elsif iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required) then
      return true;
    end if;
  end loop;

  return false;
end;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('addressed_cap', 'levels_raised_by_a_less_specific_rung');

drop function if exists custom.addressed_cap(uuid, text, uuid, uuid, uuid);

