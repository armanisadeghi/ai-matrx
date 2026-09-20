-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) 26d38857b84bfc772215221c84b705d8a54232a98262b96d2f04078d17b82272
-- based-on: custom.addressed_cap(uuid, text, uuid, uuid, uuid) 748aea3c81809b4f6a2f8c55a64ac0784840453c50728b0a6ebb5932cca2fb4b
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) f5bc03cb06b2bd4ee5dd21b2eeb158480440daf435b6c2e3c24e460c1ff170a3
--
-- LADDER-CAP — THE LEVEL IS RESOLVED ONCE PER QUESTION, AND IT GOVERNS THE WHOLE LADDER.
--
-- THE DEFECT THIS FILE FIXES IS THIS LANE'S OWN, AND IT IS A COST. Teaching
-- `iam.member_lane_confers` the specificity rule put `custom.addressed_cap_specific` — which
-- walks `custom.visibility_ancestors` — inside the PLATFORM KERNEL'S per-node loop, so one
-- access question paid for it once per node of the containment walk. Measured on the main
-- database, 200 calls a figure, a (member, record) pair whose answer is TRUE and whose arm 1 is
-- false, which is the page-read path a member actually walks:
--
--                                              before this lane   with the rule in the kernel
--     has_visibility, the answer is TRUE            25.274 ms            40.809 ms   +61.5%
--     effective_level, the answer is TRUE           28.479 ms            45.016 ms   +58.1%
--
-- ~22 calls to a 1.1 ms body where ONE was needed. The rule was right and the PLACE was wrong.
--
-- SO THE LEVEL IS RESOLVED ONCE, IN THE ONE FUNCTION THAT ASKS THE QUESTION, AND IT GOVERNS
-- EVERY ARM INCLUDING ARM 1. `iam.member_lane_confers` goes back to VIS-19 exactly as LEVEL-FIX
-- wrote it — a grant addressed to this person and THIS ROW — so the kernel's hot path costs what
-- it cost before this lane existed. `custom.reaches_directly` computes `custom.addressed_cap`
-- ONCE, lazily, and no arm may answer above it.
--
-- WHICH MEANS THE CAP MUST NOW CARRY THE LANES ADDRESSED TO NOBODY, or capping arm 1 would take
-- access away from the people arm 1 exists for. They RAISE the cap and can never lower it:
--
--   * OWNERSHIP of the row              -> admin. The strongest address there is (VIS-25).
--   * The ORGANIZATION-ADMIN lane       -> admin. VIS-20 is a different question from VIS-19,
--                                         and `iam.member_level_justified` already reads it this
--                                         way: an organization admin is justified at the top.
--   * The PLATFORM-ADMIN lane           -> admin, on the same reasoning.
--   * A PUBLIC grant on the row         -> its own level, UNIONED on top (Rule 9). Publishing a
--                                         record may only ever ADD, and levelfix PART 5c is the
--                                         clause that proves it still does.
--
-- A person no rung is addressed to at all — a signed-out reader on the open library lane, a
-- student on an education assignment, somebody who is not a member of this organization — caps
-- at NULL, which caps nothing, and arm 1 answers for her exactly as it always did.
--
-- NOT ONE ANSWER MOVES ON THIS DATABASE, and it is measured rather than argued: every
-- (member, record) pair there is — 3,333, the whole population, not a sample — asked at viewer
-- and at editor plus `custom.effective_level` on 500 of them, before and after in ONE
-- repeatable-read snapshot, hashes identical and 0 disagreements.

-- VIS-19 GOES BACK TO LEVEL-FIX'S OWN WORDS. The specificity rule is not lost — it moved to
-- `custom.addressed_cap`, which is asked ONCE per question instead of once per walked node.
create or replace function iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
begin
  if p_user_id is null or p_organization_id is null then
    return null;
  end if;

  -- Membership itself. Not a role check: `owner` and `admin` reach their own arms earlier and
  -- are not affected by anything here (VIS-20 is a different question from VIS-19).
  if not exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    return null;
  end if;

  -- THE CAMPAIGN'S OFF SWITCH, read the established way (`custom.store_is_open`'s own body,
  -- inlined so this file's guard is a line of code and not a sentence about one).
  begin
    v_store_on := coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean,
                           false);
  exception when others then
    v_store_on := false;
  end;
  if not v_store_on then
    return null;
  end if;

  -- VIS-33. The organization may say that membership alone shows nothing at all.
  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- VIS-19, THE OVERRIDE. Somebody has decided about this person and this thing, so the role
  -- default is not the answer - the grant is, and it is admitted on its own arm.
  --
  -- IT IS THIS ROW AND NOT THE WHOLE SPECIFICITY LADDER, DELIBERATELY (LADDER-CAP). The Table
  -- and the homes are rungs too, and they are read by `custom.addressed_cap`, which
  -- `custom.reaches_directly` asks ONCE per question. Asking them here put a containment walk
  -- inside the access kernel's per-node loop and cost the page-read path 61%.
  if p_id is not null
     and iam.grant_addressed_level(p_user_id, p_type, p_id) is not null then
    return null;
  end if;

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists.
  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;

-- THE CAP — the most specific rung addressed to her, RAISED by every lane addressed to nobody.
create or replace function custom.addressed_cap(p_user_id uuid, p_type text, p_id uuid,
                                                p_organization_id uuid default null,
                                                p_table_id uuid default null)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_lvl public.permission_level;
  v_pub public.permission_level;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- ── THE LANES ADDRESSED TO NOBODY, WHICH MAY ONLY ADD ──────────────────────────────────────
  -- Each of these is authority a share was never meant to limit, so each returns the top level
  -- outright: capping an owner, an organization admin or our own staff with somebody's Viewer
  -- share would take access away rather than stop it being raised, which is the opposite defect.
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  if p_organization_id is not null and public.is_org_admin_for(p_user_id, p_organization_id) then
    return iam.top_content_level();
  end if;
  if public.is_super_admin_for(p_user_id) then return iam.top_content_level(); end if;

  -- ── THE RUNGS ADDRESSED TO HER, MOST SPECIFIC FIRST ────────────────────────────────────────
  --   1 the row itself · 2 its Table · 3 its homes   (and ownership of any of them)
  v_lvl := custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, p_table_id);

  --   4 containment carry — addressed to nobody, so it sets no level at all
  --   5 the organization's own word for what membership confers
  if v_lvl is null then
    v_lvl := iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
  end if;

  -- AND A PUBLIC GRANT IS ADDRESSED TO NOBODY: it may only ADD (Rule 9). Publishing a record
  -- must never take a level away from the organization's own members, so it is UNIONED on top
  -- of whatever the rungs said and never compared against them.
  select max(p.permission_level) into v_pub
    from iam.permissions p
   where p.resource_type = p_type
     and p.resource_id   = p_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and coalesce(p.is_public, false);
  if v_pub is not null then
    v_lvl := greatest(v_lvl, v_pub);   -- greatest() ignores a null arm
  end if;

  -- NULL means no rung and no lane speaks for this person here at all, and then nothing is
  -- capped: arm 1 answers for her exactly as it did before this lane existed.
  return v_lvl;
end;
$function$;

-- THE LADDER — one question, one resolved level, every arm governed by it.
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
