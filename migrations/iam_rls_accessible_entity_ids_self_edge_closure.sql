-- ─────────────────────────────────────────────────────────────────────────────
-- THE ACCESS WALK ITSELF WAS QUADRATIC — the other half of the 57014 outage.
--
-- `iam_rls_stop_planner_evaluating_accessible_entity_ids.sql` stopped the PLANNER
-- from executing iam.accessible_entity_ids. That fixed plan time (14,254ms -> 3ms)
-- but only DEFERRED this function to execution, where it still cost:
--
--     select iam.accessible_entity_ids('folder','viewer',0,true)
--     -- 12,660 ms / 259,338 shared buffers
--
-- past the `authenticated` role's 8s statement_timeout outright. It survived the
-- post-fix verification only because the cheap `created_by = auth.uid()` / org arms
-- answered first; any read where those arms MISS reached it and 57014'd.
--
-- TWO CAUSES.
--
-- 1. A SELF-CONTAINMENT EDGE IS A TRANSITIVE CLOSURE, NOT A RECURSION.
--    platform.entity_relationships carries exactly one self edge — folder -> folder
--    (fk_column='parent_id', kind='containment'), the only one among ~200 child
--    types. The walk treated it like any cross-type parent: it recursed, its ONLY
--    stop was `p_depth > 12`, and at every level `p_include_public and v_has_vis`
--    made it recurse TWICE (include_public true and false). A depth-0 call fanned
--    out to ~91 invocations, each re-deriving the SAME base set over the whole
--    34,433-row table.
--
-- 2. `not (t.id = any($n))` AGAINST A 32,697-ELEMENT PARAMETER ARRAY.
--    PostgreSQL can hash a ScalarArrayOpExpr only when the array is a Const. A
--    plpgsql parameter is not, so it scanned the array LINEARLY PER ROW —
--    ~1.07 billion scalar comparisons per level. Replaced with a MATERIALIZED CTE
--    + NOT EXISTS, which hash-antijoins.
--
-- THE REWRITE. For a self edge, let S_T be the include_public seed (base arms +
-- granted candidates), S_F the non-public seed, and N the non-public closure. Then
--
--     P = closure_public(S_T u N)
--
-- and this EQUALS the old recursion's fixpoint. N is closed under ALL children (its
-- own branch takes the else arm, which ignores visibility), so every non-public row
-- the old code admitted via `parent in N` is already IN N; only the public arm still
-- needs iterating. N costs exactly ONE nested call, and that call takes this same
-- branch with p_include_public = false, so it does not fan out either. 91
-- invocations -> 2.
--
-- MEASURED LIVE (brsgrqvjdzwihsvnfqkf).
--     iam.accessible_entity_ids('folder',...)   12,565 ms ->   215 ms  (cold)
--     worst case across the proof set           12,763 ms -> 1,152 ms
--     select count(*) from files.folders as a real `authenticated` user, the
--     shape that 57014'd, with the parent-cascade arm (SubPlan 13) ACTUALLY
--     EXECUTING:                                                87.7 ms
--                                               (that arm: 59.6 ms / 5,491 buffers)
--
-- EQUIVALENCE PROOF. The pre-change function was cloned to
-- iam.accessible_entity_ids_ref and run head-to-head over 62
-- (user, type, include_public) pairs: all 22 distinct folder owners, plus the
-- folder-descendant types file / file_pages / file_version, both include_public
-- values. 62/62 returned IDENTICAL id sets — zero rows lost, zero rows gained. The
-- include_public/non-public split was genuinely exercised (e.g. 178 ids vs 158 for
-- one user), so the two-closure branch is proved, not merely unreached.
--
-- 🚨 ONE DELIBERATE SEMANTIC CHANGE, CURRENTLY LATENT. The self-edge closure runs to
-- FIXPOINT instead of stopping at `p_depth > 12`. Folder chains reach depth 22 live,
-- so the old cap could DENY a folder that iam.has_access_for_base — which has no
-- depth cap at all — allows. The parent-cascade arms in iam.entity_read_expr are
-- SUFFICIENT arms and are NOT covered by the bounded candidate sets, so an
-- under-report there denied the row outright: an over-tightening defect
-- (docs/official/db-rules.md §6). No row changes today — the one deep chain is owned
-- outright by its creator, so the base arm already covers it. Termination no longer
-- depends on the cap: the recursive CTE uses UNION, so each id enters the working set
-- at most once and a parent_id cycle terminates instead of spinning (no cycles exist
-- today; verified). The depth guard is RETAINED for cross-type recursion.
--
-- The kernel fingerprint legitimately changes: the BODY changed, the RESULTS did
-- not. iam.entity_read_kernel_expected() is re-baselined below, or
-- iam.entity_read_expr would degrade EVERY table to an unbounded iam.has_access
-- lane on the next iam.apply_rls run. Emitted policy text is unchanged, so the 198
-- tables / 743 policies do NOT need re-running.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function iam.accessible_entity_ids(
  p_type text,
  p_required public.permission_level,
  p_depth integer,
  p_include_public boolean
)
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'platform', 'iam'
as $function$
declare
  v_uid uuid := auth.uid();
  v_schema text; v_table text; v_tbl text; v_owner_col text;
  v_has_org boolean; v_has_vis boolean;
  v_parent_ids uuid[]; v_nonpublic_parent_ids uuid[]; v_more uuid[];
  v_trusted text; v_sql text;
  v_ids uuid[] := '{}';
  rec record;
begin
  if v_uid is null or p_depth > 12 then return '{}'::uuid[]; end if;

  select et.schema_name, et.table_name into v_schema, v_table
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

  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level then
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om where om.user_id = $1))';
    else
      v_trusted := v_trusted
        || ' or (t.visibility >= ''internal'' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and public.is_super_admin_for(v_uid) then
    v_trusted := v_trusted
      || ' or t.organization_id in (select so.organization_id '
      || 'from iam.system_orgs so where so.global_readable)';
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      if v_has_org then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    if v_has_org then
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
    with have as materialized (select iam.unnest_uuids(v_ids) as id)
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
      select r.item_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
      union
      select a.source_id
      from platform.associations_live a
      where a.source_type = p_type and a.role = 'assignment'
        and a.target_type = 'scope'
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
            || ' select t.id from %s t join clo c on t.%I = c.id'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column);
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
            || 'or (t.visibility is distinct from ''public'' and t.%I = any($2))'
            || ') and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
        else
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($2) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.%I = any($1) '
            || 'and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
        end if;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

-- Re-baseline the kernel fingerprint. HARDCODED, never recomputed at apply time:
-- the constant is the hand-blessed value, and recomputing it here would defeat the
-- very guard it feeds. If a replay finds a different fingerprint, the guard is
-- SUPPOSED to scream — another lane changed the kernel and it needs re-proving.
create or replace function iam.entity_read_kernel_expected()
returns text language sql immutable
as $function$ select 'eed6a47596c9c2b71324c360b1b15a8e'::text $function$;
