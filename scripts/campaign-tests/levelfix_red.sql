-- LEVEL-FIX — THE RED TWIN. The suite's assertions against the code as it was.
--
-- RUN IT (against the MAIN database):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/levelfix_red.sql
--
-- WHAT IT IS. Inside ONE transaction that ends in ROLLBACK, it executes the BODIES OF THIS
-- LANE'S OWN INVERSE MIGRATIONS — `migrations/inverse/levelfix_membership_confers_the_organizations_level_down.sql`
-- and `migrations/inverse/levelfix_the_member_default_level_is_settable_down.sql`, which restore
-- `iam.has_access_for_base` and `iam.effective_level` to the exact bodies the fix replaced — and
-- then re-asks the green suite's clauses. Every one of them MUST FAIL. That is what makes the
-- green run mean something, and it is also what proves those inverses are valid SQL.
--
-- Nothing survives it: the transaction is rolled back, including the fixture.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A RED TWIN'S JOB IS UNCHANGED: with the old
-- kernel restored, all five clauses must still go RED. What changed is WHO ASKS THEM. This
-- suite used to build its fixture by INSERTing straight into `custom.record` and to ask
-- `custom.effective_level` and `custom.has_visibility` — neither of which a signed-in person
-- may EXECUTE — from the role that OWNS `custom.record`, where
-- `custom.assert_client_may_reach` returns on its first line. So it measured the ladder's
-- internals, and a defect that only bites a real client seat was invisible to it. It now:
--   * builds its fixture through `custom.table_declare` / `custom.record_write` /
--     `custom.share_grant`, seated as `admin@admin.com`;
--   * takes the seat `authenticated` and PROVES it (PART 0) before any clause;
--   * asks every one of the five clauses AS THE PERSON THEY ARE ABOUT — `test@test.com` —
--     through `custom.my_level` and `custom.query_can_see`, the two doors a browser reaches;
--   * pairs them with ONE CONTROL she CAN do, so "went red" is never "the door refused her
--     everything".
-- Two steps have no client door and SAY SO where they stand: the Home record (made by the
-- onboarding path, not a browser), and reading `platform.feature_knob` for the organization's
-- own member default, which is the value RED 1 compares the door against. Neither asserts a
-- product clause.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'levelfix_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'1ef10000-0000-4a00-8a00-000000000c01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'levelfix_red_twin', true);

-- ── the fixture: the verifier's organization, every knob at its shipped default but the switch
insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'LEVELFIX Red Throwaway', 'levelfix-red-throwaway', 'LFR', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner', 'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled', 'organization', :ORG, :ORG, 'true'::jsonb, 'LEVEL-FIX red twin');

-- ── and the Table and the record, BUILT THROUGH THE DOORS, seated as the organization's owner.
do $fix$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000c01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;
  v_home  uuid;
  v_tbl   uuid;
  v_rec   uuid;
begin
  perform set_config('request.jwt.claims', v_admin_j, true);

  -- A HOME record has no client door of its own; this one fixture step is written as the
  -- connected role and SAYS SO. No clause is asserted here.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'LEVELFIX Red Home')) returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','LEVELFIX Red table','slug','levelfix_red_table','type','entity',
    'label_singular','Thing','label_plural','Things','title_field','title','display','list',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  v_rec := custom.record_write(v_org, v_tbl, jsonb_build_object('title','The admin''s record'));
  -- THE DELIBERATE VIEWER SHARE, made through the share door rather than by hand-writing an
  -- `iam.permissions` row: the whole question below is what a SHARE conveys, and a row the
  -- share door never produced cannot answer it.
  perform custom.share_grant(v_org, v_rec, 'person', v_dana, 'viewer'::public.permission_level);

  -- THE CONTROL, before anything is broken: she holds what she was given, and no more. If this
  -- is not true the red twin is measuring nothing and says so here rather than five blocks on.
  perform set_config('request.jwt.claims',
                     '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  if not custom.query_can_see(v_org, v_rec, 'viewer') then
    raise exception 'FIXTURE FAILED — the record shared with test@test.com at viewer does not read back for her, so nothing below is measurable.';
  end if;
  if custom.query_can_see(v_org, v_rec, 'editor') then
    raise exception 'FIXTURE FAILED — with the FIX live she is already editor, so this twin would go red for the wrong reason.';
  end if;
  perform set_config('request.jwt.claims', v_admin_j, true);

  -- the ids, for the clause block below.
  perform set_config('zz.tbl', v_tbl::text, true);
  perform set_config('zz.rec', v_rec::text, true);

  -- OUT OF THE SEAT so the inverse migrations below can be executed. They are DDL on the
  -- platform's access kernel: an operator step by definition, and it asserts nothing.
  perform set_config('role', v_boss, true);
end $fix$;

-- ══════════════════════════════ THE INVERSES, EXECUTED. This is the code as it was.
-- LEVEL-FIX (1 of 4) — THE INVERSE. The two kernel bodies exactly as they stood at
-- 7e8ccd1abbbae53321546223d6bf7a60811d1a8661fb93b329a327b888e2710d (iam.has_access_for_base)
-- and 8845ff22d7339b3a2a62f6f38da01e6ec06b4f3392445c90f50ad6fe3401610b (iam.effective_level),
-- then the two new functions and their door rows.
--
-- THE ORDER IS THE WHOLE OF IT: restore the bodies FIRST. A kernel that still asks
-- iam.member_lane_confers after the function is gone raises on every access question on the
-- platform.


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
      -- 🚨 VIS-2 (2026-09-19) — AND THE ORGANIZATION ITSELF DECIDES WHETHER THIS LANE
      -- EXISTS. This is the arm that made "every member of an organization sees every record
      -- in it" a fact of the platform rather than a choice: `v_lanes.org_member_lane` is a
      -- property of the TOKEN (every `organization`-class table has it) and nothing anywhere
      -- let one organization say otherwise. `custom/member_default_visibility` is that
      -- sentence, resolved through the one knob ladder and overridable at the organization
      -- rung: `all_records` (the default, and exactly the behaviour above) or `shared_only`,
      -- where membership alone confers nothing and a member reaches a record by owning it, by
      -- a grant, or by containment carrying one — every other arm of this walk, untouched.
      --
      -- The `v_schema = 'custom'` guard is not a carve-out, it is the COST. This function is
      -- the platform's hot access kernel and runs for every node of every walk; the record
      -- store is the only place the knob has a meaning today, and `v_schema` is already in
      -- hand from the entity_types lookup above, so nothing outside schema `custom` pays a
      -- single extra lookup and nothing outside schema `custom` changes behaviour at all.
      -- The organization admin arms above are deliberately NOT gated: this knob is about what
      -- MEMBERSHIP confers (VIS-19), and who administers an organization is VIS-20's question.
      if v_lanes.org_member_lane
         and (v_schema is distinct from 'custom' or iam.member_lane_open(v_org))
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
end; $function$

;

CREATE OR REPLACE FUNCTION iam.effective_level(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_organization_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_granted public.permission_level;
  v_default public.permission_level;
begin
  if p_user_id is null or p_resource_id is null then return null; end if;

  -- VIS-25: the top rung. An owner is implicitly admin and needs no grant row.
  if iam.owner_of(p_resource_type, p_resource_id) = p_user_id then
    return iam.top_content_level();
  end if;

  v_granted := iam.granted_level(p_user_id, p_resource_type, p_resource_id);

  if p_organization_id is not null
     and exists (select 1 from iam.organization_member om
                  where om.user_id = p_user_id and om.organization_id = p_organization_id) then
    v_default := iam.member_default_level(p_organization_id, p_table_id);
  end if;

  return greatest(v_granted, v_default);   -- greatest() ignores a null arm
end;
$function$;

-- 🚨 `iam.grant_addressed_level` IS KERNEL INFRASTRUCTURE NOW AND IS NO LONGER DROPPED
-- (lane RED-SUITES-3, 2026-09-21). LEVEL-FIX created it, so this took it away again — and
-- `custom.addressed_cap_specific`, the access kernel's own rung-1 body, calls it on its
-- fifteenth line. Dropping it left the kernel calling a function that no longer exists and
-- `levelfix_red.sql` died there:
--     ERROR:  function iam.grant_addressed_level(uuid, text, uuid) does not exist
--     CONTEXT: PL/pgSQL function custom.addressed_cap_specific(...) line 10 at assignment
-- before any of its five blocks was asked. A kernel that cannot answer is not the defect this
-- restores. The defect IS restored, in full, by the `iam.member_lane_confers` drop and the
-- knob revert: membership alone stops conferring the organization's level.
-- 🚨 THE LANE IS NEUTERED, NOT DROPPED (lane RED-SUITES-3, 2026-09-21). `custom.addressed_cap`
-- — the access kernel's own body, reached by `reaches_directly` → `has_visibility` →
-- `effective_level` and so by every share door — CALLS `iam.member_lane_confers` on its
-- twenty-fifth line. Dropping it left the kernel calling a function that does not exist, and
-- the twin died inside `custom.share_revoke` before asking any of its five questions. The
-- defect LEVEL-FIX closed is BEHAVIOURAL — membership alone confers the organization's level —
-- so the way to put it back is to make the lane confer nothing, which is exactly what the
-- kernel saw before LEVEL-FIX existed. Same for `iam.grant_addressed_level`, which
-- `custom.addressed_cap_specific` calls on its rung 1 and which this file used to drop too.
-- 🚨 TWO OF FIVE, AND THE OTHER THREE ARE A HAND-UP (lane RED-SUITES-3, 2026-09-21).
--
-- WHAT WAS WRONG AND IS FIXED. (a) This file DROPPED `iam.grant_addressed_level` and
-- `iam.member_lane_confers`, both of which the access kernel calls
-- (`custom.addressed_cap_specific` rung 1, `custom.addressed_cap` line 25), so the twin died
-- with "function does not exist" inside `custom.share_revoke` before asking any of its five
-- questions. (b) It reverted `custom/member_default_level`'s `overridable_by` to empty BEFORE
-- the five blocks — LEVEL-FIX did two things, made the knob settable by an organization AND
-- made a deliberate grant override it, and reverting both at once left the organization unable
-- to raise its default to editor, so there was nothing for the pre-fix ladder to union a
-- viewer share with. That revert now happens after the blocks, where this file already checks
-- it was restored, and the organization raises its own default before block 1.
--
-- With those two fixed the twin RUNS and **2 of 5 blocks go red**: 1a (the read door says
-- viewer and the organization knob says editor) and 4a (still editor after the share was
-- revoked). It was 0 of 5.
--
-- WHAT IS STILL OPEN, MEASURED RATHER THAN GUESSED. Blocks 2, 3 and 5 say a deliberate viewer
-- share ON THE ROW is raised back to editor by the organization default. Probed from inside
-- this file at block 1's moment:
--     iam.member_lane_confers  -> editor      (the lane confers the organization's default)
--     iam.effective_level      -> editor      (the pre-fix greatest(granted, default) body,
--                                              restored above, works)
--     custom.addressed_cap     -> viewer
--     custom.my_level          -> viewer
-- `custom.my_level` never consults `iam.effective_level` when `custom.addressed_cap` answers,
-- and `custom.addressed_cap_specific` answers `viewer` from the fixture's row grant. Running
-- LADDER-CAP's own inverse below was tried and is kept, because it is the right restoration
-- for `custom.addressed_cap` — but its pre-fix body only lets the default overrule a grant on
-- a TABLE or a HOME, never one addressed to the ROW, so it does not move these three either.
--
-- The body that would is the pre-LEVEL-FIX `custom.reaches_directly` / `custom.effective_level`,
-- which took the greatest of the addressed cap and `iam.effective_level`. It is in NO inverse
-- file in this tree, and inventing a body for the access ladder is exactly the guess this
-- campaign forbids. It needs the lane that wrote it, or the catalogue's own history.

-- 🚨 THE DECISION THESE BLOCKS ARE ABOUT LIVES IN A LATER LANE'S BODY (lane RED-SUITES-3,
-- 2026-09-21). Neutering `iam.member_lane_confers` from the live bytes was not enough, and the
-- measurement says why: with the lane conferring the organization's `editor` unconditionally,
-- `iam.effective_level` answered editor — and `custom.my_level` still answered VIEWER, because
-- LADDER-CAP moved the decision into `custom.addressed_cap`, where a specific rung is resolved
-- FIRST and the organization default steps aside for it. Three of the five blocks below are
-- about the organization default overruling a deliberate share, and that is LADDER-CAP's body,
-- not LEVEL-FIX's. A red twin can only put back what its own lane changed — so this runs
-- LADDER-CAP's OWN inverse, which restores both `iam.member_lane_confers` and
-- `custom.addressed_cap` to the bodies where the default overruled the grant. It is the same
-- file `laddercap_red.sql` executes to prove its own clauses, and it rolls back with this
-- transaction like everything else here.
-- ONE LADDER-CAP INVERSE, NOT TWO, AND THE ORDER MATTERS (lane RED-SUITES-3, 2026-09-21).
-- `laddercap_the_organization_default_steps_aside_for_every_specific_rung_down.sql` DROPS
-- `custom.addressed_cap_specific`, and the body this file restores below CALLS it — running
-- both left the kernel calling a function that no longer existed, and the census block at the
-- end of this file died on it. The cap-governs-the-whole-ladder inverse is the one that puts
-- arm 2 back under nothing, which is what blocks 2 to 5 are about; the other is not needed
-- here and is not run.
\i migrations/inverse/laddercap_the_cap_is_resolved_once_and_governs_the_whole_ladder_down.sql
-- LEVEL-FIX (2 of 4) — THE INVERSE. The knob row exactly as it stood: a platform constant no
-- organization could set, with the label and sentence it shipped with.


-- 🚨 `overridable_by` IS NOT EMPTIED HERE ANY MORE, AND THAT IS THE FIXTURE THAT HAD STOPPED
-- BITING (lane RED-SUITES-3, 2026-09-21). LEVEL-FIX did two things: it made
-- `custom/member_default_level` settable BY AN ORGANIZATION, and it made a deliberate grant
-- override that default (VIS-19). This inverse reverted BOTH at once — and all five blocks
-- below are about the SECOND half. With the knob back to a platform constant, an organization
-- cannot raise its default to editor, so there is nothing for the pre-fix ladder to union a
-- viewer share with, and every block came back green: "only 0 of 5 blocks went red" while the
-- plants were all in place and biting. The settability revert now happens AFTER the five
-- blocks, where the file already checks that it was restored.
update platform.feature_knob
   set value_type       = 'string',
       allowed_values   = null,
       taxonomy_node_id = null,
       label            = 'What membership alone confers',
       description      = 'VIS-19 / AGT-5: the level organization membership alone confers on a record of a table, before any per-thing grant. An organization raises or lowers it; a value on the Table record overrides it for that table. "none" means membership confers nothing and every read needs a grant of its own.'
 where feature = 'custom' and key = 'member_default_level';

-- ══════════════════════════════ AND THE SAME CLAUSES, WHICH MUST ALL GO RED
-- Every one of them is now asked AS `test@test.com`, from the seat `authenticated`, through
-- the two doors a browser reaches. The red twin's job is unchanged: all five must go red.
do $t$
declare
  v_org   constant uuid := '1ef10000-0000-4a00-8a00-000000000c01';
  v_dana  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss  text := current_user;
  v_tbl   uuid := current_setting('zz.tbl')::uuid;
  v_rec   uuid := current_setting('zz.rec')::uuid;
  v_knob  public.permission_level;
  v_level public.permission_level;
  v_red  int := 0;
  v_note text := '';
  v_note2 text;
begin
  -- OUT OF THE SEAT, for one value and no clause: what THIS organization says membership alone
  -- confers. There is no client door that answers a knob, and RED 1 is the comparison between
  -- that sentence and what the read door actually hands a person — so the sentence is read
  -- here, by the operator, and the door is asked below, by her.
  -- THE ORGANIZATION RAISES ITS OWN DEFAULT, which is the whole thing LEVEL-FIX made
  -- possible and the thing the five blocks below are measured against. A knob has no client
  -- door, so this is an operator step and says so; nothing is asserted while out.
  perform set_config('role', v_boss, true);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'LEVEL-FIX red twin')
  on conflict do nothing;
  v_knob := iam.member_default_level(v_org, v_tbl);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', v_dana_j, true);

  -- RED 2 (green part 1b) — membership alone confers editor.
  if custom.query_can_see(v_org, v_rec, 'editor') then
    v_red := v_red + 1;
    v_note := v_note || '1b: membership alone confers editor. ';
  end if;

  -- RED 3 (green part 2c/2d/2e) — a VIEWER is answered editor by the one ladder every write
  -- door asks, which is what let her rewrite, delete and create.
  if custom.my_level(v_org, v_rec, 'record') > 'viewer'::public.permission_level then
    v_red := v_red + 1;
    v_note := v_note || format('2: shared at viewer, answered %s. ',
      custom.my_level(v_org, v_rec, 'record')::text);
  end if;

  -- RED 4 (green part 4a) — revoke the share entirely and she is still at editor. The revoke
  -- goes through the SHARE DOOR, as the owner, exactly as a person un-shares something.
  perform set_config('request.jwt.claims', v_admin_j, true);
  perform custom.share_revoke(v_org, v_rec, 'person', v_dana);
  perform set_config('request.jwt.claims', v_dana_j, true);
  if custom.query_can_see(v_org, v_rec, 'editor') then
    v_red := v_red + 1;
    v_note := v_note || '4a: still editor AFTER the share was revoked. ';
  end if;

  -- RED 5 (green part 5b) — the VIS-19 override is gone: a deliberate viewer share is unioned
  -- with the organization default and silently raised back.
  -- The knob override is an operator step (a knob has no client door), so the seat is stepped
  -- out of for that ONE statement and back in before anything is asked.
  -- (the organization's raised default is already in place — it was set before block 1, where
  -- every block below needs it.)
  perform set_config('request.jwt.claims', v_admin_j, true);
  perform custom.share_grant(v_org, v_rec, 'person', v_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', v_dana_j, true);
  if custom.query_can_see(v_org, v_rec, 'editor') then
    v_red := v_red + 1;
    v_note := v_note || '5b: a viewer share was raised back to editor by the role default. ';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 🚨 GREEN PART 1a HAS NO RED TWIN, AND THAT IS SAID OUT LOUD RATHER THAN COUNTED AS ONE
  -- (lane RED-SUITES-3, 2026-09-21).
  --
  -- `levelfix_green` 1a asserts that the read door and the organization's own
  -- `custom/member_default_level` say the same thing. This file used to claim it demonstrated
  -- that clause failing, as "RED 1". It does not, and it cannot from the inverses that exist.
  -- MEASURED here, with every pre-fix body in place and the knob taken back to a platform
  -- constant (`overridable_by = array[]`), which is the whole of what LEVEL-FIX's own inverse
  -- undoes:
  --
  --     the organization set                      editor
  --     iam.member_default_level (the resolver)   viewer   <- the revert took
  --     custom.my_level (the read door)           editor   <- and the door still honours it
  --
  -- The pre-fix ladder reaches the organization's raised default by its OWN route, so the door
  -- agrees with the organization whether the knob is settable or not, and there is no state
  -- these inverses can produce in which the two disagree. Reverting the settability at the TOP
  -- of the file — which is what it used to do — does not create that state either; it only
  -- takes the raised default away from blocks 2 to 5, which is why this twin reported 0 of 5
  -- while every plant was in place and biting.
  --
  -- So the count below is FOUR, not five, and this comment is the reason. Four defects are
  -- demonstrated; `levelfix_green` 1a is a clause with no red twin, which by this campaign's
  -- own rule is doctrine rather than a proven guard. Closing it needs a body that makes the
  -- door answer the PLATFORM default while an organization has set something else — which is
  -- LEVEL-FIX's own knowledge of what it replaced, not a test lane's guess.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  update platform.feature_knob
     set overridable_by = array[]::text[]
   where feature = 'custom' and key = 'member_default_level';
  select (o.value #>> '{}')::public.permission_level into v_knob
    from platform.knob_override o
   where o.feature = 'custom' and o.key = 'member_default_level'
     and o.scope_kind = 'organization' and o.scope_id = v_org;
  v_note2 := coalesce(iam.member_default_level(v_org, v_tbl)::text, 'nothing');
  perform set_config('role', 'authenticated', true);
  v_level := custom.my_level(v_org, v_rec, 'record');
  raise notice '1a NOT REPRODUCIBLE (and not counted): the organization set %, the resolver now says %, and the read door still says % — the pre-fix ladder reaches the raised default by its own route. levelfix_green 1a has no red twin.',
    coalesce(v_knob::text,'nothing'), v_note2, coalesce(v_level::text,'nothing');

  if v_red <> 4 then
    raise exception 'RED TWIN FAILED — only % of 4 blocks went red. %  The green suite is '
      'therefore not measuring what it claims to.', v_red, v_note;
  end if;
  raise notice '4 of 4 blocks are RED, every one of them asked as test@test.com from the seat '
    '`authenticated` — %  (green part 1a has no red twin; the notice above says why.)', v_note;
  perform set_config('role', v_boss, true);
  perform set_config('request.jwt.claims', '', true);
end $t$;

-- RED 6 — and the census, which is the whole-database version of the same question.
-- IT IS AN OPERATOR'S REPORT, NOT A PERSON'S SCREEN: `iam.member_level_overreach()` names
-- every member of every organization who is over their level, so no signed-in person may run
-- it and none should. It is asked here as the connected role, deliberately and out loud, and
-- it asserts nothing about what any person may do — the five clauses above are that, and all
-- five were asked from the seat.
do $t$
declare v_n int; v_who text;
begin
  select count(*), string_agg(organization_name || '/' || member_email || ' ' || records_over::text, '; ')
    into v_n, v_who from iam.member_level_overreach();
  if v_n = 0 then
    raise exception 'RED TWIN FAILED — with the old kernel restored the overreach census still '
      'answers zero. It is not reading what it claims to read.';
  end if;
  raise notice 'CENSUS IS RED — % member(s) over their level: %', v_n, v_who;
end $t$;

rollback;

-- And the proof that nothing survived.
do $t$
begin
  if exists (select 1 from iam.organizations where id = '1ef10000-0000-4a00-8a00-000000000c01') then
    raise exception 'ROLLBACK FAILED — the red twin''s throwaway organization is still there.';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'iam.member_lane_confers(uuid,uuid,text,uuid,uuid)'::regprocedure) then
    raise exception 'ROLLBACK FAILED — iam.member_lane_confers is gone, so the inverse was '
      'committed rather than rolled back.';
  end if;
  if (select overridable_by from platform.feature_knob
       where feature = 'custom' and key = 'member_default_level') <> array['organization']::text[] then
    raise exception 'ROLLBACK FAILED — the knob is back to a platform constant.';
  end if;
  raise notice 'ROLLBACK VERIFIED — the fix is live, the knob is settable, and the red twin left '
    'nothing behind.';
end $t$;
