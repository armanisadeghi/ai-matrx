-- lane: access-ladder T-36 — a row of an "Only me" custom Table opens to the organization; "Only me" hides, never locks.
-- chair-step: iam.member_lane_confers gains a 6th argument (p_personal_hides), so its 5-argument signature is dropped (pg_depend: no dependents; callers are late-bound plpgsql) and the new one is REVOKEd from clients exactly as the old one was (EXECUTE postgres only).
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 795191af287b8bc41cae087b6f1f0794ddbe3a942468127be2877ce140f01abf
-- based-on: iam.member_lane_confers(uuid, uuid, text, uuid, uuid) 3456970f0d65679b4acd02db4beb9511a45d6c4eec1f9c42bb9488dd61d02eda
-- based-on: iam.entity_read_kernel_expected() fa488ae0cddae45bde2d77d0afaaba43cbe2be5d48f0f5aa12918efdc12594d3
-- based-on: iam.entity_read_kernel_members_expected() f84422fa1500ee3b1e87f1cc8810700346422bf0375b4d3d40c1434a780e48b6
-- based-on: platform.kernel_equivalence_expected() 03640246a27749b0c8a584709ef761368223b23e2cbcf53bdf0337097df9ed1b
--
-- Finding (kernel equivalence fixture, after T-34): for `row_of_a_mine_table` — an 'internal' row inside another
-- person's Table whose owner set it to "Only me" (the Table record is 'personal') — the kernel
-- (iam.has_access_for_base) refused the organization's member and owner at every level while the read policy
-- on custom.record let both read. Two locks the law removed but the kernel kept:
--   * the org-admin arms' SHARE-LANE-2 conjunct `not custom.row_sits_in_a_personal_table(...)`;
--   * the member arm's iam.member_lane_confers, which returns null for a row below 'internal' (ACCESS-IS-PERSONAL)
--     and for a row of a Table below 'internal' (SHARE-TAILS).
-- Law (common-docs/policies/access-ladder.md): on an Organization table "Only me" hides from lists and never
-- locks; children inherit their parent. custom.record is Organization-class.
--
-- Fix: the admin arms drop the conjunct; member_lane_confers gains `p_personal_hides` (default false) and the
-- kernel — the opening question — passes true. Every other caller (custom.visible_record_ids /
-- custom.visible_set / iam.effective_level / custom.addressed_cap / custom.share_access …: the list and set
-- doors) is unchanged, so "Only me" rows keep staying out of coworkers' lists.
-- The fixture's row_of_a_mine_table answers for member and org_owner are re-recorded as their open-table twin
-- (member: viewer; owner: up to admin); nothing else may move. The kernel fingerprint is re-recorded.
set local lock_timeout = '2s';

create temp table _t36_before on commit drop as select platform.kernel_equivalence_answers() a;

drop function iam.member_lane_confers(uuid, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION iam.member_lane_confers(p_user_id uuid, p_organization_id uuid, p_type text DEFAULT 'record'::text, p_id uuid DEFAULT NULL::uuid, p_table_id uuid DEFAULT NULL::uuid, p_personal_hides boolean DEFAULT false)
 RETURNS permission_level
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table    uuid := p_table_id;
  v_store_on boolean;
  v_row_table      uuid;
  v_row_visibility platform.visibility;
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
    v_store_on := custom.store_is_open(p_organization_id);
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
  --
  -- 🚨 ACCESS-IS-PERSONAL (2026-09-24) — AND THE ROW'S OWN VISIBILITY BOUNDS THIS LANE (DD-136).
  -- Membership is the organization lane, addressed to nobody in particular, and the access
  -- kernel only ever asks this function behind `v_vis >= 'internal'` (iam.has_access_for_base).
  -- `custom.reaches_directly` arm 2 and every level read in the record store
  -- (`iam.effective_level`) asked it with no such guard, so a clinic whose members edit the day
  -- sheet by default handed the front desk the practice manager's PERSONAL appointment — while
  -- `iam.has_access_for` refused the same row and `custom.carrying_edges_of` arm 3 declined to
  -- carry it ("reached by a grant and by its creator and by nothing else"). A row below
  -- `internal` gets nothing from membership here; its owner and a grant addressed to it are
  -- admitted on their own arms, untouched. Rule 9 stands: this narrows the lane addressed to
  -- nobody, it denies nothing a grant gave. Proof: scripts/campaign-tests/accesspersonal_personal_record_green.sql.
  if p_type = 'record' and p_id is not null
     and to_regclass('custom.record') is not null then
    select r.table_id, r.visibility into v_row_table, v_row_visibility
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id;
    -- Access ladder T-36: with p_personal_hides (the access kernel's opening question) "Only me"
    -- is a list filter on an Organization table and never removes this lane; the list and set
    -- doors call without it and keep leaving such rows out.
    if not p_personal_hides
       and v_row_visibility is not null and v_row_visibility < 'internal'::platform.visibility then
      return null;
    end if;
    if v_table is null then
      v_table := v_row_table;
    end if;
  end if;

  -- 🚨 SHARE-TAILS (2026-09-25) — AND THE ROW'S TABLE BOUNDS IT TOO. A Table set to "Only people I
  -- share it with" is `personal` (custom.share_lane_set writes the lane and the visibility in one
  -- transaction), and membership must not reach it through its ROWS either: the rows stay
  -- `internal` so the Table's own grants keep carrying them to the people named
  -- (custom.table_carries_its_rows), but the lane addressed to nobody stops at the Table. Without
  -- this line a member read every row of a "mine" Table, and so the Table itself
  -- (custom.table_has_a_visible_record). Grants, ownership and containment are untouched.
  if not p_personal_hides
     and v_table is not null and v_table is distinct from custom.table_kernel_id()
     and to_regclass('custom.record') is not null
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id and t.id = v_table
                    and t.visibility < 'internal'::platform.visibility) then
    return null;
  end if;

  return iam.member_default_level(p_organization_id, v_table);
end;
$function$
;

revoke all on function iam.member_lane_confers(uuid, uuid, text, uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- A door follows its function: the server-only declaration moves to the new signature.
update platform.client_callable_door d
   set identity_args = pg_get_function_identity_arguments(p.oid),
       identity_argtypes = platform.door_argtypes(p.proargtypes),
       reason = d.reason || ' p_personal_hides (default false; never null in practice) is true only for the access kernel''s opening question: "Only me" on the row or its Table then does not remove the member lane (access ladder T-36); list and set doors leave it false.',
       declared_by = 'access_ladder_t36_only_me_table_hides_never_locks.sql'
  from pg_proc p
 where d.schema_name = 'iam' and d.function_name = 'member_lane_confers'
   and d.identity_args = 'p_user_id uuid, p_organization_id uuid, p_type text, p_id uuid, p_table_id uuid'
   and p.oid = 'iam.member_lane_confers(uuid, uuid, text, uuid, uuid, boolean)'::regprocedure;

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
  -- RC-A2b: a detail answers to the record it is on (see the branch below).
  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
  v_detail_cols text[];  -- RC-A2e: the declared parent pointer (platform.detail_parent_columns)
  -- RC-A2c: the reference gate (platform.reference_gate).
  v_gate_cols text[]; v_gate_type_col text; v_gate_id_col text; v_gate_type text; v_gate_id uuid;
  -- RC-A1 trash rule (platform.trash_hides).
  v_trash_del timestamptz; v_trash_owner uuid;
  -- Access ladder T-11 leak fixes: a child answers to its parent (platform.child_parent_columns).
  v_child_cols text[]; v_child_type text; v_child_id uuid;
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

    select et.schema_name, et.table_name, et.rls_variant, platform.reference_gate_columns(et.token)
      into v_schema, v_table, v_variant, v_gate_cols
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
    v_gate_type_col := v_gate_cols[1]; v_gate_id_col := v_gate_cols[2];
    -- 🚨 RC-A2c (2026-09-25) — A RECORD THAT POINTS AT ANOTHER RECORD IS READ ONLY BY PEOPLE WHO
    -- CAN READ WHAT IT POINTS AT. A War Room thread / room names its subject (anchor_type,
    -- anchor_id) and copies its name; read by its own 'internal' visibility, 13 threads were
    -- readable by members who could not open the project or task. A gated node whose target is
    -- set grants nothing at any level, and carries nothing to its containers, unless the caller
    -- can view the target. An AND on the row's own lanes: it only narrows.
    if v_gate_id_col is not null then
      v_gate_type := null; v_gate_id := null;
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_gate_type_col, v_gate_id_col, v_schema, v_table)
        into v_gate_type, v_gate_id using v_id;
      continue walk when v_gate_type is not null and v_gate_id is not null
        and not (case when v_gate_type = 'file'
                      then files.has_access_for(v_uid, v_gate_id, 'viewer'::public.permission_level)
                      else iam.has_access_for_base(v_uid, v_gate_type, v_gate_id,
                                                   'viewer'::public.permission_level, true, v_visited)
                 end);
    end if;
    -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour) — A TRASHED RECORD IS ITS
    -- OWNER'S ALONE. For a token that declares it (platform.trash_is_owner_only), a row in its
    -- owner's trash grants nothing to anyone else at any level and carries nothing to its
    -- containers; restore gives every lane back. ONE rule, platform.trash_hides, asked here, by
    -- iam.accessible_entity_ids (set-wise) and by iam.entity_read_expr (the table read policy).
    -- The platform admin lane reads through platform_admin_read and is untouched.
    if platform.trash_is_owner_only(v_type) then
      v_trash_del := null; v_trash_owner := null;
      execute format('select deleted_at, created_by from %I.%I where id = $1', v_schema, v_table)
        into v_trash_del, v_trash_owner using v_id;
      continue walk when platform.trash_hides(v_type, v_trash_del, v_trash_owner, v_uid);
    end if;
    -- 🚨 RC-A2b (2026-09-25) — A DETAIL ANSWERS TO THE RECORD IT IS ON, AND TO NOTHING ELSE.
    -- A `detail` (platform.comments) names its record with (entity_type, entity_id). Until this
    -- branch the kernel resolved a detail's OWN token like any organization-class entity: from
    -- the row's own visibility ('internal' on every comment) plus organization membership, so a
    -- plain member who could not open a colleague's personal note held viewer, commenter AND
    -- editor on its comments, and version_list / version_snapshot / version_restore('comment', …)
    -- read and rewrote them (verify-RC-A2 F1/F2; 22 of 28 live comments exposed). The table
    -- policy already asked the record; now every door that asks about the comment does too.
    --   viewer / commenter  the same level on the record
    --   editor              the author, still holding commenter on the record
    --   admin               the author as above, or admin on the record (cmt_delete's rule)
    -- A soft-deleted detail answers to its author only; a detail never sits on a detail (a
    -- reply goes through the record's thread). No lane below this branch is consulted: no own
    -- visibility, no organization lane, no grant on the comment itself — the record's own
    -- resolution already carries every lane it has. Guard: aidream
    -- db/tests/test_rca2b_comment_follows_its_record.py.
    -- RC-A2e: every DECLARED detail takes this branch whatever its registry variant, and a
    -- `detail` token with no declaration fails closed instead of reading columns it may not have.
    v_detail_cols := platform.detail_parent_columns(v_type);
    if v_variant = 'detail' or v_detail_cols is not null then
      continue walk when v_detail_cols is null;
      v_detail := null;
      execute format('select to_jsonb(t) from %I.%I t where t.id = $1', v_schema, v_table)
        into v_detail using v_id;
      continue walk when v_detail is null;
      -- 1294: THE ONE RESOLVER (platform.detail_parent_of): the preferred typed pointer when set,
      -- else the type column mapped to a kernel token, else the fixed type.
      select p.parent_type, p.parent_id into v_detail_type, v_detail_id
        from platform.detail_parent_of(v_type, v_detail) p;
      v_detail_author := (v_detail ->> 'created_by')::uuid;
      continue walk when v_detail_type is null or v_detail_id is null;
      continue walk when platform.token_is_detail(v_detail_type);
      continue walk when v_detail ->> 'deleted_at' is not null
                     and v_detail_author is distinct from v_uid;
      if p_required <= 'commenter'::public.permission_level then
        if platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, p_required) then return true; end if;
      else
        if v_detail_author = v_uid
           and platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, 'commenter'::public.permission_level)
        then return true; end if;
        if p_required >= 'admin'::public.permission_level
           and platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, 'admin'::public.permission_level)
        then return true; end if;
      end if;
      continue walk;
    end if;
    v_attrs := platform.entity_row_access_attrs(v_schema, v_table, v_id);
    v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
    continue walk when not coalesce(v_found, false);
    -- 🚨 ACCESS LADDER T-33 (2026-09-28) — AN ARCHIVED ORGANIZATION IS CLOSED, TO EVERYONE. Asked
    -- before every lane: its author, the library lanes, public rows, members, admins, owners, grants
    -- and shares, record memberships, containment. `continue walk` also stops the walk carrying
    -- through the record. Every row is kept; iam.organization_restore reopens all of it at once.
    -- The generated policies ask the same question in one restrictive policy (org_open_gate).
    if v_org is not null
       and exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
      continue walk;
    end if;
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

    v_containment_carries := (v_vis is null
                              or v_vis >= 'internal'::platform.visibility
                              or not iam.table_has_visibility(v_schema, v_table));
    if v_owner = v_uid then return true; end if;
    -- 🚨 ACCESS LADDER T-11y MIRROR (2026-09-28) — A CHILD NEVER OPENS THROUGH THE ORGANIZATION LANES.
    -- iam.org_lane_visibility_sql (the generated read lane) refuses the organization lane to any row
    -- naming its parent record (platform.child_parent_columns), at every visibility level; this kernel
    -- admitted an org member to an `internal` child file of a private chat. The parent pointer is read
    -- here, once, so both organization arms below can ask it; the frontier push further down uses it.
    v_child_cols := platform.child_parent_columns(v_type);
    v_child_type := null; v_child_id := null;
    if v_child_cols is not null then
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_child_cols[1], v_child_cols[2], v_schema, v_table)
        into v_child_type, v_child_id using v_id;
    end if;
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
    if p_required = 'viewer'::public.permission_level and v_org is not null and v_child_type is null then
      if v_is_org_admin is null then
        -- Access ladder T-36: a row of a Table set to "Only me" opens to the organization's owners
        -- and admins like any row of an Organization table; "Only me" hides it from their lists
        -- and never locks (SHARE-LANE-2's lock removed; the read policy never carried it).
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
      end if;
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
              -- Access ladder T-11: on an Organization table `personal` hides from lists; it
              -- never locks (children and private-class rows excepted: iam.personal_opens_row).
              or (v_vis = 'personal'::platform.visibility
                  and iam.personal_opens_row(v_type, v_schema, v_table, v_id))
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
    -- Access ladder T-11: on an Organization table `personal` no longer locks the organization's
    -- lanes — it is "Only me", a list filter. A child (a file naming its parent record) and a
    -- private/confidential-class row keep the lock (iam.personal_opens_row).
    if (v_vis >= 'internal'::platform.visibility
        or (v_vis = 'personal'::platform.visibility
            and iam.personal_opens_row(v_type, v_schema, v_table, v_id)))
       and v_org is not null and v_child_type is null then
      if v_lanes.org_role_lane then
        if v_is_org_admin is null then
        -- Access ladder T-36: a row of a Table set to "Only me" opens to the organization's owners
        -- and admins like any row of an Organization table; "Only me" hides it from their lists
        -- and never locks (SHARE-LANE-2's lock removed; the read policy never carried it).
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
      end if;
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
        -- Access ladder T-36: the opening question passes p_personal_hides => true, so an "Only me"
        -- row, or a row of an "Only me" Table, opens to a member at the member level (the list
        -- doors keep the default and still leave it out of lists).
        elsif p_required <= iam.member_lane_confers(v_uid, v_org, v_type, v_id, null, true) then
          return true;
        end if;
      end if;
    end if;

    -- 🚨 ACCESS LADDER T-11 (2026-09-28) — A CHILD OPENS TO WHOEVER CAN OPEN ITS PARENT.
    -- Law: "Children inherit their parent". A row that names its parent record
    -- (platform.child_parent_columns: a file attached to an AI chat, the letter of an HR
    -- verification letter request, a dictation's audio chunk) has no organization lane of its
    -- own (iam.personal_opens_row above); here the parent record joins the frontier at the same
    -- level and the same public flag, so the parent's own lanes, class and trash rule decide.
    -- Owner, grants and containment on the child itself are unchanged. A child with only a type
    -- (its record not there yet, or gone) pushes nothing and stays its owner's.
    -- The set-wise twin is in iam.accessible_entity_ids.
    if v_child_cols is not null then
      -- (the parent pointer was read above, before the organization arms)
      if v_child_type is not null and v_child_id is not null then
        v_q_type := v_q_type || v_child_type;
        v_q_id   := v_q_id   || v_child_id;
        v_q_pub  := v_q_pub  || v_pub;
      end if;
    end if;

    -- No arm on this node granted. Push its containers onto the frontier: the closure first, the
    -- registered FK parents second, both exactly as the recursive body walked them.
    -- ACCESS LADDER T-33 (2026-09-28): a child row (one naming its parent record) opens only through
    -- that parent — never through its folder or any other container.
    if v_containment_carries and v_child_type is null then
      v_child_include_public := v_pub and (v_vis is null or v_vis = 'public'::platform.visibility);
      for rec in
        select r.container_type, r.container_id from platform.reachability r
        where r.item_type = v_type and r.item_id = v_id and r.max_level >= p_required
          -- 🚨 ACCESS LADDER T-35 (2026-09-28) — CONTAINMENT NEVER CARRIES A PRIVATE OR CONFIDENTIAL
          -- ROW. Private opens to its owner alone, Confidential to the people its own rules name;
          -- sitting inside an Organization container (a War Room thread holding a person's audio,
          -- a project holding an AI chat) conveys neither. Measured: test@test.com read 4 of
          -- admin@admin.com's transcripts.studio_sessions through a War Room thread. Composition
          -- (a child answering to its parent) is inheritance, not containment, and is unchanged.
          and v_lanes.resolved_class in ('organization', 'public')
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
          -- ACCESS LADDER T-35: a containment edge carries only an Organization or Public row.
          and (er.kind = 'composition' or v_lanes.resolved_class in ('organization', 'public'))
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

-- Re-record exactly the reviewed fixture keys, then the kernel fingerprint.
do $t36$
declare
  v_before jsonb; v_after jsonb; v_exp jsonb := platform.kernel_equivalence_expected(); v_new jsonb; v_chk jsonb;
  v_moved text[]; v_bad text[]; v_from text; v_to text; v_live jsonb; v_rec jsonb; v_members text[]; v_pre jsonb;
  c_shape constant text := '^k:record:row_of_a_mine_table:(member|org_owner):(viewer|commenter|editor|admin)$';
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  select a into v_before from _t36_before;
  v_after := platform.kernel_equivalence_answers();
  if v_after->>'error' is not null or v_before->>'error' is not null then
    raise exception 't36: the fixture errors: % / %', v_before->>'error', v_after->>'error';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_moved
    from (select jsonb_object_keys(v_before->'answers') k union select jsonb_object_keys(v_after->'answers')) s
   where (v_before->'answers'->k) is distinct from (v_after->'answers'->k);
  -- every moved key is a reviewed one, false -> true, and now equals its open-table twin
  select coalesce(array_agg(k), '{}') into v_bad from unnest(v_moved) k
   where k !~ c_shape
      or (v_before->'answers'->>k)::boolean is not false
      or (v_after->'answers'->>k)::boolean is not true;
  if cardinality(v_bad) > 0 then
    raise exception 't36: answers moved outside the reviewed set: %', v_bad;
  end if;
  select coalesce(array_agg(k), '{}') into v_bad
    from jsonb_object_keys(v_after->'answers') k
   where k ~ c_shape
     and (v_after->'answers'->k) is distinct from
         (v_after->'answers'->replace(k, 'row_of_a_mine_table', 'row_of_an_open_table'));
  if cardinality(v_bad) > 0 or cardinality(v_moved) = 0 then
    raise exception 't36: the only-me Table row does not answer as its open twin (or nothing moved): %', v_bad;
  end if;
  if exists (select 1 from jsonb_object_keys(v_after->'answers') k
              where k ~ '^p:record:row_of_a_mine_table:'
                and (v_after->'answers'->k) is distinct from (v_before->'answers'->k)) then
    raise exception 't36: the read policy answers moved';
  end if;

  v_new := jsonb_set(v_exp, '{answers}',
             ((v_exp->'answers') - v_moved)
             || (select jsonb_object_agg(k, v_after->'answers'->k) from unnest(v_moved) k));
  execute format('CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected() RETURNS jsonb LANGUAGE sql IMMUTABLE AS %L',
                 E'\n  SELECT ' || quote_literal(v_new::text) || E'::jsonb\n');

  v_from := iam.entity_read_kernel_expected();
  v_to := iam.entity_read_kernel_fingerprint();
  if v_to = v_from then
    raise exception 't36: the kernel fingerprint did not move after replacing has_access_for_base';
  end if;
  v_live := iam.entity_read_kernel_members_live();
  v_rec := coalesce(iam.entity_read_kernel_members_expected()->'members', '{}'::jsonb);
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_members from (
    select k from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k from jsonb_object_keys(v_rec) k where not v_live ? k) s;
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::text
$f$$ddl$, v_to);
  execute format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $f$
  SELECT %L::jsonb
$f$$ddl$, jsonb_build_object('fingerprint', v_to, 'members', v_live)::text);

  v_chk := platform.kernel_equivalence_check();
  if not (v_chk->>'ok')::boolean or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0
     or (v_chk->>'missing')::int <> 0 then
    raise exception 't36: the check is not clean after the re-record: %', v_chk - 'read_lane';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't36: fingerprint re-record did not take';
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f
              where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 't36: the provisioner preflight still names the read kernel: %', v_pre;
  end if;

  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_from, v_to, v_members,
          'ACCESS LADDER T-36: a row of an "Only me" custom Table opens to the organization''s owner/admin and '
          || 'members exactly as a row of an open Table (the read policy already did); "Only me" hides from lists, '
          || 'never locks (common-docs/policies/access-ladder.md). SHARE-LANE-2 admin-arm lock removed; the kernel '
          || 'asks iam.member_lane_confers(..., p_personal_hides => true); list/set doors unchanged.',
          v_after->>'version',
          jsonb_build_object('rerecorded', to_jsonb(v_moved), 'count', cardinality(v_moved),
                             'check_after', v_chk - 'read_lane'),
          'migration / access_ladder_t36_only_me_table_hides_never_locks',
          'platform.kernel_equivalence_expected + iam.entity_read_kernel_expected');
  raise notice 't36: re-recorded % answers; kernel % -> % (members: %)', cardinality(v_moved), v_from, v_to, v_members;
end
$t36$;
