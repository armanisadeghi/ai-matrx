-- draft: claude-opus T-33 not yet applied
-- lane: access-ladder T-33 — an archived organization is closed.
--
-- The rule (iam.organization_archive's own sentence): an archived organization is CLOSED, not deleted —
-- nobody can reach anything inside it and nothing bound to it runs, but every row is kept and an owner
-- can restore it at any time. Measured live 2026-09-28 before this file: test@test.com, a plain member
-- of 15 archived organizations, read 840 rows inside them on 31 tables (platform.associations 77,
-- platform.saved_view 26, files.folders 16, …), because the kernel's organization questions read
-- memberships without looking at archived_at, and so did the organization-role arm copied into 354
-- generated std_select policies.
--
-- What changes (one rule, asked in the kernel):
--   1. iam.has_org_access_for, public.is_org_admin_for, iam.org_access_ids: membership of an archived
--      organization answers false / is left out.
--   2. iam.accessible_entity_ids, iam.accessible_entity_candidates, iam.discoverable_ids: every
--      organization-membership read joins iam.organizations and skips archived ones.
--   3. iam.has_access_for_base: past the author arm (which every generated policy also carries), a
--      record inside an archived organization opens to nobody — members, admins, owners, grants and
--      shares to a person (sharing sits outside the ladder, and closed means closed), record
--      memberships, containment. Plus the T-11y mirror: a child row (platform.child_parent_columns)
--      never opens through the organization lanes.
--   4. NEW iam.my_admin_orgs(): the organizations the caller owns or administers that are not
--      archived — the set form of is_org_admin_for. iam.entity_read_expr's organization-role arm asks
--      it; the 354 live std_select policies are rewritten to it one table per transaction afterwards
--      (scripts in the T-33 register row).
--   5. Deliberate exceptions, changed on purpose: billing.plan_status keeps the OWNER's plan view of an
--      archived organization (iam.is_org_owner ignores archiving); public.continued_access_depart and
--      public.continued_access_set_window tell an owner/admin of an archived organization to restore it
--      first instead of "only an owner or admin". Unchanged on purpose: iam.organization_restore and
--      iam.organization_archive (iam.is_org_owner), iam.my_orgs_all() (the owner's list of archived
--      organizations, the organization row and its admin audit trail), a person's own membership rows,
--      and the platform-admin lane (admin apps).
--   6. The read-kernel fingerprint is re-recorded; the kernel equivalence fixture (no archived
--      organization in it) must answer exactly as before.
set local lock_timeout = '2s';

do $pre$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't33: the live access kernel (%) is not the recorded one (%); another lane moved a fingerprinted body and has not re-recorded it. Refusing rather than re-recording their change as this file''s.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  create temp table _t33_answers_before (a jsonb) on commit drop;
  insert into _t33_answers_before select platform.kernel_equivalence_answers();
  if (select k.a->>'error' from _t33_answers_before k) is not null then
    raise exception 't33: the kernel equivalence fixture errors before this file: %', (select k.a->>'error' from _t33_answers_before k);
  end if;
end $pre$;

-- 4. the new set helper, declared as a door BEFORE its grant (db-rules §6d-4).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
values ('iam', 'my_admin_orgs', '', '{}'::oid[], 'access-ladder T-33 (access_ladder_t33_archived_organization_is_closed.sql)',
        'Caller-identity reader, the same shape as iam.my_orgs(): takes no argument and returns only the organizations the CALLER (auth.uid()) owns or administers that are not archived — the set form of public.is_org_admin_for, asked by the organization-role arm of every generated std_select policy. Reveals nothing is_org_admin_for does not.',
        true);

create function iam.my_admin_orgs()
 returns setof uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
-- ACCESS LADDER T-33 (2026-09-28). The organizations the caller OWNS or ADMINISTERS, leaving out an
-- archived one: an archived organization is closed to its owners and admins too. The set form of
-- public.is_org_admin_for; the organization-role arm of iam.entity_read_expr asks it.
begin
  if (select auth.uid()) is null then
    return;
  end if;
  return query
    select m.organization_id
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
     where m.user_id = (select auth.uid())
       and m.role in ('owner', 'admin');
end
$function$;
revoke all on function iam.my_admin_orgs() from public, anon;
grant execute on function iam.my_admin_orgs() to authenticated, service_role;

-- ===== iam.has_org_access_for(uuid,uuid)
CREATE OR REPLACE FUNCTION iam.has_org_access_for(p_user_id uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- ACCESS LADDER T-33 (2026-09-28): AN ARCHIVED ORGANIZATION IS CLOSED. Its members are still
  -- members (the rows are kept, so a restore gives everything back), but membership of an archived
  -- organization reaches nothing inside it. The owner's restore door asks iam.is_org_owner, and the
  -- owner's list of archived organizations asks iam.my_orgs_all(); neither comes through here.
  return exists (select 1 from iam.organization_member m
                   join iam.organizations o on o.id = m.organization_id and o.archived_at is null
                 where m.organization_id = p_org and m.user_id = p_user_id)
      or (
        -- Platform-global tier for WRITES: a super admin manages what the
        -- system owns. Mirrors the read tier in iam.has_access (§6e).
        exists (select 1 from iam.system_orgs s
                 where s.organization_id = p_org and s.global_readable)
        and public.is_super_admin_for(p_user_id)
      );
end;
$function$;

-- ===== public.is_org_admin_for(uuid,uuid)
CREATE OR REPLACE FUNCTION public.is_org_admin_for(p_user_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- WHOSE QUESTION IS THIS — see iam.is_org_owner. (Arguments are in the other order
  -- here; the live signature is carried unchanged because six call sites depend on it.)
  if iam.is_client_lane()
     and p_user_id is distinct from (select auth.uid())
     and p_org_id not in (select iam.my_orgs()) then
    return false;
  end if;
  return exists (
    select 1
    from iam.organization_member om
    -- ACCESS LADDER T-33: an archived organization is closed to its owners and admins too; the
    -- restore door asks iam.is_org_owner, which does not come through here.
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
    where om.organization_id = p_org_id
      and om.user_id = p_user_id
      and om.role in ('owner', 'admin')
  );
end;
$function$;

-- ===== iam.org_access_ids()
CREATE OR REPLACE FUNCTION iam.org_access_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- The set form of iam.has_org_access(o): every o for which it answers true for the caller.
  -- Keep the two bodies identical in meaning; see iam.has_org_access_for.
  -- ACCESS LADDER T-33: an archived organization is closed (see iam.has_org_access_for).
  select m.organization_id from iam.organization_member m
    join iam.organizations o on o.id = m.organization_id and o.archived_at is null
   where m.user_id = (select auth.uid())
  union
  select s.organization_id from iam.system_orgs s
   where s.global_readable and public.is_super_admin_for((select auth.uid()))
$function$;

-- ===== iam.accessible_entity_ids(text,permission_level,integer,boolean)
CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- DD-171: containment never carries a personal row (see iam._dd171_containment_filter).

declare
  v_uid uuid := auth.uid();
  v_schema text; v_table text; v_tbl text; v_owner_col text;
  v_has_org boolean; v_has_vis boolean;
  v_parent_ids uuid[]; v_nonpublic_parent_ids uuid[]; v_more uuid[];
  v_trusted text; v_sql text;
  v_ids uuid[] := '{}';
  -- 🚨 DD-175 (2026-09-12) — THE SET FORM ASKS THE SAME QUESTION THE KERNEL ASKS.
  -- iam.has_access_for_base and iam.entity_read_expr both gate the organization and
  -- platform-staff lanes on iam.class_lanes (DD-137b). This function never learned that,
  -- so it returned ids the parent's own policy refuses. On the parent's own std_select that
  -- is harmless — the set is only a CANDIDATE there and iam.has_access confirms every id —
  -- but a generated COMPONENT lane takes this set as FINAL with nothing behind it, so the
  -- component read rows its parent refuses. Measured live, 2026-09-12, before this change:
  -- arman@titaniumsuccess.com read 2,313 docproc.processed_document_pages whose parent
  -- processed_document its own policy refuses; admin@admin.com 106 udt_document_snapshots
  -- and 87 udt_workbook_snapshots; users.credential_attachments leaked all 3 of its rows
  -- under a refused credential_item; workbench.udt_structured_list_items all 15 of its.
  v_lanes platform.lane_set;
  -- 🚨 DD-175e (2026-09-13) — THE `restricted` VARIANT HIDES ITS SOFT-DELETED ROWS AND THIS
  -- FUNCTION DID NOT. iam._apply_rls_unchecked's restricted branch emits std_select with its
  -- own `deleted_at is null and …` prefix (v_delpfx). The set form had no soft-delete arm, so
  -- a component under a restricted parent read rows whose parent the parent's own policy
  -- hides: measured live, admin@admin.com read 101 chat.coding_session_entry rows under one
  -- soft-deleted chat.coding_session. Scoped to `restricted` ON PURPOSE — every other variant
  -- keeps archived rows readable (the archived-items law), and cutting them out here would
  -- empty every archive view on the platform.
  v_soft_deleted_hidden boolean;
  rec record;
  -- AEI-MEMO (2026-09-26): cache each nested parent question within a depth-0
  -- cascade only. The frame is restored before returning, so it cannot leak to
  -- a later policy or caller.
  v_memo_prev text;
  v_memo_key text;
  v_memo jsonb;
  -- Access ladder T-11 leak fixes: the parent lane (platform.child_parent_columns).
  v_child_cols text[]; v_ptype text;
begin
  -- ACCESS LADDER T-33 (2026-09-28): every organization-membership read below joins
  -- iam.organizations and skips an ARCHIVED organization, which is closed to its members.
  if v_uid is null or p_depth > 12 then return '{}'::uuid[]; end if;

  -- 🚨 W2-PRED / VIS-N-1 — THE CUSTOM-RECORD ARM, AND NOTHING ELSE IN THIS BODY.
  -- One set-based join per request instead of one function call per row. The knob is the whole
  -- switch: while it resolves false this block falls through and the old body below answers, which
  -- is why the OFF path is the old behaviour rather than a copy of it.
  if p_type = 'record'
     and coalesce(
           platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean,
           false)
  then
    return coalesce(
      (select array_agg(distinct v.id) from custom.visible_record_ids(v_uid, p_required) v),
      '{}'::uuid[]);
  end if;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  -- 🚨 RC-A2b (2026-09-25) — A DETAIL'S SET IS WHAT THE KERNEL SAYS, ROW BY ROW. The trusted
  -- arms below read a row's own visibility and organization, which is exactly the answer a
  -- detail (platform.comments) must never get: it listed comments on colleagues' personal notes
  -- to every member. A detail's access is its record's, which only the kernel resolves, so the
  -- set form asks it per row and cannot disagree with it. Cost: one kernel call per detail row;
  -- every client read of a detail goes through a door already filtered to one record.
  if platform.token_is_detail(p_type) then  -- RC-A2e: every declared detail
    execute format('select coalesce(array_agg(t.id), ''{}'') from %I.%I t '
                   'where iam.has_access_for_base($1, $2, t.id, $3, $4)', v_schema, v_table)
      into v_ids using v_uid, p_type, p_required, p_include_public;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);
  v_lanes := iam.class_lanes(p_type);
  select coalesce(et.rls_variant = 'restricted', false)
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = v_schema and c.table_name = v_table
                        and c.column_name = 'deleted_at')
    into v_soft_deleted_hidden
    from platform.entity_types et where et.token = p_type and et.is_active;
  v_soft_deleted_hidden := coalesce(v_soft_deleted_hidden, false);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level and v_lanes.org_member_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and v_lanes.platform_admin_lane and public.is_super_admin_for(v_uid) then
    if v_has_vis then
      v_trusted := v_trusted
        || ' or (t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)'
        || ' and t.visibility >= ''internal'')';
    elsif not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)';
    end if;
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- 🚨 DD-185 (2026-09-13) — THE SECOND COPY OF THE §6e ARM, and the one the generated
      -- policy's bounded `iam.has_access` lane is asked about. Gated on the same two classes as
      -- the kernel and the mirror: an every-signed-in-user arm is not a lane a `confidential` or
      -- `private` token has. Server-side lists call this function directly, so leaving it here
      -- would have been a safe path beside an unsafe one.
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- 🚨 DD-136b (2026-09-12) — THE THIRD COPY OF THE ORG-ADMIN LANE.
    -- Unguarded, it handed an organization's admins every id in the
    -- organization at viewer, including `personal` rows, and a component's
    -- generated read lane takes this set as final with no has_access behind it.
    -- Guarded to match iam.has_access_for_base and iam.entity_read_expr; a
    -- parented component still gets nothing by role here, because its access is
    -- its parent's (db-rules §6d-1).
    if v_has_org and v_has_vis and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- Candidate lanes. THE ANTIJOIN IS HASHED, NEVER `= any(<param array>)`:
  -- a param array is not a Const, so PostgreSQL cannot use a hashed
  -- ScalarArrayOpExpr and falls back to a linear scan of the array PER ROW.
  -- Against v_ids of 32,697 that is what made this function quadratic.
  for rec in
    with have as materialized (select iam.unnest_uuids(v_ids) as id),
    -- AEI-REACH survives this rebase: ask the kernel once per distinct container,
    -- then still confirm every candidate row with the kernel below.
    reach_cand as materialized (
      select r.item_id, r.container_type, r.container_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
        and not exists (select 1 from have h where h.id = r.item_id)
    ),
    reach_containers as materialized (
      select distinct rc.container_type, rc.container_id from reach_cand rc
    ),
    -- 1320: THE KERNEL IS ASKED ONLY ABOUT CONTAINERS THAT COULD CONVEY. Before this, every distinct
    -- container of every reachability row outside the caller's own set was walked by the kernel —
    -- 3,540 file containers (~2.2 ms each) for admin@admin.com on processed_document, 8 s per call,
    -- almost all refusals (documents of other organizations reached through their own files).
    -- iam.reach_containers_worth_asking keeps the containers the caller holds a direct lane on, or
    -- one of whose own containers they do; the kernel still decides each one.
    reach_worth as materialized (
      select w.container_type, w.container_id
        from iam.reach_containers_worth_asking(v_uid,
               array(select k.container_type from reach_containers k),
               array(select k.container_id from reach_containers k)) w
    ),
    reach_ok as materialized (
      select k.container_type, k.container_id
      from reach_worth k
      where iam.has_access_for_base(v_uid, k.container_type, k.container_id, p_required, p_include_public)
    )
    select distinct c.id
    from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
      union
      select rc.item_id
      from reach_cand rc
      where exists (select 1 from reach_ok k
                     where k.container_type = rc.container_type and k.container_id = rc.container_id)
      union
      select a.source_id
      from platform.associations_live a
      where a.source_type = p_type and a.role = 'assignment'
        and a.target_type = 'scope'
      -- D261 (2026-08-23): THE LIBRARY LANES. iam.has_access_for_base opens with
      -- two token-agnostic viewer lanes — public.user_can_read_via_library_grant
      -- and public.library_is_open ("THE OPEN LIBRARY") — that both read
      -- platform.entity_grants. This function never learned them, so a row
      -- readable ONLY through a library grant was never even a CANDIDATE, and
      -- the set form disagreed with the per-row form for the same (type, id).
      -- Measured before this change: 15 disagreements across the three tokens
      -- that have entity_grants rows (rag.data_stores 6, platform.rulebook 6,
      -- seo.starter_pack 3).
      --
      -- This can only ever ADD ids, and only ids the loop below then confirms
      -- with has_access_for_base — the authority. A wider candidate SET cannot
      -- grant anything the per-row resolver denies; it can only stop the two
      -- forms from disagreeing. That asymmetry is what makes this landable on
      -- machinery every component parent arm depends on.
      union
      select g.entity_id
      from platform.entity_grants g
      where g.entity_type = p_type
      -- ...and the two curator lanes, for the same reason: has_access_for_base
      -- grants a curator every row in their industry, and none of those ids
      -- appear in permissions, memberships, reachability or assignments.
      union
      select rb.id
      from platform.rulebook rb
      join iam.industry_curators ic on ic.industry_id = rb.industry_id
      where p_type = 'rulebook' and ic.user_id = v_uid and ic.deleted_at is null
        and rb.deleted_at is null
      union
      select sp.id
      from seo.starter_pack sp
      join iam.industry_curators ic on ic.industry_id = sp.industry_id
      where p_type = 'seo_starter_pack' and ic.user_id = v_uid and ic.deleted_at is null
    ) c
    where not exists (select 1 from have h where h.id = c.id)
  loop
    if iam.has_access_for_base(v_uid, p_type, rec.id, p_required, p_include_public)
    then v_ids := v_ids || rec.id; end if;
  end loop;

  -- Parent cascade. SELF-CONTAINMENT EDGES ARE A TRANSITIVE CLOSURE, NOT A
  -- RECURSION: `folder -> folder` made a depth-0 call fan out to ~91
  -- invocations (12 levels, doubled at every level by the include_public /
  -- non-public pair), each one re-deriving the SAME base set over the whole
  -- table. Ordered so self edges run LAST, over the fully accumulated v_ids.
  if p_depth = 0 and p_include_public and v_has_vis then
    v_memo_prev := current_setting('iam.aei_cascade_memo', true);
    perform set_config('iam.aei_cascade_memo', '{}', true);
  end if;
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by (er.parent_type = p_type), er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      if rec.parent_type = p_type then
        -- T-11 leak fixes (2026-09-28), speed only: each closure step below probes the parent-id
        -- index once per row it just added (a LATERAL fenced with OFFSET 0). As a plain join the
        -- planner merge-joined the WHOLE table on every step — measured on files.folders as
        -- test@test.com: eight steps x 104k index rows = 505 ms, now 20 ms. Same rows, same filters.
        -- P = closure_public(S_T u N) where N is the non-public closure.
        -- Proof that this equals the old recursion's fixpoint: N is closed
        -- under ALL children (its own branch takes the else arm), so every
        -- non-public row the old code admitted via `parent in N` is already
        -- IN N; only the public arm still needs iterating. N costs exactly one
        -- nested call, and that call takes this same branch with
        -- p_include_public = false, so it does not fan out either.
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, p_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_more := (v_memo ->> v_memo_key)::uuid[];
          else
            v_more := iam.accessible_entity_ids(
              p_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_more::text))::text, true);
            end if;
          end if;
          v_ids := v_ids || v_more;
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id and t.visibility = ''public'' offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column);
        else
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id%s offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and '));
        end if;
        execute v_sql into v_more using v_ids;
        v_ids := coalesce(v_more, '{}'::uuid[]);
      else
        v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, p_include_public);
        v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
        if v_memo ? v_memo_key then
          v_parent_ids := (v_memo ->> v_memo_key)::uuid[];
        else
          v_parent_ids := iam.accessible_entity_ids(
            rec.parent_type, p_required, p_depth + 1, p_include_public);
          if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
            perform set_config('iam.aei_cascade_memo',
              (current_setting('iam.aei_cascade_memo', true)::jsonb
                 || jsonb_build_object(v_memo_key, v_parent_ids::text))::text, true);
          end if;
        end if;
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_nonpublic_parent_ids := (v_memo ->> v_memo_key)::uuid[];
          else
            v_nonpublic_parent_ids := iam.accessible_entity_ids(
              rec.parent_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_nonpublic_parent_ids::text))::text, true);
            end if;
          end if;
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($3) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where ('
            || '(t.visibility = ''public'' and t.%I = any($1)) '
            || 'or ((t.visibility is null or t.visibility >= ''internal''::platform.visibility)'
            || ' and t.visibility is distinct from ''public'' and t.%I = any($2))'
            || ') and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
        else
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($2) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.%I = any($1) %s'
            || 'and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and ')
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
        end if;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  if p_depth = 0 and p_include_public and v_has_vis then
    perform set_config('iam.aei_cascade_memo', coalesce(v_memo_prev, ''), true);
  end if;

  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the
  -- parent's own std_select hides.
  -- 🚨 ACCESS LADDER T-11 (2026-09-28) — THE PARENT LANE, SET-WISE. The kernel's twin
  -- (iam.has_access_for_base): a child row is in the set when its parent record is in the
  -- caller's set for the parent's type. Only the parent types actually present are asked (a
  -- loose index scan over files_files_parent_record_idx), each once, through this same function
  -- at depth + 1; the rows come back through the same index. A same-type pointer (a file variant
  -- written before T-11 part n) is left to the kernel row by row. The trash rule and the
  -- reference gate below still apply to these rows.
  v_child_cols := platform.child_parent_columns(p_type);
  if v_child_cols is not null and p_depth < 12 then
    for v_ptype in execute format(
        'with recursive d(v) as ('
        || ' (select t.%1$I::text from %2$s t where t.%1$I is not null and t.%3$I is not null order by 1 limit 1)'
        || ' union all'
        || ' select (select t.%1$I::text from %2$s t where t.%1$I > d.v and t.%3$I is not null order by 1 limit 1)'
        || ' from d where d.v is not null'
        || ') select v from d where v is not null',
        v_child_cols[1], v_tbl, v_child_cols[2])
    loop
      continue when v_ptype = p_type;
      v_parent_ids := iam.accessible_entity_ids(v_ptype, p_required, p_depth + 1, p_include_public);
      continue when coalesce(cardinality(v_parent_ids), 0) = 0;
      execute format(
        'with have as materialized (select iam.unnest_uuids($3) as id) '
        || 'select coalesce(array_agg(t.id), ''{}'') from %s t where t.%I = $1 and t.%I = any($2) '
        || 'and not exists (select 1 from have h where h.id = t.id)',
        v_tbl, v_child_cols[1], v_child_cols[2])
        into v_more using v_ptype, v_parent_ids, v_ids;
      v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;

  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t' ||
      ' where t.id = any($1) and t.deleted_at is null', v_tbl);
    execute v_sql into v_more using v_ids;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A1 (2026-09-25): the kernel's trash rule, set-wise — a row in its owner's trash is in
  -- nobody else's set (platform.trash_hides; declared by platform.trash_is_owner_only).
  if platform.trash_is_owner_only(p_type) and coalesce(array_length(v_ids, 1), 0) > 0 then
    execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) '
                   'and not platform.trash_hides($2, t.deleted_at, t.created_by, $3)', v_tbl)
      into v_more using v_ids, p_type, v_uid;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A2c (2026-09-25): a row that points at another record (platform.reference_gate) is in
  -- the set only when the caller can view that record — the kernel's gate, set-wise.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    for rec in select g.type_column, g.id_column from platform.reference_gate(p_type) g loop
      execute format(
        'select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) and '
        '(t.%I is null or t.%I is null or iam.has_access_for($2, t.%I, t.%I, ''viewer''::public.permission_level))',
        v_tbl, rec.type_column, rec.id_column, rec.type_column, rec.id_column)
        into v_more using v_ids, v_uid;
      v_ids := coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;
  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

-- ===== iam.accessible_entity_candidates(text)
CREATE OR REPLACE FUNCTION iam.accessible_entity_candidates(p_type text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  -- ACCESS LADDER T-33 (2026-09-28): every organization-membership read below joins
  -- iam.organizations and skips an ARCHIVED organization, which is closed to its members.
  if v_uid is null then return '{}'::uuid[]; end if;
  with reach_cand as materialized (
    select r.item_id, r.container_type, r.container_id
    from platform.reachability r
    where r.item_type = p_type and r.max_level >= 'viewer'::public.permission_level
  ),
  reach_containers as materialized (
    select distinct rc.container_type, rc.container_id from reach_cand rc
  ),
  reach_worth as materialized (
    select w.container_type, w.container_id
      from iam.reach_containers_worth_asking(v_uid,
             array(select k.container_type from reach_containers k),
             array(select k.container_id from reach_containers k)) w
  ),
  reach_ok as materialized (
    select k.container_type, k.container_id
    from reach_worth k
    where iam.has_access_for_base(v_uid, k.container_type, k.container_id,
                                  'viewer'::public.permission_level, true)
  )
  select array_agg(distinct c.id) into v_ids
  from (
    select p.resource_id as id
    from iam.permissions p
    where p.resource_type = p_type
      and (
        p.granted_to_user_id = v_uid
        or p.granted_to_organization_id in (
          select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = v_uid)
      )
      and p.status <> 'rejected'
      and (p.expires_at is null or p.expires_at > now())
    union
    select m.container_id
    from iam.memberships m
    where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
    union
    select rc.item_id
    from reach_cand rc
    where exists (select 1 from reach_ok k
                   where k.container_type = rc.container_type and k.container_id = rc.container_id)
    union
    select a.source_id
    from platform.associations_live a
    where a.source_type = p_type and a.role = 'assignment' and a.target_type = 'scope'
    union
    select g.entity_id
    from platform.entity_grants g
    where g.entity_type = p_type
    union
    select rb.id
    from platform.rulebook rb
    join iam.industry_curators ic on ic.industry_id = rb.industry_id
    where p_type = 'rulebook' and ic.user_id = v_uid and ic.deleted_at is null
      and rb.deleted_at is null
    union
    select sp.id
    from seo.starter_pack sp
    join iam.industry_curators ic on ic.industry_id = sp.industry_id
    where p_type = 'seo_starter_pack' and ic.user_id = v_uid and ic.deleted_at is null
  ) c
  where c.id is not null;
  return coalesce(v_ids, '{}'::uuid[]);
end;
$function$;

-- ===== iam.discoverable_ids(uuid,text,permission_level,integer,boolean)
CREATE OR REPLACE FUNCTION iam.discoverable_ids(p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := p_user_id;
  v_schema text;
  v_table text;
  v_is_component boolean;
  v_tbl text;
  v_owner_col text;
  v_has_org boolean;
  v_has_vis boolean;
  v_parent_type text;
  v_parent_col text;
  v_parent_ids uuid[];
  v_more uuid[];
  v_trusted text;
  v_sql text;
  v_ids uuid[] := '{}';
  rec record;
  -- 🚨 DD-189 (2026-09-13) — THE ID PRODUCER ASKS THE SAME QUESTION AS THE KERNEL.
  -- This function builds its lanes as SQL TEXT, which is exactly why they were missed: a lane that
  -- is a string concatenation does not look like an access decision. It is one. Every arm below is
  -- the arm iam.has_access_for_base runs, so the enumerator can never be wider than the reader.
  v_lanes platform.lane_set;
  -- true when a role arm may exist for this token at all: the table carries a real visibility
  -- column (and the arm is then walled at >= internal), or it carries none and is not a parented
  -- COMPONENT — the same two-part test the kernel and iam.is_discoverable_base use (DD-136b).
  v_role_arm_exists boolean;
begin
  -- ACCESS LADDER T-33 (2026-09-28): every organization-membership read below joins
  -- iam.organizations and skips an ARCHIVED organization, which is closed to its members.
  if v_uid is null or p_depth > 4 then return '{}'::uuid[]; end if;
  if auth.role() = 'anon' then return '{}'::uuid[]; end if;
  if auth.role() = 'authenticated'
     and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id)
  then return '{}'::uuid[]; end if;

  select et.schema_name, et.table_name, coalesce(et.is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  if v_is_component then
    select er.parent_type, er.fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships er
    where er.child_type = p_type and er.kind = 'composition'
    limit 1;
    if v_parent_type is null then return '{}'::uuid[]; end if;
    v_parent_ids := iam.discoverable_ids(
      v_uid, v_parent_type, p_required, p_depth + 1, p_include_public
    );
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t '
      || 'where t.%I = any($1)%s',
      v_tbl, v_parent_col,
      case when v_owner_col is not null
        then format(' or (t.%I is null and t.%I = $2)', v_parent_col, v_owner_col)
        else '' end
    );
    execute v_sql into v_ids using v_parent_ids, v_uid;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;

  v_lanes := iam.class_lanes(p_type);
  v_role_arm_exists := v_has_vis or not iam.token_is_parented_component(p_type);

  v_trusted := case when v_owner_col is not null
    then format('t.%I = $1', v_owner_col) else 'false' end;
  -- DD-189: the two org lanes, each gated on the class that owns it. `confidential` keeps its
  -- member lane and loses its role lane; `private` loses both; `organization`/`public` keep both,
  -- which is why classifying a table `organization` changes nothing about it.
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      if v_lanes.org_member_lane then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1))';
      end if;
    else
      if v_lanes.org_role_lane then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
          || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
      end if;
    end if;
  end if;
  -- DD-189: the platform-staff arm. It had no class question and no visibility guard at all — the
  -- id-producer half of DD-170, and the reason a super admin's shared-workflow list could enumerate
  -- personal and confidential rows owned by the global-readable system organization.
  if v_has_org and v_lanes.platform_admin_lane and v_role_arm_exists
     and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || case when v_has_vis then ' or (t.visibility >= ''internal'' and t.organization_id in ('
                                  || 'select so.organization_id from iam.system_orgs so where so.global_readable))'
              else ' or t.organization_id in (select so.organization_id '
                   || 'from iam.system_orgs so where so.global_readable)' end;
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- DD-185's §6e arm (unchanged by DD-189).
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- DD-189: the viewer org-admin arm — class-gated and visibility-walled like the kernel's.
    if v_has_org and v_lanes.org_role_lane and v_role_arm_exists then
      v_trusted := v_trusted
        || case when v_has_vis then ' or (t.visibility >= ''internal'' and t.organization_id in ('
                                    || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1 '
                                    || 'and om.role in (''owner'', ''admin'')))'
                else ' or t.organization_id in (select om.organization_id '
                     || 'from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1 '
                     || 'and om.role in (''owner'', ''admin''))' end;
    end if;
  end if;

  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  for rec in
    select distinct c.id from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type
        and m.user_id = v_uid and m.deleted_at is null
    ) c
    where not (c.id = any(v_ids))
  loop
    if iam.is_discoverable_base(
      v_uid, p_type, rec.id, p_required, p_include_public
    ) then v_ids := v_ids || rec.id; end if;
  end loop;

  if v_has_vis then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_type and er.kind = 'containment'
    loop
      if exists (
        select 1 from information_schema.columns c
        where c.table_schema = v_schema and c.table_name = v_table
          and c.column_name = rec.fk_column
      ) then
        v_parent_ids := iam.discoverable_ids(
          v_uid, rec.parent_type, p_required, p_depth + 1, false
        );
        if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
          v_sql := format(
            'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.visibility >= ''internal'' and t.%I = any($1) '
            || 'and not (t.id = any($2))',
            v_tbl, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
          v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
        end if;
      end if;
    end loop;
  end if;

  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

-- ===== iam.has_access_for_base(uuid,text,uuid,permission_level,boolean,text[])
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
    -- 🚨 ACCESS LADDER T-33 (2026-09-28) — AN ARCHIVED ORGANIZATION IS CLOSED. Past the author arm
    -- above (which every generated policy also carries), nothing inside an archived organization
    -- opens: not its members, its admins or its owners, not a grant or share to a person or to an
    -- organization, not a record membership, not containment. `continue walk` also stops the walk
    -- from carrying through the record to its containers. Every row is kept; iam.organization_restore
    -- (asked through iam.is_org_owner) reopens all of it in the same instant.
    if v_org is not null
       and exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
      continue walk;
    end if;
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
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org)
          -- 🚨 SHARE-LANE-2 (2026-09-25): an organization role never opens a row of a Table its
          -- owner set to "Only people I share it with" (see custom.row_sits_in_a_personal_table).
          and not (v_schema = 'custom' and custom.row_sits_in_a_personal_table(v_type, v_org, v_id));
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
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org)
          -- 🚨 SHARE-LANE-2 (2026-09-25): an organization role never opens a row of a Table its
          -- owner set to "Only people I share it with" (see custom.row_sits_in_a_personal_table).
          and not (v_schema = 'custom' and custom.row_sits_in_a_personal_table(v_type, v_org, v_id));
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
        elsif p_required <= iam.member_lane_confers(v_uid, v_org, v_type, v_id) then
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

-- ===== iam.entity_read_expr(text,text,text,text)
CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.
declare
  v_has_org boolean;
  v_has_vis boolean;
  v_arms text[] := '{}';
  v_cands text[] := '{}';
  v_bespoke boolean := false;
  v_owner_col text;
  v_cand text;
  v_expr text;
  v_selfref text;
  v_stale boolean := false;
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5, D14.1/D19). This mirror builds the
  -- `std_select` body for the entity, system AND component lanes, so it owns the
  -- ONE remaining platform-staff arm those three variants carry: the system-org
  -- global-readable lane gated on `public.is_super_admin()`. `restricted`,
  -- `ledger` and `personal` build their own std_select inside
  -- `iam._apply_rls_unchecked` and are already walled there. Omitting the arm is
  -- exactly what §3.5 directs ("omit the v_admin prefix and the is_super_admin()
  -- arm when true"), and it costs a flagged customer table nothing: the arm can
  -- only ever match a row owned by a global_readable SYSTEM org, which a
  -- customer's HR row never is.
  v_suppress_admin boolean := false;
  -- DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE ONE SOURCE. Which org lanes exist at
  -- all is a REGISTRY fact, true on every token whether or not it has a visibility column.
  -- iam.has_access_for_base reads the SAME function at runtime, so generation-time truth and
  -- runtime truth cannot drift by a single statement (db-rules §6d).
  v_lanes platform.lane_set;
  -- MIRROR-LIVE-FORM (2026-09-27): custom.record asks its per-organization question instead of the
  -- whole-database record set. See the note at the candidate sets below.
  v_record_in_org boolean := false;
  rec record;
begin
  select coalesce(et.suppress_platform_admin_lane, false) into v_suppress_admin
  from platform.entity_types et where et.token = p_token;
  v_suppress_admin := coalesce(v_suppress_admin, false);
  v_lanes := iam.class_lanes(p_token);
  -- 🚨 IS THE THING THIS MIRRORS STILL WHAT IT WAS? Between the sweep that
  -- certified 203 tables and the rollout an hour later, another lane rewrote
  -- `iam.has_access_for_base`: the `data_store`-only early lane became a general
  -- library-grant lane, "THE OPEN LIBRARY" appeared, and two curator lanes with
  -- it. Two tables' proofs flipped to `lost` and the gate refused them — the
  -- system working, but only because someone was running the gate. On a
  -- fingerprint mismatch this function DROPS THE BOUND and emits an unbounded
  -- iam.has_access call: exactly as correct as the pre-D249 policy, merely
  -- slower. Correct-and-slow is the only direction a read policy may fail in.
  v_stale := iam.entity_read_kernel_fingerprint()
             is distinct from iam.entity_read_kernel_expected();
  if v_stale then
    raise warning 'entity_read_expr: the access kernel has CHANGED since this '
      'expression was last proved against it (fingerprint % vs expected %). '
      'Emitting an UNBOUNDED iam.has_access lane for %.% — correct but slow. '
      'Re-read the kernel, update iam.entity_read_expr, re-run '
      'scripts/_verify_entity_read_equivalence.py --apply, then bump '
      'iam.entity_read_kernel_expected().',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected(),
      p_schema, p_table;
  end if;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='organization_id')
    into v_has_org;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='visibility'
                    and udt_schema='platform' and udt_name='visibility')
    into v_has_vis;

  -- ── SUFFICIENT ATTRIBUTE LANES ────────────────────────────────────────────
  -- Each is lifted from iam.has_access_for_base and each is a SUFFICIENT
  -- condition for it to return true, so a row admitted here was always visible.
  -- All read the row's own columns plus UNCORRELATED set subqueries, so every
  -- one is indexable.
  --
  -- array_append, never `||`: `text[] || <unknown literal>` resolves to
  -- array||array and tries to CAST the literal to text[] ("malformed array
  -- literal"), which is how this function failed on its first run.

  -- owner — `if v_owner = v_uid then return true`. CONDITIONAL, because a
  -- COMPONENT has no owner column at all (§6d-1: its access is its parent's),
  -- and this builder serves both variants. platform.entity_row_access_attrs
  -- falls back through created_by -> owner_id -> none, so the arm follows
  -- whichever exists and is simply absent when neither does.
  select case
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='created_by') then 'created_by'
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='owner_id') then 'owner_id'
         end
    into v_owner_col;
  if v_owner_col is not null and p_variant <> 'component' then
    v_arms := array_append(v_arms, format('%I = (select auth.uid())', v_owner_col));
  end if;

  if v_has_vis then
    -- public lane — `p_include_public and v_vis = 'public'`
    v_arms := array_append(v_arms, 'visibility = ''public''');
  end if;

  -- 🚨 THE ORG ARMS ARE ONLY VALID WHEN THE KERNEL CAN SEE AN ORG.
  -- has_access_for_base reads o_org from platform.entity_row_access_attrs, whose
  -- first four branches all need an OWNER column (created_by or owner_id)
  -- alongside organization_id. A table with organization_id and NO owner column
  -- falls through to the fifth branch, which returns o_owner=NULL AND
  -- o_org=NULL — so the kernel's org-admin and system-org lanes CANNOT fire
  -- there, and emitting them would GRANT rows the kernel denies. 13 of the 195
  -- live component tables are exactly that shape (organization_id, no owner).
  if v_has_org and v_owner_col is not null then
    -- Every org arm is guarded `organization_id is not null` so the expression
    -- is TOTAL. `x in (select …)` yields NULL, not false, when x is NULL, and
    -- while a USING clause treats NULL as deny — so this is not an access
    -- change — a policy that evaluates to NULL is the kind of thing that reads
    -- as a bug forever after. has_access_for_base guards the same lanes with
    -- `v_org is not null` for the same reason.

    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    --
    -- ACCESS LADDER T-33 (2026-09-28): the arm asks iam.my_admin_orgs(), the organizations the caller
    -- owns or administers that are NOT archived — the set form of is_org_admin_for, same rule.
    --
    -- 🚨 DD-136 (2026-09-12) — THIS ARM USED TO CARRY NO VISIBILITY GUARD while
    -- the two org arms directly below it both do, so `visibility='personal'`
    -- hid a row from a plain member and from nobody else. Measured live before
    -- the fix: a plain member read 0 of other people's personal conversations,
    -- an org admin who is NOT a platform admin read 10,817 of them plus 74,485
    -- messages, and nothing anywhere recorded that it happened. Arman,
    -- 2026-09-12: the organization reaches a person's private data only through
    -- an audited emergency door, never by an admin browsing (the door is a
    -- grant — DD-137 — and the grant lanes are already below).
    --
    -- The kernel guards the same lane with `v_vis >= 'internal' or not
    -- iam.table_has_visibility(...)`. The second half is why this is an if/else
    -- rather than one string: `platform.entity_row_access_attrs` HARD-CODES
    -- 'personal' for a table with no visibility column, so a table that never
    -- declared a visibility contract must keep the arm it has always had — it
    -- cannot hold a row marked `personal` in the first place. Mirror and kernel
    -- ask the same predicate so they cannot drift (db-rules §6d).
    if v_has_vis then
      v_arms := array_append(v_arms,
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '') || ' and organization_id in'
        ' (select iam.my_admin_orgs()))');
    elsif not iam.token_is_parented_component(p_token) then
      -- 🚨 DD-136b (2026-09-12) — A COMPONENT ASKS ITS PARENT, SO IT GETS NO
      -- ROLE ARM. DD-136 spared every table with no visibility column; 281 of
      -- them are components, which have no visibility column precisely BECAUSE
      -- their access is their parent's (db-rules §6d-1). Leaving the arm there
      -- meant an organization's admins kept reading every chat.message inside a
      -- `personal` conversation whose envelope DD-136 had just closed — 71,424
      -- rows for one real admin. The lane they lose here is one they never
      -- needed: the parent-cascade arm below resolves
      -- `iam.accessible_entity_ids('<parent>', 'viewer')`, so an admin who may
      -- read the parent still reads all of its components. Measured before
      -- changing anything: all 281 have a registered parent whose FK column
      -- exists, so not one is left with no lane at all.
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select iam.my_admin_orgs()))');
    end if;

    if v_has_vis then
      -- global-readable system org at >= internal (db-rules §6e)
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      -- org members at >= internal — the `iam.has_org_access_for` lane
      --
      -- 🚨 SHARED-ONLY (2026-09-19) — AND THE ORGANIZATION ITSELF DECIDES WHETHER THIS LANE
      -- EXISTS. `iam.has_access_for_base` has asked that since VIS-2:
      --
      --     if v_lanes.org_member_lane and iam.has_org_access_for(v_uid, v_org) then
      --       if v_schema is distinct from 'custom' or not custom.store_is_open(v_org) then
      --         if p_required <= 'editor' then return true; end if;     -- the 2026-08-12 cap
      --       elsif p_required <= iam.member_lane_confers(...) then return true; end if;
      --
      -- and this mirror never learned it. VIS-2, LEVEL-FIX and GUARD-SWITCH each recorded the
      -- gap and each left it, because census 7 of `pnpm check:store-doors-decide` keeps
      -- `authenticated` holding no TABLE privilege anywhere in schema `custom`, so no policy
      -- built from this expression is reachable today. That is a fact about the grants, not
      -- about this function: the day one table grant appears in schema `custom`, an
      -- organization that has said `shared_only` hands every member every `internal` row
      -- through the policy text while every door refuses them — the kernel and its mirror
      -- disagreeing in the same breath, which is the exact shape of the defect the sixth pass
      -- found on the door side.
      --
      -- THE TWO GUARDS ARE THE KERNEL'S TWO LINES, in the same order and with the same
      -- posture. `custom.store_is_open` first: an organization that has not turned the record
      -- store on keeps the arm the kernel always had, so nothing changes for it. Then
      -- `iam.member_lane_open`, which is the knob and which fails toward TODAY'S behaviour on
      -- an unreadable registry — over-tightening a read policy denies a legitimate person
      -- their own data, which db-rules §6 treats as the same size of bug as a stranger let in.
      -- Only schema `custom` pays the two calls; every other token emits the arm unchanged.
      if p_schema = 'custom'
         and not exists (select 1 from platform.feature_knob k
                          where k.feature = 'custom' and k.key = 'system_enabled') then
        raise exception 'iam.entity_read_expr: schema custom''''s organization-member arm is held '
          'off by custom.store_is_open, which is the read of the custom/system_enabled knob - and '
          'that knob row does not exist, so the gate is on nothing. Restore the knob row or take '
          'the guard out deliberately; do not ship an arm gated on a switch that is not there.';
      end if;
      v_arms := array_append(v_arms,
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '')
        || ' and organization_id in (select iam.my_orgs())'
        || case when p_schema = 'custom'
                then ' and (not custom.store_is_open(organization_id)'
                     || ' or iam.member_lane_open(organization_id))'
                else '' end
        || ')');
    end if;

    -- system org + super admin — THE LAST STAFF ARM on the entity/system/component
    -- lanes. DD-170 (2026-09-13): walled the same way as the org-admin arm above — the
    -- kernel (iam.has_access_for_base) got this wall first; mirroring it here is the other
    -- half, because the policy TEXT is what a real HTTP read runs against, not the kernel
    -- alone. v_suppress_admin still removes the arm entirely (the privacy wall).
    if not v_suppress_admin then
      if v_has_vis then
        v_arms := array_append(v_arms,
          '(organization_id is not null and visibility >= ''internal''::platform.visibility'
          ' and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      elsif not iam.token_is_parented_component(p_token) then
        v_arms := array_append(v_arms,
          '(organization_id is not null and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      end if;
    end if;
  end if;

  -- The old `data_store`-only early lane (public.user_can_read_data_store_via_grant)
  -- was GENERALISED by the kernel on 2026-08-23 into
  -- `user_can_read_via_library_grant` for EVERY token, so it needs no special
  -- case any more — the platform.entity_grants candidate above covers it. Left
  -- as a note rather than deleted silently: an earlier version of this function
  -- carried a per-row arm here, and the kernel moving underneath it is exactly
  -- what the fingerprint guard exists to catch.

  -- composition / containment parents. A child's own id appears in no id-set,
  -- so the FK is the lane.
  --
  -- 🚨 THE CHILD'S OWN VISIBILITY IS A BOUNDARY, and dropping that guard is a
  -- LEAK. has_access_for_base walks the parent with
  --     v_parent_include_public := p_include_public
  --                                and (v_vis is null or v_vis = 'public')
  -- so an `internal` child does NOT inherit access from a parent that is merely
  -- PUBLIC. Passing the default p_include_public = true instead made
  -- plan.node GAIN 24 rows and web.site GAIN 2 — rows whose own visibility is
  -- `internal` under a public parent. The prover caught it; nothing else would
  -- have.
  --
  -- The flag is per-ROW, so it is emitted as two arms rather than one. A table
  -- with NO visibility column takes the include_public = false arm alone:
  -- platform.entity_row_access_attrs returns 'personal' for such a table, and
  -- 'personal' is neither NULL nor 'public'.
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_token and er.kind in ('composition','containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (select 1 from information_schema.columns
                where table_schema=p_schema and table_name=p_table and column_name=rec.fk_column) then
      -- `%I is not null` is not decoration: has_access_for_base guards the walk
      -- with `if v_parent_id is not null`, and without it a NULL FK makes
      -- `NULL in (…)` evaluate to NULL rather than false. 10 of web.site's 45
      -- rows have a NULL brand_id, and they were the last thing standing
      -- between this expression and a total one.
      if p_variant = 'component' and iam.read_lane_v2_edge_emits(p_token, rec.parent_type, rec.fk_column) then
        -- READ-LANE V2: use the parent policy's correlated arm where the declared edge supports it.
        v_arms := array_append(v_arms, iam.read_lane_v2_parent_arm(rec.parent_type, rec.fk_column));
      elsif p_variant = 'component' then
        -- 🚨 MIRROR THE DEPLOYED LANE HERE, NOT THE KERNEL, and the difference is
        -- not academic. The generated component policy calls the 2-arg
        -- `accessible_entity_ids(parent,'viewer')` — include_public => TRUE —
        -- while has_access_for_base computes
        --   v_parent_include_public := p_include_public and (v_vis is null or v_vis='public')
        -- and a component's v_vis resolves to 'personal', so the KERNEL walks
        -- with FALSE. The deployed lane is therefore MORE PERMISSIVE than the
        -- resolver it is supposed to express.
        --
        -- Measured: mirroring the kernel would have REMOVED 4,784 rows from
        -- runtime.global_execution_event and 4,734 from runtime.global_execution
        -- — live access, for children of public parents. D254 is a PERFORMANCE
        -- defect; re-scoping who can read what inside a performance fix is not
        -- this migration's business and would be indistinguishable, in the
        -- change log, from a bug. The disagreement is filed as its own finding.
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
      elsif v_has_vis then
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and (visibility is null or visibility = ''public'') and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and visibility >= ''internal''::platform.visibility and visibility <> ''public'' and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      else
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      end if;
    end if;
  end loop;

  -- ── CANDIDATE SETS — every remaining lane, all of them id-PRODUCING ────────

  -- SECURITY DEFINER candidate superset. The raw candidates below remain for
  -- their cheap indexed paths, but protected reachability/entity-grant rows
  -- are intentionally invisible to ordinary users. accessible_entity_ids
  -- reads them inside the canonical boundary and this policy still confirms
  -- every returned id through iam.has_access() below.
  -- D266 (2026-09-12): NEVER on a component. §6d — "Component SELECT resolves
  -- its composition PARENT IDs and filters on the child FKs — never call
  -- accessible_entity_ids on the child token" (the 12.9M-UUID
  -- seo.search_performance_daily class, 2026-08-13). A component's candidate
  -- set is exactly what was proven on 2026-08-26.
  -- 🚨 MIRROR-LIVE-FORM (2026-09-27) — custom.record ASKS ABOUT THE ROW'S OWN ORGANIZATION.
  -- For custom.record the definer superset is `custom.visible_record_ids`, the ladder over every
  -- (organization, Table) the viewer can reach on the whole database. MIRROR-2 (2026-09-20) took it
  -- out of the LIVE std_select policy and put the same question back as its own top-level arm,
  -- `deleted_at is null and iam.record_visible_in_org(...) and iam.has_access(...)`, because
  --     id in (C1 ∪ C2…C6) ∧ H   ≡   (id in C1 ∧ H) ∨ (id in (C2…C6) ∧ H)
  -- and `iam.record_visible_in_org` is `id in C1` for a live row (C1 returns live rows only, hence
  -- `deleted_at is null`). This generator never learned it, so an `iam.apply_rls` on custom.record
  -- would have put the whole-database set back and census 12 judged a text that was not live.
  -- Only (custom, record, record) takes it: the memo's arguments are custom.record's own columns.
  v_record_in_org := p_schema = 'custom' and p_table = 'record' and p_token = 'record'
                     and p_variant <> 'component';
  -- Access ladder T-11 parts t/v: `file` and `folder` do not take the whole reachable set as a
  -- candidate. Their policies decide the owner, organization and folder lanes row by row (the arms
  -- above), and the rest of that set arrives through the lazy arms built below the `file` branch.
  if p_variant <> 'component' and not v_record_in_org and p_token not in ('file', 'folder') then
    v_cands := array_append(v_cands, format(
      'select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level, 0, true))',
      p_token));
  end if;

  -- explicit grants (public.has_permission_for)
  v_cands := array_append(v_cands, format(
    'select p.resource_id from iam.permissions p where p.resource_type = %L'
    ' and (p.granted_to_user_id = (select auth.uid())'
    ' or p.granted_to_organization_id in (select iam.my_orgs()))'
    ' and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now())', p_token));

  -- container membership + membership_grant
  v_cands := array_append(v_cands, format(
    'select m.container_id from iam.memberships m where m.container_type = %L'
    ' and m.user_id = (select auth.uid()) and m.deleted_at is null', p_token));

  -- association conveyance (platform.reachability). One has_access call per
  -- CONTAINER, not per row; the whole table is 4,501 rows across every type.
  v_cands := array_append(v_cands, format(
    'select r.item_id from platform.reachability r where r.item_type = %L'
    ' and r.max_level >= ''viewer''::public.permission_level'
    ' and iam.has_access(r.container_type, r.container_id, ''viewer'')', p_token));

  -- education assignment (public._edu_can_read_via_assignment), both arms
  v_cands := array_append(v_cands, format(
    'select a.source_id from platform.associations_live a where a.source_type = %L'
    ' and a.target_type = ''scope'' and a.role = ''assignment''', p_token));
  if p_token = 'fc_card' then
    v_cands := array_append(v_cands,
      'select link.source_id from platform.associations_live link'
      ' where link.source_type = ''fc_card'' and link.target_type = ''fc_set'''
      ' and link.role = ''member''');
  end if;

  -- ── THE LIBRARY LANES (kernel, 2026-08-23) — apply to EVERY token ─────────
  -- has_access_for_base now opens with TWO token-agnostic viewer lanes:
  --   public.user_can_read_via_library_grant(uid, type, id)
  --   public.library_is_open(type, id)            -- "THE OPEN LIBRARY"
  -- Both read `platform.entity_grants` keyed on (entity_type, entity_id), so a
  -- single id-set is a superset of both — the audience/industry/membership
  -- filtering inside them only ever NARROWS it, and a candidate set is allowed
  -- to be wide. Missing this is what made platform.rulebook lose 10 rows and
  -- rag.data_stores lose 5 on the rollout's own proof.
  v_cands := array_append(v_cands, format(
    'select g.entity_id from platform.entity_grants g where g.entity_type = %L', p_token));

  -- ── THE CURATOR LANES ─────────────────────────────────────────────────────
  -- 🚨 A CANDIDATE SET MAY NEVER READ THE POLICY'S OWN TABLE. These two lanes
  -- used to be emitted as `select rb.id from platform.rulebook rb join
  -- iam.industry_curators ...`, i.e. a SELECT policy on platform.rulebook whose
  -- USING clause selects from platform.rulebook. Postgres answers that with
  -- `42P17 infinite recursion detected in policy for relation "rulebook"` and
  -- the table becomes unreadable for every non-superuser role — measured live
  -- 2026-09-12, every signed-in GET 500 from 11:10:40Z, the moment DD-136's
  -- step 7 first regenerated the table through this generator.
  --
  -- The kernel's own curator lane is a SECURITY DEFINER door:
  --     if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
  --       if p_required = 'viewer' then return true; end if; ...
  --     if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
  --       then return true; end if;
  -- so the arm below is that same viewer lane, evaluated the same way, outside
  -- RLS and therefore outside the recursion. It is a SUFFICIENT arm rather than
  -- a candidate set because a boolean door cannot produce an id set, and it
  -- needs no `iam.has_access` confirmation: the kernel grants exactly this.
  if p_token = 'rulebook' then
    v_arms := array_append(v_arms,
      'public.is_rulebook_curator((select auth.uid()), id)');
  end if;
  if p_token = 'seo_starter_pack' then
    v_arms := array_append(v_arms,
      'public.is_pack_curator((select auth.uid()), id)');
  end if;

  -- ── 🚨 BESPOKE RESOLVERS — the ladder is not always has_access_for_base ────
  -- `iam.has_access` -> `iam.has_access_for`, which DISPATCHES BY TOKEN:
  --     when p_type = 'file' then files.has_access_for(...)
  --     else iam.has_access_for_base(...)
  -- A token routed away from the base kernel has lanes this expression knows
  -- nothing about, so bounding its has_access call by base's candidate sets
  -- would DENY rows. That is not hypothetical: it cost `files.files` 7 rows in
  -- the 4,000-row proof, invisible at 60 rows, because a crawl artifact
  -- resolves through `files.crawl_site_conveys` and through nothing in base.
  --
  -- So the dispatch list is read from the live function body and any token this
  -- function does not explicitly understand keeps an UNBOUNDED has_access arm:
  -- slower, and exactly as correct as today. A new bespoke resolver added later
  -- degrades safely instead of silently denying rows.
  select coalesce(bool_or(true), false) into v_bespoke
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'has_access_for'
    and p.prosrc ~ ('p_type\s*=\s*''' || p_token || '''');

  if v_bespoke and p_token <> 'file' then
    v_cands := '{}';   -- unknown bespoke resolver: refuse to bound it
  elsif p_token = 'file' then
    -- files.has_access_for = has_access_for_base OR
    --   (files.is_crawl_artifact(f) AND files.crawl_site_conveys(user, f)) at viewer.
    --
    -- ALL THREE branches of crawl_site_conveys become SUFFICIENT ARMS, because a
    -- candidate set here is not small: the file ids reachable through snapshots
    -- and screenshots are 6,971 + 5,945 + 8,655 ids, so bounding the definer
    -- call by them still meant ~22,000 per-row calls and files.files still timed
    -- out. Each branch is org-scoped AND pins the file, so each is a
    -- row-constructor IN against an UNCORRELATED set — evaluated once per query.
    --
    -- The parent-token sets come from `iam.accessible_entity_ids`, NOT from
    -- has_access per row, and the difference is not marginal (measured live as a
    -- real non-admin):
    --     has_access over all 7,014 web.snapshot rows      34.3s
    --     accessible_entity_ids('web_snapshot')             0.26s -> 1 id
    --     has_access over all 8,655 web.screenshot rows    70.9s
    --     accessible_entity_ids('web_screenshot')           0.31s -> 0 ids
    -- Same function family the kernel resolves through, asked set-wise.
    --
    -- `include_public => true` matches the kernel: crawl_site_conveys calls
    -- `iam.has_access_for(...)`, whose 4-arg base wrapper defaults it to true.

    -- Branch 1 — metadata-only site artifact. `ws.id::text` rather than casting
    -- the metadata value: the kernel guards that cast with a uuid regex because
    -- the field is free-form jsonb, and a policy that can raise
    -- `invalid input syntax for type uuid` is a table nobody can read at all.
    -- The metadata predicate also makes `is_crawl_artifact` true, so the arm
    -- implies BOTH halves of the kernel's crawl branch and cannot over-grant.
    v_arms := array_append(v_arms,
      '(metadata @> ''{"system_artifact": true, "artifact_domain": "web_crawl"}''::jsonb'
      ' and (organization_id, metadata->>''web_site_id'') in'
      ' (select ws.organization_id, ws.id::text from web.site ws'
      '   where ws.deleted_at is null'
      '     and ws.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branches 2 and 3 — snapshot body / markdown and screenshot image. CORRELATED, read AS
    -- THE INVOKER, bounded by the SAME accessible-id rule as before (CS-32, R13, 2026-09-18).
    --
    -- THE ONLY CHANGE FROM THE SET FORM IS CORRELATION. Each arm still reads web.snapshot /
    -- web.screenshot inside a policy subquery, which runs with the QUERYING role's privileges
    -- and therefore under those tables' own RLS, and still bounds the snapshot by
    -- `iam.accessible_entity_ids(<parent token>, 'viewer', 0, true)`. Same authority, same
    -- inner RLS, same id rule. What changed is that the subquery now pins the snapshot to the
    -- file being examined, so the FK index answers it instead of the whole table being
    -- materialised into a pair set.
    --
    -- WHY NOT A SECURITY DEFINER HELPER ASKING iam.has_access. That was this lane's first
    -- attempt and an adversarial re-verify killed it: substituting `iam.has_access` for
    -- `std_select(snapshot) ∩ accessible_entity_ids` is NOT the same question. It differs in
    -- both directions, and today's data hid both. Planting `visibility = 'public'` on ONE
    -- web.site turned it into a 361-pair NARROWING for a non-member (361 old-only, 0 new-only),
    -- and has_access's owner lane is a structural WIDENING that is merely unreproducible while
    -- every snapshot creator happens to be an admin or owner. The equivalence "proof" that
    -- lane ran was a coincidence of one afternoon's rows, not a property of the expressions.
    -- Correlation is what made it fast; bypassing RLS only made it wrong.
    --
    -- NULL SEMANTICS ARE UNCHANGED. The set form was
    -- `(organization_id, id) in (select s.organization_id, s.body_file_id ...)`: a row
    -- constructor with a NULL on either side yields NULL, never true, so the row is excluded.
    -- The correlated form compares with `=`, which yields NULL for a NULL and matches nothing,
    -- so the row is excluded there too. `s.body_file_id is not null` is kept anyway rather
    -- than argued away.
    -- Repo guard: tests/test_cs32_crawl_arm_stays_correlated.py.
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.body_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.body_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.markdown_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.markdown_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.screenshot s'
      '           where s.file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.file_id is not null'
      '), false))');

  end if;

  -- 🚨 ACCESS LADDER T-11 PARTS t/v (2026-09-28) — WHAT iam.accessible_entity_ids ADDED, ASKED
  -- LAZILY, for `file` and `folder`. The bounded arm used to take the caller's WHOLE reachable set as
  -- a candidate (1.3 s for a coworker's files, 0.9 s for folders, paid by every list that met one row
  -- the caller cannot read). Of that set, the owner, public, organization-role, system-organization
  -- and containment (parent folder) lanes are already arms above, evaluated row by row. The rest is
  -- exactly these three, each ANDed with the same confirmation the set form gave it:
  --   1. the organization-member lane read from iam.organization_member (the set form's source),
  --      which still includes an ARCHIVED organization the member arm above (iam.my_orgs) leaves
  --      out — confirmed by iam.has_access as before;
  --   2. the child parent lane (platform.child_parent_columns: a child opens to whoever opens its
  --      parent record), asked once per statement as (parent type, parent id) pairs — confirmed by
  --      iam.has_access as before;
  --   3. the kernel-confirmed candidate lanes (grants, memberships, reachability, assignments,
  --      library grants), unconfirmed in the set and confirmed per row by iam.candidate_admits —
  --      the same iam.has_access_for_base question the set form asked of each candidate.
  -- Only these two tokens: the equivalence was proved for them (every id, three real accounts,
  -- parts t and v). Another token joins the list only with the same proof.
  if p_token in ('file', 'folder') and p_variant <> 'component' and not v_record_in_org then
    if v_lanes.org_member_lane and v_has_org and v_has_vis then
      v_arms := array_append(v_arms, format(
        '(organization_id in (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid())) and %s'
        ' and iam.has_access(%L, id, ''viewer''::public.permission_level))',
        iam.org_lane_visibility_sql(p_token, ''), p_token));
    end if;
    if platform.child_parent_columns(p_token) is not null then
      v_arms := array_append(v_arms, format(
        '(%1$I is not null and %1$I <> %3$L and (%1$I, %2$I) in'
        ' (select c.parent_type, c.parent_id from iam.accessible_child_parents(%3$L) c)'
        ' and iam.has_access(%3$L, id, ''viewer''::public.permission_level))',
        (platform.child_parent_columns(p_token))[1], (platform.child_parent_columns(p_token))[2], p_token));
    end if;
    v_arms := array_append(v_arms, format(
      '(id in (select iam.unnest_uuids(iam.accessible_entity_candidates(%1$L)))'
      ' and iam.candidate_admits(%1$L, id))', p_token));
  end if;

  -- ── the bounded definer call ──────────────────────────────────────────────
  -- Everything the attribute lanes do not decide is decided exactly as before,
  -- by the same function — but only ever ASKED about ids a non-attribute lane
  -- could admit. A row outside both cannot be visible by any lane.
  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  -- 🚨 NO CANDIDATE SET MAY READ THE POLICY'S OWN TABLE (2026-09-12).
  -- A SELECT policy whose USING clause selects from its own relation raises
  -- `42P17 infinite recursion detected in policy for relation "..."` and the
  -- table becomes unreadable for every non-superuser role — not slow, not
  -- subtly wrong: 500 on every read. The industry-curator lane was exactly that
  -- for 14 days and went live the moment DD-136 regenerated the table.
  -- `iam.memberships` carries the same latent shape through the membership
  -- candidate (`select m.container_id from iam.memberships m ...`, token
  -- `membership`), so this is a CLASS, not two tokens.
  --
  -- The safe direction is the one this function already takes for a stale
  -- kernel fingerprint and for an unknown bespoke resolver: DROP THE BOUND and
  -- emit the unbounded `iam.has_access` lane. Correct, slower, and it can never
  -- deny a row — the opposite of silently omitting the offending lane, which
  -- WOULD deny rows. It screams so the lane gets a SECURITY DEFINER door of its
  -- own (see the curator lanes above) rather than living on as a slow path.
  v_selfref := '(from|join)[[:space:]]*\(?[[:space:]]*(' || p_schema || '\.)?'
               || p_table || '([^a-z0-9_]|$)';
  if cardinality(v_cands) > 0 then
    foreach v_cand in array v_cands loop
      if v_cand ~* v_selfref then
        raise warning 'entity_read_expr: a candidate lane for %.% READS THAT TABLE '
          'ITSELF (the 42P17 class). Dropping the bound and emitting an unbounded '
          'iam.has_access lane for %.% — correct but slow. Give the lane a SECURITY '
          'DEFINER door instead. Lane: %', p_schema, p_table, p_schema, p_table, v_cand;
        v_cands := '{}';
        exit;
      end if;
    end loop;
  end if;

  if cardinality(v_cands) = 0 then
    v_arms := array_append(v_arms, format('iam.has_access(%L, id, ''viewer'')', p_token));
  else
    v_arms := array_append(v_arms, format(
      '(id in (%s) and iam.has_access(%L, id, ''viewer''))',
      array_to_string(v_cands, ' union '), p_token));
  end if;
  -- MIRROR-LIVE-FORM: C1 for custom.record, as its own arm (see the candidate sets). Only when the
  -- call is bounded: an unbounded `iam.has_access` arm above already admits every row it would.
  if v_record_in_org and cardinality(v_cands) > 0 then
    v_arms := array_append(v_arms,
      '(deleted_at is null and iam.record_visible_in_org(organization_id, table_id, id, visibility,'
      ' created_by, ''viewer''::public.permission_level)'
      ' and iam.has_access(''record'', id, ''viewer''::public.permission_level))');
  end if;

  -- ══ DD-137b — THE CLASS DECIDES WHICH LANES EXIST AT ALL (§3.1, F-5) ═══════════════
  -- DD-136 decided how WIDE the organization lanes are on the tables that HAVE a visibility
  -- column. On the 371 active tokens that do not, its guard could not be written at all, so
  -- the org-role arm was emitted unguarded and an organization admin read every member''s
  -- rows there (66 users.user_feedback rows and 96 transcripts.studio_runs for one real
  -- admin, measured 2026-09-12). The class answers that question the same way on all 672
  -- tokens, column or no column: a `private` or `confidential` token emits NO
  -- organization-role arm, a `private` token emits no organization-member arm either, and
  -- both close the platform-staff arm — our own staff go through the door too.
  --
  -- coalesce(..., true) is the component/ledger case spelled out: those tokens have NO class
  -- of their own (db-rules §6d-1) and keep exactly the behaviour they have always had; the
  -- parent they resolve through is gated on ITS class.
  -- 🚨 THE ORG-ARM PREFIX IS THE ANCHOR, AND IT IS LOAD-BEARING (DD-137b3a). Every
  -- organization arm this function builds opens with `(organization_id is not null and` —
  -- the generator''s own totality guard, on all four of them. Matching a lane''s INNER text
  -- alone is not enough: `iam.my_orgs()` also lives inside the bounded candidate arm, in the
  -- explicit-grant candidate, so a bare match deleted the whole sharing lane from every
  -- `private` token. The class is a FLOOR (§3.6) — ordinary sharing opens above it per item
  -- and per person, and cancelling that is over-tightening, which db-rules §6 treats as the
  -- same size of bug as a stranger let in.
  if not v_lanes.org_role_lane then
    if not exists (select 1 from unnest(v_arms) a where a like '(organization_id is not null and%'
                    and a like '%om.role in (''owner'',''admin'')%') and v_has_org and v_owner_col is not null and p_variant <> 'component' then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'organization-role arm — but no arm carrying that lane was found to remove. The arm '
        'shapes have moved and this filter is now silently keeping a lane it was written to '
        'cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%om.role in (''owner'',''admin'')%'));
  end if;
  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM,
  -- SO IT BELONGS TO THE TWO CLASSES WHOSE LANE SET IS WIDER THAN ONE ORGANIZATION.
  -- `org_member_lane` was doing double duty: it is TRUE for `confidential`, so the filter below
  -- kept the global-readable arm on every confidential token — and that arm asks nothing about
  -- membership at all. Measured on this database (B-65, rolled-back rehearsal): a NON-MEMBER read
  -- 8 rows of a confidential `audit_exemption` and 4 of `admin_markdown_sample` through it, and
  -- live today hr.earning_code (24 rows) and hr.auto_close_rule (2) sit behind it.
  -- This is DD-174's ledger-branch rule, character for character: the system-org arm exists only
  -- for `organization` and `public`. `private` loses it here too and then loses the member arm
  -- below; the two filters are independent because the lanes are.
  if not (v_lanes.resolved_class in ('organization','public')) then
    if v_lanes.org_member_lane and v_has_org and v_has_vis and v_owner_col is not null
       and p_variant <> 'component'
       and not exists (select 1 from unnest(v_arms) a
                        where a like '(organization_id is not null and%'
                          and a like '%so.global_readable%'
                          and a not like '%is_super_admin%') then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'global-readable system-organization read arm — but no arm carrying that lane was found '
        'to remove. The arm shapes have moved and this filter is now silently keeping a lane it '
        'was written to cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%so.global_readable%'
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.org_member_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%iam.my_orgs()%' or a like '%so.global_readable%')
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.platform_admin_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%' and a like '%is_super_admin%'));
  end if;
  -- The OWNER arm is never filtered. Over-tightening is a defect too: db-rules §6 — "a
  -- legitimate user blocked from their own data is as serious a bug as a stranger let in".
  if p_variant <> 'component' and v_owner_col is not null
     and not (format('%I = (select auth.uid())', v_owner_col) = any(v_arms)) then
    raise exception 'iam.entity_read_expr: the class filter removed the OWNER arm from %.% '
      '(token %). No class has ever excluded the owner and none may.', p_schema, p_table, p_token;
  end if;

  v_expr := array_to_string(v_arms, ' or ');

  -- 🚨 THE LAST WALL. The candidate filter above degrades safely, so anything
  -- still reading the table here is an ARM — hand-written, with no safe
  -- degradation available and no way to bound it. That is a coding error in
  -- this function, and a coding error that ships makes the table unreadable
  -- (42P17) for everyone. It dies here, at generation time, naming the table,
  -- instead of at 11:10 on a Saturday in every user's browser.
  -- Repo guard: pnpm check:rls-self-reference.
  if v_expr ~* v_selfref then
    raise exception
      'iam.entity_read_expr: an ARM built for %.% (token %, variant %) reads '
      '%.% ITSELF — a policy that selects from its own relation raises 42P17 '
      'and makes the table unreadable. Route the lane through a SECURITY '
      'DEFINER door (see the curator lanes) instead of a join on the entity.',
      p_schema, p_table, p_token, p_variant, p_schema, p_table;
  end if;

  -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour): for a token that declares it
  -- (platform.trash_is_owner_only) every arm above is ANDed with the kernel's trash rule, so a
  -- row in its owner's trash is read by its owner only. platform_admin_read is a separate
  -- policy and keeps reading every row.
  if platform.trash_is_owner_only(p_token) and v_owner_col is not null
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = p_schema and c.table_name = p_table and c.column_name = 'deleted_at') then
    v_expr := format('(%s) and not platform.trash_hides(%L, deleted_at, %I, (select auth.uid()))',
                     v_expr, p_token, v_owner_col);
  end if;

  return v_expr;
end;
$function$;

-- ===== billing.plan_status(uuid)
CREATE OR REPLACE FUNCTION billing.plan_status(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  v_user  uuid := auth.uid();
  v_plan  text;
  v_row   billing.plan%rowtype;
  v_next  billing.plan%rowtype;
  v_dims  jsonb := '[]'::jsonb;
  r       record;
  v_res   jsonb;
begin
  if v_user is null then
    return jsonb_build_object('signed_in', false, 'plan', null, 'dimensions', '[]'::jsonb);
  end if;

  -- 🚨 DD-214: an organization's plan is its members' to see. `p_org` is a CLAIM.
  -- This door returns the organization's whole plan row — key, name, rank, seat
  -- model, price band — plus its per-dimension usage. It is the single widest
  -- disclosure in the family, and it was open to any signed-in caller.
  if p_org is not null
     and not iam.has_org_access_for(v_user, p_org)
     -- ACCESS LADDER T-33: an archived organization is closed to its members, but its OWNER keeps
     -- the plan view (what they would be restoring, and what it costs). is_org_owner ignores archiving.
     and not iam.is_org_owner(p_org, v_user)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;

  v_plan := billing.resolve_plan(p_org);
  select * into v_row from billing.plan where plan_key = v_plan;
  -- The next plan up WITHIN THE SAME AUDIENCE — what "upgrade" means here.
  --
  -- Audience matters: ranking personal and company plans on one line makes the
  -- plan after Max ($199, 1.4M points) come out as Team ($39/seat, 260k) — an
  -- "upgrade" that gives less on every dimension. A personal account upgrades
  -- along the personal ladder; moving to a company plan is a different decision
  -- and belongs on the pricing page, not in an inline nudge. Free sits outside
  -- both ladders, so it points at the entry-level personal plan.
  -- NULL next_plan is a real answer: they are on the top plan, and the surface
  -- says so instead of inventing somewhere to send them.
  select * into v_next from billing.plan
    where active and is_public and rank > coalesce(v_row.rank, 0)
      and audience = case when coalesce(v_row.audience,'free') = 'free'
                          then 'personal' else v_row.audience end
    order by rank limit 1;

  for r in
    select c.capability, c.period, c.enforced
    from billing.capability c
    join billing.plan_limit pl on pl.capability = c.capability
    where pl.plan_id = v_plan
    order by c.capability
  loop
    v_res := billing.resolve_capability(v_user, r.capability, p_org);
    v_dims := v_dims || jsonb_build_array(jsonb_build_object(
      'capability', r.capability,
      'period',     r.period,
      'enforced',   r.enforced,
      'used',       v_res->'used',
      'limit',      v_res->'limit',
      'remaining',  v_res->'remaining',
      'unlimited',  (v_res->'limit') = 'null'::jsonb,
      'from_addon', coalesce(v_res->'from_addon', 'false'::jsonb),
      'resets_at',  v_res->'windows'->0->'resetsAt',
      'next_plan_limit', (
        select pl2.limit_value from billing.plan_limit pl2
        where pl2.plan_id = v_next.plan_key and pl2.capability = r.capability
          and pl2.period is not distinct from r.period)
    ));
  end loop;

  -- 🚨 `to_jsonb(v_row)` / `to_jsonb(v_next)` are GONE — DD-173. The object below is
  --    THE EXACT KEY SET THE WHOLE-ROW SPREAD PRODUCED BEFORE THAT FILE: all seventeen
  --    columns billing.plan had, with `id` carrying the plan_key. Nothing is added and
  --    nothing is dropped — a whole-row spread would have started publishing
  --    organization_id, created_by, updated_by, version and visibility to every
  --    signed-in browser the moment the retrofit added them, and nothing would have
  --    raised.
  return jsonb_build_object(
    'signed_in', true,
    'organization_id', p_org,
    'plan', case when v_row.plan_key is null then null else jsonb_build_object(
      'id', v_row.plan_key, 'name', v_row.name, 'audience', v_row.audience,
      'tagline', v_row.tagline, 'rank', v_row.rank, 'tier', v_row.tier,
      'monthly_cents', v_row.monthly_cents, 'annual_cents', v_row.annual_cents,
      'per_seat', v_row.per_seat, 'min_seats', v_row.min_seats,
      'badge', v_row.badge, 'is_public', v_row.is_public,
      'is_default', v_row.is_default, 'active', v_row.active,
      'metadata', v_row.metadata, 'created_at', v_row.created_at,
      'updated_at', v_row.updated_at) end,
    'next_plan', case when v_next.plan_key is null then null else jsonb_build_object(
      'id', v_next.plan_key, 'name', v_next.name, 'audience', v_next.audience,
      'tagline', v_next.tagline, 'rank', v_next.rank, 'tier', v_next.tier,
      'monthly_cents', v_next.monthly_cents, 'annual_cents', v_next.annual_cents,
      'per_seat', v_next.per_seat, 'min_seats', v_next.min_seats,
      'badge', v_next.badge, 'is_public', v_next.is_public,
      'is_default', v_next.is_default, 'active', v_next.active,
      'metadata', v_next.metadata, 'created_at', v_next.created_at,
      'updated_at', v_next.updated_at) end,
    'tier', billing.resolve_effective_tier(v_user, p_org),
    'dimensions', v_dims);
end;
$function$;

-- ===== public.continued_access_depart(uuid,uuid,timestamp with time zone,text,uuid,text,text)
CREATE OR REPLACE FUNCTION public.continued_access_depart(p_organization_id uuid, p_subject_user_id uuid, p_access_cutoff_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_origin text DEFAULT NULL::text, p_origin_id uuid DEFAULT NULL::uuid, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;
  -- ACCESS LADDER T-33: an archived organization is closed, so its owners and admins cannot
  -- administer it until it is restored. Say that, instead of "only an owner or admin".
  if not public.is_admin()
     and exists (select 1 from iam.organization_member om
                   join iam.organizations o on o.id = om.organization_id and o.archived_at is not null
                  where om.organization_id = p_organization_id and om.user_id = v_uid
                    and om.role in ('owner', 'admin')) then
    return jsonb_build_object('ok', false, 'reason', 'organization_archived',
      'detail', (select format('%s is archived, so nothing inside it can be changed. Restore it first, '
                               'then end a membership there.', o.name)
                   from iam.organizations o where o.id = p_organization_id));
  end if;
  if not (public.is_org_admin_for(v_uid, p_organization_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Only an owner or admin of this organization can end a membership.');
  end if;
  return platform.continued_access_depart_apply(p_organization_id, p_subject_user_id, v_uid,
    p_access_cutoff_at, p_origin, p_origin_id, p_contact_email, p_contact_phone);
end
$function$;

-- ===== public.continued_access_set_window(uuid,uuid,timestamp with time zone,boolean,text)
CREATE OR REPLACE FUNCTION public.continued_access_set_window(p_organization_id uuid, p_subject_user_id uuid, p_access_cutoff_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_revoke boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'pg_temp'
AS $function$
-- Arman: "they also get control of when to cut off the person's access entirely or if they want
-- to keep it on indefinitely." This is that control, both halves:
--   p_access_cutoff_at = NULL + p_revoke = false  -> keep it on indefinitely
--   p_access_cutoff_at = <ts>                     -> it ends then
--   p_revoke = true                               -> it ends NOW
-- Un-revoking is deliberately possible (p_revoke => false): an org that cut someone off in anger
-- on Friday must be able to put it back on Monday without re-terminating them.
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_authenticated_caller');
  end if;
  -- ACCESS LADDER T-33: an archived organization is closed, so its owners and admins cannot
  -- administer it until it is restored. Say that, instead of "only an owner or admin".
  if not public.is_admin()
     and exists (select 1 from iam.organization_member om
                   join iam.organizations o on o.id = om.organization_id and o.archived_at is not null
                  where om.organization_id = p_organization_id and om.user_id = v_uid
                    and om.role in ('owner', 'admin')) then
    return jsonb_build_object('ok', false, 'reason', 'organization_archived',
      'detail', (select format('%s is archived, so nothing inside it can be changed. Restore it first, '
                               'then change continued access there.', o.name)
                   from iam.organizations o where o.id = p_organization_id));
  end if;
  if not (public.is_org_admin_for(v_uid, p_organization_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'Only an owner or admin of this organization can change continued access.');
  end if;

  update platform.continued_access
     set access_cutoff_at = p_access_cutoff_at,
         revoked_at = case when p_revoke then now() else null end,
         revoked_by = case when p_revoke then v_uid else null end,
         revoke_reason = case when p_revoke then p_reason else null end,
         updated_at = now(), updated_by = v_uid
   where organization_id = p_organization_id
     and subject_user_id = p_subject_user_id
     and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable',
      'detail', 'This person has no departed record in this organization.');
  end if;

  return jsonb_build_object('ok', true,
    'state', platform.continued_access_state(p_organization_id, p_subject_user_id));
end
$function$;


-- 6. re-record the read-kernel fingerprint.
do $rerecord$
declare
  v_after jsonb; v_snap jsonb; v_chk jsonb; v_from text; v_to text; v_live jsonb; v_rec jsonb;
  v_moved text[]; v_pre jsonb; v_diff text[];
begin
  perform pg_advisory_xact_lock(hashtext('platform.kernel_fingerprint_rerecord'));
  v_from := iam.entity_read_kernel_expected();
  v_to := iam.entity_read_kernel_fingerprint();
  if v_to = v_from then
    raise exception 't33: the fingerprint did not move after replacing kernel bodies; nothing re-recorded.';
  end if;
  v_after := platform.kernel_equivalence_answers();
  select k.a into v_snap from _t33_answers_before k;
  select array_agg(k || ' ' || coalesce(v_snap->'answers'->>k, 'absent') || '->' || coalesce(v_after->'answers'->>k, 'absent'))
    into v_diff
    from (select jsonb_object_keys(v_snap->'answers') k union select jsonb_object_keys(v_after->'answers')) s
   where (v_snap->'answers'->k) is distinct from (v_after->'answers'->k);
  if v_after->>'error' is not null or v_snap is null or v_diff is not null then
    raise exception 't33: the kernel equivalence fixture (no archived organization, no child row) answered differently: % %', v_after->>'error', v_diff;
  end if;
  v_chk := platform.kernel_equivalence_check();
  if v_chk->>'error' is not null or (v_chk->>'lost')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 't33: the kernel equivalence check reports lost or missing answers: %', v_chk - 'answers';
  end if;
  v_live := iam.entity_read_kernel_members_live();
  v_rec := coalesce(iam.entity_read_kernel_members_expected()->'members', '{}'::jsonb);
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_moved from (
    select k from jsonb_object_keys(v_live) k where (v_rec->>k) is distinct from (v_live->>k)
    union
    select k from jsonb_object_keys(v_rec) k where not v_live ? k
  ) s;
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
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 't33: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f
              where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 't33: the provisioner preflight still names the read kernel after the re-record: %', v_pre;
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values (v_from, v_to, v_moved,
          'ACCESS LADDER T-33: an archived organization is closed. has_org_access_for, is_org_admin_for and the '
          'set forms skip archived organizations; has_access_for_base opens nothing inside an archived '
          'organization past the author arm, and never opens a child row through the organization lanes (T-11y mirror).',
          v_chk->>'version',
          jsonb_build_object('fixture_answers_identical_before_and_after', true,
                             'answers', jsonb_array_length(jsonb_path_query_array(v_after->'answers', '$.keyvalue()')),
                             'check_against_recorded_expectation', v_chk - 'answers'),
          'matrx-frontend migrations/access_ladder_t33_archived_organization_is_closed.sql',
          'iam.entity_read_kernel_fingerprint (archived organization closed)');
  raise notice 't33: kernel re-recorded % -> % (moved: %)', v_from, v_to, v_moved;
end $rerecord$;
