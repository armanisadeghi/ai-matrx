-- iam_access_kernel_bounded_walk_dd263 — DD-263: THE ACCESS KERNEL WALKS A CYCLE FOREVER.
--
-- THE FINDING (the seeded gate corpus, 2026-09-15, branch ksfhewuxgxwavkpceein)
-- ----------------------------------------------------------------------------
-- One of the corpus's 49 manifest pairs did not answer at all. Asked whether the principal who
-- holds NO grant of any kind may read a record that sits inside a CYCLE of carrying relations
-- (folder A contains folder B, folder B contains folder A), the live kernel does not answer
-- `false`: it recurses A -> B -> A -> B ... until Postgres kills the statement with
-- `54001 stack depth limit exceeded`.
--
--   select iam.has_access_for_base('a0000000-0000-4000-8000-00000000000e',
--            'corpus_loop_b', 'b0000000-0000-4000-8000-000000000009', 'viewer', true);
--   ERROR: stack depth limit exceeded   (recursing on itself, line 132)
--
-- WHY. `iam.has_access_for_base` resolves containment by looping over `platform.reachability` and
-- CALLING ITSELF on each container, and again over `platform.entity_relationships` and calling
-- itself on each FK parent. Its ONLY cycle protection was
-- `(rec.container_type, rec.container_id) is distinct from (p_type, p_id)`, which stops a record
-- that contains ITSELF and nothing one hop longer. The depth ceiling everybody assumes is there
-- lives in `platform.derive_reachability` (`w.depth < 8` plus a path array) — the CLOSURE BUILDER,
-- which does terminate — not in the function that READS the closure. `iam.accessible_entity_ids`,
-- the set form, has its own bound (`p_depth > 12`) and was never affected. So of the three walks in
-- the access kernel, exactly one was unbounded, and it is the one every RLS policy calls per row.
--
-- WHY ONLY A **NEGATIVE** ANSWER CRASHES. Ask about a principal who DOES hold a grant on either
-- container and the recursion short-circuits on the first frame and answers `true` in microseconds.
-- Only the walk that must exhaust every path — the `false` answer — goes round the cycle. A test
-- that asserts access is GRANTED proves nothing here. This is the concrete argument for the gate's
-- "gained access must be zero" half.
--
-- SEVERITY, HONESTLY. It fails CLOSED: under RLS the statement errors, so nobody gains access and
-- nothing leaks. It is an availability and cost defect — reachable by any signed-in person who can
-- create two ordinary relations, costing the server an unbounded recursion per attempt, and it
-- surfaces as a BROKEN PAGE rather than a refusal, which law 4 (nothing fails silently, a screen
-- never lies) does not permit either.
--
-- HOW CLOSE PRODUCTION IS (measured on brsgrqvjdzwihsvnfqkf, 2026-09-15, before this file)
-- ---------------------------------------------------------------------------------------
--   * mutually-containing pairs in `platform.reachability`: 0
--   * self-containing rows in `platform.reachability`:      0
--   * folder parent_id cycles in `files.folders`:           0
-- and THREE doors stand open onto it, none of them guarded:
--   1. `platform.association_types` registers `file -> file` and
--      `content_ir_kind_instance -> content_ir_kind_instance`, both ACTIVE, both with
--      `container_side='target'` — two ordinary "move this into that" writes in opposite
--      directions arm the fault.
--   2. Any LONGER carrying cycle across two or more registered types (A contains B, B contains A
--      through different relation types) does the same and was equally unrefused.
--   3. `platform.entity_relationships` registers `folder -> folder via parent_id` as a
--      `containment` relationship, and `files.folders` carries NO parent-cycle trigger, so the FK
--      walk is armed by a plain "move folder A into folder B" pair as well. This door is NOT
--      reachable through `platform.associations` at all and would have survived a fix that only
--      guarded the association write door.
--
-- WHAT THIS FILE DOES — the class closed at the read end and at every write end
-- ----------------------------------------------------------------------------
-- 1. THE KERNEL CARRIES ITS OWN PATH. The whole body moves to a sixth parameter `p_path text[]`
--    holding the key `type:id:include_public` of every frame currently ON THE STACK. Re-entering a
--    frame already on the stack is, by definition, a cycle: the function returns `false` and RAISES
--    A WARNING naming the exact path. The five-argument and four-argument signatures are unchanged
--    in shape and keep every caller (every generated RLS policy) working byte for byte; the
--    five-argument one is now a one-line delegate that seeds an empty path.
--
--    WHY A STACK PATH AND NOT A MEMOISED VISITED SET: the answer for a frame is a pure function of
--    (uid, type, id, required, include_public), and `p_required` is invariant down the recursion
--    while `p_include_public` is part of the key — so pruning a frame that is ALREADY BEING
--    EVALUATED can never hide a `true` (the outer frame would have returned it). On an acyclic
--    graph this change prunes nothing at all: the answers are identical, provably, because no key
--    can repeat on a path without a cycle. It is a termination fix, not an access change.
--
--    A second, redundant DEPTH CEILING (32 frames) sits behind it as a backstop and announces
--    itself the same way. `platform.derive_reachability` stops the closure at depth 8 and
--    `iam.accessible_entity_ids` at 12; 32 is above anything either can present, so it can only
--    fire on something neither of them models — and it must fail closed and loudly rather than run
--    to the stack limit.
--
--    WHY A `RAISE WARNING` AND NOT AN `ops.system_error` ROW, SAID PLAINLY: the kernel is
--    `STABLE SECURITY DEFINER` and Postgres refuses any INSERT inside a non-volatile function
--    ("INSERT is not allowed in a non-volatile function"). Making it VOLATILE would destroy the
--    bounded-definer planner optimisation every generated policy depends on (THE PLAN §4.13 edge
--    14) — a far worse defect than the one being fixed. So the READ announces in the server log and
--    to the client, and the ROW is filed by `platform.audit_carrying_cycles()` below, which is
--    VOLATILE, is called by the guard, and is the thing that knows about cycles that already exist.
--
-- 2. THE WRITE DOORS REFUSE A CYCLE. `platform.association_types` gains `allows_loops boolean not
--    null default false` — Rule 5's "allowed to loop" property — and an AFTER INSERT/UPDATE trigger
--    on `platform.associations` refuses any edge whose carrying orientation would close a cycle,
--    unless the relation type declares `allows_loops = true`. The same refusal, generically written,
--    is bound to every self-referential registered `composition`/`containment` FK relationship —
--    today exactly `files.folders.parent_id`.
--
-- 3. THE DETECTOR AND THE INCIDENT. `platform.carrying_cycles()` names every cycle that exists;
--    `platform.audit_carrying_cycles()` files (or folds into) ONE open `ops.system_error` row of
--    kind `carrying_cycle_detected` when there is one, in the same file-first shape
--    `platform.heal_reachability_drift()` uses.
--
-- 4. THE FINGERPRINT. `iam.entity_read_kernel_fingerprint()` hashes `has_access_for_base`'s source,
--    so this file moves it; `iam.entity_read_kernel_expected()` is re-stamped at the end and the
--    re-stamp is asserted. NO ARM IS ADDED OR REMOVED, so `iam.entity_read_expr` (the RLS-policy
--    text mirror) is untouched and NO policy needs regenerating — the mirror mirrors which lanes
--    exist, and this change adds none.
--
-- RED (proven, branch ksfhewuxgxwavkpceein, whose kernel was byte-identical to production —
-- md5(prosrc) e37fdacb359b9a528d7aef6b2bfb5270 / 6f06342e0151932f978451d909a7d22e on both):
--   the corpus repro above -> ERROR 54001 stack depth limit exceeded.
-- GREEN is asserted at the end of this file and RAISES if it does not hold.
--
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean) bb10a6e7fedfb0c368a530fe0f8aa5a8bdd57b1b6d83ce2c73285df23e014326
-- based-on: iam.entity_read_kernel_expected() 8cc612af5d5f7d29be655dc3005579e510d1753f86a134baa18f571349b16f71

-- ============================== 1. THE BOUNDED KERNEL ==============================
-- The whole body, unchanged arm for arm, with `p_path` threaded through both recursive walks.
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_parent_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the header: the
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
  -- 🚨 DD-263 (2026-09-15) — THE WALK IS BOUNDED. See this migration's header.
  -- v_key identifies THIS FRAME. p_path holds every frame already on the stack. Both recursive
  -- walks below pass `p_path || v_key`, so a cycle is detected the moment it closes, at the frame
  -- that closes it, with the whole path available to name in the warning.
  c_max_depth constant integer := 32;
  v_key text;
  v_child_path text[];
begin
  if v_uid is null then return false; end if;
  v_key := p_type || ':' || p_id::text || ':' || (case when p_include_public then 't' else 'f' end);
  if p_path @> ARRAY[v_key] then
    -- A CYCLE. Not an exception — the caller asked an access question and must get an ANSWER.
    -- `false` is the correct answer: every frame on this path is still being evaluated, so if any
    -- of them could have said `true` it would already have returned it without coming back here.
    raise warning 'iam.has_access_for_base: CARRYING CYCLE refused — % is already on the walk. Path: %. '
      'Answering false (correct: a frame still being evaluated cannot grant through itself). '
      'THIS IS A DATA DEFECT: run select * from platform.carrying_cycles() to name it, and '
      'select platform.audit_carrying_cycles() to file it; break the loop by soft-deleting one of '
      'the platform.associations rows (or clearing the parent_id) that closes it.',
      v_key, array_to_string(p_path || v_key, ' -> ');
    return false;
  end if;
  if coalesce(array_length(p_path, 1), 0) >= c_max_depth then
    -- The backstop. platform.derive_reachability stops at depth 8 and iam.accessible_entity_ids at
    -- 12, so nothing either of them models can reach 32 frames; getting here means the containment
    -- graph grew a shape neither models. Fail closed, and SAY SO rather than run to 54001.
    raise warning 'iam.has_access_for_base: DEPTH CEILING % reached at %. Path: %. Answering false — '
      'this is deeper than platform.derive_reachability (8) or iam.accessible_entity_ids (12) can '
      'produce, so the containment graph has a shape neither models. Someone may be denied access '
      'they hold. Investigate the path before raising the ceiling.',
      c_max_depth, v_key, array_to_string(p_path || v_key, ' -> ');
    return false;
  end if;
  v_child_path := p_path || v_key;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;
  v_lanes := iam.class_lanes(p_type);

  if p_required = 'viewer'::public.permission_level
     and public.user_can_read_via_library_grant(v_uid, p_type, p_id)
  then return true; end if;
  -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
  -- everyone is readable by anyone signed in. The opt-in decides what you are
  -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
  -- grants (pilots, subscriptions) are excluded and stay targeted.
  if p_required = 'viewer'::public.permission_level
     and public.library_is_open(p_type, p_id)
  then return true; end if;
  if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id) then return true; end if;
  if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
    if p_required = 'viewer'::public.permission_level then return true; end if;
    if exists (select 1 from platform.rulebook rb
                where rb.id = p_id and rb.status = 'draft' and rb.deleted_at is null)
    then return true; end if;
  end if;

  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;
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
                and not iam.token_is_parented_component(p_type)))
    then return true; end if;
  end if;
  if p_include_public and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
  -- 🚨 DD-185 (2026-09-13) — AND THE CLASS DECIDES WHETHER THIS ARM EXISTS AT ALL.
  -- This is the §6e global-readable system-organization lane, and it admits EVERY SIGNED-IN
  -- ACCOUNT — it asks about no membership, no role and no grant. Until this line it was
  -- unconditional, so a `confidential` row owned by the global-readable system org was readable
  -- by every signed-in user including a non-member (measured 0 -> 8, B-65). DD-174 fixed exactly
  -- this in the ledger branch; this is the same rule, in the resolver every other variant asks.
  -- The mirror (iam.entity_read_expr) drops the same arm in the same breath — the policy TEXT is
  -- what a real HTTP read runs against, the kernel is what the bounded has_access arm asks, and
  -- closing one without the other closes nothing (DD-170's lesson, the other way round).
  if p_include_public and p_required = 'viewer'::public.permission_level
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
          or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(p_type)))
     and public.is_super_admin_for(v_uid) then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1 from iam.memberships m
    join iam.membership_grant g on g.member_role = m.role and g.container_type in (p_type, '*')
    where m.container_type = p_type and m.container_id = p_id and m.user_id = v_uid
      and m.deleted_at is null and g.confers >= p_required) then return true; end if;
  if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, p_type, p_id) then return true; end if;
  for rec in
    select r.container_type, r.container_id from platform.reachability r
    where r.item_type = p_type and r.item_id = p_id and r.max_level >= p_required
      and v_containment_carries
  loop
    -- DD-263: the `is distinct from` self-check below is KEPT — it is the depth-zero case and
    -- catching it here costs nothing — but the real guarantee is now `v_child_path`.
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(v_uid, rec.container_type, rec.container_id, p_required,
             p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility),
             v_child_path)
    then return true; end if;
  end loop;
  -- DD-137b: the late org lanes, each answering to the class that owns it. The
  -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
  -- the lane exists, the row's own value says how far it reaches.
  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_lanes.org_role_lane then
      if v_is_org_admin is null then v_is_org_admin := public.is_org_admin_for(v_uid, v_org); end if;
      if v_is_org_admin then return true; end if;
    end if;
    if v_lanes.org_member_lane
       and p_required <= 'editor'::public.permission_level and iam.has_org_access_for(v_uid, v_org) then return true; end if;
  end if;
  v_parent_include_public := p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);
  for rec in
    select er.parent_type, er.fk_column from platform.entity_relationships er
    where er.child_type = p_type and er.kind in ('composition', 'containment')
      and v_containment_carries
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using p_id;
    -- DD-263: the FK parent walk is the SECOND unbounded walk and the one a folder-parent loop
    -- arms (`folder -> folder via parent_id` is a registered containment relationship). Same path.
    if v_parent_id is not null
       and iam.has_access_for_base(v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public,
             v_child_path)
    then return true; end if;
  end loop;
  return false;
end; $function$;

-- The five-argument signature every generated RLS policy and every other kernel function calls.
-- Same shape, same volatility, same cost, same search_path — a one-line delegate that seeds the
-- walk with an empty path. DD-263: the body it used to hold is the function above, arm for arm.
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
begin
  return iam.has_access_for_base(p_user_id, p_type, p_id, p_required, p_include_public, ARRAY[]::text[]);
end;
$function$;

-- Exactly the ACL the five-argument signature carries today (postgres=X, service_role=X; PUBLIC's
-- default EXECUTE revoked). Nothing calls the six-argument form but the delegate above and itself,
-- and both run as the definer, so a wider grant would only be surface.
REVOKE ALL ON FUNCTION iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) TO service_role;

-- ============================== 2. RULE 5's "ALLOWED TO LOOP" PROPERTY ==============================
ALTER TABLE platform.association_types
  ADD COLUMN IF NOT EXISTS allows_loops boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN platform.association_types.allows_loops IS
  'DD-263. A carrying relation type (container_side source|target) may NOT close a cycle: two '
  'records that each contain the other make every negative access question on either of them walk '
  'the loop. The write doors refuse it. Set true ONLY for a relation type whose cycles are '
  'deliberate and whose consumers are cycle-safe; the read kernel stays bounded either way.';

-- ============================== 3. THE DETECTOR AND THE INCIDENT ==============================
CREATE OR REPLACE FUNCTION platform.carrying_cycles()
 RETURNS TABLE(a_type text, a_id uuid, b_type text, b_id uuid, shape text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Self-containment: a record that contains itself.
  SELECT r.container_type, r.container_id, r.item_type, r.item_id, 'self'::text
  FROM platform.reachability r
  WHERE (r.container_type, r.container_id) IS NOT DISTINCT FROM (r.item_type, r.item_id)
  UNION ALL
  -- Mutual containment: each reaches the other. `platform.reachability` is the CLOSURE, so this one
  -- pair-wise join finds a cycle of ANY length, not only the two-hop kind.
  SELECT r1.container_type, r1.container_id, r1.item_type, r1.item_id, 'mutual'::text
  FROM platform.reachability r1
  JOIN platform.reachability r2
    ON  r2.container_type = r1.item_type
    AND r2.container_id   = r1.item_id
    AND r2.item_type      = r1.container_type
    AND r2.item_id        = r1.container_id
  WHERE (r1.container_type, r1.container_id) IS DISTINCT FROM (r1.item_type, r1.item_id)
    AND (r1.container_type, r1.container_id::text) < (r1.item_type, r1.item_id::text)
$function$;

CREATE OR REPLACE FUNCTION platform.audit_carrying_cycles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_n bigint; v_sample jsonb; v_open_id uuid; v_error_id uuid; v_occ int := 1;
BEGIN
  WITH c AS MATERIALIZED (SELECT * FROM platform.carrying_cycles())
  SELECT (SELECT count(*) FROM c),
         COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM c ORDER BY 1,2,3,4 LIMIT 25) s), '[]'::jsonb)
  INTO v_n, v_sample;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('cycles', 0, 'incident', null, 'checked_at', now());
  END IF;

  RAISE WARNING 'audit_carrying_cycles: % carrying cycle(s) present — every NEGATIVE access question on a record inside one is answered false by a bounded walk and logged (DD-263)', v_n;

  SELECT e.id INTO v_open_id FROM ops.system_error e
  WHERE e.kind = 'carrying_cycle_detected' AND e.resolved_at IS NULL
  ORDER BY e.occurred_at DESC LIMIT 1;

  IF v_open_id IS NULL THEN
    INSERT INTO ops.system_error (kind, error_type, source_app, route, error_text, context)
    VALUES (
      'carrying_cycle_detected', 'CarryingCycle', 'postgres', 'db:platform.audit_carrying_cycles',
      format('%s carrying cycle(s) exist in platform.reachability: two or more records each contain '
             'the other through a carrying relation. Since DD-263 the access kernel answers false '
             'and warns instead of crashing with 54001, so nobody is locked out by a stack '
             'overflow — but a record inside a cycle can be DENIED access that a container would '
             'otherwise convey, and every read of it pays the walk. THIS IS A DEFECT: break the '
             'loop (soft-delete one platform.associations row, or clear the parent_id that closes '
             'it), or declare the relation type allows_loops = true if the loop is deliberate. '
             'Evidence in context.sample.', v_n),
      jsonb_build_object('cycles', v_n, 'sample', v_sample, 'first_seen_at', now(),
                         'occurrences', 1, 'guard', 'carrying_cycle', 'severity', 'high')
    ) RETURNING id INTO v_error_id;
  ELSE
    v_error_id := v_open_id;
    SELECT COALESCE((e.context->>'occurrences')::int, 1) + 1 INTO v_occ
      FROM ops.system_error e WHERE e.id = v_error_id;
    UPDATE ops.system_error e
    SET context = e.context || jsonb_build_object('occurrences', v_occ, 'last_seen_at', now(),
                                                  'cycles', v_n, 'sample', v_sample)
    WHERE e.id = v_error_id;
  END IF;

  RETURN jsonb_build_object('cycles', v_n, 'sample', v_sample, 'incident_id', v_error_id,
                            'incident', CASE WHEN v_open_id IS NULL THEN 'filed' ELSE 'folded_into_open' END,
                            'checked_at', now());
END $function$;

-- ============================== 4. THE ASSOCIATION WRITE DOOR ==============================
-- WHY **AFTER** AND NOT BEFORE. A BEFORE ROW trigger cannot see the cache: `platform.reachability`
-- is maintained by `trg_associations_reachability`, an AFTER ROW trigger, and Postgres queues AFTER
-- ROW events until the row is processed — so in a SINGLE multi-row INSERT that plants both halves of
-- a loop at once, the second row's BEFORE trigger looks at a cache that does not yet contain the
-- first row. Measured: a BEFORE version of this trigger let the gate corpus seed its own two-row
-- loop straight through. AFTER ROW, named to sort after `trg_associations_reachability`, sees the
-- cache the kernel will actually read, so the refusal and the read agree by construction.
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

    -- The cache already carries this edge (this trigger runs after the one that maintains it), so a
    -- loop of ANY length shows up as "the item also contains the container".
    IF EXISTS (
      SELECT 1 FROM platform.reachability rr
      WHERE rr.container_type = v_it AND rr.container_id = v_iid
        AND rr.item_type      = v_ct AND rr.item_id      = v_cid
    ) THEN
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

DROP TRIGGER IF EXISTS trg_associations_no_carrying_cycle ON platform.associations;
DROP TRIGGER IF EXISTS trg_associations_zz_no_carrying_cycle ON platform.associations;
-- `zz_` so it fires AFTER `trg_associations_reachability` has written the edge into the cache.
CREATE TRIGGER trg_associations_zz_no_carrying_cycle
  AFTER INSERT OR UPDATE ON platform.associations
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_no_carrying_cycle();

-- ============================== 5. THE FK-PARENT WRITE DOOR ==============================
-- Generic: reads platform.entity_relationships, so it is the SAME rule for any self-referential
-- registered composition/containment relationship, not a folder special case.
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
      HINT    = 'Run select * from platform.carrying_cycles() and fix the existing chain first.';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cld_folders_no_parent_cycle ON files.folders;
CREATE TRIGGER trg_cld_folders_no_parent_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON files.folders
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_no_fk_parent_cycle('parent_id');

-- ============================== 6. RE-STAMP THE FINGERPRINT ==============================
DO $fp$
DECLARE v_new_fp text;
BEGIN
  SELECT iam.entity_read_kernel_fingerprint() INTO v_new_fp;
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text LANGUAGE sql IMMUTABLE AS $body$ select %L::text $body$$f$,
    v_new_fp);
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'dd263: fingerprint re-stamp failed to take — actual % expected %',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
  RAISE NOTICE 'dd263: entity_read_kernel_expected() re-stamped to %', v_new_fp;
END $fp$;

-- ============================== 7. GREEN, PROVEN, NOT ASSUMED ==============================
DO $green$
DECLARE
  v_ans boolean; v_cycles bigint; v_bound boolean;
BEGIN
  -- 7a. THE BOUND FIRES AND ANSWERS. Hand the kernel a path that already carries its own frame —
  -- the exact state a cycle produces — and it must return false, not recurse, with no data planted.
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true,
           ARRAY['folder:00000000-0000-4000-8000-0000000000fe:t'])
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263: GREEN failed — the on-stack frame was not refused (got %)', v_ans;
  END IF;

  -- 7b. THE DEPTH CEILING FIRES.
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true,
           (SELECT array_agg('x:' || g::text) FROM generate_series(1, 40) g))
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263: GREEN failed — the depth ceiling did not refuse (got %)', v_ans;
  END IF;

  -- 7c. THE FIVE-ARGUMENT DELEGATE STILL ANSWERS (every RLS policy calls this one).
  SELECT iam.has_access_for_base(
           '00000000-0000-4000-8000-0000000000ff'::uuid, 'folder',
           '00000000-0000-4000-8000-0000000000fe'::uuid, 'viewer'::public.permission_level, true)
    INTO v_ans;
  IF v_ans IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'dd263: GREEN failed — the 5-arg delegate answered % for a nonexistent row', v_ans;
  END IF;

  -- 7d. BOTH WRITE DOORS ARE BOUND AND ENABLED.
  SELECT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'platform.associations'::regclass
                   AND t.tgname = 'trg_associations_zz_no_carrying_cycle' AND t.tgenabled <> 'D')
     AND EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'files.folders'::regclass
                   AND t.tgname = 'trg_cld_folders_no_parent_cycle' AND t.tgenabled <> 'D')
    INTO v_bound;
  IF NOT v_bound THEN RAISE EXCEPTION 'dd263: GREEN failed — a cycle-refusal trigger is not bound/enabled'; END IF;

  -- 7e. EVERY self-referential registered containment/composition relationship has a bound refusal.
  --     A new one added later without its trigger is a hole; the guard asserts this too.
  PERFORM 1 FROM platform.entity_relationships er
  JOIN platform.entity_types et ON et.token = er.child_type AND et.is_active
  WHERE er.kind IN ('composition','containment') AND er.child_type = er.parent_type
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = (quote_ident(et.schema_name) || '.' || quote_ident(et.table_name))::regclass
        AND p.proname = 'enforce_no_fk_parent_cycle' AND t.tgenabled <> 'D');
  IF FOUND THEN
    RAISE EXCEPTION 'dd263: GREEN failed — a self-referential containment relationship has no bound cycle refusal';
  END IF;

  -- 7f. THE GRAPH IS CLEAN RIGHT NOW (and if it is not, the incident is filed rather than assumed).
  SELECT count(*) INTO v_cycles FROM platform.carrying_cycles();
  IF v_cycles > 0 THEN
    PERFORM platform.audit_carrying_cycles();
    RAISE WARNING 'dd263: % pre-existing carrying cycle(s) — incident filed; the kernel now answers them false instead of crashing', v_cycles;
  END IF;

  RAISE NOTICE 'dd263 GREEN: bound walk refuses an on-stack frame and the depth ceiling, 5-arg delegate answers, both write doors bound, % carrying cycle(s) present', v_cycles;
END $green$;
