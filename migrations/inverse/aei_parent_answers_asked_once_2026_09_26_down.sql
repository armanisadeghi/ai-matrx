-- chair-step: restores iam.accessible_entity_ids(text, permission_level, integer, boolean) to the body live before aei_parent_answers_asked_once_2026_09_26.sql, and re-records the kernel fingerprint for that one member.
-- aei_parent_answers_asked_once_2026_09_26_down
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) 71c33edd5a1d4e66d5fdac5ab4292075f8c49ac8238f99653b57fcaa6af08971
-- based-on: iam.entity_read_kernel_expected() ba3f72a09984399e898efa8e6892b7c0e686525affbfdb07200761354f5f90d1
-- based-on: iam.entity_read_kernel_members_expected() a1aee99a4eadb07b0d05494b95b9d09313c187424a96df0a64e259ba13260eea

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
begin
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
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
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
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om where om.user_id = $1 '
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
    -- 🚨 AEI-REACH (2026-09-25) — THE REACHABILITY LANE ASKS ABOUT EACH CONTAINER ONCE, NOT
    -- ABOUT EVERY ROW INSIDE IT. This lane used to hand the kernel EVERY row of this type that
    -- sits in ANY container — whoever's container it is — and the kernel walked each one up into
    -- its container and said no. Measured live as a plain member (test@test.com): 3,588 of 4,087
    -- flash cards sat in other people's sets, so every read of education.fc_card paid 3,588
    -- kernel walks — 4.7 s for a 50-card list (RC-A5 timings; aidream
    -- db/tests/test_access_read_latency.py).
    -- A row reached through containment is admitted by iam.has_access_for_base only when a
    -- container on its frontier is itself admitted: the walk pushes exactly these reachability
    -- containers (and the row's FK parents, which the parent cascade below covers), and a
    -- container is walked with include_public no wider than the row's, while admission only grows
    -- with include_public. So the kernel is asked ONCE per distinct container, at this call's
    -- include_public (the wider question), and a candidate none of whose containers is admitted
    -- is not a containment candidate. Every surviving candidate is still confirmed by
    -- iam.has_access_for_base in the loop below, so this can only drop ids the kernel refuses.
    -- The cost is one kernel walk per distinct container (279 for the flash cards) instead of one
    -- per contained row, and never more than before: a row's walk already contains its
    -- container's.
    reach_cand as materialized (
      select r.item_id, r.container_type, r.container_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
        and not exists (select 1 from have h where h.id = r.item_id)
    ),
    -- Materialized on its own so the kernel call below cannot be pushed beneath the DISTINCT and
    -- asked once per contained row again.
    reach_containers as materialized (
      select distinct rc.container_type, rc.container_id from reach_cand rc
    ),
    reach_ok as materialized (
      select k.container_type, k.container_id
      from reach_containers k
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
            from iam.organization_member om where om.user_id = v_uid
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
        -- P = closure_public(S_T u N) where N is the non-public closure.
        -- Proof that this equals the old recursion's fixpoint: N is closed
        -- under ALL children (its own branch takes the else arm), so every
        -- non-public row the old code admitted via `parent in N` is already
        -- IN N; only the public arm still needs iterating. N costs exactly one
        -- nested call, and that call takes this same branch with
        -- p_include_public = false, so it does not fan out either.
        if p_include_public and v_has_vis then
          v_ids := v_ids || iam.accessible_entity_ids(
            p_type, p_required, p_depth + 1, false);
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from %s t join clo c on t.%I = c.id'
            || '  where t.visibility = ''public'''
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column);
        else
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from %s t join clo c on t.%I = c.id%s'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' where '));
        end if;
        execute v_sql into v_more using v_ids;
        v_ids := coalesce(v_more, '{}'::uuid[]);
      else
        v_parent_ids := iam.accessible_entity_ids(
          rec.parent_type, p_required, p_depth + 1, p_include_public
        );
        if p_include_public and v_has_vis then
          v_nonpublic_parent_ids := iam.accessible_entity_ids(
            rec.parent_type, p_required, p_depth + 1, false
          );
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

  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the
  -- parent's own std_select hides.
  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t' ||
      ' where t.id = any($1) and t.deleted_at is null', v_tbl);
    execute v_sql into v_more using v_ids;
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
$function$
;

DO $rerecord$
DECLARE
  v_fp text := iam.entity_read_kernel_fingerprint();
  v_members jsonb := iam.entity_read_kernel_members_live();
  v_before jsonb := iam.entity_read_kernel_members_expected()->'members';
  v_added text[];
  v_removed text[];
  v_changed text[];
BEGIN
  -- Re-record ONLY this file's own change: exactly one kernel member moved, and it is the
  -- four-argument accessible_entity_ids. Any other drift is somebody else's, and is refused.
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_added
    FROM jsonb_object_keys(v_members) AS k WHERE NOT v_before ? k;
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_removed
    FROM jsonb_object_keys(v_before) AS k WHERE NOT v_members ? k;
  SELECT coalesce(array_agg(k ORDER BY k), '{}'::text[]) INTO v_changed
    FROM jsonb_object_keys(v_members) AS k
   WHERE v_before ? k AND (v_before->>k) IS DISTINCT FROM (v_members->>k);
  IF cardinality(v_added) <> 0 OR cardinality(v_removed) <> 0
     OR cardinality(v_changed) <> 1
     OR v_changed[1] <> 'iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)' THEN
    RAISE EXCEPTION 'aei-memo-down: refusing to re-record unrelated kernel drift (added %, removed %, changed %)',
      v_added, v_removed, v_changed;
  END IF;
  EXECUTE format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
RETURNS text LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::text $f$$ddl$, v_fp);
  EXECUTE format($ddl$CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::jsonb $f$$ddl$,
                 jsonb_build_object('fingerprint', v_fp, 'members', v_members)::text);
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected()
     OR (iam.entity_read_kernel_members_expected()->'members') IS DISTINCT FROM iam.entity_read_kernel_members_live()
     OR (iam.entity_read_kernel_members_expected()->>'fingerprint') IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'aei-memo-down: kernel fingerprint re-record did not match the live kernel';
  END IF;
END
$rerecord$;
