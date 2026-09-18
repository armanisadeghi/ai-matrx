-- THE PRE-DD-263b ACCESS KERNEL, CAPTURED VERBATIM FROM PRODUCTION 2026-09-15.
--
-- This is the DD-263 body: bounded in PATH (a `p_path` stack array) but NOT in WORK. Inside a
-- carrying ring of ten or more nodes the walk branches ~8-way to the 32-frame ceiling and the
-- frame count explodes, so a negative access question never returns (measured: 60 s statement
-- timeout on the branch, >180 s on production, against a 104 ms acyclic control).
--
-- `scripts/check-access-kernel-bounded.ts --self-test` installs this file INSIDE a transaction it
-- always rolls back, and requires the planted ten-node ring to FAIL. Nothing else reads it, and it
-- must never be applied as a migration. A guard that cannot be shown failing is not a guard.
--
-- sha256(pg_get_functiondef) of the 6-argument body it carries:
--   1cf8cad23afe683113b02379f53e4a9ac3df00ef8bbe8e0f8c82e7c9f89a8295
-- which is exactly the hash iam_access_kernel_bounded_work_dd263b.sql declares in its
-- `-- based-on:` header for the body it replaced.
CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
begin
  return iam.has_access_for_base(p_user_id, p_type, p_id, p_required, p_include_public, ARRAY[]::text[]);
end;
$function$
;
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
end; $function$
;
