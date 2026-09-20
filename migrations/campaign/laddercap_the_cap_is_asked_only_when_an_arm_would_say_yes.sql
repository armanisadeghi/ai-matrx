-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 9ceec442061db26ead5e100b5662570fc8aaa471bc5c2447a394dae5b24a7e58
--
-- LADDER-CAP — THE CAP IS A VETO, SO IT IS ASKED ONLY WHEN AN ARM WOULD OTHERWISE SAY YES.
--
-- The cap landed asked unconditionally, between arm 1 and arm 2. That is correct and it is too
-- expensive: `custom.addressed_cap` walks `custom.visibility_ancestors` a second time and asks
-- `iam.member_lane_confers` a second time, and it was paying that on the COMMONEST path of all —
-- the one where the answer is NO and no arm would have said yes anyway. Measured on the main
-- database, 200 calls a figure, one (member, record) pair whose answer is false, LADDER-PERF's
-- own questions:
--
--                                                     before this file   after the cap landed
--     has_visibility, one member, one ordinary record       3.295 ms           4.705 ms   +42.8%
--     has_visibility, one member, one TABLE row             5.175 ms           7.261 ms   +40.3%
--     effective_level, one ordinary record                  5.498 ms           7.990 ms   +45.3%
--
-- THE CAP CANNOT TURN A NO INTO A YES. It only ever REFUSES, and it refuses arms 2 and 3
-- identically — they are the two rungs less specific than a grant addressed to her, and one cap
-- governs both. So a walk that reaches the end with both arms saying no answers `false` whether
-- the cap was asked or not, and asking it there buys nothing.
--
-- So it is asked at the two points where it changes an answer: the moment arm 2 would return
-- true, and the moment arm 3's carrying would. Once it refuses, the walk STOPS — a later
-- ancestor is less specific still and is governed by the same cap, so it could only be refused
-- too. `v_cap_asked` makes it exactly one call per question, never two.
--
-- NOT ONE ANSWER MOVES. This file changes WHEN the cap is consulted, never what it says: every
-- `return true` that the landed body would have produced is still guarded by the same
-- comparison against the same `custom.addressed_cap`, and every `return false` it would have
-- produced is still `false`. Proven by the same exhaustive parity the cap itself was proven by.

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
  rec        record;
  v_org      uuid;
  v_table    uuid;
  v_cap      public.permission_level;
  v_cap_asked boolean := false;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership,
  -- grant rows, the organization lanes (which honour the row's own `visibility`, DD-136),
  -- the containment walk, the public and global-readable system-organization arms. This is
  -- the arm the WRITE doors used to ask on their own; asking it here is what makes reading
  -- and writing the same question.
  --
  -- IT IS ASKED BEFORE THE CAP AND IS NOT SUBJECT TO IT (LADDER-CAP). Everything it admits
  -- that a share was never meant to limit — an owner, an organization admin, a platform
  -- admin, a public or library reader, the global-readable system organization — is reach
  -- addressed to NOBODY, and capping it with one person's own grant would take access away
  -- rather than stop it being raised. The kernel already applies VIS-19 to the row itself.
  if iam.has_access_for(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19).
  --
  -- THE CAP (LADDER-CAP) — THE MOST SPECIFIC RUNG ADDRESSED TO HER DECIDES HER LEVEL, and this
  -- arm and arm 3 are the two below it: the organization's default and the store's carrying,
  -- both less specific than a grant somebody wrote naming her on this record, on its Table or
  -- on a home of it. The cap is a VETO — it never turns a no into a yes — so it is asked HERE,
  -- where an arm is about to say yes, and not on the walk that ends in no. A refusal ENDS the
  -- walk: arm 3 is less specific than arm 2 and is governed by the same cap, so it could only
  -- be refused as well.
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
