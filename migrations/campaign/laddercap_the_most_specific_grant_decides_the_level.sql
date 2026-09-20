-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 093520a161c33d3ce2ba5dc86ba62e42b2d459b5423e4d5a7c18e83cdd4e0d07
--
-- LADDER-CAP — A LESS SPECIFIC RUNG MAY ADD REACH. IT MAY NEVER RAISE THE LEVEL.
--
-- THE CONTRACT. The MOST SPECIFIC grant addressed to a person decides her level on a record:
--
--     record grant  >  table grant  >  home  >  containment carry  >  organization default
--
-- and a less specific rung may never RAISE the level above a more specific one addressed to
-- her. "Addressed to her" means a row somebody deliberately wrote naming HER (or an
-- organization she is in), or ownership, which is the strongest address there is. Public
-- grants and the store's own carrying are addressed to NOBODY: they ADD REACH and never set
-- a level, so they can neither raise her nor lower her.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-20 (levelfix_green.sql PART 5b, red since
-- LEVEL-FIX landed, located by lane EXPORT-FIX). An organization at its shipped default with
-- `custom/member_default_level = editor`; a plain member deliberately shared ONE record at
-- VIEWER through the rows the Share dialog writes:
--
--     PROBE has_visibility editor            = t     <- the store's ladder
--     PROBE has_access_for editor            = f     <- the platform's kernel caps her
--     PROBE member_lane_confers on record    = <NULL>   (VIS-19: a grant speaks for this row)
--     PROBE granted_level on record          = viewer
--     PROBE effective_level(iam)             = viewer
--     PROBE ancestors@editor = record:...000b21 d1 max=admin      <- the TABLE
--     PROBE table_carries_its_rows(TBL,editor) = t
--     PROBE reaches_directly editor          = t
--
-- Every rung ADDRESSED to her says `viewer`. The walk climbed from the record to the TABLE it
-- lives in, where NO grant is addressed to her at all, `iam.has_access_for` admitted the
-- ORGANISATION'S OWN `member_default_level` (editor) on that Table row, and arm 3 read that as
-- "and therefore every row inside it". A deliberate Viewer share was silently raised back to
-- editor by the role default on its container. LEVEL-FIX taught the RECORD's own lane that a
-- grant overrides the role default (VIS-19); nothing taught the CONTAINER's.
--
-- THE FIX IS THE CLASS, NOT THE ARM. `custom.table_carries_its_rows` is not patched and is not
-- touched: it is one of FIVE rungs that could each raise her past her own grant, and fixing the
-- one the reproduction happened to use would leave the other four. Instead the walk now RESOLVES
-- A LEVEL before it answers a question: `custom.addressed_cap` collects the candidate
-- (rung, level) pairs in specificity order and returns the FIRST one addressed to this person,
-- and `custom.reaches_directly` refuses anything above it before arms 2 and 3 are asked at all.
--
-- IT READS THE RUNGS THROUGH THE PRIMITIVES THAT ALREADY EXIST. "What did somebody address to
-- this person here" is `iam.grant_addressed_level`, which LEVEL-FIX built for VIS-19 and which
-- `iam.member_lane_confers` already asks; the organization's own rung is
-- `iam.member_lane_confers` itself. Nothing here re-implements a rung, so the cap and the lane
-- that admits a member cannot drift apart.
--
-- ARM 1 — THE PLATFORM KERNEL — IS DELIBERATELY NOT CAPPED, and that is measured rather than
-- assumed. A census of every live (member, record) pair on this database holding a grant
-- addressed to that person where the store answers HIGHER than the grant named exactly ONE pair
-- (`test@test.com` / `a4e441c4-9c16-4705-885c-3a2b6cc60a8e`, granted editor, answered admin) and
-- she is an ORGANIZATION ADMIN of that workspace who also OWNS the Table. Ownership, the
-- organization-admin and platform-admin lanes, the public and library lanes and the
-- global-readable system-organization lane are all reach that is addressed to nobody in the
-- grant sense; capping them with a person's own share would take access away from org admins,
-- owners and public readers, which is the opposite defect. The kernel already applies VIS-19 to
-- the record itself — it answered `f` at editor in the probe above — so what it grants, it
-- grants on a lane a share was never meant to limit.
--
-- WHAT MOVES. Nothing on this database: the same census finds ZERO live (member, record) pairs
-- whose answer this file changes. The defect is invisible live only because no live organization
-- is in the shipped default configuration — which is the configuration a real customer gets, and
-- the one PART 5b builds.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE LEVEL RESOLUTION — THE CANDIDATE (RUNG, LEVEL) PAIRS, MOST SPECIFIC FIRST.
--
-- Returns the level of the most specific rung ADDRESSED to this person, or NULL when no rung is
-- addressed to her at all (in which case nothing is capped and reach-only rungs answer alone).
--
--   RUNG 1  the row itself      ownership, or a grant addressed to her on it
--   RUNG 2  the Table it is in  ownership, or a grant addressed to her on the Table row
--   RUNG 3  the homes           shallowest first, ownership or a grant, never above conveys_max
--   RUNG 4  containment carry   ADDRESSED TO NOBODY - contributes reach, never a level
--   RUNG 5  the organization    what membership alone confers, which is the knob's word
--
-- Rung 5 is asked through `iam.member_lane_confers` rather than the knob, so the ceiling and the
-- lane that admits a member are the same sentence: it already returns NONE under `shared_only`,
-- for a Table carrying a `restricted` field, and for a person a grant already speaks for - by
-- which point rungs 1 to 3 have answered anyway.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create function custom.addressed_cap(p_user_id uuid, p_type text, p_id uuid,
                                     p_organization_id uuid default null,
                                     p_table_id uuid default null)
 returns permission_level
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_lvl public.permission_level;
  a     record;
begin
  if p_user_id is null or p_id is null then return null; end if;

  -- RUNG 1 — THE ROW ITSELF. Ownership is the strongest address there is (VIS-25).
  if iam.owner_of(p_type, p_id) = p_user_id then return iam.top_content_level(); end if;
  v_lvl := iam.grant_addressed_level(p_user_id, p_type, p_id);
  if v_lvl is not null then return v_lvl; end if;

  -- RUNG 2 — THE TABLE THE ROW LIVES IN. A Table is a record (REC-25), so it is asked exactly
  -- as rung 1 is. This is the rung the defect walked THROUGH without ever asking.
  if p_table_id is not null and p_table_id is distinct from p_id then
    if iam.owner_of('record', p_table_id) = p_user_id then return iam.top_content_level(); end if;
    v_lvl := iam.grant_addressed_level(p_user_id, 'record', p_table_id);
    if v_lvl is not null then return v_lvl; end if;
  end if;

  -- RUNG 3 — THE HOMES, SHALLOWEST FIRST, because a nearer container is the more specific word.
  -- An ancestor can never address more than it conveys, so `conveys_max` bounds it here exactly
  -- as it bounds the carry in arm 3.
  for a in
    select c.container_type, c.container_id, c.max_level, c.depth
      from custom.visibility_ancestors(p_type, p_id) c
     where c.container_id is distinct from p_table_id
     order by c.depth
  loop
    if iam.owner_of(a.container_type, a.container_id) = p_user_id then
      return least(a.max_level, iam.top_content_level());
    end if;
    v_lvl := iam.grant_addressed_level(p_user_id, a.container_type, a.container_id);
    if v_lvl is not null then return least(a.max_level, v_lvl); end if;
  end loop;

  -- RUNG 4 — CONTAINMENT CARRY. Nothing here is addressed to her, so it sets no level.

  -- RUNG 5 — THE ORGANIZATION'S OWN WORD FOR WHAT MEMBERSHIP CONFERS.
  return iam.member_lane_confers(p_user_id, p_organization_id, p_type, p_id, p_table_id);
end;
$function$;

comment on function custom.addressed_cap(uuid, text, uuid, uuid, uuid) is
  'LADDER-CAP: the level of the MOST SPECIFIC rung addressed to this person (record grant > table grant > home > organization default), or NULL when none is. Carrying and public rungs are addressed to nobody and appear here at no rung.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'addressed_cap',
   'p_user_id uuid, p_type text, p_id uuid, p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_user_id is the person being ASKED ABOUT, never the caller. p_id is matched only against '
   'iam.permissions rows and custom.visibility_ancestors for p_type; p_organization_id and '
   'p_table_id are the row''s own, read from custom.record by the caller, and are passed on '
   'unchanged to iam.member_lane_confers. A null user or id answers null; a null organization or '
   'table simply removes rung 2 and rung 5 from the walk, which can only LOWER the cap.',
   'laddercap_the_most_specific_grant_decides_the_level.sql',
   'server_only: a rung of the one access ladder. It is read by custom.reaches_directly, which '
   'decides its caller first, and by the LADDER-CAP census. It answers about ANY person, so a '
   'client calling it directly could enumerate what other people have been shared.',
   false, false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ARMS 1, 2 AND 3 OF THE ONE LADDER — NOW WITH THE LEVEL RESOLVED BEFORE THE QUESTION.
-- Byte for byte the landed body, with ONE addition: the cap, between arm 1 and arm 2.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE CENSUS — EVERY LIVE (MEMBER, RECORD) PAIR WHERE A LESS SPECIFIC RUNG RAISED THE LEVEL.
--
-- A pair is named when a rung ADDRESSED to the person names a level and the store answers
-- HIGHER, and the person is neither an owner nor an organization admin — the reach-only lanes a
-- share is not meant to limit. It is not satisfied by the thing it judges: the addressed side is
-- read from the rungs (`iam.grant_addressed_level` / `iam.member_lane_confers` / `iam.owner_of`)
-- and the answered side from the door, so the two can disagree and the census says so.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create function custom.levels_raised_by_a_less_specific_rung()
 returns table(organization_id uuid, organization_name text, member_id uuid, member_email text,
               record_id uuid, addressed_level permission_level, answered_level permission_level)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with pair as (
    select r.organization_id, om.user_id, r.id as record_id,
           custom.addressed_cap(om.user_id, 'record', r.id, r.organization_id, r.table_id) as addressed,
           custom.effective_level(om.user_id, r.organization_id, r.id, 'record')            as answered
      from iam.organization_member om
      join custom.record r on r.organization_id = om.organization_id and r.deleted_at is null
     where not public.is_org_admin_for(om.user_id, om.organization_id)
       and iam.owner_of('record', r.id) is distinct from om.user_id
  )
  select p.organization_id, coalesce(g.name, p.organization_id::text), p.user_id,
         coalesce(u.email::text, p.user_id::text), p.record_id, p.addressed, p.answered
    from pair p
    left join iam.organizations g on g.id = p.organization_id
    left join auth.users        u on u.id = p.user_id
   where p.addressed is not null
     and p.answered  is not null
     and p.answered  > p.addressed
   order by 4, 5;
$function$;

comment on function custom.levels_raised_by_a_less_specific_rung() is
  'LADDER-CAP census: every live (member, record) pair the store answers HIGHER than the most specific rung addressed to that person. Zero is the contract.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'levels_raised_by_a_less_specific_rung', '', array[]::oid[],
   'Takes no argument and therefore checks none. It reads every organization member and every '
   'live record on the database and reports the two levels for each pair.',
   'laddercap_the_most_specific_grant_decides_the_level.sql',
   'server_only: a whole-database census read by the LADDER-CAP suites and by '
   'check:store-doors-decide. It crosses every organization boundary there is, so no client of '
   'any kind may ever call it.',
   false, false)
on conflict do nothing;
