-- VIS-2 (1 of 3) — WHAT MEMBERSHIP ALONE CONFERS IS THE ORGANIZATION'S SENTENCE, NOT OURS.
--
-- MEASURED LIVE, 2026-09-19, on the main database. Every record of the unified store is
-- reachable by every member of the organization that owns it, and no organization can say
-- otherwise. Two arms make that true and both are unconditional:
--
--   1. `iam.has_access_for_base` — the platform's access kernel, ARM 1 of
--      `custom.has_visibility` — ends its per-node arms with the org MEMBER lane:
--      `if v_lanes.org_member_lane and p_required <= 'editor' and iam.has_org_access_for(...)`.
--      `iam.class_lanes('record')` returns `org_member_lane = t`, so a member reads (and at
--      `editor`, rewrites) every row whose `visibility >= internal` — which is the default.
--   2. `iam.member_default_level` — ARM 2 — resolves `custom/member_default_level`, whose
--      row reads `overridable_by = {}`. The knob exists; the organization rung does not, so
--      the value `viewer` is the platform's, for everybody, forever.
--
-- "Opinions become knobs. Behavioural choices are organization-configurable settings with
-- sensible defaults; organizations decide, never agents." This one was an opinion.
--
-- WHAT THIS FILE LANDS
--
--   · `custom/member_default_visibility`, an enum knob with exactly two values today:
--       `all_records` — the default, and BYTE-FOR-BYTE the behaviour above.
--       `shared_only` — membership alone confers nothing. A member reaches a record by
--                       owning it (VIS-25), by a grant on it or on something that carries it
--                       (VIS-1/VIS-2), or because containment carries one down to it
--                       (REC-10). Every other arm of the walk is untouched.
--     `overridable_by = {organization}`, `propagation = instant`, filed under the
--     `custom-data` taxonomy node — which is the whole of "expose it on the existing
--     organization settings screen". The universal settings platform builds its screen from
--     `platform.knob_index` over `platform.feature_knob`, renders by `value_type` in
--     `KnobFieldControl`, and writes through `platform.knob_override_set`'s `org_steward`
--     door (an owner or admin of the organization). A knob that declares an organization rung
--     and names its taxonomy node IS on that screen. A second page, a bespoke control or a
--     new route would be a parallel settings layer, which is the thing the unified settings
--     platform exists to refuse.
--
--   · `iam.member_lane_open(organization)` — the one reader of the knob, `stable`, failing
--     TOWARD today's behaviour if the knob registry cannot be read at all (the kernel cannot
--     refuse: refusing at runtime is denying a person their own data — the same rule the
--     `v_lanes` resolution states two hundred lines above the arm this touches).
--
--   · The two arms, each asking it. In the kernel the question is guarded by the schema
--     already in hand (`v_schema is distinct from 'custom' or ...`), so nothing outside the
--     record store pays one extra lookup and nothing outside the record store changes
--     behaviour by one row. In `iam.member_default_level` the knob short-circuits before the
--     level word is resolved, so `shared_only` confers nothing whatever the level says.
--
-- NO REBUILD FOLLOWS IT. The member lane is decided at READ time, per node, inside the
-- kernel; `platform.reachability` stores the containment closure and the visibility cache is
-- keyed by `(container, item)` with the principal resolved at read (VIS-10). Nothing cached
-- mentions membership, so flipping this knob changes the next read and nothing else — no
-- rebuild, no invalidation, no epoch bump. (Proven in the suite: the same reader, the same
-- record, two answers, one `knob_override_set` apart, in one session.)
--
-- ADDITIVE: one knob row, one new function, two `create or replace`. It drops nothing,
-- revokes nothing, and with the knob unset every arm answers exactly as it does today.
--
-- THE INVERSE: migrations/inverse/vis2_member_visibility_is_the_organizations_knob_down.sql

-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 49f6fd3e20fbe0752e9680c90d0441e98b465425b691109d5f973d45f659408e
-- based-on: iam.member_default_level(uuid, uuid) 3996d3a79e2ba8698f66e2152957f8dd73b95acacabc0e85c8f65518b0d034b4

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ─────────────────────────────────────────────────────────────── THE KNOB ITSELF
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id, ui)
values
  ('custom', 'member_default_visibility',
   '"all_records"'::jsonb, '"all_records"'::jsonb, 'enum',
   '["all_records", "shared_only"]'::jsonb,
   'What members can see by default',
   'Whether being a member of this organization is, by itself, enough to see every record in it. '
   '"All records" is how the platform has always behaved: any member sees any record. '
   '"Only what is shared" means membership on its own shows nothing — a person sees the records they created, '
   'the records shared with them, and anything inside a record they can already see. '
   'Administrators of the organization are not affected by this setting; what they can reach is set by their role.',
   'agent',
   'VIS-19 / VIS-2 lane, 2026-09-19: measured live, iam.has_access_for_base''s org member lane and '
   'iam.member_default_level both admitted every member of an organization to every record of the unified '
   'store unconditionally, and custom/member_default_level carried overridable_by = {} so no organization '
   'could say otherwise. The default here is that exact behaviour.',
   array['organization']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'),
   '{}'::jsonb)
on conflict (feature, key) do nothing;


-- ──────────────────────────────────────────────────── THE ONE READER OF THE KNOB
create or replace function iam.member_lane_open(p_organization_id uuid)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
-- IS THE ORGANIZATION-MEMBER LANE OPEN IN THIS ORGANIZATION (VIS-19 / VIS-2)?
--
-- True unless the organization has set `custom/member_default_visibility` to `shared_only`,
-- in which case membership alone confers nothing on a record of the unified store and every
-- other arm of the access walk — ownership, grants, containment, the admin lanes — decides
-- on its own, exactly as it does now.
--
-- IT FAILS TOWARD TODAY'S BEHAVIOUR, not toward privacy, and that is deliberate: this is
-- read inside `iam.has_access_for_base`, which cannot refuse — an exception there denies a
-- person their own data on an unrelated fault. The knob registry being unreadable is a
-- platform defect to fix, never a reason to lock an organization out of its own records.
-- The wall that DOES fail closed is `custom.assert_client_may_reach`, ahead of every door.
declare
  v_word text;
begin
  if p_organization_id is null then
    return true;
  end if;
  begin
    v_word := platform.knob_resolve('custom', 'member_default_visibility', p_organization_id) #>> '{}';
  exception when others then
    v_word := 'all_records';
  end;
  return coalesce(nullif(btrim(v_word), ''), 'all_records') <> 'shared_only';
end;
$$;

comment on function iam.member_lane_open(uuid) is
  'VIS-19 / VIS-2: is membership alone enough to reach a record of the unified store in this organization? Reads custom/member_default_visibility through the one knob ladder; false only for shared_only.';


-- ──────────────────────────────────────── ARM 1 — THE KERNEL ASKS THE SAME KNOB
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
end; $function$;


-- THE DEBT THE REPLACE INCURS, PAID IN DATA. `platform.provision_shape_guard` refuses to let
-- a SECURITY DEFINER function reach COMMIT with no access decision declared, and
-- `iam.has_access_for_base` predates that rule: it holds no door row, so re-creating it makes
-- the debt fall due here. It is not a client door and never was — measured live before this
-- file ran, `authenticated` and `anon` hold EXECUTE on none of its three overloads — so the
-- declaration says exactly that, in the shape the guard reads.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, non_client_lane, declared_by, reason)
select 'iam', 'has_access_for_base',
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       false, false,
       'server_only: it takes an arbitrary p_user_id and an arbitrary entity token, so a client '
       'calling it would be asking "what can SOMEBODY ELSE see". The client question is '
       'iam.has_access(p_type, p_id, p_required), which asks about auth.uid() and nobody else; '
       'the store asks custom.has_visibility, which asks this on the caller''s behalf.',
       'migrations/campaign/vis2_member_visibility_is_the_organizations_knob.sql (lane VIS-2)',
       'The platform''s access kernel. p_user_id is the principal the answer is about and is '
       'never taken from a client; p_id is checked against p_type''s registered table through '
       'platform.entity_row_access_attrs, and a null p_user_id or p_id answers false rather '
       'than raising. Declared non-client so the guard has the fact, not to open anything.'
  from pg_proc p
 where p.pronamespace = 'iam'::regnamespace
   and p.proname = 'has_access_for_base'
   and pg_get_function_identity_arguments(p.oid) =
       'p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[]'
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ─────────────────────── ARM 2 — AND WHAT MEMBERSHIP CONFERS ASKS IT TOO
CREATE OR REPLACE FUNCTION iam.member_default_level(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_word text;
  v_table_word text;
begin
  -- 🚨 VIS-2 (2026-09-19) — THE ORGANIZATION'S OTHER KNOB COMES FIRST. VIS-19 says a
  -- role sets a DEFAULT level and per-thing grants override it; it does not say every
  -- organization must have such a default. `custom/member_default_visibility = shared_only`
  -- is an organization saying membership alone confers NOTHING, which is this function
  -- returning null - the same answer the `none` word and a `restricted` field already give.
  -- Asked first, because the level word below is then simply not a question.
  if not iam.member_lane_open(p_organization_id) then
    return null;
  end if;

  -- The organization's knob, resolved through the one ladder (system -> organization).
  begin
    v_word := platform.knob_resolve('custom', 'member_default_level', p_organization_id) #>> '{}';
  exception when others then
    v_word := 'viewer';
  end;

  -- The per-table override, declared on the Table record itself. A Table is a record, so the
  -- knob lives where its subject lives rather than in a second settings store.
  if p_table_id is not null and to_regclass('custom.record') is not null then
    select nullif(btrim(t.data ->> 'member_default_level'), '')
      into v_table_word
      from custom.record t
     where t.organization_id = p_organization_id
       and t.id = p_table_id
       and t.deleted_at is null;
    if v_table_word is not null then
      v_word := v_table_word;
    end if;

    -- A table carrying a `restricted` field confers NOTHING by membership, whatever the knob
    -- says, and says so rather than quietly downgrading: the field's own sensitivity is the
    -- stricter rule and VIS-22 makes it the default (section 4).
    if exists (select 1
                 from custom.record f
                where f.organization_id = p_organization_id
                  and f.table_id = custom.field_kernel_id()
                  and f.deleted_at is null
                  and (f.data ->> 'entity_definition_id')::uuid = p_table_id
                  and f.data ->> 'sensitivity' = 'restricted') then
      return null;
    end if;
  end if;

  if v_word is null or v_word = 'none' then
    return null;
  end if;
  if not exists (select 1 from iam.content_levels() l where l.level::text = v_word) then
    raise exception 'custom/member_default_level says %, and the levels are %',
                    v_word,
                    (select string_agg(l.level::text, ', ' order by l.ordinal) from iam.content_levels() l)
      using errcode = '22023',
            hint = 'VIS-19: a role sets a default level, and a default has to be one of the four - or "none".';
  end if;
  return v_word::public.permission_level;
end;
$function$;
