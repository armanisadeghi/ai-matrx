-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 8256f83d15e762ded943a3b4f301164915308d2c5f97c0f1384c74783c51ab6a
--
-- LADDER-CAP — A CEILING CANNOT REFUSE AT THE FLOOR, SO IT IS NOT ASKED THERE.
--
-- WHERE THE COST ACTUALLY WENT, profiled rather than guessed. The cap is asked once per
-- question, and `custom.addressed_cap` measures 2.334 ms. But `custom.has_visibility` on a
-- TABLE row whose answer comes from ARM 4 measured 28.720 ms while `custom.reaches_directly`
-- on the same row measured 3.448 ms and `iam.has_access_for` 0.874 ms — so the time is inside
-- arm 4, `custom.table_has_a_visible_record`, which asks the per-row ladder about EVERY
-- candidate record in the Table. The cap was being paid once per candidate:
--
--                                              before this lane   with the cap on every row
--     has_visibility, the answer is TRUE            19.026 ms            32.055 ms   +68.5%
--     effective_level, the answer is TRUE           23.255 ms            39.235 ms   +68.7%
--
-- AND EVERY ONE OF THOSE QUESTIONS IS ASKED AT `viewer`. The cap is a CEILING ON A LEVEL:
-- `custom.addressed_cap` returns either NULL, which caps nothing, or one of the content levels,
-- every one of which is >= the lowest. So at the lowest content level `p_required <= v_cap`
-- holds for every value the cap can possibly take, and the cap CANNOT REFUSE. Asking it there
-- is pure cost — and that is where nearly every question in the system is asked: every page
-- read, every row of a set-based walk, every `custom.visible_set` candidate, arm 4's whole
-- census of a Table.
--
-- `custom.level_floor()` is that level, read from `iam.content_levels()` — the one place that
-- knows the rungs and their order — so nothing here hard-codes the word `viewer`, and a new
-- lowest rung moves this with it.
--
-- NOT ONE ANSWER MOVES: the skipped comparison is one whose result is a constant `true`.

create or replace function custom.level_floor()
 returns permission_level
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- THE LOWEST CONTENT LEVEL. `iam.content_levels()` is the one place that knows the rungs and
  -- their order, so this reads them rather than spelling one out.
  select l.level from iam.content_levels() l order by l.ordinal limit 1;
$function$;

comment on function custom.level_floor() is
  'LADDER-CAP: the lowest content level. A ceiling can never refuse a question asked at the floor, which is where nearly every access question in the system is asked.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'level_floor', '', array[]::oid[],
   'Takes no argument and therefore checks none. It returns one enum value read from the '
   'platform''s own level registry and touches no organization, person or row.',
   'laddercap_a_ceiling_cannot_refuse_at_the_floor.sql',
   'server_only: a constant of the one access ladder, read by custom.reaches_directly. No '
   'client needs it and nothing about it is per-caller, so it is not a door.',
   false, false)
on conflict do nothing;

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
    if p_required <= custom.level_floor() then return true; end if;
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
    if p_required <= custom.level_floor() then return true; end if;
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
      if p_required <= custom.level_floor() then return true; end if;
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
