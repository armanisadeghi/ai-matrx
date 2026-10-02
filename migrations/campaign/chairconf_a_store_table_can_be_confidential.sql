-- chair-step: lane CHAIR-CONFIDENTIAL-STORE — a store (custom) Table can be Confidential. Five BODY replacements (iam.has_access_for_base, custom.reaches_directly, custom.visible_set, custom._table_shape_guard, platform._set_table_strict_class: same signatures, same SECURITY/search_path, CREATE OR REPLACE keeps their grants), four NEW functions (custom.confidential_anchor, custom.confidential_names, custom.confidential_answer, custom.set_table_confidential_arman_explicitly_approved — EXECUTE revoked from every client role; postgres only), and the D249 kernel re-record after a zero-moved-answers proof. No table, column, index, trigger, policy or grant to a client is added. Inverse: migrations/inverse/chairconf_a_store_table_can_be_confidential_down.sql.
-- lane: CHAIR-CONFIDENTIAL-STORE
-- lock: custom
-- window-class: function bodies and their kernel re-record; no DDL on any table.
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 576c521cf83a1b7428ac589c8ae9b28381d96334d1aaec0512c521eb3c3b026b
-- based-on: custom.reaches_directly(uuid, text, uuid, permission_level) 125313d281e46dc4d6946035230ede32e14397f60be28c0b3d33348b1aacbc42
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) 7ce6219edc2d442dca132f374b5694fcd709acbdb518ee08d04acd29ecd6ab38
-- based-on: custom._table_shape_guard() 989e808a0c09e3a3b29f3b886a3ca4cc71320a1a60e7f611fda7d8d329e33ce6
-- based-on: platform._set_table_strict_class(text, platform.data_class, text, date, text, boolean) 25fbf413b8875271b8582081e6ad3b2e9bb7a39aa6c107970b7be7bb1f9c18d9
-- based-on: iam.entity_read_kernel_expected() 0a3e31f11fd8251a431963346ec106c9d496d1c781188e726088f12e01515f4b
-- based-on: iam.entity_read_kernel_members_expected() 70c196f7ba95bb82030180301b53dde5641a5a3315ca1c7293950b9bbd8dc0e9
--
-- THE GAP (lane 12, proof two, 2026-10-02). The access ladder's Confidential level — "the owner and the
-- people the record's own rules name"; canonical example the HR employee record — existed for standard
-- tables (platform.set_table_confidential_arman_explicitly_approved) and not for store Tables, which had
-- field sensitivity only. A member who was neither owner nor named read a manager's review of an
-- employee through read_records, read_records_page + search, read_record, record_aggregate, the history
-- doors and io_export.
--
-- THE DESIGN, IN THE ONE KERNEL PATH.
--   · State: the Table document carries `level: "confidential"` and `readers: [{field, level}]` — the
--     record's own rules (a field naming a person — a Person record or an account — or a team).
--   · Door: custom.set_table_confidential_arman_explicitly_approved(p_table_id, p_readers, p_arman_words,
--     p_approved_on) records Arman's words in platform.class_approval_by_arman (token custom.table:<id>,
--     the standard door's own ledger and word rule) and writes both keys; platform.set_table_confidential_
--     arman_explicitly_approved(p_token => 'custom.table:<id>', …) routes to it. custom._table_shape_guard
--     refuses every other write that enters Confidential or changes its readers (42501, the standard
--     refusal's sentence). Back to Organization needs no approval.
--   · Read: ONE answer, custom.confidential_answer, asked by the platform's one check
--     (iam.has_access_for_base, every record node of every walk) and by the store's ladder
--     (custom.reaches_directly, before arm 1). Owner and Table owner: every level; a share addressed to
--     the person on the row or the Table: its level; a named reader: its level (≤ editor); nobody else.
--   · Set lane: custom.visible_set — the one body that names the visibility column — stops for a
--     Confidential Table (or one holding children of one) and the doors walk the per-row ladder.
--   · Children: a record whose parent_id climbs to a Confidential row answers exactly as that row.
--
-- RED before this file, GREEN after: scripts/campaign-tests/chairconf_a_store_table_can_be_confidential_proof.sql
-- (clone, as admin@admin.com the manager and test@test.com the coworker, Cedar Ridge Physical Therapy).

set local lock_timeout = '2s';

create temp table _chairconf_before on commit drop as select platform.kernel_equivalence_answers() a;

-- ── NEW: where a row's Confidential answer comes from ───────────────────────────────────────────
create or replace function custom.confidential_anchor(p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- THE CONFIDENTIAL ROW A RECORD ANSWERS TO, or null. A record of a Confidential Table answers to
-- itself; a record whose parent_id climbs (at most 16 hops) to one answers to that row — "children
-- inherit their parent" (access ladder). A Table, a field, a rule, a kernel row: null.
declare
  v_id     uuid := p_id;
  v_org    uuid;
  v_data   jsonb;
  v_level  text;
  v_hops   integer := 0;
begin
  if p_id is null then return null; end if;
  loop
    select r.organization_id, r.data, t.data ->> 'level'
      into v_org, v_data, v_level
      from custom.record r
      left join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
     where r.id = v_id and r.data_class = 'record';
    if not found then return null; end if;
    if v_level = 'confidential' then return v_id; end if;
    exit when v_hops >= 16 or jsonb_typeof(v_data -> 'parent_id') is distinct from 'string';
    v_hops := v_hops + 1;
    begin
      v_id := (v_data ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      return null;
    end;
  end loop;
  return null;
end;
$function$;

create or replace function custom.confidential_names(p_organization_id uuid, p_value jsonb, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
-- DOES THIS FIELD VALUE NAME THIS PERSON? A value is one id or a list of ids, and an id names the
-- person when it is their account, a Person record of this organization that is theirs, or a team
-- they are an active member of.
  select exists (
    select 1
      from jsonb_array_elements_text(case jsonb_typeof(p_value)
                                       when 'array'  then p_value
                                       when 'string' then jsonb_build_array(p_value)
                                       else '[]'::jsonb end) v(s)
     where v.s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (v.s::uuid = p_user
            or exists (select 1 from custom.record p
                        where p.organization_id = p_organization_id and p.id = v.s::uuid
                          and p.table_id = '11111111-0000-4000-8000-000000000005'::uuid
                          and p.deleted_at is null
                          and p.data ->> 'user_id' = p_user::text)
            or exists (select 1 from iam.memberships m
                        where m.container_type = 'team' and m.container_id = v.s::uuid
                          and m.user_id = p_user and m.deleted_at is null
                          and m.status = 'active')));
$function$;

create or replace function custom.confidential_answer(p_user uuid, p_id uuid, p_required public.permission_level default 'viewer')
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- THE ONE ANSWER FOR A ROW OF A CONFIDENTIAL STORE TABLE (access ladder: "the owner and the people
-- the record's own rules name"). null = the row is not under a Confidential Table, ask the ladder
-- as always. Otherwise, at the level asked:
--   · the row's owner (created_by) and the Table's owner: every level;
--   · a share addressed to this person — on the row, or on its whole Table — at its own level
--     (sharing sits outside the ladder and works at every level);
--   · a person a reader field names (the Table's `readers`): that reader's level, never above editor;
--   · nobody else: no organization lane, no admin lane, no library lane, no containment.
-- An archived organization is closed to everyone. A child answers exactly as its Confidential row.
-- Asked by iam.has_access_for_base and custom.reaches_directly — the platform's one check and the
-- store's ladder — so they cannot disagree.
declare
  v_anchor  uuid;
  v_org     uuid;
  v_table   uuid;
  v_owner   uuid;
  v_data    jsonb;
  v_towner  uuid;
  v_readers jsonb;
  v_grant   public.permission_level;
  v_reader  jsonb;
  v_level   public.permission_level;
begin
  v_anchor := custom.confidential_anchor(p_id);
  if v_anchor is null then return null; end if;
  if p_user is null then return false; end if;

  select r.organization_id, r.table_id, r.created_by, r.data, t.created_by, t.data -> 'readers'
    into v_org, v_table, v_owner, v_data, v_towner, v_readers
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = v_anchor;

  if exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
    return false;
  end if;
  if p_user = v_owner or p_user = v_towner then
    return true;
  end if;

  select max(g.permission_level) into v_grant
    from iam.permissions g
   where g.resource_type = 'record'
     and g.resource_id in (v_anchor, v_table)
     and g.granted_to_user_id = p_user
     and g.status = 'active'
     and (g.expires_at is null or g.expires_at > now());
  if v_grant is not null and v_grant >= p_required then
    return true;
  end if;

  if jsonb_typeof(v_readers) = 'array' then
    for v_reader in select x from jsonb_array_elements(v_readers) x loop
      continue when jsonb_typeof(v_reader) is distinct from 'object';
      v_level := least(coalesce(nullif(v_reader ->> 'level', '')::public.permission_level, 'viewer'),
                       'editor'::public.permission_level);
      continue when v_level < p_required;
      if custom.confidential_names(v_org, v_data -> (v_reader ->> 'field'), p_user) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

-- ── NEW: the Arman-approved door for a store Table ──────────────────────────────────────────────
create or replace function custom.set_table_confidential_arman_explicitly_approved(
  p_table_id uuid, p_readers jsonb, p_arman_words text, p_approved_on date)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
-- THE ONE DOOR THAT MAKES A STORE TABLE CONFIDENTIAL, OR CHANGES WHOM IT NAMES. The standard
-- table's door (platform.set_table_confidential_arman_explicitly_approved) records Arman's words
-- in platform.class_approval_by_arman and the registry refuses the change without that row in the
-- same transaction; this is the same rule for a store Table, whose level lives on its document.
-- p_readers null keeps the readers it has. custom._table_shape_guard judges the readers' shape
-- and refuses any write of `level`/`readers` that has no approval row in this transaction.
declare
  v_id      bigint;
  v_org     uuid;
  v_before  text;
  v_readers jsonb;
begin
  if p_table_id is null then
    raise exception 'Name the store Table to make Confidential (p_table_id).' using errcode = '22004';
  end if;
  select t.organization_id, t.data ->> 'level' into v_org, v_before
    from custom.record t
   where t.id = p_table_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null;
  if not found then
    raise exception 'There is no live store Table %.', p_table_id using errcode = '02000';
  end if;
  v_id := platform._record_arman_class_approval('custom.table:' || p_table_id::text,
                                                'confidential'::platform.data_class,
                                                p_arman_words, p_approved_on);
  update custom.record t
     set data = t.data
                || jsonb_build_object('level', 'confidential')
                || case when p_readers is null then '{}'::jsonb
                        else jsonb_build_object('readers', p_readers) end
   where t.organization_id = v_org and t.id = p_table_id
  returning t.data -> 'readers' into v_readers;
  return jsonb_build_object('token', 'custom.table:' || p_table_id::text, 'table_id', p_table_id,
                            'level', 'confidential', 'approval_id', v_id, 'class_set', true,
                            'from', coalesce(v_before, 'organization'),
                            'readers', coalesce(v_readers, '[]'::jsonb));
end;
$function$;

-- The access decision for each new definer, IN DATA (provision_shape_guard / §6d-4): none is a client door.
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
 ('custom', 'confidential_anchor', pg_get_function_identity_arguments('custom.confidential_anchor(uuid)'::regprocedure),
  ARRAY['uuid'::regtype]::oid[],
  'p_id is a record id; the function returns which Confidential row it answers to and reads nothing a caller does not already name. NULL p_id answers NULL.',
  'campaign chairconf_a_store_table_can_be_confidential.sql',
  'server_only: called only inside custom.confidential_answer and custom.visible_set, both running as their owner; no client ever calls it.', false, false),
 ('custom', 'confidential_names', pg_get_function_identity_arguments('custom.confidential_names(uuid,jsonb,uuid)'::regprocedure),
  ARRAY['uuid'::regtype, 'jsonb'::regtype, 'uuid'::regtype]::oid[],
  'p_organization_id scopes the Person lookup; p_user is the person being asked about, supplied by the access kernel, never by a client. NULLs answer false.',
  'campaign chairconf_a_store_table_can_be_confidential.sql',
  'server_only: called only inside custom.confidential_answer; answering it for an arbitrary person would be a probe, so no client lane may ever exist.', false, false),
 ('custom', 'confidential_answer', pg_get_function_identity_arguments('custom.confidential_answer(uuid,uuid,permission_level)'::regprocedure),
  ARRAY['uuid'::regtype, 'uuid'::regtype, 'public.permission_level'::regtype]::oid[],
  'p_user is the principal the access kernel is answering for; p_id the record. It is a rung of iam.has_access_for_base and custom.reaches_directly. NULL p_id answers NULL; NULL p_user on a Confidential row answers false.',
  'campaign chairconf_a_store_table_can_be_confidential.sql',
  'server_only: a rung of the access kernel (iam.has_access_for_base) and the store ladder (custom.reaches_directly); clients ask iam.has_access, never this, because asking about another person is a probe.', false, false),
 ('custom', 'set_table_confidential_arman_explicitly_approved', pg_get_function_identity_arguments('custom.set_table_confidential_arman_explicitly_approved(uuid,jsonb,text,date)'::regprocedure),
  ARRAY['uuid'::regtype, 'jsonb'::regtype, 'text'::regtype, 'date'::regtype]::oid[],
  'p_table_id must be a live store Table; p_arman_words and p_approved_on are judged by platform._record_arman_class_approval exactly as for a standard table. NULL p_table_id is refused.',
  'campaign chairconf_a_store_table_can_be_confidential.sql',
  'server_only: Arman approves a Confidential table in his own words and the chair records them as the database owner; platform.set_table_confidential_arman_explicitly_approved (service_role) routes custom.table:<id> here.', false, false);

revoke all on function custom.confidential_anchor(uuid) from public, anon, authenticated, service_role;
revoke all on function custom.confidential_names(uuid, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function custom.confidential_answer(uuid, uuid, public.permission_level) from public, anon, authenticated, service_role;
revoke all on function custom.set_table_confidential_arman_explicitly_approved(uuid, jsonb, text, date) from public, anon, authenticated, service_role;

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
  -- CHAIR-CONFIDENTIAL-STORE: a row of a Confidential store Table answers to custom.confidential_answer.
  v_conf boolean;
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
    -- 🚨 CHAIR-CONFIDENTIAL-STORE (2026-10-02) — A ROW OF A CONFIDENTIAL STORE TABLE OPENS TO ITS
    -- OWNER AND THE PEOPLE ITS OWN RULES NAME, AND TO NOTHING ELSE (access ladder: Confidential).
    -- custom.record is one token for every store Table, so its class cannot say which Tables are
    -- Confidential; the Table document does (`level`, set only through the Arman-approved door).
    -- One question, custom.confidential_answer: null = not under a Confidential Table (every arm
    -- below runs exactly as before), true/false = the answer, and no other lane is consulted — no
    -- organization lane, no admin lane, no library lane, no containment. A child (a record whose
    -- parent_id climbs to a Confidential row) answers exactly as that row. Shares addressed to the
    -- person, on the row or on its Table, are inside that answer: sharing works at every level.
    if v_type = 'record' and v_schema = 'custom' then
      v_conf := custom.confidential_answer(v_uid, v_id, p_required);
      if v_conf is not null then
        if v_conf then return true; end if;
        continue walk;
      end if;
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

CREATE OR REPLACE FUNCTION custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_vis       platform.visibility;
  -- KERNEL-TAILS arm 3b
  v_parent    uuid;
  v_child     uuid;
  v_named     public.permission_level;
  v_spec      public.permission_level;
  v_hops      integer := 0;
  v_conf      boolean;  -- CHAIR-CONFIDENTIAL-STORE
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- 🚨 CHAIR-CONFIDENTIAL-STORE (2026-10-02) — A ROW OF A CONFIDENTIAL TABLE IS ANSWERED BY ONE
  -- QUESTION AND NO ARM BELOW. The same call the access kernel makes (iam.has_access_for_base), so
  -- the store's ladder and the platform's agree by construction: arm 1's organization lanes, arm 2's
  -- membership default, arm 3's carrying, 3b's named parent and 4's scope membership are all lanes
  -- a Confidential row does not have. Owner, the people its rules name, and shares addressed to the
  -- person are inside the answer.
  if p_type = 'record' then
    v_conf := custom.confidential_answer(p_user_id, p_id, p_required);
    if v_conf is not null then
      return v_conf;
    end if;
  end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id, r.visibility, custom.containment_parent(r.data)
      into v_org, v_table, v_vis, v_parent
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
    if p_required <= custom.level_floor() then return true; end if;
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
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true — subject to the same cap.
  -- 🚨 SHARE-TAILS (2026-09-25) — A PERSONAL RECORD IS CARRIED BY NOTHING. The access kernel
  -- already says so (`iam.has_access_for_base`: `v_containment_carries` is false below
  -- `internal`) and so does the Table edge (`custom.carrying_edges_of` arm 3, DD-136: "reached by a
  -- grant and by its creator and by nothing else"); this loop alone still let a Home carry a
  -- personal Table to every member who reaches the Home through the member lane — which is how a
  -- Table set to "Only people I share it with" stayed open to the whole organization (measured on
  -- the clone, 2026-09-25). Its owner and a grant addressed to it are answered above, untouched.
  if v_vis is not null and v_vis < 'internal'::platform.visibility then
    return false;
  end if;

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
      if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
    end if;
  end loop;

  -- ARM 3b — A RECORD OWNED BY A RECORD SHE IS NAMED ON (lane KERNEL-TAILS, 2026-09-25; chair
  -- ruling for v1store_fixes_green 4d). A person named on a record holds that level — never above
  -- editor — on the records it OWNS (children made through custom.relation_own: the child's
  -- parent_id AND an "owned" relation row from the parent), the way a Notion sub-page inherits its
  -- parent's share, and on their owned children in turn. The nearest explicit grant decides: a
  -- child that carries its own grant for her answers with that grant (the addressed cap's rung 1,
  -- the row itself), and an owned ancestor on the way up that is named for her ends the walk.
  -- WHY IT IS ITS OWN ARM. Arm 3 already carries a live parent's share through the containment
  -- edge. But custom.record_delete archives a container BEFORE its cascade asks about the
  -- children (the order that stops a containment loop), the archive soft-deletes that edge, and
  -- the named editor who may delete the parent was refused its owned child at "viewer" — the
  -- organization's member default, all that was left. This arm reads the ownership itself (the
  -- relation row, which the archive keeps) and the parent's NAMED grant (which the archive keeps),
  -- and admits an archived parent only while it belongs to the archive running in this
  -- transaction (custom.archive_took). A record merely contained, carried or linked is not owned
  -- and gains nothing here; a personal child already returned above (DD-136).
  if p_type = 'record' and v_parent is not null and p_required <= 'editor'::public.permission_level then
    v_child := p_id;
    while v_parent is not null and v_hops < 16 loop
      v_hops := v_hops + 1;
      exit when not exists (
        select 1 from custom.record rel
         where rel.organization_id = v_org and rel.data_class = 'relation' and rel.deleted_at is null
           and rel.data @> jsonb_build_object('kind', 'owned', 'from', v_parent::text, 'to', v_child::text));
      exit when not exists (
        select 1 from custom.record pr
         where pr.organization_id = v_org and pr.id = v_parent
           and (pr.deleted_at is null
                or strpos(coalesce(current_setting('custom.archive_took', true), ''), v_parent::text) > 0));
      select max(g.permission_level) into v_named
        from iam.permissions g
       where g.resource_type = 'record' and g.resource_id = v_parent and g.granted_to_user_id = p_user_id
         and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now());
      if v_named is not null then
        if least(v_named, 'editor'::public.permission_level) >= p_required then
          v_spec := custom.addressed_cap_specific(p_user_id, p_type, p_id, v_org, v_table);
          if v_spec is null or p_required <= v_spec then
            return true;
          end if;
        end if;
        exit;
      end if;
      v_child := v_parent;
      -- an owned ancestor that carries its own grant for her is the nearest explicit grant, and
      -- it was answered no above (or it would have carried through arm 1): the walk ends.
      exit when exists (
        select 1 from iam.permissions g
         where g.resource_type = 'record' and g.resource_id = v_child and g.granted_to_user_id = p_user_id
           and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now()));
      select custom.containment_parent(pr.data) into v_parent
        from custom.record pr where pr.organization_id = v_org and pr.id = v_child;
    end loop;
  end if;

  -- ARM 4 — A SCOPE MEMBERSHIP (lane SC-3', P7's read arm, 2026-09-24). A person the
  -- organization admitted to ONE record — a student to one class — reads that record and the
  -- records it carries, at viewer and never above. Last, because it is the only arm that reads
  -- `iam.memberships`, and every cheaper reason has already answered no. It does not reach the
  -- record's Table: `custom.scope_member_reaches` walks the record's carriers and a Table is
  -- where that walk stops, so the other classes stay unlisted.
  if p_type = 'record' and custom.scope_member_reaches(p_user_id, p_id, p_required) then
    return true;
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label   text;
  v_vis     platform.visibility;
  v_rep     uuid;
  v_id      uuid;
  v_n       integer;
  v_window  integer;
  v_carried record;
  -- SHARED-ONLY (2026-09-19): does the caller reach the TABLE itself at this level? Asked
  -- ONCE, before anything else, because it answers for every row at once.
  v_table_carries boolean := false;
  v_tables        integer;
  v_seen_memo     text;   -- STORE-READ-PERF-3
begin
  o_all_visible     := false;
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;

  if p_user is null or p_organization_id is null then
    o_fallback := true;
    o_note := 'READ-PERF: no principal, so the set-based shape has nobody to answer for. The door is walking the per-row ladder, which is what it did before this file.';
    return;
  end if;

  -- THE FOURTH THING THAT MAKES IT STOP (SHARED-ONLY). With no Table named, the answer spans
  -- the kernel Table as well as every ordinary one, and a Table is no longer a member of a
  -- visibility CLASS — it is visible when something inside it is (arm 4 of the one ladder),
  -- so two Tables of one class answer differently and no representative can speak for them.
  if p_table_id is null then
    o_fallback := true;
    o_note := 'SHARED-ONLY: no Table was named, so this answer spans the kernel Table, whose rows '
           || 'are Tables — and a Table is visible when a record inside it is, which is not a '
           || 'property of its visibility class. The door is walking the per-row ladder. REMEDY: '
           || 'name the Table, or give custom.visible_set a per-Table carry list the way '
           || 'custom.visible_predicate_sql would need to emit `table_id = any(...)`.';
    return;
  end if;

  -- THE CONFIDENTIAL STOP (CHAIR-CONFIDENTIAL-STORE, 2026-10-02). A row of a Confidential Table —
  -- or a child of one — opens to its owner and the people ITS OWN fields name, so two rows of one
  -- visibility class no longer answer alike and no representative may speak for its class. Asked
  -- only when the organization holds a Confidential Table at all, so every other organization pays
  -- one bounded look at its own Tables and nothing else changes.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null
                    and t.data ->> 'level' = 'confidential')
     and (exists (select 1 from custom.record t
                   where t.organization_id = p_organization_id
                     and t.id = p_table_id
                     and t.data ->> 'level' = 'confidential')
          or exists (select 1 from custom.record c
                      where c.organization_id = p_organization_id
                        and c.table_id = p_table_id
                        and c.deleted_at is null
                        and jsonb_typeof(c.data -> 'parent_id') = 'string'
                        and custom.confidential_anchor(c.id) is not null)) then
    o_fallback := true;
    o_note := 'CONFIDENTIAL: this Table is Confidential, or holds rows whose parent is, so each row '
           || 'opens to its owner and the people its own fields name and no visibility class can '
           || 'answer for another row. The door is walking the per-row ladder (custom.confidential_answer).';
    return;
  end if;

  -- THE FIRST THING THAT MAKES IT STOP. `iam.has_access_for_base` pushes a child's REGISTERED
  -- FK parents onto its frontier as well as the closure. There is no such registration for
  -- `record` today, so a record's containers come only from associations — which
  -- `custom.read_door_carried_ids` resolves. If one is ever registered, a row's container is a
  -- COLUMN of its own row, two rows of one class stop answering alike, and the argument this
  -- file rests on stops holding. So it says so and walks.
  if exists (select 1 from platform.entity_relationships er
              where er.child_type = 'record' and er.kind in ('composition', 'containment')) then
    o_fallback := true;
    o_note := 'READ-PERF: `record` now has a registered FK containment parent in '
           || 'platform.entity_relationships, so a row''s container is a column of its own row and '
           || 'two rows of one visibility class no longer answer alike. The door is walking the '
           || 'per-row ladder. REMEDY: teach custom.visible_set to classify on that column too, or '
           || 'seed custom.read_door_carried_ids from it the way it is seeded from associations.';
    return;
  end if;

  -- THE TABLE ITSELF, ONCE (SHARED-ONLY). A Table shared with somebody carries every row in it
  -- (arm 3 of `custom.carrying_edges_of`), so one ladder call about the TABLE answers for the
  -- whole page.
  --
  -- 🚨 AND THE QUESTION IS `iam.has_access_for`, NOT `custom.reaches_directly` (LEAK-T10,
  -- 2026-09-20). This is the whole of acceptance test 10 and it is a live cross-project leak.
  -- `custom.reaches_directly` treats the Table as the SUBJECT of the walk, so its arm 3 climbs
  -- from the Table into the Table's own HOMES — and a person shared ONE Home of a Table was
  -- handed every record of that Table in every other Home, with its contents, by this line,
  -- while `custom.read_record` refused her the same row.
  --
  -- What the PER-ROW ladder asks about this Table is one thing, and asking exactly it is what
  -- makes the two doors agree by construction instead of by agreement:
  -- `custom.visibility_ancestors` returns the Table as a TERMINAL ancestor of every row in it,
  -- at `admin`, and `custom.reaches_directly` arm 3 then asks
  -- `iam.has_access_for(user, 'record', <the Table>, required)` about it — ownership, a grant
  -- row, the organization lanes, the platform's own containment closure, and nothing above
  -- them. A whole Table shared through `custom.share_grant` writes the `iam.permissions` row
  -- that admits it, so the case this shortcut exists for is untouched.
  --
  -- The rows it does NOT speak for are the ones whose own `visibility` is below `internal`,
  -- which that edge deliberately does not carry; they fall through to their class below.
  --
  -- THE SAME-ORGANISATION, LIVE-ROW JOIN STAYS. The kernel Tables (`Table`, `Field`, and the
  -- home-record kernel every fixture hangs off) live in the SYSTEM organization, which is
  -- global_readable, so `iam.has_access_for` says yes about them to EVERY signed-in person.
  -- Without this line `p_table_id = 11111111-…-0002` — the Field kernel — made every Field row
  -- of a `shared_only` organization visible to every member.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := custom.table_carries_its_rows(p_user, p_table_id, p_required);
  end if;

  -- THE GRANTED IDS, and the second thing that makes it stop.
  -- STORE-READ-PERF-3: for the Table kernel, the same ids may already be in this statement's memo,
  -- left by custom.tables_seen_once_per_group, which asked read_door_granted_ids' own query once for
  -- every organization of the door statement that called us.
  -- STORE-READ-PERF-4: only while the transaction has written nothing (a writing transaction may
  -- have changed the answer after the memo was taken).
  if p_table_id = custom.table_kernel_id() and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_seen_memo := platform.memo_k_get('custom.kernel_granted:' || p_organization_id::text || ':' || pg_catalog.pg_current_snapshot()::text);
  end if;
  if v_seen_memo is not null then
    o_granted_all := array(select g from unnest(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[]) g order by g);
    v_seen_memo := null;
  else
    o_granted_all := custom.read_door_granted_ids(p_organization_id, p_table_id);
  end if;
  v_n := coalesce(array_length(o_granted_all, 1), 0);
  if v_n > custom.read_door_ladder_ceiling() then
    o_fallback := true;
    o_note := format('READ-PERF: %s ids of this Table carry a grant, a membership or a closure row, '
                  || 'which is over the ceiling of %s, so asking them one at a time is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or resolve grants set-based the way '
                  || 'custom.read_door_carried_ids resolves containment.',
                  v_n, custom.read_door_ladder_ceiling());
    return;
  end if;

  -- THE TABLE LIST (SHARED-ONLY). The rows of the kernel Table are the organization's Tables,
  -- and a Table is visible when a record inside it is — one Table at a time, never by class.
  -- An organization holds a few hundred Tables at the very most (263 is the largest on this
  -- database today, against a ceiling of 5,000), so this enumerates them and asks the ladder
  -- once each. Over the ceiling it says so and walks, like every other stop here.
  if p_table_id = custom.table_kernel_id() then
    select count(*) into v_tables
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.deleted_at is null;
    if v_tables > custom.read_door_ladder_ceiling() then
      o_fallback := true;
      o_note := format('SHARED-ONLY: this organization holds %s Tables, over the ceiling of %s, and a '
                    || 'Table is visible when a record inside it is - which no representative can '
                    || 'answer for. The door is walking the per-row ladder. REMEDY: raise '
                    || 'custom.read_door_ladder_ceiling(), or index the "does this Table hold a row '
                    || 'this person reaches" question the way custom.visibility_cache intends.',
                    v_tables, custom.read_door_ladder_ceiling());
      return;
    end if;
    -- STORE-READ-PERF-3 (2026-09-28). At viewer the same answer — custom.has_visibility about every
    -- live Table — comes from custom.tables_seen_once_per_group: the one ladder asked once per group
    -- of Tables it cannot tell apart (its header has the argument), or, when the door statement
    -- that called us already asked it for this person and organization, from that statement's memo.
    -- Any other level walks every Table as before. o_ladder_calls still counts one answer per Table.
    if p_required = 'viewer'::public.permission_level then
      v_seen_memo := case when pg_catalog.pg_current_xact_id_if_assigned() is null
                          then platform.memo_k_get('custom.tables_seen:' || p_user::text || ':' || p_organization_id::text
                                                   || ':' || pg_catalog.pg_current_snapshot()::text) end;
      if v_seen_memo is null then
        select coalesce(array_agg(g.id) filter (where g.seen), '{}'::uuid[])
          into o_carried_visible
          from custom.tables_seen_once_per_group(p_user, array[p_organization_id]) g;
      else
        o_carried_visible := coalesce(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[], '{}'::uuid[]);
      end if;
      o_ladder_calls := o_ladder_calls + v_tables;
    else
      for v_id in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.deleted_at is null
      loop
        o_ladder_calls := o_ladder_calls + 1;
        if custom.has_visibility(p_user, 'record', v_id, p_required) then
          o_carried_visible := o_carried_visible || v_id;
        end if;
      end loop;
    end if;
    o_all_visible := (v_tables = coalesce(array_length(o_carried_visible, 1), 0));
    return;
  end if;

  -- CONTAINMENT, ONCE, DOWNWARD — and the third thing that makes it stop.
  v_carried := custom.read_door_carried_ids(p_user, p_organization_id, p_table_id, p_required);
  o_ladder_calls := o_ladder_calls + coalesce(v_carried.o_containers, 0);
  if v_carried.o_ids is null then
    o_fallback := true;
    o_note := format('READ-PERF: this Table''s records sit under %s distinct containers, which is '
                  || 'over the ceiling of %s, so asking the ladder about each of them is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or give the containers an accessible-set '
                  || 'cache the way VIS-9''s epochs intend.',
                  v_carried.o_containers, custom.read_door_ladder_ceiling());
    return;
  end if;
  o_carried_visible := v_carried.o_ids;

  -- THE CLASSES. One ladder call for each label of `platform.visibility` this Table actually
  -- holds, asked about a row that is NOT the caller's own, NOT granted and NOT carried — the
  -- three things that would make a representative answer for a reason its class does not have.
  for v_label in select e.enumlabel
                   from pg_catalog.pg_enum e
                   join pg_catalog.pg_type t on t.oid = e.enumtypid
                   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'visibility'
                  order by e.enumsortorder
  loop
    v_vis := v_label::platform.visibility;
    -- THE TABLE ALREADY ANSWERED FOR THIS CLASS (SHARED-ONLY). The Table edge carries every
    -- row at or above `internal`, so when the caller reaches the Table there is nothing left
    -- to ask about those classes and no representative to find.
    if v_table_carries and v_vis >= 'internal'::platform.visibility then
      o_true_visibility := o_true_visibility || v_vis;
      continue;
    end if;
    -- THE ROW THIS CLASS SPEAKS FOR, found in three bounded index scans instead of one scan of
    -- the class. `created_by is distinct from p_user` is two ranges and a null, and each of the
    -- three stops at its own first entry; the window is one row wider than the number of ids
    -- that may not represent their class, so it cannot miss a row it is allowed to choose.
    v_window := coalesce(array_length(o_granted_all, 1), 0)
              + coalesce(array_length(o_carried_visible, 1), 0) + 1;
    select c.id into v_rep
      from (
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by is null
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by < p_user
          order by r.created_by desc
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by > p_user
          order by r.created_by asc
          limit v_window)
      ) c
     where not (c.id = any (o_granted_all))
       and not (c.id = any (o_carried_visible))
     limit 1;
    if v_rep is not null then
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_rep, p_required) then
        o_true_visibility := o_true_visibility || v_vis;
      end if;
    end if;
  end loop;

  -- THE GRANTED IDS, ONE AT A TIME, ON THE ONE LADDER. Nothing here decides anything: it asks.
  foreach v_id in array o_granted_all loop
    o_ladder_calls := o_ladder_calls + 1;
    if custom.has_visibility(p_user, 'record', v_id, p_required) then
      o_granted_visible := o_granted_visible || v_id;
    end if;
  end loop;

  -- IS IT THE WHOLE TABLE? Then the page needs no visibility predicate at all and the LIMIT
  -- stops the scan at the first p_limit rows. This is the ordinary case — somebody reading a
  -- Table of their own organization — and it is the case that was costing seconds.
  o_all_visible := (v_n = 0)
                   and not exists (
                     select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.table_id is not distinct from p_table_id
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
  v_reader     jsonb;   -- CHAIR-CONFIDENTIAL-STORE
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := array_append(v_bad, format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: type ∈ {entity, detail}.')::text);
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := array_append(v_bad, format('a detail table has to say what it is a detail of'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token is required when type is detail.')::text);
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := array_append(v_bad, format('only a detail table has a parent table'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token belongs to type detail and to nothing else.')::text);
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := array_append(v_bad, format('a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1.')::text);
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := array_append(v_bad, format('a table needs a slug made of lower-case letters, digits and underscores'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: slug.')::text);
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := array_append(v_bad, format('a table needs both of its labels - one thing and many things'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: label_singular and label_plural.')::text);
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := array_append(v_bad, format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: display. T4 turns a list into a page and migrates nothing.')::text);
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether its records are ordered'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: ordered.')::text);
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := array_append(v_bad, format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: heavy|light.')::text);
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := array_append(v_bad, format('a table has to say how long it keeps its history'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: retention.')::text);
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if custom.store_is_open(new.organization_id) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := array_append(v_bad, format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days'));
      v_bad_hints := array_append(v_bad_hints, (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor))::text);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table has to say how its records are sorted by default'));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: default_sort is an array of {field, direction}.')::text);
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := array_append(v_bad, format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: manual row order.')::text);
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether an agent may write to it'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: agent_writable, default true, is declared rather than guessed.')::text);
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := array_append(v_bad, format('a table has to declare its fields'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := array_append(v_bad, format('every field of a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := array_append(v_bad, format('a table needs a title field, or its records cannot be shown as chips'));
      v_bad_hints := array_append(v_bad_hints, ('REC-2.')::text);
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := array_append(v_bad, format('the title field %s is not one of this table''s fields', v_title));
      v_bad_hints := array_append(v_bad_hints, ('REC-2: the title field names one of the table''s own fields.')::text);
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := array_append(v_bad, format('a table has to live somewhere - give it a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).')::text);
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := array_append(v_bad, format('a detail record cannot be a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.')::text);
  end if;

  -- ── SC-1 PLACEMENT (2026-09-23): WHO KEEPS THIS TABLE, AND WHETHER THE PICKER OFFERS IT. ──
  -- `kept_by_the_app` is the store's one flag for a Table the app or one of its features keeps
  -- (custom._options_table_for has always stamped it). Beside it, optionally, `kept_for` names
  -- WHICH feature in one lower-case word (context, education, dictionary, …) — only on a Table
  -- that is kept — and `offered_as_context` says whether the context picker offers the Table.
  -- Each is judged only when present; absent is the default (custom.table_placement).
  -- Judged only while the organization's store is switched on (custom/system_enabled), exactly
  -- like the rest of the store's own shape rules; switched off, the document is stored as written.
  if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    if d ? 'kept_by_the_app' and jsonb_typeof(d -> 'kept_by_the_app') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being kept by the app'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_by_the_app is true or false.')::text);
    end if;
    if d ? 'kept_for' and (jsonb_typeof(d -> 'kept_for') is distinct from 'string'
                           or coalesce(d ->> 'kept_for', '') !~ '^[a-z][a-z_]*$') then
      v_bad := array_append(v_bad, format('the feature that keeps a table is named in one lower-case word, and this one says %s',
                      custom.said(d ->> 'kept_for', 'nothing')));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_for is a word such as context, education or dictionary.')::text);
    end if;
    if d ? 'kept_for' and d ->> 'kept_by_the_app' is distinct from 'true' then
      v_bad := array_append(v_bad, format('only a table the app keeps says which feature keeps it'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: say kept_by_the_app = true beside kept_for, or take kept_for off.')::text);
    end if;
    if d ? 'offered_as_context' and jsonb_typeof(d -> 'offered_as_context') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being offered in the context picker'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: offered_as_context is true or false.')::text);
    end if;
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE (2026-10-02): THE TABLE'S LEVEL AND THE PEOPLE ITS RULES NAME. ──
  -- `level` is absent (Organization, the default) or "confidential". `readers` is the record's own
  -- rules: a list of {field, level} where `field` is one of this Table's fields whose value names a
  -- person (a Person record, a person's id) or a team, and `level` is viewer (the default),
  -- commenter or editor. Only a Confidential Table names readers. Who may SET either is decided
  -- after the shape below: only the Arman-approved door.
  if d ? 'level' and (jsonb_typeof(d -> 'level') is distinct from 'string' or d ->> 'level' <> 'confidential') then
    v_bad := array_append(v_bad, format('a table is Confidential or it leaves its level out, and this one says %s', custom.said(d ->> 'level', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: level is "confidential", or absent for Organization.')::text);
  end if;
  if d ? 'readers' and d ->> 'level' is distinct from 'confidential' then
    v_bad := array_append(v_bad, format('only a Confidential table names the people who may read its records'));
      v_bad_hints := array_append(v_bad_hints, ('Access ladder: readers belong to a Confidential table; take them off, or make the table Confidential.')::text);
  elsif d ? 'readers' and jsonb_typeof(d -> 'readers') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table names its readers as a list'));
      v_bad_hints := array_append(v_bad_hints, ('readers is a list of {field, level}.')::text);
  elsif d ? 'readers' then
    for v_reader in select x from jsonb_array_elements(d -> 'readers') x loop
      if jsonb_typeof(v_reader) is distinct from 'object'
         or coalesce(v_reader ->> 'field', '') = ''
         or v_names is null or not ((v_reader ->> 'field') = any (v_names)) then
        v_bad := array_append(v_bad, format('a reader is one of this table''s own fields, and %s is not', custom.said(coalesce(v_reader ->> 'field', v_reader #>> '{}'), 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers: {field: <a field of this table naming a person or a team>, level: viewer|commenter|editor}.')::text);
      elsif v_reader ? 'level' and coalesce(v_reader ->> 'level', '') not in ('viewer', 'commenter', 'editor') then
        v_bad := array_append(v_bad, format('a reader reads, comments or edits, and %s says %s', v_reader ->> 'field', custom.said(v_reader ->> 'level', 'nothing')));
          v_bad_hints := array_append(v_bad_hints, ('readers[].level is viewer, commenter or editor; owner and admin are not given by a field.')::text);
      end if;
    end loop;
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  -- ── CHAIR-CONFIDENTIAL-STORE: ONLY ARMAN MAKES A TABLE CONFIDENTIAL, AND ONLY HE CHANGES WHOM ──
  -- ── IT NAMES. The same rule as a standard table (platform.strict_class_refusal): the change is ──
  -- ── refused unless an approval in his own words was recorded for this Table in THIS transaction ──
  -- ── (platform.class_approval_by_arman, token custom.table:<id>). Leaving Confidential for ──
  -- ── Organization needs no approval. ──
  if d ->> 'level' = 'confidential'
     and (tg_op = 'INSERT'
          or old.data ->> 'level' is distinct from 'confidential'
          or (old.data -> 'readers') is distinct from (d -> 'readers'))
     and not exists (select 1 from platform.class_approval_by_arman a
                      where a.token = 'custom.table:' || new.id::text
                        and a.txid = pg_current_xact_id()
                        and a.level = 'confidential'::platform.data_class) then
    raise exception 'Refused: % would become Confidential%. Every table is Organization by default, and Confidential locks people out of their own organization''s work, so only Arman approves it. The law: common-docs/policies/access-ladder.md. If Arman approved this table in his own words, record them and make the change with custom.set_table_confidential_arman_explicitly_approved(p_table_id => %L, p_readers => ''[{"field": "<a person field>", "level": "viewer"}]'', p_arman_words => ''<his exact words>'', p_approved_on => ''<the date he said them>''). Moving a table back to Organization never needs approval.',
                    coalesce(nullif(d ->> 'name', ''), new.id::text),
                    case when tg_op = 'UPDATE' and old.data ->> 'level' = 'confidential' then ' with different readers' else '' end,
                    new.id
      using errcode = '42501';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform._set_table_strict_class(p_token text, p_level platform.data_class, p_arman_words text, p_approved_on date, p_rls_variant text, p_set_class_now boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id bigint;
  v_et record;
begin
  -- CHAIR-CONFIDENTIAL-STORE (2026-10-02): a store Table is named `custom.table:<id>`. It has no
  -- entity type and no rls_variant; its level lives on the Table document and is written by the
  -- store's own door, which records the approval in the same ledger this function writes.
  if p_token like 'custom.table:%' then
    if p_rls_variant is not null then
      raise exception 'A store Table has no rls_variant; its level is written on the Table itself. Call again without p_rls_variant.'
        using errcode = '22023';
    end if;
    if p_level is distinct from 'confidential'::platform.data_class then
      raise exception 'A store Table can be Confidential; Private is not built for store Tables yet. Ask the chair before using Private on a store Table.'
        using errcode = '22023';
    end if;
    if not coalesce(p_set_class_now, true) then
      raise exception 'A store Table is made Confidential in one call: use custom.set_table_confidential_arman_explicitly_approved(p_table_id, p_readers, p_arman_words, p_approved_on).'
        using errcode = '22023';
    end if;
    return custom.set_table_confidential_arman_explicitly_approved(
             substr(p_token, length('custom.table:') + 1)::uuid, null, p_arman_words, p_approved_on);
  end if;
  v_id := platform._record_arman_class_approval(p_token, p_level, p_arman_words, p_approved_on);
  if not coalesce(p_set_class_now, true) then
    -- The approval stands for the rest of THIS transaction: move rls_variant, retrofit, then set
    -- data_class yourself, in that order (the regeneration trigger fires on the class change).
    return jsonb_build_object('token', p_token, 'level', p_level, 'approval_id', v_id,
                              'class_set', false,
                              'next', 'in this same transaction: move rls_variant, retrofit, then set data_class');
  end if;

  select et.token, et.rls_variant, et.data_class, et.is_active into v_et
    from platform.entity_types et where et.token = p_token;
  if not found or not v_et.is_active then
    raise exception 'platform.entity_types has no active token %. Register the table first, or pass p_set_class_now => false and set its class in this transaction.', p_token
      using errcode = '22023';
  end if;
  if coalesce(p_rls_variant, v_et.rls_variant) in ('component','reference') then
    raise exception '% is a % — %', p_token, coalesce(p_rls_variant, v_et.rls_variant),
      case when coalesce(p_rls_variant, v_et.rls_variant) = 'component'
           then 'it holds no class; its access is its parent''s (db-rules §6d-1). Approve the parent.'
           else 'a reference catalogue is read by every signed-in member and is never Confidential or Private.' end
      using errcode = '22023';
  end if;

  -- Variant and class move in ONE statement: the personal variant's CHECK requires the private
  -- class on the same row, and the class-change trigger regenerates the policies from the
  -- variant the row carries after this statement.
  update platform.entity_types
     set rls_variant = coalesce(p_rls_variant, rls_variant),
         data_class = p_level,
         suppress_platform_admin_lane = true,
         data_class_reason = format('Arman approved %s on %s: "%s" (platform.class_approval_by_arman #%s)',
                                    initcap(p_level::text), p_approved_on, btrim(p_arman_words), v_id)
   where token = p_token;

  return jsonb_build_object('token', p_token, 'level', p_level, 'approval_id', v_id,
                            'class_set', true, 'from', v_et.data_class,
                            'rls_variant', coalesce(p_rls_variant, v_et.rls_variant));
end
$function$
;

-- ── THE KERNEL FINGERPRINT, RE-RECORDED ONLY IF NO ANSWER MOVED (D249 pairing; AD242: no blind stamp) ──
do $chairconf$
declare
  v_before jsonb; v_after jsonb; v_moved text[]; v_from text; v_to text; v_live jsonb; v_rec jsonb;
  v_members text[]; v_chk jsonb; v_pre jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  select a into v_before from _chairconf_before;
  v_after := platform.kernel_equivalence_answers();
  if v_after->>'error' is not null or v_before->>'error' is not null then
    raise exception 'chairconf: the kernel fixture errors: % / %', v_before->>'error', v_after->>'error';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_moved
    from (select jsonb_object_keys(v_before->'answers') k union select jsonb_object_keys(v_after->'answers')) s
   where (v_before->'answers'->k) is distinct from (v_after->'answers'->k);
  if cardinality(v_moved) > 0 then
    raise exception 'chairconf: the kernel fixture answers moved (no fixture row sits in a Confidential store Table, so none may): %', v_moved;
  end if;

  v_from := iam.entity_read_kernel_expected();
  v_to := iam.entity_read_kernel_fingerprint();
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
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'lost')::int <> 0
     or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 'chairconf: the kernel equivalence check is not clean after the change: %', v_chk - 'answers' - 'read_lane';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'chairconf: fingerprint re-record did not take';
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f
              where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'chairconf: the provisioner preflight still names the read kernel: %', v_pre;
  end if;

  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_from, v_to, v_members,
          'CHAIR-CONFIDENTIAL-STORE (2026-10-02): a row of a Confidential store Table (Table document level = '
          || 'confidential, set only through the Arman-approved door) answers to custom.confidential_answer: its '
          || 'owner, the Table''s owner, shares addressed to the person, and the people its reader fields name; '
          || 'no organization, admin, library or containment lane. Every fixture answer is unchanged. Members '
          || 'that moved before this file (left unrecorded by earlier lanes) are re-recorded with it after the same '
          || 'equivalence proof.',
          v_after->>'version',
          jsonb_build_object('moved_answers', 0, 'members_changed', to_jsonb(v_members),
                             'check_after', v_chk - 'answers' - 'read_lane'),
          'campaign chairconf_a_store_table_can_be_confidential.sql / lane CHAIR-CONFIDENTIAL-STORE',
          'iam.entity_read_kernel_expected + iam.entity_read_kernel_members_expected');
  raise notice 'chairconf: kernel % -> % (members re-recorded: %)', v_from, v_to, v_members;
end
$chairconf$;
