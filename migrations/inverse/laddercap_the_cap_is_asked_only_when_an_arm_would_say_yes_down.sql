-- INVERSE of migrations/campaign/laddercap_the_cap_is_asked_only_when_an_arm_would_say_yes.sql
--
-- Puts custom.reaches_directly back to the EAGER-CAP body: the cap asked unconditionally
-- between arm 1 and arm 2. Every answer is identical; what comes back is the cost, measured on
-- the main database at +42.8% / +40.3% / +45.3% on LADDER-PERF's three ladder questions.

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
  v_cap   public.permission_level;
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

  -- THE CAP (LADDER-CAP) — THE MOST SPECIFIC RUNG ADDRESSED TO HER DECIDES HER LEVEL, and the
  -- two rungs below cannot raise it. Arm 2 is the ORGANIZATION'S default and arm 3 is the
  -- store's CARRYING; both are less specific than a grant somebody wrote naming her on this
  -- record, on its Table, or on a home of it. Asked once, here, so that neither arm can be
  -- reached at a level she was never given. NULL means no rung is addressed to her at all, and
  -- then nothing is capped: the reach-only rungs answer exactly as they always did.
  v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
  if v_cap is not null and p_required > v_cap then
    return false;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19).
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
