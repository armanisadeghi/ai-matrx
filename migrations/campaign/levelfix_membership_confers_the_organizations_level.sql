-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 7e8ccd1abbbae53321546223d6bf7a60811d1a8661fb93b329a327b888e2710d
-- based-on: iam.effective_level(uuid, text, uuid, uuid, uuid) 8845ff22d7339b3a2a62f6f38da01e6ec06b4f3392445c90f50ad6fe3401610b
-- based-on: iam.member_default_level(uuid, uuid) 5e8b1175b6686605dacb0d18b3fb00b62517b40854324fed86a4ed23168ff8e8
-- based-on: iam.granted_level(uuid, text, uuid) ff38b35ffc47f57a20bc96c514caddb581e652b182d821c69ec72aa269cd0ff6
-- based-on: custom.has_visibility(uuid, text, uuid, permission_level) c203376a653fb7b7c137c0ed40f638a56d552b50e06ad973949db30c974939dd
--
-- LEVEL-FIX — "VIEWER" MEANS VIEWER. WHAT MEMBERSHIP CONFERS IS THE ORGANIZATION'S OWN LEVEL.
--
-- THE DEFECT, REPRODUCED ON THE MAIN DATABASE ON 2026-09-19 IN A BRAND-NEW ORGANIZATION
-- WITH TWO SEATS AND EVERY KNOB AT ITS SHIPPED DEFAULT (nothing but the store switch set):
--
--   effective_level | iam_effective_level | member_default_level_knob | granted_level | kernel_editor
--   ----------------+---------------------+---------------------------+---------------+--------------
--   editor          | viewer              | viewer                    | (none)        | t
--
-- and after sharing that record with the plain member at VIEWER through the very rows the
-- Share dialog writes:
--
--   share_access_says | effective_level_says | viewer_can_write
--   ------------------+----------------------+------------------
--   viewer            | editor               | t
--
-- and after revoking the share entirely:
--
--   effective_after_revoke | revoked_can_still_write | revoked_can_still_read
--   -----------------------+-------------------------+------------------------
--   editor                 | t                       | t
--
-- WHICH RUNG. Not ownership (`iam.owner_of` <> her), not the organization-admin lane
-- (`public.is_org_admin_for` false), not a grant (none, and after the revoke none at all), not
-- containment (zero ancestors conveying editor that she reaches), and NOT a cache — the store's
-- `custom.visibility_cache` holds zero rows and nothing in this path reads it, so every one of
-- these answers was recomputed from scratch on the call that produced it. It is ONE arm of the
-- platform's access kernel, `iam.has_access_for_base`'s organization-member lane:
--
--     if v_lanes.org_member_lane
--        and (v_schema is distinct from 'custom' or iam.member_lane_open(v_org))
--        and p_required <= 'editor' and iam.has_org_access_for(v_uid, v_org) then return true;
--
-- `p_required <= 'editor'` is a CEILING WRITTEN IN THE CODE. VIS-2 taught that arm the
-- organization's word for WHETHER membership shows anything (`custom/member_default_visibility`);
-- nothing ever taught it the organization's word for HOW MUCH. So `custom/member_default_level`
-- — the knob `custom.share_access` reports to the person in the Access tab, and the knob
-- `iam.effective_level` resolves — was read by every door that DESCRIBES access and by no door
-- that DECIDES it. That is why the two doors disagreed in the same breath.
--
-- THE CLASS, AND WHAT THIS FILE MAKES TRUE (VIS-19, `access/DECISIONS.md` line 44 and line 49,
-- contract rows VIS-19 / VIS-33 / AGT-5):
--
--   1. A ROLE SETS A DEFAULT LEVEL; A PER-THING GRANT OVERRIDES IT. `iam.member_lane_confers`
--      returns NONE for a person who holds a grant ADDRESSED to them on this very thing (to
--      them, or to an organization they belong to), so the role default can no longer be
--      unioned on top of a deliberate share and silently raise it. It is not a deny lane and it
--      never lowers a level anybody was actually given: the grant itself is admitted, at its own
--      level, by `public.has_permission_for` a few lines above. A PUBLIC grant is addressed to
--      nobody in particular and is left unioning, exactly as Rule 9 requires — publishing a
--      record to the world must never REDUCE what the organization's own members reach.
--   2. THE ORGANIZATION DEFAULT IS WHAT THE ORGANIZATION SAYS. The lane now confers
--      `iam.member_default_level(organization, table)` — the `custom/member_default_level` knob
--      (shipped `viewer`), overridden per Table on the Table record, NONE under `shared_only`
--      and NONE for a Table carrying a `restricted` field. And the knob becomes settable: it
--      shipped `overridable_by = {}`, which made it a platform constant no organization could
--      change, so this file gives it the organization rung and the custom-data taxonomy node —
--      which, on the universal settings platform, IS its registration on the organization's
--      settings screen (no React, VIS-2's mechanism).
--   3. REVOCATION TAKES EFFECT ON THE NEXT CALL. Every arm here is resolved at read time from
--      the grant rows and the knob registry; there is no stamped entry to invalidate, which the
--      reproduction above confirms (the share row's DELETE changed `custom.share_access` in the
--      same breath). What kept the member writing was rung 2, not a stale entry.
--   4. THE WRITE DOORS ASK WHAT THE READ DOOR ASKS. They already do — `custom.record_write`,
--      `record_update`, `record_delete`, `record_restore` and every io_*/anon_* door go through
--      `custom.assert_client_may_change` → `custom.has_visibility`, W4-DOOR-RECORD's one ladder
--      — so fixing the rung fixes both halves at once, and `custom._field_write_door` (the last
--      door still asking `iam.effective_level` directly) is fixed by the same file because
--      `iam.effective_level` is corrected here too and stays strictly stricter.
--
-- NOTHING OUTSIDE SCHEMA `custom` CHANGES. The 2026-08-12 editor cap that every other table on
-- this platform runs on is reproduced byte-for-byte in the `v_schema is distinct from 'custom'`
-- arm. This file replaces no policy, drops nothing, and revokes nothing.

set local statement_timeout = '120s';
set local lock_timeout = '20s';
set local idle_in_transaction_session_timeout = '120s';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. A GRANT ADDRESSED TO THIS PERSON, WHICH IS THE ONE THAT OVERRIDES A ROLE DEFAULT.
--
-- `iam.granted_level` answers "how far does any grant on this thing carry this person",
-- public grants included, and it stays exactly as it is: that is the UNION arm, and Rule 9
-- says union only. This is the narrower question VIS-19 needs — "did somebody decide about
-- THIS PERSON on THIS THING" — and a public grant is not that decision.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function iam.grant_addressed_level(
  p_user_id       uuid,
  p_resource_type text,
  p_resource_id   uuid
) returns public.permission_level
language sql
stable
security definer
set search_path to ''
as $fn$
  select max(p.permission_level)
    from iam.permissions p
   where p.resource_type = p_resource_type
     and p.resource_id   = p_resource_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
     and coalesce(p.is_public, false) = false
     and (p.granted_to_user_id = p_user_id
          or p.granted_to_organization_id in (select om.organization_id
                                                from iam.organization_member om
                                               where om.user_id = p_user_id));
$fn$;

comment on function iam.grant_addressed_level(uuid, text, uuid) is
  'VIS-19. The level of the highest grant ADDRESSED to this person on this thing - to them, or '
  'to an organization they belong to. A public grant is addressed to nobody in particular and is '
  'excluded on purpose: it may only ADD (Rule 9, union only), never override a role default. '
  'Null means nobody has decided about this person and this thing, which is when the role '
  'default applies.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. WHAT MEMBERSHIP ALONE CONFERS, HERE. The ONE function the access kernel, the level
--    resolver and the share dialog all answer to.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function iam.member_lane_confers(
  p_user_id         uuid,
  p_organization_id uuid,
  p_type            text default 'record',
  p_id              uuid default null,
  p_table_id        uuid default null
) returns public.permission_level
language plpgsql
stable
security definer
set search_path to ''
as $fn$
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

  -- VIS-19, THE OVERRIDE. Somebody has decided about this person and this thing, so the role
  -- default is not the answer - the grant is, and it is admitted on its own arm.
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
$fn$;

comment on function iam.member_lane_confers(uuid, uuid, text, uuid, uuid) is
  'VIS-19 / VIS-33 / AGT-5. The level that MEMBERSHIP ALONE confers on this thing in this '
  'organization, and the only thing iam.has_access_for_base''s organization-member lane is '
  'allowed to admit for a record of the unified store. Null (nothing) when the person is not a '
  'member, when the organization has set custom/member_default_visibility to shared_only, when a '
  'grant addressed to this person already speaks for this thing, or when custom/member_default_level '
  'resolves to none for this Table.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE ACCESS KERNEL. Byte-for-byte the live body, with ONE arm replaced — see the
--    comment on that arm. Everything outside schema `custom` is identical.
-- ─────────────────────────────────────────────────────────────────────────────────────────
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
      -- 🚨 LEVEL-FIX (2026-09-19) — AND WHAT MEMBERSHIP CONFERS IS A LEVEL, NOT A CEILING.
      -- VIS-2 gave the organization the word "whether"; this line still hard-coded the word
      -- "how much". Measured live on the main database the day this was written, in a brand-new
      -- organization with two seats and every knob at its shipped default: a plain member who
      -- had been shared one record at VIEWER was answered `editor` by the read door and
      -- rewrote, deleted and re-created the owner's record — and kept writing after the share
      -- was revoked, because this arm never looked at the share or at the knob at all. The two
      -- doors said different things in the same breath: `custom.share_access` reported the
      -- organization default as `iam.member_default_level` (viewer) while this arm admitted
      -- editor.
      --
      -- So the lane asks ONE function, `iam.member_lane_confers`, which is the organization's
      -- own answer to "what does membership alone confer HERE": the `custom/member_default_level`
      -- knob at the organization rung, overridden per Table on the Table record itself, NONE
      -- when the organization has said `shared_only` or the Table carries a `restricted` field —
      -- and NONE when a grant addressed to this person already speaks for this thing, which is
      -- VIS-19 ("roles set a default level; per-thing grants override it") in one line. A grant
      -- is admitted by `public.has_permission_for` above at its own level, so overriding here
      -- never loses a level somebody was actually given; it stops the role default SILENTLY
      -- RAISING one. A `p_required` above what the function returns simply is not admitted
      -- (`<= null` is null, which is not true), so the lane fails closed on an unreadable knob.
      --
      -- EVERYTHING OUTSIDE SCHEMA `custom` IS BYTE-FOR-BYTE UNCHANGED, including the
      -- 2026-08-12 editor cap that every other table on this platform runs on. `v_schema` is
      -- already in hand from the entity_types lookup above, so no table outside the record
      -- store pays one extra lookup, exactly as VIS-2 argued for the line this replaces.
      if v_lanes.org_member_lane and iam.has_org_access_for(v_uid, v_org) then
        if v_schema is distinct from 'custom' or not custom.store_is_open(v_org) then
          -- UNCHANGED: every table outside the record store, and every organization whose
          -- store switch is still off. This is the 2026-08-12 editor cap, reproduced exactly.
          if p_required <= 'editor'::public.permission_level then return true; end if;
        elsif p_required <= iam.member_lane_confers(v_uid, v_org, v_type, v_id) then
          return true;
        end if;
      end if;
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

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE LEVEL RESOLVER SAYS THE SAME THING AS THE KERNEL.
--
-- `greatest(granted, member_default)` was the union that made a VIEWER share read `editor`
-- everywhere a level is DISPLAYED as well as where it is decided: `custom.read_record`,
-- `custom.read_records`, `custom.record_card`, `custom.share_revoke`, `custom.share_people`,
-- `custom.relation_target_card` and the field write trigger `custom._field_write_door` all ask
-- this function. It now asks `iam.member_lane_confers`, so the role default disappears the
-- moment a grant is addressed to the person and the number on the screen is the number the
-- door enforces.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function iam.effective_level(
  p_user_id         uuid,
  p_resource_type   text,
  p_resource_id     uuid,
  p_organization_id uuid default null,
  p_table_id        uuid default null
) returns public.permission_level
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_granted public.permission_level;
  v_default public.permission_level;
begin
  if p_user_id is null or p_resource_id is null then return null; end if;

  -- VIS-25: the top rung. An owner is implicitly admin and needs no grant row.
  if iam.owner_of(p_resource_type, p_resource_id) = p_user_id then
    return iam.top_content_level();
  end if;

  -- The UNION arm, unchanged: every grant on the thing that carries this person, public
  -- grants included (Rule 9 - union only, no deny).
  v_granted := iam.granted_level(p_user_id, p_resource_type, p_resource_id);

  -- The ROLE DEFAULT arm, which VIS-19 says a per-thing grant overrides. The membership
  -- test, the shared_only test, the grant override and the per-Table default all live in
  -- the one function the access kernel asks, so the two can no longer drift.
  v_default := iam.member_lane_confers(p_user_id, p_organization_id, p_resource_type,
                                       p_resource_id, p_table_id);

  return greatest(v_granted, v_default);   -- greatest() ignores a null arm
end;
$fn$;

comment on function iam.effective_level(uuid, text, uuid, uuid, uuid) is
  'VIS-19 / VIS-25. The level this person holds on this thing: Owner first, then the highest '
  'grant on it, then - only where no grant is addressed to them - what membership alone confers '
  'in this organization (iam.member_lane_confers). The same rule iam.has_access_for_base''s '
  'organization-member lane admits, asked once.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. AND THE TWO NEW FUNCTIONS ARE DECLARED, IN DATA, AS THINGS NO CLIENT EVER CALLS.
--
-- Both are SECURITY DEFINER and both take the person as an ARGUMENT rather than reading the
-- caller, which is exactly what `provision_shape_guard` exists to make somebody say out loud:
-- a client that could call either would be able to ask "what may that OTHER person do with
-- that thing", one probe at a time. They are rungs of the access kernel; the doors a person
-- reaches are in schema `custom` and they decide the caller.
-- ─────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('iam', 'grant_addressed_level',
   'p_user_id uuid, p_resource_type text, p_resource_id uuid',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype]::oid[],
   'p_user_id is the person being ASKED ABOUT, never the caller. p_resource_id is matched only '
   'against iam.permissions rows for p_resource_type; a null user or resource answers null.',
   'levelfix_membership_confers_the_organizations_level.sql',
   'server_only: a rung of the access kernel. It is read by iam.member_lane_confers and by '
   'iam.effective_level, both of which run inside SECURITY DEFINER doors that decide the caller '
   'first. A client calling it directly could enumerate other people''s grants.',
   false, false),
  ('iam', 'member_lane_confers',
   'p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'uuid'::regtype]::oid[],
   'p_user_id is the person being ASKED ABOUT, never the caller. p_organization_id is the '
   'organization whose knob is read; p_id is read inside it. Null user or null organization '
   'answers null, which is "membership confers nothing".',
   'levelfix_membership_confers_the_organizations_level.sql',
   'server_only: a rung of the access kernel, read by iam.has_access_for_base and '
   'iam.effective_level. Every door a person actually reaches is in schema custom and decides '
   'the caller with custom.assert_client_may_open / _may_change before any of this is asked.',
   false, false)
on conflict do nothing;
