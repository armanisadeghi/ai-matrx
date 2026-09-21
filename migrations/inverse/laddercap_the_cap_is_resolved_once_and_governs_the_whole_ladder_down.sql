-- 🚨 WHICH LADDER-CAP INVERSE IS MEANT TO RUN, AND IN WHAT ORDER (lane INVERSE-GUARD, 2026-09-21).
-- The `iam.member_lane_confers` body this file restores CALLS `custom.addressed_cap_specific`,
-- which the SIBLING inverse
-- `laddercap_the_organization_default_steps_aside_for_every_specific_rung_down.sql` takes away —
-- this is the recorded clause (b) instance in the guard's own header. The two are ALTERNATIVES,
-- not a sequence: each LADDER-CAP red twin opens its own transaction, applies exactly ONE of the
-- two inverses, asks its questions and ends in ROLLBACK. Run this one ALONE. If both are ever
-- wanted in the same transaction, the specific-rung inverse must run LAST and must take this
-- restored `member_lane_confers` with it, because `addressed_cap_specific` is exactly what it
-- exists to remove and a per-node loop that asks a function that is gone is not a defect put back.
-- ground-standing-ok: b  — the sibling is named above, the order is stated, and this file is run alone.
--
-- INVERSE of migrations/campaign/laddercap_the_cap_is_resolved_once_and_governs_the_whole_ladder.sql
--
-- Puts the specificity rule back INSIDE the platform kernel's per-node loop (iam.member_lane_confers
-- asking custom.addressed_cap_specific), takes the lanes-addressed-to-nobody back out of the cap,
-- and leaves arm 1 ungoverned again. Every answer is the same; what comes back is the cost, measured
-- at +61.5% / +58.1% on the page-read path where the answer is TRUE.

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
  -- inlined so this file's guard is a line of code and not a sentence about one). An
  -- organization that has not turned the unified record store on keeps the arm the access
  -- kernel always had, so applying this file changes nothing anywhere until the switch. A knob
  -- this reader cannot read is CLOSED, never open - the same trap `custom.store_is_open`
  -- documents: `platform.knob_resolve` is SECURITY INVOKER and raises P0001 for a role that
  -- merely cannot see the row.
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

  -- AGT-5. The default is held PER REGISTERED TABLE, so the Table is read off the row rather
  -- than guessed. `to_regclass` keeps this callable before the store exists. It is read BEFORE
  -- the override below, because the override asks about the Table as a rung of its own.
  if v_table is null and p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
  end if;

  -- VIS-19, THE OVERRIDE — AND IT IS ABOUT SPECIFICITY, NOT ABOUT "THIS ROW" (LADDER-CAP).
  -- Somebody has decided about this person and this thing, or the Table it lives in, or a home
  -- of it: the role default is not the answer, the more specific grant is, and it is admitted on
  -- its own arm at its own level. Written as "this row" it let a Table grant at viewer be
  -- overruled by the organization's editor default on every record in that Table.
  if p_id is not null
     and custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, v_table) is not null then
    return null;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$;

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
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNGS 1, 2 and 3 — the record, its Table, its homes, and ownership of any of them.
  v_lvl := custom.addressed_cap_specific(p_user_id, p_type, p_id, p_organization_id, p_table_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 4 — CONTAINMENT CARRY. Nothing there is addressed to her, so it sets no level.

  -- RUNG 5 — THE ORGANIZATION'S OWN WORD FOR WHAT MEMBERSHIP CONFERS.
  return iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
end;
$function$;

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
