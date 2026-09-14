-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DD-195 — AN ASSOCIATION DOOR REVEALS ONLY EDGES ITS CALLER MAY READ, AND SAYS SO (SECURITY)
--
-- WHAT WAS WRONG (measured live 2026-09-13, this database, rolled back)
-- --------------------------------------------------------------------
-- `platform.client_callable_door` declares of `public.assoc_for_entity`, `public.assoc_for_sources`
-- and `public.assoc_for_targets`:
--
--     "...every read and write goes through this definer chokepoint, which resolves access per
--      entity via iam.has_access before touching an edge."
--
-- Not one of the three has ever called `iam.has_access`. All three are SECURITY DEFINER — they
-- bypass `platform.associations`' RLS completely — and their whole gate was
-- `iam.org_readable(organization_id, <other side's token>)`: an ORGANIZATION-level question. A
-- member of the row's organization was handed every edge in that organization regardless of the
-- individual row's own lane. The register line was false as written (V-55 §7 proved the same thing
-- independently), and a declared reason that misdescribes its own gate is the most expensive kind of
-- wrong: it is the sentence the next reviewer trusts instead of reading the body.
--
-- THE RED, on real rows and real identities (no probes, nothing written):
--   `test@test.com` (4060701e-…) is a PLAIN MEMBER of admin's Workspace (884d1ce8-…).
--   `workbench.working_documents` 6fff109d-… is `confidential` class, `personal` visibility,
--   authored by `admin@admin.com`; it is linked to two `chat.conversation` rows (28437032-…,
--   7ba49d41-…) which are `private` class, `personal` visibility, also authored by admin@admin.com.
--   The kernel says `test@test.com` may read NONE of those three rows. The doors said:
--
--     assoc_for_entity('working_document', 6fff109d…)   -> 2 edges, revealing both conversations
--     assoc_for_targets('conversation', [the two ids])  -> 2 edges, revealing the document
--     assoc_for_sources('working_document', [6fff109d]) -> 2 edges, revealing both conversations
--       (iam.has_access on the revealed side, for that caller, on every one of those rows: FALSE)
--
-- THE FIX — THE KERNEL, PER EDGE, ON THE SIDE THE EDGE REVEALS
-- ------------------------------------------------------------
-- The organization question STAYS and a second one is added beside it, so the gate is a conjunction
-- and can only ever narrow:
--
--     iam.org_readable(a.organization_id, <revealed token>)   -- may I see edges of THIS edge's org?
--     and iam.assoc_side_readable(<revealed token>, <revealed id>)  -- may I read the row it reveals?
--
-- Dropping the first half was measured and rejected: it WIDENS. `agent` 6cb7be35-… carries five
-- edges, two of them owned by organizations the caller is not in (5dc930e9-…, 3e790542-…) whose
-- `surface` counterparts are public — so kernel-only took a signed-out visitor from 2 edges to 4 and
-- a signed-in non-member from 3 to 5. An edge is a row of `platform.associations` with its own
-- tenancy, its own label and its own metadata; who may see THE EDGE and who may see THE ROW IT
-- POINTS AT are two different questions and the door now asks both.
--
-- `iam.assoc_side_readable` is the second half, and it is a dispatcher, not a third opinion about
-- access:
--
--   * signed in  -> `iam.has_access(token, id, 'viewer')` verbatim. The kernel is the whole answer.
--   * signed out -> the kernel needs a uid and returns false for every row, so the one lane §3.1
--                   gives an anonymous caller is asked in the mirror's own words: the token's class
--                   must carry `anon_lane` (i.e. `public`) and the row's own `visibility` must be
--                   `public` — which is exactly the `pub_read` policy `iam.apply_rls` generates.
--
-- `iam.has_access` is never NARROWER than a table's own read policy: every arm `iam.entity_read_expr`
-- emits is lifted from `iam.has_access_for_base`, and the one unbounded arm it emits ends
-- `... AND iam.has_access(token, id, 'viewer')`. So gating an edge on the kernel can never hide a
-- row the caller could have read directly over PostgREST. That is why this is a gate and not a new
-- access rule.
--
-- WHAT THIS DELIBERATELY DOES **NOT** DO, and the measurement that decided it
-- --------------------------------------------------------------------------
-- It does not gate the ANCHOR the caller named (`p_id` / `p_source_ids` / `p_target_ids`). Gating it
-- as well was measured first, and it changes the ANONYMOUS shape the brief pins: `agent`
-- 6cb7be35-… is `organization` class, `internal`, owned by the global-readable Matrx System org, so
-- no anonymous caller can read it — yet its two `surface` counterparts are `public` class and
-- `public` visibility, and a signed-out visitor legitimately reads them today (2 rows). An anchor
-- gate takes that to 0. The residue is therefore named, not swept: a caller who already holds an id
-- they cannot read can still learn that an edge touches it, provided the OTHER side is readable to
-- them. In the RED above that residue is closed anyway — the revealed side is unreadable in all
-- three directions — but it is not closed by construction. Reported for its own row.
--
-- COST, on the largest live shapes (EXPLAIN ANALYZE, rolled back, as admin@admin.com)
-- -----------------------------------------------------------------------------------
-- Edges per anchor across all 31,840 live anchors: p50 = 1, p90 = 2, p99 = 10, max = 371.
-- `assoc_for_entity` on that ONE fattest anchor (`web_site` f8e332bb-…, 371 edges):
--     today                          35 ms
--     per-edge kernel gate          309 ms   (≈0.8 ms per edge; the plan is linear in edges)
-- At p99 that is ~8 ms and at p50 ~1 ms. `assoc_for_sources` / `assoc_for_targets` are bounded by
-- the caller's own id array. So NO bound is introduced here: a limit+cursor would change every
-- caller's contract to buy nothing at the shapes that exist, and the fattest anchor in the whole
-- database is a 300 ms read. The numbers are shapes, not an argument — if a surface ever starts
-- listing edges at volume, bound it THEN, and never by weakening this gate.
--
-- `iam.org_readable(uuid, text)` therefore stays exactly where it was, doing exactly what it is good
-- at — deciding whether the CALLER may see rows belonging to THIS EDGE'S organization. What it was
-- never able to do is decide anything about the row at the other end, and that is now somebody
-- else's job. Its comment says so, so the next lane does not mistake it for the whole gate.
-- B-82 §6.2's note about its per-row `iam.class_lanes` call stands and is unchanged: it is reached
-- only for an edge owned by a global-readable system organization when the caller is not a member,
-- it does not appear as a plan node, and at 0.8 ms/edge the kernel beside it dominates anyway.
--
-- ALSO IN THIS FILE — SELF-TEST HYGIENE (V-55 concerns 1 and 2)
-- ------------------------------------------------------------
-- `iam.discovery_class_selftest()` and `platform.provisioner_selftest()` provision a real probe
-- table through `platform.create_entity_table`, which regenerates policies — and three of V-55's
-- four attempts died on `55P03` (`lock_timeout`) because sibling lanes were regenerating at the same
-- moment. A guard that only runs a quarter of the time gets read as a flake and then ignored.
-- Each is now split in two: `_once()` holds the unchanged body, and the public name is a bounded,
-- ANNOUNCED retry wrapper — 3 attempts, 2 s then 4 s of backoff, `lock_timeout` raised to 5 s for
-- the probe (that bounds how long the probe WAITS, never how long it holds), and a final refusal
-- that says in a sentence that nothing was measured and therefore nothing may be read as green.
-- The re-raise keeps the original SQLSTATE.
--
-- On V-55 concern 2 (DDL against live `platform.entity_types` outside a caller-owned transaction):
-- every effect these functions have — `create schema`, the registry row, the policies — is
-- transactional in PostgreSQL, and the whole call is one transaction, so an error at ANY point
-- rolls all of it back before the caller ever sees the failure; the `exception` handler's teardown
-- is belt-and-braces on top of that. Proven by a copy of the body with one `raise` injected
-- immediately after the registry insert: the error came back and `platform.entity_types` held zero
-- rows for the probe token and the schema was gone, both when it was called in its own transaction
-- and when the caller caught the error. That proof is in the DD-195 report, not in this file.
--
-- APPLIED WITH: pnpm db:apply migrations/dd195_association_doors_resolve_per_edge.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. THE PER-EDGE GATE ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION iam.assoc_side_readable(p_token text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'platform', 'iam'
AS $fn$
-- 🚨 THIS IS NOT A THIRD ACCESS PREDICATE. It is the dispatcher an association door needs because
-- its callers include `anon`, and `iam.has_access` answers false for every row when there is no
-- session. Signed in, the kernel decides and nothing else is consulted. It answers about ONE ROW —
-- the row an edge reveals — and never about the edge itself; the edge's own tenancy is
-- iam.org_readable's question, and the doors ask both.
declare
  v_schema text;
  v_table  text;
  v_attrs  record;
begin
  if p_token is null or p_id is null then
    return false;
  end if;

  -- THE KERNEL, VERBATIM. Same predicate the row's own RLS resolves to; never narrower than it.
  if (select auth.uid()) is not null then
    return iam.has_access(p_token, p_id, 'viewer'::public.permission_level);
  end if;

  -- SIGNED OUT. §3.1 gives an anon lane to the `public` class alone, and iam.entity_read_expr emits
  -- that lane as `visibility = 'public'`. Both halves, or nothing.
  if not (iam.class_lanes(p_token)).anon_lane then
    return false;
  end if;
  select et.schema_name, et.table_name into v_schema, v_table
    from platform.entity_types et where et.token = p_token and et.is_active;
  if v_schema is null then
    return false;                               -- an unregistered token has no declared anon lane
  end if;
  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  return coalesce(v_attrs.o_found, false)
     and v_attrs.o_vis = 'public'::platform.visibility;
end;
$fn$;

COMMENT ON FUNCTION iam.assoc_side_readable(text, uuid) IS
  'DD-195 — "may this caller read the row this edge reveals?" for the association reader doors. Signed in it IS iam.has_access(token,id,''viewer''); signed out it is the §3.1 public-class anon lane (class carries anon_lane AND the row''s visibility is public), because the kernel needs a uid. Not client-callable: the doors call it, nobody else.';

REVOKE ALL ON FUNCTION iam.assoc_side_readable(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.assoc_side_readable(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION iam.assoc_side_readable(text, uuid) FROM authenticated;

-- ── 2. THE THREE READER DOORS ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assoc_for_entity(p_type text, p_id uuid)
RETURNS TABLE(id uuid, direction text, other_type text, other_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- DD-195: one kernel question per edge, about the side this row REVEALS (the other end).
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_type and a.source_id = p_id
     and iam.org_readable(a.organization_id, a.target_type)          -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.target_type, a.target_id)         -- DD-195: AND the row it reveals
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_type and a.target_id = p_id
     and iam.org_readable(a.organization_id, a.source_type)          -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.source_type, a.source_id)         -- DD-195: AND the row it reveals
  order by 7 nulls last, 10;
$fn$;

CREATE OR REPLACE FUNCTION public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text DEFAULT NULL::text)
RETURNS TABLE(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.org_readable(a.organization_id, a.target_type)     -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.target_type, a.target_id)    -- DD-195: AND the row it reveals
  order by 7 nulls last, 10;
$fn$;

CREATE OR REPLACE FUNCTION public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text,
              "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type
     and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.org_readable(a.organization_id, a.source_type)     -- the EDGE's own tenancy, unchanged
     and iam.assoc_side_readable(a.source_type, a.source_id)    -- DD-195: AND the row it reveals
  order by 7 nulls last, 10;
$fn$;

-- ── 3. THE REGISTER LINE NOW SAYS WHAT THE GATE DOES ─────────────────────────────────────────────
-- `gate_predicate` is what `check:impl-doors` D6 asserts is still literally present in the live
-- body, so it names the thing the body actually calls.
update platform.client_callable_door d
   set reason = 'Association edge vocabulary — THE one way to relate two entities (@ai-matrx/associations). '
                'The client holds no grant on platform.associations; every read goes through this definer chokepoint. '
                'DD-195 (2026-09-13): the gate is a CONJUNCTION of two questions, asked for every single edge before it '
                'is returned. (1) May the caller see edges belonging to THIS EDGE''S organization — iam.org_readable, '
                'unchanged, the tenancy of the association row itself. (2) May the caller read THE ROW THIS EDGE REVEALS '
                '(its other end) — iam.assoc_side_readable, which is iam.has_access(token, id, ''viewer'') for a signed-in '
                'caller and the §3.1 public-class anon lane for a signed-out one. Question 2 is new: until DD-195 the '
                'organization question was the WHOLE gate, so a plain member of the row''s organization was handed edges '
                'revealing rows the kernel said they could not read (measured live: two personal conversations and the '
                'personal working document they hang off, all authored by someone else). The door does NOT gate the anchor '
                'the caller named, so a caller holding an id they cannot read can still learn an edge touches it when the '
                'other end is readable to them and they are in the edge''s organization — named residue, DD-195.',
       gate_predicate = 'iam.assoc_side_readable'
 where d.schema_name = 'public'
   and d.function_name in ('assoc_for_entity', 'assoc_for_sources', 'assoc_for_targets');

do $dd195_doors$
declare v_n int;
begin
  select count(*) into v_n from platform.client_callable_door
   where schema_name='public' and function_name in ('assoc_for_entity','assoc_for_sources','assoc_for_targets')
     and gate_predicate = 'iam.assoc_side_readable';
  if v_n <> 3 then
    raise exception 'DD-195: expected 3 association reader door rows to carry the new gate_predicate, found %. The door register is the thing this row exists to make honest — refusing rather than leaving it half-written.', v_n;
  end if;
end
$dd195_doors$;

COMMENT ON FUNCTION iam.org_readable(uuid, text) IS
  'Class-aware "may I see rows belonging to this organization" (DD-189). IT IS NOT A WHOLE GATE ON ITS OWN: it answers about an ORGANIZATION, so on its own it hands a member every row in their organization regardless of that row''s own lane (DD-195, measured live). In the three association reader doors it now decides only the EDGE''s own tenancy, and iam.assoc_side_readable decides the row at the other end. Gate a row on iam.has_access; gate an association edge on both.';

-- ── 4. SELF-TEST HYGIENE — the probe survives a lock race, or says it could not run ──────────────
--
-- The unchanged DD-189 body, renamed. Everything about what it measures is B-82's; this file only
-- moves it behind a retry.
CREATE OR REPLACE FUNCTION iam._discovery_class_selftest_once()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema text := 'zz_dd189_selftest_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_token  text;
  -- THE IDENTITIES. Real accounts, chosen so each arm is separable from every other arm.
  v_sysorg     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System, global_readable, ZERO members
  v_org        constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';  -- admin's Workspace
  v_author     constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com — OWNER of every probe row
  v_orgadmin   constant uuid := '34ed4fc3-c527-4819-99bf-15c26603b261';  -- arman@titaniumsuccess.com — admin of v_org, NOT a super admin
  v_member     constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com — plain member of v_org
  v_staff      constant uuid := '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf';  -- arman26@gmail.com — super admin, member of NEITHER organization
  v_stranger   constant uuid := 'a4955b5c-d524-4d72-a90e-0658d5d51148';  -- developer111@pixelium.uk — member of neither, not staff
  r_sys uuid; r_pers uuid; r_int uuid;
  v_ids uuid[];
  v_pub_token text;
  v_conf_token text;
begin
  -- the resolvers refuse when the caller LOOKS like a browser asking about someone else; this runs as
  -- the migration role, so the claim is cleared and the p_user_id argument is the whole identity.
  perform set_config('request.jwt.claims', '', true);
  -- DD-195: bound how long THIS probe waits for a lock, not how long it holds one. The provisioning
  -- step regenerates policies and sibling lanes regenerate too; 5 s plus the caller's retry loop is
  -- what makes this guard runnable on a busy day instead of a coin flip.
  perform set_config('lock_timeout', '5s', true);

  v_token := v_schema || '_token';
  execute format('create schema %I', v_schema);
  execute format('grant usage on schema %I to authenticated', v_schema);
  -- built `organization` first: create_entity_table CERTIFIES what it builds and a `confidential`
  -- token cannot certify until suppress_platform_admin_lane is declared (DD-137b, working).
  perform platform.create_entity_table(
    v_schema, 'probe', v_token, 'DD-189 discovery-class probe',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  update platform.entity_types
     set data_class_reason = 'DD-189 self-test probe; the schema and this row are dropped before this function returns'
   where token = v_token;

  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''personal'',''system-org personal'') returning id', v_schema, v_sysorg, v_author) into r_sys;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''personal'',''real-org personal'') returning id',   v_schema, v_org,    v_author) into r_pers;
  execute format('insert into %I.probe (organization_id, created_by, visibility, note) values (%L,%L,''internal'',''real-org internal'') returning id',   v_schema, v_org,    v_author) into r_int;

  -- ── the arms that must CLOSE ────────────────────────────────────────────────────────────────
  -- C1 — THE BRIEF'S RED. A super admin who is a member of NO organization (Matrx System has zero
  -- members) discovers a CONFIDENTIAL row through the platform-staff arm. `confidential` has no
  -- platform-admin lane at all (§3.1), so this arm must not exist for this token.
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'staff_arm_respects_class';
  status := case when iam.is_discoverable_base(v_staff, v_token, r_sys, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a non-member super admin discovers a confidential row in the global-readable system org'; return next;

  -- C2 — the same arm, class `organization` (the lane DOES exist) but the row is `personal`.
  -- DD-170's wall: a table with a real visibility column is walled at >= internal.
  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'staff_arm_respects_visibility';
  status := case when iam.is_discoverable_base(v_staff, v_token, r_sys, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a super admin discovers a personal row in the global-readable system org'; return next;

  -- C3 — the org-admin arm, class `private` (neither org lane exists), row visibility internal.
  -- `private` is the class that isolates the ROLE arm at viewer: on `confidential` the org-MEMBER
  -- lane legitimately admits every member including the admin (§3.1), so a confidential probe at
  -- viewer proves nothing about the role arm and asserting FALSE there would be over-tightening.
  update platform.entity_types set data_class='private', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'org_admin_arm_respects_class';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers a private-class row of their organization'; return next;

  -- C3b — and at ADMIN level, where `confidential` DOES separate the two lanes: org_member_lane
  -- confers at most editor, so only the role lane could admit here, and `confidential` has none.
  update platform.entity_types set data_class='confidential' where token=v_token;
  check_name := 'org_admin_arm_respects_class_at_admin_level';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'admin'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers a confidential row at ADMIN level, where only the role lane could admit'; return next;

  -- C4 — the org-admin arm, class `organization` (lane exists), row visibility PERSONAL: DD-136.
  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'org_admin_arm_respects_visibility';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_pers, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'an organization admin discovers another person''s personal row'; return next;

  -- C5 — the org-member arm, class `private` (no org_member_lane), row visibility internal.
  update platform.entity_types set data_class='private', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'org_member_arm_respects_class';
  status := case when iam.is_discoverable_base(v_member, v_token, r_int, 'viewer'::public.permission_level, true) then 'FAIL' else 'PASS' end;
  detail := 'a plain member discovers a private-class row of their organization'; return next;

  -- C6..C8 — the id producer answers the same three questions. Same door, different handle.
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  v_ids := iam.discoverable_ids(v_staff, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_staff_arm_respects_class';
  status := case when r_sys = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands a non-member super admin a confidential system-org row'; return next;

  v_ids := iam.discoverable_ids(v_orgadmin, v_token, 'admin'::public.permission_level, 0, true);
  check_name := 'ids_org_admin_arm_respects_class';
  status := case when r_int = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands an organization admin a confidential row at ADMIN level'; return next;

  update platform.entity_types set data_class='private' where token=v_token;
  v_ids := iam.discoverable_ids(v_member, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_org_member_arm_respects_class';
  status := case when r_int = any(v_ids) then 'FAIL' else 'PASS' end;
  detail := 'discoverable_ids hands a plain member a private-class row'; return next;

  -- ── the lanes that must SURVIVE. Over-tightening is the same size of bug. ────────────────────
  update platform.entity_types set data_class='confidential', suppress_platform_admin_lane=true where token=v_token;
  check_name := 'owner_still_discovers';
  status := case when iam.is_discoverable_base(v_author, v_token, r_sys,  'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_author, v_token, r_pers, 'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_author, v_token, r_int,  'viewer'::public.permission_level, true)
             then 'PASS' else 'FAIL' end;
  detail := 'the author of a confidential row must keep discovering all three of their rows'; return next;

  v_ids := iam.discoverable_ids(v_author, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_owner_still_lists';
  status := case when r_sys = any(v_ids) and r_pers = any(v_ids) and r_int = any(v_ids) then 'PASS' else 'FAIL' end;
  detail := 'discoverable_ids must keep handing the author their own three rows'; return next;

  -- the CONFIDENTIAL member lane is legitimate and must survive: `confidential` keeps
  -- org_member_lane (§3.1), so every member of the row's organization — the admin included —
  -- still discovers an internal row at viewer. This is the check C3 would have broken.
  check_name := 'confidential_class_member_lane_survives';
  status := case when iam.is_discoverable_base(v_member,   v_token, r_int, 'viewer'::public.permission_level, true)
                  and iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true)
             then 'PASS' else 'FAIL' end;
  detail := 'a confidential internal row stays discoverable at viewer by every member of its organization'; return next;

  update platform.entity_types set data_class='organization', suppress_platform_admin_lane=false where token=v_token;
  check_name := 'organization_class_org_admin_still_discovers';
  status := case when iam.is_discoverable_base(v_orgadmin, v_token, r_int, 'viewer'::public.permission_level, true) then 'PASS' else 'FAIL' end;
  detail := 'an organization-class internal row stays discoverable by the organization admin'; return next;

  check_name := 'organization_class_member_still_discovers';
  status := case when iam.is_discoverable_base(v_member, v_token, r_int, 'viewer'::public.permission_level, true) then 'PASS' else 'FAIL' end;
  detail := 'an organization-class internal row stays discoverable by a plain member'; return next;

  v_ids := iam.discoverable_ids(v_orgadmin, v_token, 'viewer'::public.permission_level, 0, true);
  check_name := 'ids_organization_class_org_admin_still_lists';
  status := case when r_int = any(v_ids) then 'PASS' else 'FAIL' end;
  detail := 'discoverable_ids keeps the organization-class internal row for the organization admin'; return next;

  check_name := 'stranger_never_discovers';
  status := case when iam.is_discoverable_base(v_stranger, v_token, r_int, 'viewer'::public.permission_level, true)
                   or iam.is_discoverable_base(v_stranger, v_token, r_sys, 'viewer'::public.permission_level, true)
             then 'FAIL' else 'PASS' end;
  detail := 'a member of neither organization discovers an organization-class row'; return next;

  -- ── iam.org_readable — the class-aware organization oracle DD-189 left behind ─────────────────
  -- DD-195 took it OUT of the association doors (an organization is not an edge's access decision),
  -- but the check stays: while the function exists it must be class-aware, and the token-less form
  -- must stay retired. A guard that cannot run reports FAIL rather than reading green.
  select token into v_pub_token  from platform.entity_types where is_active and data_class='public'       and rls_variant<>'component' order by token limit 1;
  select token into v_conf_token from platform.entity_types where is_active and data_class='confidential' and rls_variant<>'component' order by token limit 1;
  check_name := 'org_readable_is_class_aware';
  if to_regprocedure('iam.org_readable(uuid,text)') is null then
    status := 'FAIL'; detail := 'iam.org_readable has no class-aware (uuid,text) form; the token-less one cannot ask the class question at all';
  elsif to_regprocedure('iam.org_readable(uuid)') is not null then
    status := 'FAIL'; detail := 'the token-less iam.org_readable(uuid) still exists — a class-blind door beside a class-aware one is not a fix';
  else
    status := case when iam.org_readable(v_sysorg, v_conf_token) then 'FAIL'
                   when not iam.org_readable(v_sysorg, v_pub_token) then 'FAIL'
                   else 'PASS' end;
    detail := format('global-readable system org: confidential token %s must be unreadable, public token %s readable', v_conf_token, v_pub_token);
  end if;
  return next;

  -- teardown, always
  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token = v_token;
  execute format('drop schema %I cascade', v_schema);
  return;
exception when others then
  -- a self-test that leaves a schema behind poisons the next run; tear down, then re-raise verbatim.
  -- (The enclosing transaction would undo all of it anyway — this is belt-and-braces, and it is why
  -- a forced mid-run failure leaves zero rows in platform.entity_types.)
  begin
    delete from iam.superseded_policy where schema_name = v_schema;
    delete from platform.entity_types where token = v_token;
    execute format('drop schema if exists %I cascade', v_schema);
  exception when others then null; end;
  raise;
end;
$function$;

COMMENT ON FUNCTION iam._discovery_class_selftest_once() IS
  'DD-189 discovery-class forcing test, one attempt. Call iam.discovery_class_selftest() instead — it wraps this in the bounded lock-contention retry DD-195 added.';
REVOKE ALL ON FUNCTION iam._discovery_class_selftest_once() FROM PUBLIC;

CREATE OR REPLACE FUNCTION iam.discovery_class_selftest()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
-- DD-195 (V-55 concern 1): three of four live attempts died on 55P03 because sibling lanes were
-- regenerating policies while this test provisioned its probe table. A guard that runs a quarter of
-- the time is a guard nobody trusts. Bounded, announced, and it NEVER reports a green it did not
-- measure: if the attempts run out it raises, carrying the original SQLSTATE.
declare
  v_max     constant int := 3;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      -- the inner function materialises its whole result before a row reaches this tuplestore, so a
      -- failed attempt contributes nothing and a retry cannot duplicate a check.
      return query select * from iam._discovery_class_selftest_once();
      return;
    exception when lock_not_available or deadlock_detected then
      if v_attempt >= v_max then
        raise exception
          'iam.discovery_class_selftest could not run: % attempts all lost a lock race while provisioning its probe table (last: % %). NOTHING WAS MEASURED, so nothing here may be read as a pass — re-run when fewer policy-regeneration lanes are active.',
          v_max, SQLSTATE, SQLERRM
          using errcode = SQLSTATE;
      end if;
      raise warning
        'iam.discovery_class_selftest: attempt %/% lost a lock race to a concurrent regeneration (% %); retrying in % s.',
        v_attempt, v_max, SQLSTATE, SQLERRM, v_attempt * 2;
      perform pg_sleep(v_attempt * 2);
    end;
  end loop;
end;
$function$;

COMMENT ON FUNCTION iam.discovery_class_selftest() IS
  'DD-189 — the discovery resolvers honour the class in every organization-shaped arm, measured with five real accounts against a probe table it provisions and tears down. DD-195: bounded, announced retry (3 attempts, 2 s + 4 s backoff, 5 s lock_timeout on the probe) so live regeneration contention cannot turn it into a flake; when the attempts run out it RAISES rather than returning an unmeasured pass.';
REVOKE ALL ON FUNCTION iam.discovery_class_selftest() FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform._provisioner_selftest_once()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_schema text := 'zz_dd189_provision_' || to_hex((extract(epoch from clock_timestamp())*1000)::bigint);
  v_tok_e text; v_tok_s text;
  v_carriers int; v_fails text;
begin
  perform set_config('lock_timeout', '5s', true);   -- DD-195: bounds waiting, never holding
  execute format('create schema %I', v_schema);
  v_tok_e := v_schema || '_entity';
  v_tok_s := v_schema || '_system';

  perform platform.create_entity_table(
    v_schema, 'probe_entity', v_tok_e, 'DD-189 provisioner probe (entity)',
    array['note text'], 'entity', false, false, 'internal', false, false, false, false,
    null::text[], 'organization'::platform.data_class, 'organization'::platform.list_scope);
  select count(*) into v_carriers from pg_trigger tg
   where tg.tgrelid = format('%I.probe_entity', v_schema)::regclass
     and not tg.tgisinternal and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure;
  select string_agg(v.check_name||coalesce(': '||v.detail,''), '; ')
    into v_fails from iam.verify_canonical(v_schema,'probe_entity',v_tok_e) v where v.status='FAIL';
  check_name := 'provisions_entity_end_to_end';
  status := case when v_carriers = 1 and v_fails is null then 'PASS' else 'FAIL' end;
  detail := format('carrier triggers=%s; verify_canonical FAILs=%s', v_carriers, coalesce(v_fails,'none'));
  return next;

  perform platform.create_entity_table(
    v_schema, 'probe_system', v_tok_s, 'DD-189 provisioner probe (system)',
    array['note text'], 'system', false, false, 'internal', false, false, false, false,
    null::text[], 'public'::platform.data_class, 'organization'::platform.list_scope);
  select count(*) into v_carriers from pg_trigger tg
   where tg.tgrelid = format('%I.probe_system', v_schema)::regclass
     and not tg.tgisinternal and tg.tgfoid = 'platform._stamp_actor_tier()'::regprocedure;
  select string_agg(v.check_name||coalesce(': '||v.detail,''), '; ')
    into v_fails from iam.verify_canonical(v_schema,'probe_system',v_tok_s) v where v.status='FAIL';
  check_name := 'provisions_system_end_to_end';
  status := case when v_carriers = 1 and v_fails is null then 'PASS' else 'FAIL' end;
  detail := format('carrier triggers=%s; verify_canonical FAILs=%s', v_carriers, coalesce(v_fails,'none'));
  return next;

  delete from iam.superseded_policy where schema_name = v_schema;
  delete from platform.entity_types where token in (v_tok_e, v_tok_s);
  execute format('drop schema %I cascade', v_schema);
  return;
exception when others then
  begin
    delete from iam.superseded_policy where schema_name = v_schema;
    delete from platform.entity_types where token in (v_tok_e, v_tok_s);
    execute format('drop schema if exists %I cascade', v_schema);
  exception when others then null; end;
  raise;
end;
$function$;

COMMENT ON FUNCTION platform._provisioner_selftest_once() IS
  'DD-189 provisioner forcing test, one attempt. Call platform.provisioner_selftest() instead — it wraps this in the bounded lock-contention retry DD-195 added.';
REVOKE ALL ON FUNCTION platform._provisioner_selftest_once() FROM PUBLIC;

CREATE OR REPLACE FUNCTION platform.provisioner_selftest()
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_max     constant int := 3;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    begin
      return query select * from platform._provisioner_selftest_once();
      return;
    exception when lock_not_available or deadlock_detected then
      if v_attempt >= v_max then
        raise exception
          'platform.provisioner_selftest could not run: % attempts all lost a lock race while building its probe tables (last: % %). NOTHING WAS MEASURED, so nothing here may be read as a pass — re-run when fewer policy-regeneration lanes are active.',
          v_max, SQLSTATE, SQLERRM
          using errcode = SQLSTATE;
      end if;
      raise warning
        'platform.provisioner_selftest: attempt %/% lost a lock race to a concurrent regeneration (% %); retrying in % s.',
        v_attempt, v_max, SQLSTATE, SQLERRM, v_attempt * 2;
      perform pg_sleep(v_attempt * 2);
    end;
  end loop;
end;
$function$;

COMMENT ON FUNCTION platform.provisioner_selftest() IS
  'DD-189 — platform.create_entity_table builds an `entity` table AND a `system` table end to end, each certified by iam.verify_canonical and carrying exactly one actor-tier carrier trigger. DD-195: bounded, announced retry (3 attempts, 2 s + 4 s backoff, 5 s lock_timeout on the probe); when the attempts run out it RAISES rather than returning an unmeasured pass.';
REVOKE ALL ON FUNCTION platform.provisioner_selftest() FROM PUBLIC;

-- ── 5. THE GREEN, ASSERTED IN THIS FILE AGAINST REAL ROWS AND REAL IDENTITIES ────────────────────
do $dd195_green$
declare
  v_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, plain member of 884d1ce8
  v_owner   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, author of all three rows
  v_dev111  constant uuid := 'a4955b5c-d524-4d72-a90e-0658d5d51148';  -- developer111@pixelium.uk, member of neither org
  v_wd      constant uuid := '6fff109d-cf6d-51ef-b489-ce48d72c7f8a';
  v_convos  constant uuid[] := array['28437032-1597-4004-8d27-c073852464ad','7ba49d41-3778-43c5-8a28-98eea43e5a7e']::uuid[];
  v_agent_pub constant uuid := '6cb7be35-719a-43a0-8faf-075cf300d4a7'; -- system-org agent, 2 PUBLIC-class surface edges
  v_agent_org constant uuid := 'f6358227-8ae5-4ed4-b58e-3c8848f13e4b'; -- system-org agent, organization-class edges
  n int;
  v_bad text[] := '{}';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role','authenticated')::text, true);
  select count(*) into n from public.assoc_for_entity('working_document', v_wd);
  if n <> 0 then v_bad := v_bad || format('assoc_for_entity as a plain member still returns %s edge(s) revealing another person''s private conversations (was 2, must be 0)', n); end if;
  select count(*) into n from public.assoc_for_targets('conversation', v_convos);
  if n <> 0 then v_bad := v_bad || format('assoc_for_targets as a plain member still returns %s edge(s) (was 2, must be 0)', n); end if;
  select count(*) into n from public.assoc_for_sources('working_document', array[v_wd], null);
  if n <> 0 then v_bad := v_bad || format('assoc_for_sources as a plain member still returns %s edge(s) (was 2, must be 0)', n); end if;

  -- over-tightening is the same size of bug: the AUTHOR must lose nothing.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  select count(*) into n from public.assoc_for_entity('working_document', v_wd);
  if n <> 3 then v_bad := v_bad || format('the author of every one of these rows now sees %s edges through assoc_for_entity, not the 3 they saw before', n); end if;
  select count(*) into n from public.assoc_for_targets('conversation', v_convos);
  if n <> 2 then v_bad := v_bad || format('the author now sees %s edges through assoc_for_targets, not the 2 they saw before', n); end if;
  select count(*) into n from public.assoc_for_sources('working_document', array[v_wd], null);
  if n <> 3 then v_bad := v_bad || format('the author now sees %s edges through assoc_for_sources, not the 3 they saw before', n); end if;

  -- the ANONYMOUS shape is pinned: the public-class lane survives, the organization-class one stays shut.
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.assoc_for_entity('agent', v_agent_pub);
  if n <> 2 then v_bad := v_bad || format('a signed-out visitor now sees %s public-class edge(s) where they saw 2 — the §3.1 anon lane must survive', n); end if;
  select count(*) into n from public.assoc_for_entity('agent', v_agent_org);
  if n <> 0 then v_bad := v_bad || format('a signed-out visitor now sees %s organization-class edge(s) where they saw 0', n); end if;

  -- and the signed-in NON-MEMBER keeps the global-readable system organization.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dev111, 'role','authenticated')::text, true);
  select count(*) into n from public.assoc_for_entity('agent', v_agent_pub);
  if n <> 3 then v_bad := v_bad || format('a signed-in non-member now sees %s edge(s) on the public-edged system agent, not the 3 they saw before', n); end if;
  select count(*) into n from public.assoc_for_entity('agent', v_agent_org);
  if n <> 5 then v_bad := v_bad || format('a signed-in non-member now sees %s edge(s) on the organization-edged system agent, not the 5 they saw before', n); end if;

  perform set_config('request.jwt.claims', '', true);

  if array_length(v_bad, 1) is not null then
    raise exception 'DD-195 refused: %', array_to_string(v_bad, ' | ');
  end if;
  raise notice 'DD-195 — GREEN on live rows: the plain member''s 2+2+2 leaked edges are gone, the author''s 3/2/3 are untouched, and the anonymous (2/0) and signed-in non-member (3/5) shapes are unchanged.';
end
$dd195_green$;

-- the two self-tests, on the state this file leaves behind
do $dd195_selftests$
declare v_fails text;
begin
  select string_agg(s.check_name||' ('||s.detail||')', '; ' order by s.check_name)
    into v_fails from iam.discovery_class_selftest() s where s.status = 'FAIL';
  if v_fails is not null then
    raise exception 'DD-195: iam.discovery_class_selftest reports FAIL after this file: %', v_fails;
  end if;
  select string_agg(p.check_name||' ('||p.detail||')', '; ' order by p.check_name)
    into v_fails from platform.provisioner_selftest() p where p.status = 'FAIL';
  if v_fails is not null then
    raise exception 'DD-195: platform.provisioner_selftest reports FAIL after this file: %', v_fails;
  end if;
  raise notice 'DD-195 — both self-tests green through their new retry wrappers.';
end
$dd195_selftests$;
