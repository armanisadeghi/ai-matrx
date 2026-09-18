-- iam_access_kernel_bounded_work_dd263b — DD-263 RESIDUE: THE WALK TERMINATES BUT ITS COST DOES NOT,
-- AND THE WRITE DOOR CANNOT SEE A RING LONGER THAN THE CACHE IT ASKS.
--
-- THE FINDING (V-115, independent verification of DD-263, measured on production 2026-09-15)
-- -----------------------------------------------------------------------------------------
-- DD-263 gave `iam.has_access_for_base` a `p_path` stack array, and gave the two write doors a
-- refusal. Both were real, and both are narrower than the class:
--
--   1. `platform.enforce_no_carrying_cycle` decides by asking `platform.reachability` whether the
--      item already contains the container. That cache is built by `platform.derive_reachability`,
--      which stops at `depth < 8`. So the closing edge of a ring of TEN OR MORE nodes is invisible
--      to it. Measured, each in its own rolled-back transaction: a 9-node ring is REFUSED `23514`;
--      a 10-, 11- or 12-node ring is ACCEPTED.
--
--   2. `p_path` makes every PATH acyclic; it does not bound the number of paths. Inside a ring each
--      node acquires up to eight cached containers, so the walk branches ~8-way to the 32-frame
--      ceiling and the frame count explodes combinatorially. With a ten-node ring present, a
--      NEGATIVE access question inside it never returns: `canceling statement due to statement
--      timeout` at 180 s on production, 60 s on the branch, against a 104 ms acyclic control.
--      `54001 stack depth limit exceeded` had become a statement timeout — the same defect
--      (unbounded server cost per attempt, a broken page rather than a refusal) wearing a new code.
--
--   3. Reach: `platform.associations` policy `assoc_insert` lets ANY signed-in org member insert,
--      and the carrying type `file -> file` (container_side target, active, allows_loops false)
--      already exists on production. Ten files and ten association rows. No admin, no new type.
--      The original DD-263 needed two.
--
--   4. The guard `check:access-kernel-bounded` plants exactly ONE two-node cycle, so it is GREEN on
--      a database where (1) and (2) are reproducible; and its assertion 7 (`carrying_cycles()` is
--      empty) FAILS on any database that holds a deliberately DECLARED `allows_loops` cycle — it
--      is red for a legal state, which is the other half of "nothing fails silently".
--
-- WHAT THIS FILE DOES — the class, at the cost end and at the edge end
-- -------------------------------------------------------------------
-- 1. THE KERNEL IS BOUNDED IN **WORK**, NOT ONLY IN PATH. The containment walk stops being
--    recursive at all. `iam.has_access_for_base` now holds ONE frame that runs an explicit
--    breadth-first frontier over the containment graph with a VISITED SET spanning the WHOLE walk:
--    every (type, id, include_public) node is expanded AT MOST ONCE, so the cost is O(distinct
--    ancestors), never O(paths). A ring of any length is answered in milliseconds.
--
--    WHY THIS IS THE SAME ANSWER, ARM FOR ARM. The old body was
--        access(node) = (any direct arm of node) OR (access of any container of node)
--    which is exactly a disjunction of the direct arms over every node reachable upward through
--    containment. Every arm is a pure boolean test on (uid, node, required, include_public) with no
--    side effect, so the ORDER in which the disjuncts are evaluated cannot change the result: if any
--    arm on any reachable node is true, both forms return true; if none is, both return false. The
--    only behaviour that changes is the one being fixed — the walk now always terminates, in
--    bounded work. (This is why the late org lanes, which the recursive body evaluated AFTER the
--    reachability loop and BEFORE the FK loop, are evaluated with the rest of that node's arms here.)
--
--    `p_path` keeps its meaning and its shape: it SEEDS the visited set. A caller that hands the
--    kernel a path already containing the frame it is asked about still gets `false` + the warning,
--    and a path of >= 32 entries still trips the depth ceiling, so every existing caller, the
--    migration's own GREEN block and the guard's first two assertions are unchanged.
--
--    A WORK CEILING (1024 expanded nodes) replaces the 32-frame ceiling as the backstop and
--    announces itself with the node it stopped on and a remedy. It is a bound on how much of the
--    graph one access question may read, not on how deep a legitimate tree may be: a 40-deep
--    folder chain now answers TRUE (the old 32-frame ceiling denied it, loudly in the log and
--    silently to the person). That is strictly fewer false denials, at strictly less cost.
--
-- 2. THE WRITE DOORS DECIDE FROM THE **EDGES**, NOT FROM THE DEPTH-8 CACHE.
--    `platform.containment_reaches(from, target)` walks the real containment edges —
--    `platform.containment_edges` (associations x active carrying association types) AND the
--    `platform.entity_relationships` composition/containment FK parents — upward from a node with
--    its own visited set and its own node ceiling. Both doors ask it. A ring of ANY length is
--    refused at the edge that closes it, and a cycle that mixes an association hop with an FK-parent
--    hop is refused too, which neither door could see before.
--
-- 3. A DECLARED LOOP IS NOT AN INCIDENT. `platform.carrying_cycle_is_declared()` answers whether a
--    reported pair is joined, in both directions, ONLY by edges whose association type declares
--    `allows_loops = true`. `platform.undeclared_carrying_cycles()` is the detector the incident and
--    the guard use, so a deliberate, declared loop (the gate corpus's own) no longer files an
--    `ops.system_error` row and no longer turns the guard red.
--
-- RED, PROVEN ON THE BRANCH ksfhewuxgxwavkpceein BEFORE THIS FILE (rolled back):
--   ring of  9 nodes -> closing edge REFUSED 23514
--   ring of 10 nodes -> closing edge ACCEPTED; iam.has_access_for_base(...) inside it ->
--                       ERROR 57014 canceling statement due to statement timeout after 60,099 ms
-- GREEN is asserted at the end of this file and RAISES if it does not hold.
--
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 1cf8cad23afe683113b02379f53e4a9ac3df00ef8bbe8e0f8c82e7c9f89a8295
-- based-on: platform.enforce_no_carrying_cycle() 8cee7507a86261ea0f9393ad0f3ee484d711a3c8feded2beb78e36de02fa0f47
-- based-on: platform.enforce_no_fk_parent_cycle() c36dafe893e636ef00085347f8b78634081891e87048d83e4772f2f57402e7d8
-- based-on: platform.audit_carrying_cycles() bbe084b304ab4611f66fd88869ec3d821ff90df92cc20b6be8e3c76ac5548634
-- based-on: iam.entity_read_kernel_expected() 2e34b9b77c8ec03c160ad05e7a7d4607c882da8b00e37ab5029dff945a66475b

-- ============================== 1. THE BOUNDED-WORK KERNEL ==============================
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_child_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the DD-263 header: the
  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because
  -- entity_row_access_attrs hard-codes o_vis := 'personal' for a table with no
  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).
  v_containment_carries boolean;
  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.
  -- iam.entity_read_expr decides which arms to EMIT from this function; this function
  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token
  -- resolves to `private` here rather than raising: the kernel cannot refuse, because
  -- refusing at runtime is denying a person their own data — so it fails toward privacy
  -- while iam.apply_rls refuses outright (chair R3, both directions).
  v_lanes platform.lane_set;
  -- 🚨 DD-263b (2026-09-15) — THE WALK IS BOUNDED IN **WORK**. See this migration's header.
  -- The containment walk is an explicit breadth-first frontier inside THIS frame. v_visited holds
  -- every node key already expanded across the WHOLE walk (seeded from p_path, which is how a
  -- caller hands in frames it has already resolved), so each node is expanded at most once and the
  -- cost is O(distinct ancestors) rather than O(paths). c_max_depth still refuses an inbound path
  -- at 32; c_max_nodes is the backstop on how much graph ONE access question may read.
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_visited text[];
  v_q_type text[]; v_q_id uuid[]; v_q_pub boolean[];
  v_head integer := 1; v_expanded integer := 0;
  v_type text; v_id uuid; v_pub boolean; v_key text;
begin
  if v_uid is null then return false; end if;
  v_visited := coalesce(p_path, ARRAY[]::text[]);
  v_key := p_type || ':' || p_id::text || ':' || (case when p_include_public then 't' else 'f' end);
  if v_visited @> ARRAY[v_key] then
    -- A CYCLE, handed in by a caller that is already resolving this very frame. Not an exception —
    -- the caller asked an access question and must get an ANSWER. `false` is the correct one: the
    -- outer frame is still being evaluated, so if it could have said `true` it would already have.
    raise warning 'iam.has_access_for_base: CARRYING CYCLE refused — % is already on the walk. Path: %. '
      'Answering false (correct: a frame still being evaluated cannot grant through itself). '
      'THIS IS A DATA DEFECT: run select * from platform.undeclared_carrying_cycles() to name it, and '
      'select platform.audit_carrying_cycles() to file it; break the loop by soft-deleting one of '
      'the platform.associations rows (or clearing the parent_id) that closes it.',
      v_key, array_to_string(v_visited || v_key, ' -> ');
    return false;
  end if;
  if coalesce(array_length(p_path, 1), 0) >= c_max_depth then
    raise warning 'iam.has_access_for_base: DEPTH CEILING % reached at %. Path: %. Answering false — '
      'a caller handed in more than % resolved frames. Investigate the path before raising the ceiling.',
      c_max_depth, v_key, array_to_string(v_visited || v_key, ' -> '), c_max_depth;
    return false;
  end if;

  v_q_type := ARRAY[p_type]; v_q_id := ARRAY[p_id]; v_q_pub := ARRAY[p_include_public];

  <<walk>>
  while v_head <= coalesce(array_length(v_q_type, 1), 0) loop
    v_type := v_q_type[v_head]; v_id := v_q_id[v_head]; v_pub := v_q_pub[v_head];
    v_head := v_head + 1;
    v_key := v_type || ':' || v_id::text || ':' || (case when v_pub then 't' else 'f' end);
    continue walk when v_visited @> ARRAY[v_key];
    v_visited := v_visited || v_key;
    v_expanded := v_expanded + 1;
    if v_expanded > c_max_nodes then
      -- The backstop. A single access question has read more of the containment graph than any
      -- real containment can present. Fail closed and SAY SO rather than run to a timeout.
      raise warning 'iam.has_access_for_base: WORK CEILING % nodes reached at %, asking about %:%. '
        'Answering false — the containment graph above this record is larger than one access '
        'question may read. Someone may be denied access they hold. Run '
        'select * from platform.undeclared_carrying_cycles() first: a loop is the usual cause.',
        c_max_nodes, v_key, p_type, p_id;
      return false;
    end if;

    select et.schema_name, et.table_name into v_schema, v_table
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
    v_lanes := iam.class_lanes(v_type);
    v_is_org_admin := null;

    if p_required = 'viewer'::public.permission_level
       and public.user_can_read_via_library_grant(v_uid, v_type, v_id)
    then return true; end if;
    -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
    -- everyone is readable by anyone signed in. The opt-in decides what you are
    -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
    -- grants (pilots, subscriptions) are excluded and stay targeted.
    if p_required = 'viewer'::public.permission_level
       and public.library_is_open(v_type, v_id)
    then return true; end if;
    if v_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, v_id) then return true; end if;
    if v_type = 'rulebook' and public.is_rulebook_curator(v_uid, v_id) then
      if p_required = 'viewer'::public.permission_level then return true; end if;
      if exists (select 1 from platform.rulebook rb
                  where rb.id = v_id and rb.status = 'draft' and rb.deleted_at is null)
      then return true; end if;
    end if;

    v_attrs := platform.entity_row_access_attrs(v_schema, v_table, v_id);
    v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
    continue walk when not coalesce(v_found, false);
    v_containment_carries := (v_vis is null
                              or v_vis >= 'internal'::platform.visibility
                              or not iam.table_has_visibility(v_schema, v_table));
    if v_owner = v_uid then return true; end if;
    -- 🚨 DD-136 (2026-09-12) — THE ORG-ADMIN LANE HONOURS `personal` VISIBILITY.
    -- This lane used to `return true` for any org owner/admin at viewer, with no
    -- visibility condition, while the two org lanes below are both guarded
    -- `v_vis >= 'internal'`. That single asymmetry meant `visibility='personal'`
    -- hid a row from a plain member and from nobody else: measured live, a plain
    -- member read 0 of other people's personal conversations and an org admin who
    -- is not a platform admin read 10,817 of them plus 74,485 messages, with no
    -- audit anywhere. Arman, 2026-09-12: the organization reaches a person's
    -- private data only through an audited emergency door, never by an admin
    -- browsing. The door is a GRANT (DD-137 generalises `public.hr_break_glass`),
    -- and a grant is already a first-class lane below — so the door needs no arm
    -- of its own and this guard leaves no bypass.
    --
    -- The `table_has_visibility` half is not a loophole: entity_row_access_attrs
    -- HARD-CODES o_vis := 'personal' for a table with no visibility column, so a
    -- bare `v_vis >= 'internal'` would strip this lane from 305 org-scoped tables
    -- that never declared a visibility contract and cannot hold a `personal` row
    -- at all. iam.entity_read_expr asks the SAME predicate, so the mirror and the
    -- kernel cannot drift on it (db-rules §6d).
    if p_required = 'viewer'::public.permission_level and v_org is not null then
      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
      -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
      -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
      -- 305 tables it spared are COMPONENTS, and a component has no visibility
      -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
      -- because it holds nothing private. It left every chat.message inside a
      -- `personal` conversation readable by the organization's admins after
      -- DD-136 had closed the conversation itself — 71,424 of them for one real
      -- admin. A component with a registered parent needs no role arm: its
      -- generated lane resolves the parent's accessible ids, so an admin who may
      -- read the parent still reads all of it, and an admin who may not, does not.
      -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)
      -- keeps a component/ledger token (NULL lanes — its access IS its parent's) exactly as
      -- it is; the parent it walks to is gated on its own class.
      if v_lanes.org_role_lane
         and v_is_org_admin
         and (v_vis >= 'internal'::platform.visibility
              or (not iam.table_has_visibility(v_schema, v_table)
                  and not iam.token_is_parented_component(v_type)))
      then return true; end if;
    end if;
    if v_pub and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
    -- 🚨 DD-185 (2026-09-13) — AND THE CLASS DECIDES WHETHER THIS ARM EXISTS AT ALL.
    -- This is the §6e global-readable system-organization lane, and it admits EVERY SIGNED-IN
    -- ACCOUNT — it asks about no membership, no role and no grant. Until this line it was
    -- unconditional, so a `confidential` row owned by the global-readable system org was readable
    -- by every signed-in user including a non-member (measured 0 -> 8, B-65). DD-174 fixed exactly
    -- this in the ledger branch; this is the same rule, in the resolver every other variant asks.
    -- The mirror (iam.entity_read_expr) drops the same arm in the same breath — the policy TEXT is
    -- what a real HTTP read runs against, the kernel is what the bounded has_access arm asks, and
    -- closing one without the other closes nothing (DD-170's lesson, the other way round).
    if v_pub and p_required = 'viewer'::public.permission_level
       and v_lanes.resolved_class in ('organization','public')
       and v_vis >= 'internal'::platform.visibility and v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
    -- DD-137b: our own staff go through the door too on the two private classes (§3.1
    -- derivation two). This is the runtime half of suppress_platform_admin_lane.
    -- DD-170 (2026-09-13): THE SAME WALL DD-165 GAVE THE OTHER STAFF ARMS, applied here too.
    -- This arm used to admit a super admin to ANY row owned by a global_readable system org
    -- with no visibility guard at all — the one staff arm DD-165 named but did not close
    -- (measured: 8 personal rows, browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
    -- agent.definition 1). Same predicate as the org-admin arm above: a table with a real
    -- visibility column is walled at >= internal; a table with none at all (and not a parented
    -- component, which has no visibility concept of its own) keeps the arm it always had.
    if v_lanes.platform_admin_lane
       and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(v_type)))
       and public.is_super_admin_for(v_uid) then return true; end if;
    if public.has_permission_for(v_uid, v_type, v_id, p_required) then return true; end if;
    if exists (
      select 1 from iam.memberships m
      join iam.membership_grant g on g.member_role = m.role and g.container_type in (v_type, '*')
      where m.container_type = v_type and m.container_id = v_id and m.user_id = v_uid
        and m.deleted_at is null and g.confers >= p_required) then return true; end if;
    if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, v_type, v_id) then return true; end if;
    -- DD-137b: the late org lanes, each answering to the class that owns it. The
    -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
    -- the lane exists, the row's own value says how far it reaches. DD-263b: evaluated with the
    -- rest of THIS node's arms rather than between the two containment walks; see the header —
    -- the result is a disjunction over the reachable nodes and cannot depend on the order.
    if v_vis >= 'internal'::platform.visibility and v_org is not null then
      if v_lanes.org_role_lane then
        if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
        if v_is_org_admin then return true; end if;
      end if;
      if v_lanes.org_member_lane
         and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
    end if;

    -- No arm on this node granted. Push its containers onto the frontier: the closure first, the
    -- registered FK parents second, both exactly as the recursive body walked them.
    if v_containment_carries then
      v_child_include_public := v_pub and (v_vis is null or v_vis = 'public'::platform.visibility);
      for rec in
        select r.container_type, r.container_id from platform.reachability r
        where r.item_type = v_type and r.item_id = v_id and r.max_level >= p_required
      loop
        if (rec.container_type, rec.container_id) is distinct from (v_type, v_id) then
          v_q_type := v_q_type || rec.container_type;
          v_q_id   := v_q_id   || rec.container_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
      for rec in
        select er.parent_type, er.fk_column from platform.entity_relationships er
        where er.child_type = v_type and er.kind in ('composition', 'containment')
        order by er.kind, er.parent_type, er.fk_column
      loop
        execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using v_id;
        if v_parent_id is not null then
          v_q_type := v_q_type || rec.parent_type;
          v_q_id   := v_q_id   || v_parent_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
    end if;
  end loop;
  return false;
end; $function$;

-- ============================== 2. CONTAINMENT REACH, FROM THE EDGES ==============================
-- The primitive both write doors ask. It reads the EDGES — `platform.containment_edges`
-- (associations x active carrying types) and the registered composition/containment FK parents —
-- never `platform.reachability`, whose builder stops at depth 8 and which therefore cannot see the
-- closing edge of a longer ring. Its own visited set makes it O(nodes) and terminates on a graph
-- that already holds a declared loop.
CREATE OR REPLACE FUNCTION platform.containment_reaches(
  p_from_type text, p_from_id uuid, p_target_type text, p_target_id uuid,
  p_max_nodes integer DEFAULT 5000)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_visited text[] := ARRAY[]::text[];
  v_qt text[] := ARRAY[p_from_type]; v_qi uuid[] := ARRAY[p_from_id];
  v_head integer := 1;
  v_t text; v_i uuid; v_key text; v_parent uuid; rec record;
BEGIN
  <<walk>>
  WHILE v_head <= COALESCE(array_length(v_qt, 1), 0) LOOP
    v_t := v_qt[v_head]; v_i := v_qi[v_head]; v_head := v_head + 1;
    v_key := v_t || ':' || v_i::text;
    CONTINUE walk WHEN v_visited @> ARRAY[v_key];
    v_visited := v_visited || v_key;
    IF (v_t, v_i) IS NOT DISTINCT FROM (p_target_type, p_target_id) THEN RETURN true; END IF;
    IF array_length(v_visited, 1) > p_max_nodes THEN
      -- Fail CLOSED on a write door: refuse the edge rather than accept it into a graph this
      -- function could not finish reading, and say why.
      RAISE WARNING 'platform.containment_reaches: ceiling of % nodes reached walking up from %:% — '
        'answering "reaches" so the write is refused rather than accepted unverified. '
        'The containment graph above that record needs attention.', p_max_nodes, p_from_type, p_from_id;
      RETURN true;
    END IF;
    FOR rec IN
      SELECT ce.container_type AS ct, ce.container_id AS ci
      FROM platform.containment_edges ce
      WHERE ce.item_type = v_t AND ce.item_id = v_i
    LOOP
      v_qt := v_qt || rec.ct; v_qi := v_qi || rec.ci;
    END LOOP;
    FOR rec IN
      SELECT er.parent_type AS pt, er.fk_column AS fk, et.schema_name AS sn, et.table_name AS tn
      FROM platform.entity_relationships er
      JOIN platform.entity_types et ON et.token = er.child_type AND et.is_active
      WHERE er.child_type = v_t AND er.kind IN ('composition', 'containment')
    LOOP
      EXECUTE format('select %I from %I.%I where id = $1', rec.fk, rec.sn, rec.tn) INTO v_parent USING v_i;
      IF v_parent IS NOT NULL THEN v_qt := v_qt || rec.pt; v_qi := v_qi || v_parent; END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END $function$;

REVOKE ALL ON FUNCTION platform.containment_reaches(text, uuid, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.containment_reaches(text, uuid, text, uuid, integer) TO service_role;

-- ============================== 3. A DECLARED LOOP IS NOT AN INCIDENT ==============================
-- True when the reported pair is joined in BOTH directions using ONLY edges whose association type
-- declares `allows_loops = true` — i.e. the loop is the one somebody deliberately declared, not one
-- that slipped through. The gate corpus builds exactly such a loop on purpose.
CREATE OR REPLACE FUNCTION platform.carrying_cycle_is_declared(
  p_a_type text, p_a_id uuid, p_b_type text, p_b_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH RECURSIVE declared_edge AS (
    SELECT CASE WHEN at.container_side = 'source' THEN a.source_type ELSE a.target_type END AS container_type,
           CASE WHEN at.container_side = 'source' THEN a.source_id   ELSE a.target_id   END AS container_id,
           CASE WHEN at.container_side = 'source' THEN a.target_type ELSE a.source_type END AS item_type,
           CASE WHEN at.container_side = 'source' THEN a.target_id   ELSE a.source_id   END AS item_id
    FROM platform.associations a
    JOIN platform.association_types at
      ON at.source_type = a.source_type AND at.target_type = a.target_type
     AND (at.label IS NULL OR at.label = a.label)
    WHERE a.deleted_at IS NULL AND at.is_active
      AND at.container_side IN ('source', 'target') AND at.allows_loops
  ),
  up_a (t, i) AS (
    SELECT p_a_type, p_a_id
    UNION
    SELECT e.container_type, e.container_id FROM up_a JOIN declared_edge e ON e.item_type = up_a.t AND e.item_id = up_a.i
  ),
  up_b (t, i) AS (
    SELECT p_b_type, p_b_id
    UNION
    SELECT e.container_type, e.container_id FROM up_b JOIN declared_edge e ON e.item_type = up_b.t AND e.item_id = up_b.i
  )
  SELECT EXISTS (SELECT 1 FROM up_a WHERE up_a.t = p_b_type AND up_a.i = p_b_id)
     AND EXISTS (SELECT 1 FROM up_b WHERE up_b.t = p_a_type AND up_b.i = p_a_id)
$function$;

-- The detector the incident and the guard use: every cycle that nobody declared.
CREATE OR REPLACE FUNCTION platform.undeclared_carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT c.a_type, c.a_id, c.b_type, c.b_id, c.shape
  FROM platform.carrying_cycles() c
  WHERE NOT platform.carrying_cycle_is_declared(c.a_type, c.a_id, c.b_type, c.b_id)
$function$;

REVOKE ALL ON FUNCTION platform.carrying_cycle_is_declared(text, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.undeclared_carrying_cycles() FROM PUBLIC;

-- The incident files only what nobody declared.
CREATE OR REPLACE FUNCTION platform.audit_carrying_cycles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_n bigint; v_sample jsonb; v_open_id uuid; v_error_id uuid; v_occ int := 1; v_declared bigint;
BEGIN
  SELECT count(*) INTO v_declared FROM platform.carrying_cycles();
  WITH c AS MATERIALIZED (SELECT * FROM platform.undeclared_carrying_cycles())
  SELECT (SELECT count(*) FROM c),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM c ORDER BY 1,2,3,4 LIMIT 25) s), '[]'::jsonb)
  INTO v_n, v_sample;
  v_declared := v_declared - v_n;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('cycles', 0, 'declared', v_declared, 'incident', null, 'checked_at', now());
  END IF;

  RAISE WARNING 'audit_carrying_cycles: % undeclared carrying cycle(s) present — every NEGATIVE access question on a record inside one is answered false by a bounded walk and logged (DD-263)', v_n;

  SELECT e.id INTO v_open_id FROM ops.system_error e
  WHERE e.kind = 'carrying_cycle_detected' AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (kind, error_type, source_app, route, error_text, context)
    VALUES (
      'carrying_cycle_detected', 'CarryingCycle', 'postgres', 'db:platform.audit_carrying_cycles',
      format('%s undeclared carrying cycle(s) exist in platform.reachability: two or more records '
             'each contain the other through a carrying relation. Since DD-263 the access kernel '
             'answers false and warns instead of crashing, so nobody is locked out by a stack '
             'overflow — but a record inside a cycle can be DENIED access that a container would '
             'otherwise convey. THIS IS A DEFECT: break the '
             'loop (soft-delete one platform.associations row, or clear the parent_id that closes '
             'it), or declare the relation type allows_loops = true if the loop is deliberate. '
             'Evidence in context.sample.', v_n),
      jsonb_build_object('cycles', v_n, 'declared', v_declared, 'sample', v_sample, 'first_seen_at', now(),
                         'occurrences', 1, 'guard', 'carrying_cycle', 'severity', 'high')
    ) RETURNING id INTO v_error_id;
  ELSE
    v_error_id := v_open_id;
    SELECT COALESCE((e.context->>'occurrences')::int, 1) + 1 INTO v_occ
      FROM ops.system_error e WHERE e.id = v_error_id;
    UPDATE ops.system_error e
    SET context = e.context || jsonb_build_object('occurrences', v_occ, 'last_seen_at', now(),
                                                  'cycles', v_n, 'declared', v_declared, 'sample', v_sample)
    WHERE e.id = v_error_id;
  END IF;

  RETURN jsonb_build_object('cycles', v_n, 'declared', v_declared, 'sample', v_sample, 'incident_id', v_error_id,
                            'incident', CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
                            'checked_at', now());
END $function$;

-- ============================== 4. THE ASSOCIATION WRITE DOOR, FROM THE EDGES ==============================
-- WHY **AFTER** AND NOT BEFORE (unchanged from DD-263, and still true): in a SINGLE multi-row INSERT
-- that plants both halves of a loop at once, a BEFORE ROW trigger on the second row cannot see the
-- first — AFTER ROW events are queued until every row of the statement is in the table. Measured: a
-- BEFORE version let the gate corpus seed its own two-row loop straight through.
-- WHAT CHANGED (DD-263b): the decision no longer asks `platform.reachability`, whose builder stops
-- at depth 8 and so could not see a ring of ten or more. It walks the real edges.
CREATE OR REPLACE FUNCTION platform.enforce_no_carrying_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec record; v_ct text; v_cid uuid; v_it text; v_iid uuid;
BEGIN
  -- A soft-deleted edge carries nothing, so it can close nothing.
  IF NEW.deleted_at IS NOT NULL THEN RETURN NULL; END IF;

  -- Every registered type row this edge matches, exactly as platform.containment_edges joins them.
  FOR rec IN
    SELECT at.container_side, at.allows_loops
    FROM platform.association_types at
    WHERE at.source_type = NEW.source_type
      AND at.target_type = NEW.target_type
      AND (at.label IS NULL OR at.label = NEW.label)
      AND at.is_active
      AND at.container_side IN ('source', 'target')
  LOOP
    IF rec.allows_loops THEN CONTINUE; END IF;
    IF rec.container_side = 'source' THEN
      v_ct := NEW.source_type; v_cid := NEW.source_id; v_it := NEW.target_type; v_iid := NEW.target_id;
    ELSE
      v_ct := NEW.target_type; v_cid := NEW.target_id; v_it := NEW.source_type; v_iid := NEW.source_id;
    END IF;

    IF (v_ct, v_cid) IS NOT DISTINCT FROM (v_it, v_iid) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('This relation would put %s %s inside itself.', v_ct, v_cid),
        DETAIL  = 'DD-263: a carrying relation may not close a loop — a record inside a loop makes '
                  'every access question about it walk the loop.',
        HINT    = 'Pick a different container, or set platform.association_types.allows_loops = true '
                  'for this relation type if the loop is deliberate and its consumers are cycle-safe.';
    END IF;

    -- DD-263b: walk the EDGES upward from the container looking for the item. A ring of ANY length
    -- closes here, including one that mixes association hops with FK-parent hops.
    IF platform.containment_reaches(v_ct, v_cid, v_it, v_iid) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('This relation would create a loop: %s %s is already inside %s %s.',
                         v_ct, v_cid, v_it, v_iid),
        DETAIL  = 'DD-263: a carrying relation may not close a loop — a record inside a loop makes '
                  'every access question about it walk the loop.',
        HINT    = 'Move the other one out first, or set platform.association_types.allows_loops = '
                  'true for this relation type if the loop is deliberate and its consumers are '
                  'cycle-safe.';
    END IF;
  END LOOP;

  RETURN NULL;
END $function$;

-- ============================== 5. THE FK-PARENT WRITE DOOR ==============================
-- Generic: reads platform.entity_relationships, so it is the SAME rule for any self-referential
-- registered composition/containment relationship, not a folder special case.
-- DD-263b: after its own FK-chain walk it asks platform.containment_reaches as well, so a loop that
-- leaves the FK chain and comes back through an ASSOCIATION hop is refused too.
CREATE OR REPLACE FUNCTION platform.enforce_no_fk_parent_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fk text := TG_ARGV[0];
  v_new_parent uuid;
  v_cur uuid;
  v_id uuid;
  v_depth int := 0;
  v_token text;
  v_tbl text := quote_ident(TG_TABLE_SCHEMA) || '.' || quote_ident(TG_TABLE_NAME);
BEGIN
  -- to_jsonb rather than a composite EXECUTE parameter: passing NEW as $1 to a dynamic statement
  -- leaves its type undeterminable in a generic trigger and fails at runtime.
  v_new_parent := NULLIF(to_jsonb(NEW) ->> v_fk, '')::uuid;
  v_id         := NULLIF(to_jsonb(NEW) ->> 'id', '')::uuid;
  IF v_new_parent IS NULL THEN RETURN NEW; END IF;
  IF v_new_parent = v_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('This would put %s %s inside itself.', TG_TABLE_NAME, v_id),
      DETAIL  = 'DD-263: a containment parent may not close a loop.',
      HINT    = 'Pick a different parent.';
  END IF;
  -- Walk UP from the proposed parent. If we reach this row, the move closes a loop.
  v_cur := v_new_parent;
  WHILE v_cur IS NOT NULL AND v_depth < 100 LOOP
    IF v_cur = v_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('This would create a loop: %s %s is already inside %s %s.',
                         TG_TABLE_NAME, v_new_parent, TG_TABLE_NAME, v_id),
        DETAIL  = 'DD-263: a containment parent may not close a loop — a record inside a loop makes '
                  'every access question about it walk the loop.',
        HINT    = 'Move the destination out of this one first.';
    END IF;
    v_depth := v_depth + 1;
    EXECUTE format('select %I from %s where id = $1', v_fk, v_tbl) INTO v_cur USING v_cur;
  END LOOP;
  IF v_depth >= 100 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('The %s parent chain above %s is deeper than 100 or already looped.',
                       TG_TABLE_NAME, v_new_parent),
      DETAIL  = 'DD-263: refused rather than accepted into an unverifiable chain.',
      HINT    = 'Run select * from platform.undeclared_carrying_cycles() and fix the existing chain first.';
  END IF;
  -- DD-263b: the same question over the WHOLE containment graph, so an FK move that closes a loop
  -- through an association hop is refused as well.
  SELECT et.token INTO v_token FROM platform.entity_types et
   WHERE et.schema_name = TG_TABLE_SCHEMA AND et.table_name = TG_TABLE_NAME AND et.is_active LIMIT 1;
  IF v_token IS NOT NULL AND platform.containment_reaches(v_token, v_new_parent, v_token, v_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('This would create a loop: %s %s is already inside %s %s (through a carrying relation).',
                       TG_TABLE_NAME, v_new_parent, TG_TABLE_NAME, v_id),
      DETAIL  = 'DD-263: a containment parent may not close a loop — a record inside a loop makes '
                'every access question about it walk the loop.',
      HINT    = 'Move the destination out of this one first, or remove the association that carries it.';
  END IF;
  RETURN NEW;
END $function$;

-- ============================== 6. RE-STAMP THE FINGERPRINT ==============================
DO $fp$
DECLARE v_new_fp text;
BEGIN
  SELECT iam.entity_read_kernel_fingerprint() INTO v_new_fp;
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $body$ select %L::text $body$$f$,
    v_new_fp);
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'dd263b: fingerprint re-stamp failed to take — actual % expected %',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  RAISE NOTICE 'dd263b: entity_read_kernel_expected() re-stamped to %', v_new_fp;
END $fp$;

-- ============================== 7. GREEN, PROVEN, NOT ASSUMED ==============================
DO $green$
DECLARE
  v_ans boolean; v_cycles bigint; v_bound boolean; v_src text;
BEGIN
  -- 7a. AN ON-STACK FRAME HANDED IN IS STILL REFUSED (every DD-263 caller and the guard rely on it).
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true,
           ARRAY['folder:00000000-0000-4000-8000-0000000000fe:t'])
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the on-stack frame was not refused (got %)', v_ans;
  END IF;

  -- 7b. THE DEPTH CEILING ON AN INBOUND PATH STILL FIRES.
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true,
           (SELECT array_agg('x:' || g::text) FROM generate_series(1, 40) g))
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the depth ceiling did not refuse (got %)', v_ans;
  END IF;

  -- 7c. THE FIVE-ARGUMENT DELEGATE STILL ANSWERS (every RLS policy calls this one).
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true)
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the 5-arg delegate answered % for a nonexistent row', v_ans;
  END IF;

  -- 7d. BOTH WRITE DOORS ARE BOUND AND ENABLED.
  SELECT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'platform.associations'::regclass
                   AND t.tgname = 'trg_associations_zz_no_carrying_cycle' AND t.tgenabled <> 'D')
     AND EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'files.folders'::regclass
                   AND t.tgname = 'trg_cld_folders_no_parent_cycle' AND t.tgenabled <> 'D')
    INTO v_bound;
  IF NOT v_bound THEN RAISE EXCEPTION 'dd263b: GREEN failed — a cycle-refusal trigger is not bound/enabled'; END IF;

  -- 7e. EVERY self-referential registered containment/composition relationship has a bound refusal.
  PERFORM 1 FROM platform.entity_relationships er
  JOIN platform.entity_types et ON et.token = er.child_type AND et.is_active
  WHERE er.kind IN ('composition','containment') AND er.child_type = er.parent_type
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = (quote_ident(et.schema_name) || '.' || quote_ident(et.table_name))::regclass
        AND p.proname = 'enforce_no_fk_parent_cycle' AND t.tgenabled <> 'D');
  IF FOUND THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — a self-referential containment relationship has no bound cycle refusal';
  END IF;

  -- 7f. THE DOOR NO LONGER DECIDES FROM THE DEPTH-8 CACHE. Structural, because the live ten-node
  --     RING proof plants rows and belongs where it can be rolled back: it is assertion 3 of
  --     `pnpm check:access-kernel-bounded`, which plants a ten-node ring inside a transaction it
  --     always rolls back, and whose --self-test proves that plant RED against the pre-DD-263b body.
  --     Here we assert only what can be asserted without writing a row to a live database.
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = 'enforce_no_carrying_cycle';
  IF v_src LIKE '%platform.reachability%' THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the association write door still reads platform.reachability, whose builder stops at depth 8 and cannot see a ring of ten';
  END IF;
  IF v_src NOT LIKE '%containment_reaches%' THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the association write door does not ask platform.containment_reaches';
  END IF;
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'platform' AND p.proname = 'enforce_no_fk_parent_cycle';
  IF v_src NOT LIKE '%containment_reaches%' THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the FK-parent write door does not ask platform.containment_reaches';
  END IF;

  -- The edge walker itself answers, and answers false, for two nodes that do not exist.
  IF platform.containment_reaches('folder', '00000000-0000-4000-8000-0000000000fd'::uuid,
                                  'folder', '00000000-0000-4000-8000-0000000000fc'::uuid) THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — containment_reaches claimed a path between two nonexistent nodes';
  END IF;

  -- And the kernel's own walk is a frontier, not a recursion: no self-call remains in its body.
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'iam' AND p.proname = 'has_access_for_base' AND p.pronargs = 6;
  IF v_src LIKE '%iam.has_access_for_base(v_uid%' THEN
    RAISE EXCEPTION 'dd263b: GREEN failed — the kernel still calls itself; the walk is not bounded in work';
  END IF;

  -- 7g. THE GRAPH IS CLEAN RIGHT NOW (declared loops excluded), and if it is not, the incident is
  --     filed rather than assumed.
  SELECT count(*) INTO v_cycles FROM platform.undeclared_carrying_cycles();
  IF v_cycles > 0 THEN
    PERFORM platform.audit_carrying_cycles();
    RAISE WARNING 'dd263b: % pre-existing undeclared carrying cycle(s) — incident filed', v_cycles;
  END IF;

  RAISE NOTICE 'dd263b GREEN: the walk is bounded in work, both write doors decide from the edges, % undeclared carrying cycle(s) present', v_cycles;
END $green$;
