-- assoc_soft_delete_tombstones.sql
--
-- D135 — a soft delete SOFT-removes an entity's association edges; a restore
-- brings back exactly the edges that trashing removed. Permanent destruction of
-- edges belongs ONLY to a true hard DELETE. (Arman's ruling, 2026-08-14.)
--
-- BEFORE: platform._gc_entity_associations fired on DELETE *and* on the UPDATE
-- that set deleted_at, and in both arms issued an unconditional
--   delete from platform.associations where source/target = this row
-- so trashing a web.page (Dismiss), a note, an agent — anything wired to
-- _gc_assoc_softdelete — PERMANENTLY destroyed its keywords, tasks, notes,
-- files and every other edge. Restore returned a stripped row and nothing
-- rebuilt the edges.
--
-- AFTER:
--   * hard DELETE  -> purge (unchanged, tombstoned rows included)
--   * ->deleted_at -> TOMBSTONE the live edges, stamped with the entity whose
--                     trashing removed them (deleted_via_type/_id)
--   * deleted_at-> -> UN-TOMBSTONE exactly the edges stamped by THIS entity.
--                     An edge the user removed before trashing was hard-deleted
--                     by assoc_remove and is therefore never resurrected.
--
-- ACCESS: platform.associations conveys access (platform.containment_edges ->
-- platform.reachability -> iam.has_access). A tombstoned edge must stop
-- conveying the instant the item is trashed, so:
--   * containment_edges filters deleted_at is null (the ONE conveyance choke point)
--   * trg_associations_reachability now also fires on UPDATE OF deleted_at, so
--     tombstoning/restoring an edge recomputes platform.reachability
--   * every reader function is repointed at platform.associations_live
--
-- Idempotent.

-- The applier runs each migration in its own transaction; no BEGIN/COMMIT here.

-- ── 1. the tombstone ────────────────────────────────────────────────────────
alter table platform.associations
  add column if not exists deleted_at       timestamptz,
  add column if not exists deleted_via_type text,
  add column if not exists deleted_via_id   uuid;

comment on column platform.associations.deleted_at is
  'Tombstone. Non-null = this edge was soft-removed because an endpoint entity was trashed. Never set by a user detaching an edge (that is a hard delete).';
comment on column platform.associations.deleted_via_type is
  'Entity token whose soft delete tombstoned this edge; restoring THAT entity revives exactly these edges.';
comment on column platform.associations.deleted_via_id is
  'Entity id whose soft delete tombstoned this edge.';

-- Restore looks edges up by the stamp; keep it cheap and tombstone-only.
create index if not exists idx_assoc_deleted_via
  on platform.associations (deleted_via_type, deleted_via_id)
  where deleted_at is not null;

-- Every read path filters on this; keep the hot lookups partial.
create index if not exists idx_assoc_source_live
  on platform.associations (source_type, source_id) where deleted_at is null;
create index if not exists idx_assoc_target_live
  on platform.associations (target_type, target_id) where deleted_at is null;

-- ── 2. the live view every reader uses ──────────────────────────────────────
-- security_invoker: the caller's own RLS on platform.associations still applies,
-- exactly as it did when readers named the table directly.
create or replace view platform.associations_live with (security_invoker = true) as
  select * from platform.associations where deleted_at is null;

comment on view platform.associations_live is
  'Non-tombstoned edges. THE read surface for platform.associations — a reader that names the base table sees soft-removed edges and is an access leak (D135).';

grant select on platform.associations_live to authenticated, service_role, svc_seo;

-- ── 3. conveyance stops at the tombstone (the one choke point) ──────────────
create or replace view platform.containment_edges as
 SELECT
        CASE
            WHEN r.container_side = 'source'::text THEN a.source_type
            ELSE a.target_type
        END AS container_type,
        CASE
            WHEN r.container_side = 'source'::text THEN a.source_id
            ELSE a.target_id
        END AS container_id,
        CASE
            WHEN r.container_side = 'source'::text THEN a.target_type
            ELSE a.source_type
        END AS item_type,
        CASE
            WHEN r.container_side = 'source'::text THEN a.target_id
            ELSE a.source_id
        END AS item_id,
    r.conveys_max
   FROM platform.associations a
     JOIN platform.association_types r ON r.source_type = a.source_type AND r.target_type = a.target_type AND (r.label IS NULL OR r.label = a.label)
  WHERE a.deleted_at IS NULL
    AND r.is_active AND (r.container_side = ANY (ARRAY['source'::text, 'target'::text]));

-- ── 4. reachability must recompute when an edge is tombstoned or revived ────
drop trigger if exists trg_associations_reachability on platform.associations;
create trigger trg_associations_reachability
  after insert or delete or update of source_type, source_id, target_type, target_id, label, deleted_at
  on platform.associations
  for each row execute function platform.trg_reachability_on_association();

-- ── 5. the GC: tombstone / restore / purge ──────────────────────────────────
create or replace function platform._gc_entity_associations()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_token text := tg_argv[0];
begin
  -- A true hard DELETE destroys the edges for good, tombstoned ones included.
  if tg_op = 'DELETE' then
    delete from platform.associations
     where (source_type = v_token and source_id = old.id)
        or (target_type = v_token and target_id = old.id);
    return null;
  end if;

  if tg_op <> 'UPDATE' then
    return null;
  end if;

  -- TRASH: soft-remove every LIVE edge, stamped with the entity that caused it.
  -- Already-tombstoned edges keep their original stamp so the entity that first
  -- removed them is the entity that brings them back.
  if old.deleted_at is null and new.deleted_at is not null then
    update platform.associations
       set deleted_at       = now(),
           deleted_via_type = v_token,
           deleted_via_id   = new.id
     where deleted_at is null
       and ((source_type = v_token and source_id = new.id)
         or (target_type = v_token and target_id = new.id));

  -- RESTORE: bring back exactly what THIS entity's trashing removed. An edge the
  -- user detached before trashing was hard-deleted and is not resurrected.
  elsif old.deleted_at is not null and new.deleted_at is null then
    update platform.associations
       set deleted_at       = null,
           deleted_via_type = null,
           deleted_via_id   = null
     where deleted_at is not null
       and deleted_via_type = v_token
       and deleted_via_id   = new.id;
  end if;

  return null;
end
$function$;

-- ── 6. re-attaching a tombstoned edge revives it ────────────────────────────
-- associations_unique does not know about deleted_at, so a tombstoned edge would
-- otherwise block every future INSERT of the same edge with a unique violation
-- the caller cannot see the cause of (the soft-delete write barrier). Reviving it
-- BEFORE the insert makes an insert-over-a-tombstone behave exactly like an
-- insert-over-a-live-edge: ON CONFLICT DO UPDATE applies the new attributes,
-- ON CONFLICT DO NOTHING keeps the old ones, a bare INSERT raises as it always did.
create or replace function platform.revive_tombstoned_association()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update platform.associations
     set deleted_at       = null,
         deleted_via_type = null,
         deleted_via_id   = null
   where deleted_at is not null
     and source_type = new.source_type and source_id = new.source_id
     and target_type = new.target_type and target_id = new.target_id
     and role is not distinct from new.role;
  return new;
end
$function$;

drop trigger if exists trg_associations_revive_tombstone on platform.associations;
create trigger trg_associations_revive_tombstone
  before insert on platform.associations
  for each row execute function platform.revive_tombstoned_association();

-- ── 7. every reader repointed at platform.associations_live ─────────────────
-- Enumerated from pg_proc (prosrc ilike '%platform.associations%'): 78 routines,
-- of which 52 read the table. The rest only INSERT/UPDATE/DELETE it, plus three
-- deliberate exceptions kept on the base table:
--   platform._gc_entity_associations     — rewritten above
--   platform.sweep_orphaned_associations — must purge tombstoned orphans too
--   platform.create_entity_table/_ddl_guard — emit/inspect DDL text

CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_schema text;
  v_table text;
  v_tbl text;
  v_owner_col text;
  v_has_org boolean;
  v_has_vis boolean;
  v_parent_ids uuid[];
  v_nonpublic_parent_ids uuid[];
  v_more uuid[];
  v_trusted text;
  v_sql text;
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

  for rec in
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
    where not (c.id = any(v_ids))
  loop
    if iam.has_access_for_base(v_uid, p_type, rec.id, p_required, p_include_public)
    then v_ids := v_ids || rec.id; end if;
  end loop;

  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      v_parent_ids := iam.accessible_entity_ids(
        rec.parent_type, p_required, p_depth + 1, p_include_public
      );
      if p_include_public and v_has_vis then
        v_nonpublic_parent_ids := iam.accessible_entity_ids(
          rec.parent_type, p_required, p_depth + 1, false
        );
        v_sql := format(
          'select coalesce(array_agg(t.id), ''{}'') from %s t '
          || 'where ('
          || '(t.visibility = ''public'' and t.%I = any($1)) '
          || 'or (t.visibility is distinct from ''public'' and t.%I = any($2))'
          || ') and not (t.id = any($3))',
          v_tbl, rec.fk_column, rec.fk_column
        );
        execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
      else
        v_sql := format(
          'select coalesce(array_agg(t.id), ''{}'') from %s t '
          || 'where t.%I = any($1) and not (t.id = any($2))',
          v_tbl, rec.fk_column
        );
        execute v_sql into v_more using v_parent_ids, v_ids;
      end if;
      v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
    end if;
  end loop;

  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.propagate_plan_page_research_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'platform', 'public'
AS $function$
begin
  if new.source_type in ('research_topic', 'research_tag')
     and new.target_type = 'plan_node' then
    insert into platform.associations (
      source_type,
      source_id,
      target_type,
      target_id,
      organization_id,
      label,
      metadata,
      created_by,
      role
    )
    select
      new.source_type,
      new.source_id,
      'web_page',
      realized.target_id,
      coalesce(new.organization_id, realized.organization_id),
      new.label,
      coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
        'lineage_origin', 'plan_node',
        'plan_node_id', new.target_id
      ),
      new.created_by,
      'inherited_from_plan'
    from platform.associations_live realized
    where realized.source_type = 'plan_node'
      and realized.source_id = new.target_id
      and realized.target_type = 'web_page'
      and realized.role = 'realizes'
    on conflict do nothing;
  elsif new.source_type = 'plan_node'
        and new.target_type = 'web_page'
        and new.role = 'realizes' then
    insert into platform.associations (
      source_type,
      source_id,
      target_type,
      target_id,
      organization_id,
      label,
      metadata,
      created_by,
      role
    )
    select
      research.source_type,
      research.source_id,
      'web_page',
      new.target_id,
      coalesce(research.organization_id, new.organization_id),
      research.label,
      coalesce(research.metadata, '{}'::jsonb) || jsonb_build_object(
        'lineage_origin', 'plan_node',
        'plan_node_id', new.source_id
      ),
      coalesce(new.created_by, research.created_by),
      'inherited_from_plan'
    from platform.associations_live research
    where research.source_type in ('research_topic', 'research_tag')
      and research.target_type = 'plan_node'
      and research.target_id = new.source_id
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from platform.associations_live a
    join iam.memberships m
      on m.container_type = 'scope'
     and m.container_id   = a.target_id
     and m.user_id        = p_user_id
     and m.status         = 'active'
     and m.deleted_at is null
    where a.source_type = p_type
      and a.source_id   = p_id
      and a.target_type = 'scope'
      and a.role        = 'assignment'
  )
  or (
    p_type = 'fc_card' and exists (
      select 1
      from platform.associations_live link
      join platform.associations_live a
        on a.source_type = 'fc_set'
       and a.source_id   = link.target_id
       and a.target_type = 'scope'
       and a.role        = 'assignment'
      join iam.memberships m
        on m.container_type = 'scope'
       and m.container_id   = a.target_id
       and m.user_id        = p_user_id
       and m.status         = 'active'
       and m.deleted_at is null
      where link.source_type = 'fc_card'
        and link.source_id   = p_id
        and link.target_type = 'fc_set'
        and link.role        = 'member'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.access_drift_report()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'platform', 'iam'
AS $function$
  SELECT jsonb_build_object(
    'members_missing_edge', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('store', dm.data_store_id,
                                          'source_kind', dm.source_kind,
                                          'source_id', dm.source_id))
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL
        AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM platform.association_types r
          WHERE r.source_type = rag.member_source_entity_token(dm.source_kind)
            AND r.target_type = 'data_store' AND r.is_active)
        AND NOT EXISTS (
          SELECT 1 FROM platform.associations_live a
          WHERE a.source_type = rag.member_source_entity_token(dm.source_kind)
            AND a.source_id = dm.source_id::uuid
            AND a.target_type = 'data_store' AND a.target_id = dm.data_store_id
            AND a.role IS NOT DISTINCT FROM 'library_member')), '[]'::jsonb),
    'unruled_member_kinds', COALESCE((
      SELECT jsonb_agg(DISTINCT dm.source_kind)
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM platform.association_types r
          WHERE r.source_type = rag.member_source_entity_token(dm.source_kind)
            AND r.target_type = 'data_store' AND r.is_active)), '[]'::jsonb),
    'edges_missing_reachability', (
      SELECT count(*)
      FROM platform.associations_live a
      JOIN platform.association_types r
        ON r.source_type = a.source_type AND r.target_type = a.target_type
       AND r.is_active AND r.conveys_max IS NOT NULL AND r.container_side = 'target'
      WHERE NOT EXISTS (
        SELECT 1 FROM platform.reachability rr
        WHERE rr.item_type = a.source_type AND rr.item_id = a.source_id
          AND rr.container_type = a.target_type AND rr.container_id = a.target_id)),
    'dead_policies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('schema', p.schemaname, 'table', p.tablename,
                                          'policy', p.policyname, 'cmd', p.cmd,
                                          'missing', CASE
                                            WHEN NOT has_schema_privilege('authenticated', p.schemaname, 'USAGE')
                                              THEN 'schema USAGE'
                                            ELSE 'table/column SELECT' END))
      FROM pg_policies p
      WHERE p.cmd IN ('SELECT', 'ALL')
        AND (p.roles::text LIKE '%authenticated%' OR p.roles::text = '{public}')
        AND p.schemaname NOT IN ('storage', 'realtime', 'graveyard')
        AND (
          NOT has_schema_privilege('authenticated', p.schemaname, 'USAGE')
          OR (
            NOT has_table_privilege('authenticated',
                  format('%I.%I', p.schemaname, p.tablename), 'SELECT')
            AND NOT has_any_column_privilege('authenticated',
                  format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT')))), '[]'::jsonb),
    'registry_cycles', COALESCE((
      WITH RECURSIVE walk AS (
        SELECT er.child_type, er.parent_type, ARRAY[er.child_type] AS path,
               false AS cycle
        FROM platform.entity_relationships er
        WHERE er.child_type <> er.parent_type
        UNION ALL
        SELECT w.child_type, er.parent_type, w.path || er.child_type,
               er.parent_type = ANY(w.path)
        FROM walk w
        JOIN platform.entity_relationships er
          ON er.child_type = w.parent_type AND er.child_type <> er.parent_type
        WHERE NOT w.cycle AND array_length(w.path, 1) < 20
      )
      SELECT jsonb_agg(DISTINCT to_jsonb(w.path || w.parent_type))
      FROM walk w WHERE w.cycle), '[]'::jsonb),
    'row_cycles', COALESCE(public.detect_self_containment_row_cycles(), '[]'::jsonb),
    'orphan_members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('store', dm.data_store_id, 'source_id', dm.source_id))
      FROM rag.data_store_members dm
      WHERE dm.deleted_at IS NULL AND dm.source_kind = 'cld_file'
        AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
          SELECT 1 FROM files.files f
          WHERE f.id = dm.source_id::uuid AND f.deleted_at IS NULL)), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_relationship_problems()
 RETURNS TABLE(kind text, severity text, source_type text, target_type text, label text, container_side text, edge_count bigint, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'unregistered_pair'::text, 'error'::text,
         a.source_type, a.target_type, a.label, null::text, count(*),
         'Association shape exists in data but no active rule registers it.'::text
  from platform.associations_live a
  where public.is_super_admin()
    and not exists (
      select 1 from platform.association_types r
      where r.source_type = a.source_type
        and r.target_type = a.target_type
        and (r.label is null or r.label = a.label)
        and r.is_active
    )
  group by a.source_type, a.target_type, a.label

  union all
  select 'wrong_way_edges'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations_live a
          where a.source_type = r.target_type
            and a.target_type = r.source_type
            and (r.label is null or a.label = r.label)),
         'Edges exist in the reverse direction of this registered pair.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.source_type <> r.target_type
    and not exists (
      select 1 from platform.association_types rr
      where rr.source_type = r.target_type
        and rr.target_type = r.source_type
        and rr.label is not distinct from r.label
        and rr.is_active
    )
    and exists (
      select 1 from platform.associations_live a
      where a.source_type = r.target_type
        and a.target_type = r.source_type
        and (r.label is null or a.label = r.label)
    )

  union all
  select 'conveying_container_not_shareable'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations_live a
          where a.source_type = r.source_type
            and a.target_type = r.target_type
            and (r.label is null or a.label = r.label)),
         'This rule conveys access, but its container type has neither a direct share entry nor a structural path from any shareable ancestor.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.container_side <> 'none'
    and not platform.entity_type_has_shareable_ancestor(
      case when r.container_side = 'target' then r.target_type else r.source_type end
    )

  union all
  select 'conveying_rule_no_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side, 0::bigint,
         'Rule conveys access but no associations of this shape exist yet.'::text
  from platform.association_types r
  where public.is_super_admin()
    and r.is_active
    and r.container_side <> 'none'
    and not exists (
      select 1 from platform.associations_live a
      where a.source_type = r.source_type
        and a.target_type = r.target_type
        and (r.label is null or a.label = r.label)
    )

  union all
  select 'inactive_rule_with_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (select count(*) from platform.associations_live a
          where a.source_type = r.source_type
            and a.target_type = r.target_type
            and (r.label is null or a.label = r.label)),
         'Rule is inactive but associations of this shape still exist.'::text
  from platform.association_types r
  where public.is_super_admin()
    and not r.is_active
    and exists (
      select 1 from platform.associations_live a
      where a.source_type = r.source_type
        and a.target_type = r.target_type
        and (r.label is null or a.label = r.label)
    )
  order by 2, 7 desc;
$function$;

CREATE OR REPLACE FUNCTION public.admin_relationship_rules()
 RETURNS TABLE(source_type text, target_type text, label text, container_side text, conveys_max permission_level, is_active boolean, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, edge_count bigint, closure_rows bigint, reverse_edge_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT r.source_type, r.target_type, r.label,
         r.container_side, r.conveys_max, r.is_active, r.notes,
         r.created_at, r.updated_at,
         (SELECT count(*) FROM platform.associations_live a
           WHERE a.source_type = r.source_type AND a.target_type = r.target_type
             AND (r.label IS NULL OR a.label = r.label)) AS edge_count,
         (SELECT count(*) FROM platform.reachability x
           WHERE r.container_side = 'target' AND x.container_type = r.target_type AND x.item_type = r.source_type
              OR r.container_side = 'source' AND x.container_type = r.source_type AND x.item_type = r.target_type) AS closure_rows,
         CASE
           WHEN r.source_type = r.target_type THEN 0
           WHEN EXISTS (SELECT 1 FROM platform.association_types rr
                         WHERE rr.source_type = r.target_type AND rr.target_type = r.source_type
                           AND rr.label IS NOT DISTINCT FROM r.label AND rr.is_active) THEN 0
           ELSE (SELECT count(*) FROM platform.associations_live a
                  WHERE a.source_type = r.target_type AND a.target_type = r.source_type
                    AND (r.label IS NULL OR a.label = r.label))
         END AS reverse_edge_count
  FROM platform.association_types r
  WHERE public.is_super_admin()
  ORDER BY (r.container_side <> 'none') DESC, edge_count DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_unregistered_pairs()
 RETURNS TABLE(source_type text, target_type text, label text, edge_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT a.source_type, a.target_type, a.label, count(*)
  FROM platform.associations_live a
  WHERE public.is_super_admin()
    AND NOT EXISTS (
      SELECT 1 FROM platform.association_types r
      WHERE r.source_type = a.source_type AND r.target_type = a.target_type
        AND (r.label IS NULL OR r.label = a.label) AND r.is_active)
  GROUP BY 1, 2, 3 ORDER BY count(*) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.agent_set_list()
 RETURNS TABLE(orchestrator_id uuid, name text, description text, set_label text, metadata jsonb, member_count integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.source_id                                              as orchestrator_id,
    d.name,
    d.description,
    s.label                                                  as set_label,
    coalesce(s.metadata, '{}'::jsonb)                        as metadata,
    coalesce(m.cnt, 0)::int                                  as member_count,
    s.created_at,
    greatest(s.created_at, coalesce(m.last_at, s.created_at)) as updated_at
  from platform.associations_live s
  join agent.definition d on d.id = s.source_id
  left join lateral (
    select count(*) as cnt, max(a.created_at) as last_at
      from platform.associations_live a
     where a.source_type = 'agent'
       and a.source_id   = s.source_id
       and a.target_type = 'agent'
       and a.role        = 'member'
  ) m on true
  where s.source_type = 'agent'
    and s.target_type = 'agent'
    and s.source_id   = s.target_id
    and s.role        = 'matrx_set'
    and d.deleted_at is null
    and iam.has_org_access(s.organization_id)
  order by updated_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_slots jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    CASE
      WHEN s.agent_id IS NULL THEN NULL
      WHEN s.use_latest THEN s.agent_id
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN s.agent_id
      ELSE s.agent_version_id
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      WHEN COALESCE(av.version_number, a.version) >= a.version THEN false
      ELSE true
    END,
    CASE
      WHEN s.agent_id IS NULL THEN false
      WHEN s.use_latest THEN false
      ELSE a.version > COALESCE(av.version_number, a.version)
    END,
    s.agent_id, s.agent_version_id, a.version, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_slots
         ELSE av.context_slots END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id AND a.deleted_at IS NULL
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE s.is_active = true
    AND (
      (p_project_id IS NOT NULL AND sp.target_id = p_project_id)
      OR (p_task_id IS NOT NULL AND st.target_id = p_task_id)
      OR EXISTS (
        SELECT 1 FROM iam.permissions p
        WHERE p.resource_type = 'agent_shortcut'
          AND p.resource_id = s.id
          AND (
            p.granted_to_user_id = auth.uid()
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = auth.uid()
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_user_shortcuts()
 RETURNS TABLE(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.name,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case when st.target_id is not null then 'task' when sp.target_id is not null then 'project'
          when s.organization_id is not null then 'organization' when s.created_by is not null then 'personal'
          else 'system' end)::text,
    (case when st.target_id is not null then (select t.title from workspace.tasks t where t.id = st.target_id)
          when sp.target_id is not null then (select p.name from workspace.projects p where p.id = sp.target_id)
          when s.organization_id is not null then (select o.name from iam.organizations o where o.id = s.organization_id)
          when s.created_by is not null then 'Personal' else 'System' end)::text,
    s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from agent.shortcut s
  left join agent.definition a on a.id = s.agent_id
  left join platform.categories sc on sc.id = s.category_id and sc.dimension = 'shortcut'
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'project'
    order by x.created_at limit 1
  ) sp on true
  left join lateral (
    select x.target_id from platform.associations_live x
    where x.source_type = 'agent_shortcut' and x.source_id = s.id and x.target_type = 'task'
    order by x.created_at limit 1
  ) st on true
  where s.created_by = v_uid
     or s.organization_id in (select om.organization_id from iam.organization_member om
        where om.user_id = v_uid and om.role in ('owner','admin'))
     or sp.target_id in (select m.container_id from iam.memberships m
        where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner','admin'))
  order by case when s.created_by is not null then 0 when s.organization_id is not null then 1
                when sp.target_id is not null then 2 when st.target_id is not null then 3 else 4 end,
           s.sort_order, s.label;
end;
$function$;

CREATE OR REPLACE FUNCTION public.agx_list_non_global_shortcuts_for_admin()
 RETURNS TABLE(id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, agent_id uuid, agent_version_id uuid, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, is_active boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, display_mode text, show_variable_panel boolean, variables_panel_style text, auto_run boolean, allow_chat boolean, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, owner_email text, owner_display text, scope_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.category_id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.agent_id, s.agent_version_id, s.use_latest,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.is_active, s.created_by, s.organization_id, sp.target_id, st.target_id,
    s.display_mode, s.show_variable_panel, s.variables_panel_style,
    s.auto_run, s.allow_chat,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.created_at, s.updated_at,
    u.email::text AS owner_email,
    COALESCE(u.email::text, o.name, sp.target_id::text, st.target_id::text) AS owner_display,
    CASE
      WHEN s.created_by      IS NOT NULL THEN 'user'
      WHEN s.organization_id IS NOT NULL THEN 'organization'
      WHEN sp.target_id      IS NOT NULL THEN 'project'
      WHEN st.target_id      IS NOT NULL THEN 'task'
      ELSE 'global'
    END AS scope_type
  FROM agent.shortcut s
  LEFT JOIN auth.users u ON u.id = s.created_by
  LEFT JOIN iam.organizations o ON o.id = s.organization_id
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations_live x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'task'
    ORDER BY x.created_at LIMIT 1
  ) st ON true
  WHERE NOT (
    s.created_by IS NULL AND s.organization_id IS NULL
    AND sp.target_id IS NULL AND st.target_id IS NULL
  )
  ORDER BY s.updated_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_usage_scan_core(p_agent_id uuid, p_viewer uuid, p_scope text DEFAULT 'agent'::text)
 RETURNS TABLE(usage_type text, usage_id uuid, node_id text, label text, owner_user_id uuid, organization_id uuid, organization_name text, org_manager_user_ids uuid[], agent_id uuid, agent_name text, current_version integer, pin_mode text, pinned_version_id uuid, pinned_version_number integer, versions_behind integer, stale_pin boolean, is_usage_active boolean, severity text, findings jsonb, config jsonb, managed_by_caller boolean, usage_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'scheduler', 'communication', 'agent', 'iam', 'app', 'workflow', 'pg_temp'
AS $function$
WITH usages AS (
  SELECT
    'shortcut'::text AS usage_type, s.id AS usage_id, NULL::text AS node_id,
    s.label, s.created_by AS owner_user_id, s.organization_id,
    COALESCE(s.agent_id, sv.agent_id) AS target_agent_id,
    CASE WHEN NOT s.use_latest AND sv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END AS pin_mode,
    CASE WHEN NOT s.use_latest THEN sv.id END AS pinned_version_id,
    CASE WHEN NOT s.use_latest THEN sv.version_number END AS pinned_version_number,
    (public.agx_usage_jsonb_keys(s.default_variables)
      || CASE WHEN public.agx_usage_jsonb_keys(s.value_mappings) <> '{}'::text[]
              THEN public.agx_usage_jsonb_keys(s.value_mappings)
              ELSE public.agx_usage_jsonb_text_values(s.scope_mappings) END) AS stored_var_keys,
    (public.agx_usage_jsonb_keys(s.context_overrides)
      || public.agx_usage_jsonb_text_values(s.context_mappings)) AS stored_slot_keys,
    (NOT COALESCE(s.auto_run, false)) AS is_interactive,
    s.is_active AS is_usage_active,
    jsonb_build_object(
      'default_variables', s.default_variables, 'value_mappings', s.value_mappings,
      'context_mappings', s.context_mappings, 'context_overrides', s.context_overrides,
      'scope_mappings', s.scope_mappings, 'auto_run', s.auto_run,
      'surface_name', s.surface_name, 'use_latest', s.use_latest) AS config,
    s.updated_at AS usage_updated_at
  FROM agent.shortcut s
  LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id

  UNION ALL
  SELECT
    'app', ap.id, NULL, ap.name, ap.created_by, ap.organization_id,
    COALESCE(ap.agent_id, av.agent_id),
    CASE WHEN NOT COALESCE(ap.use_latest, true) AND av.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.id END,
    CASE WHEN NOT COALESCE(ap.use_latest, true) THEN av.version_number END,
    (SELECT c.var_names FROM public.agx_usage_contract(ap.variable_schema, '[]'::jsonb) c),
    (SELECT c.slot_keys FROM public.agx_usage_contract('[]'::jsonb, ap.shared_context_slots) c),
    false,
    (ap.status = 'published'),
    jsonb_build_object(
      'variable_schema', ap.variable_schema, 'shared_context_slots', ap.shared_context_slots,
      'pinned_version', ap.pinned_version, 'status', ap.status, 'slug', ap.slug,
      'use_latest', ap.use_latest),
    ap.updated_at
  FROM app.definition ap
  LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id

  UNION ALL
  SELECT
    'scheduled_task', st.id, NULL, st.title, st.user_id, NULL::uuid,
    COALESCE(ta.id, tv.agent_id),
    CASE WHEN tv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    tv.id, tv.version_number,
    public.agx_usage_jsonb_keys(sat.variables),
    '{}'::text[],
    false,
    (st.enabled AND st.deleted_at IS NULL),
    jsonb_build_object('variables', sat.variables, 'prompt', left(sat.prompt, 400), 'kind', st.kind),
    st.updated_at
  FROM scheduler.sch_agent_task sat
  JOIN scheduler.sch_task st ON st.id = sat.id
  LEFT JOIN agent.definition ta ON ta.id = sat.agent_id
  LEFT JOIN agent.definition_version tv ON tv.id = sat.agent_id
  WHERE st.kind = 'agent' AND st.deleted_at IS NULL AND sat.agent_id IS NOT NULL

  UNION ALL
  SELECT
    'surface_binding', sf.id, NULL, sfu.name,
    NULLIF(sf.metadata ->> 'user_id', '')::uuid, sf.organization_id,
    COALESCE(sa.id, sv2.agent_id),
    CASE WHEN sv2.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    sv2.id, sv2.version_number,
    public.agx_usage_jsonb_keys(COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb)),
    '{}'::text[],
    false,
    true,
    jsonb_build_object('value_mappings', COALESCE(sf.metadata -> 'value_mappings', '{}'::jsonb), 'surface_name', sfu.name),
    sf.created_at
  FROM platform.associations_live sf
  JOIN ui.ui_surface sfu ON sfu.id = sf.target_id
  LEFT JOIN agent.definition sa ON sa.id = sf.source_id
  LEFT JOIN agent.definition_version sv2 ON sv2.id = sf.source_id
  WHERE sf.source_type = 'agent' AND sf.target_type = 'surface'

  UNION ALL
  SELECT
    'sms_line', sc.id, NULL, COALESCE(sc.external_phone_number, 'SMS line'),
    sc.user_id, NULL::uuid,
    COALESCE(ma.id, mv.agent_id),
    CASE WHEN mv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    mv.id, mv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    (sc.status = 'active'),
    jsonb_build_object('our_phone_number', sc.our_phone_number, 'conversation_type', sc.conversation_type),
    sc.updated_at
  FROM communication.sms_conversations sc
  CROSS JOIN LATERAL (
    SELECT CASE WHEN sc.ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN sc.ai_agent_id::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition ma ON ma.id = rid.ref_id
  LEFT JOIN agent.definition_version mv ON mv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'workflow_node', w.id, n.elem ->> 'id',
    w.name || ' · ' || COALESCE(n.elem -> 'data' ->> 'label', n.elem ->> 'id'),
    w.created_by, w.organization_id,
    COALESCE(wa.id, wv.agent_id),
    CASE WHEN wv.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    wv.id, wv.version_number,
    public.agx_usage_jsonb_keys(n.elem -> 'data' -> 'config' -> 'variables'),
    '{}'::text[],
    false,
    (NOT COALESCE(w.is_archived, false)),
    jsonb_build_object('workflow_id', w.id, 'node_label', n.elem -> 'data' ->> 'label',
                       'node_config', n.elem -> 'data' -> 'config'),
    NULL::timestamptz
  FROM workflow.definition w
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.nodes) = 'array' THEN w.nodes ELSE '[]'::jsonb END) n(elem)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (n.elem -> 'data' -> 'config' ->> 'agent_id')
                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (n.elem -> 'data' -> 'config' ->> 'agent_id')::uuid END AS ref_id
  ) rid
  LEFT JOIN agent.definition wa ON wa.id = rid.ref_id
  LEFT JOIN agent.definition_version wv ON wv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  SELECT
    'derived_agent', d.id, NULL, d.name, d.created_by, d.organization_id,
    d.source_agent_id,
    'pinned',
    dpv.id, dpv.version_number,
    '{}'::text[], '{}'::text[],
    true,
    (d.is_active AND NOT d.is_archived),
    jsonb_build_object('source_snapshot_at', d.source_snapshot_at, 'derived_version', d.version),
    d.updated_at
  FROM agent.definition d
  LEFT JOIN LATERAL (
    SELECT v.id, v.version_number FROM agent.definition_version v
    WHERE v.agent_id = d.source_agent_id
      AND (d.source_snapshot_at IS NULL OR v.changed_at <= d.source_snapshot_at)
    ORDER BY v.version_number DESC LIMIT 1
  ) dpv ON true
  WHERE d.source_agent_id IS NOT NULL

  UNION ALL
  SELECT
    'comparison', e.id, NULL, COALESCE(cs.name, 'Comparison entry'),
    cs.created_by, cs.organization_id,
    COALESCE(ca.id, cv.agent_id),
    CASE WHEN e.agent_version_snapshot_id IS NOT NULL OR e.agent_version IS NOT NULL
         THEN 'pinned' ELSE 'follow_active' END,
    cv2.id, COALESCE(cv2.version_number, e.agent_version),
    '{}'::text[], '{}'::text[],
    true,
    true,
    jsonb_build_object('comparison_set_id', e.comparison_set_id, 'agent_version', e.agent_version),
    e.created_at
  FROM agent.cmp_comparison_entries e
  LEFT JOIN agent.cmp_comparison_sets cs ON cs.id = e.comparison_set_id
  LEFT JOIN agent.definition ca ON ca.id = e.agent_id
  LEFT JOIN agent.definition_version cv ON cv.id = e.agent_id
  LEFT JOIN agent.definition_version cv2 ON cv2.id = e.agent_version_snapshot_id

  UNION ALL
  SELECT
    'code', r.id, NULL, r.usage_key, NULL::uuid, NULL::uuid,
    COALESCE(r.agent_id, rv.agent_id),
    CASE WHEN r.ref_kind = 'version' THEN 'pinned' ELSE 'follow_active' END,
    rv.id, rv.version_number,
    '{}'::text[], '{}'::text[],
    false,
    true,
    jsonb_build_object('purpose', r.purpose, 'code_path', r.code_path,
                       'source_system', r.source_system, 'ref_kind', r.ref_kind),
    r.last_synced_at
  FROM agent.usage r
  LEFT JOIN agent.definition_version rv ON rv.id = r.agent_version_id
  WHERE r.status = 'active' AND r.ref_kind IN ('version', 'agent')
),
enriched AS (
  SELECT
    u.*,
    ag.name AS r_agent_name,
    ag.version AS r_current_version,
    (ag.is_archived OR NOT ag.is_active) AS agent_unavailable,
    lc.var_names AS live_vars, lc.required_var_names AS live_req, lc.slot_keys AS live_slots,
    pvrow.id AS pin_row_id,
    pc.var_names AS pin_vars, pc.required_var_names AS pin_req, pc.slot_keys AS pin_slots,
    org.name AS r_organization_name,
    (SELECT array_agg(om.user_id) FROM iam.organization_member om
      WHERE om.organization_id = u.organization_id AND om.role IN ('owner', 'admin')) AS r_org_managers,
    (u.pin_mode = 'pinned' AND u.pinned_version_number IS NOT NULL
      AND u.pinned_version_number <> ag.version) AS r_stale_pin
  FROM usages u
  JOIN agent.definition ag ON ag.id = u.target_agent_id
  CROSS JOIN LATERAL public.agx_usage_contract(ag.variable_definitions, ag.context_slots) lc
  LEFT JOIN agent.definition_version pvrow ON pvrow.id = u.pinned_version_id
  LEFT JOIN LATERAL (
    SELECT c.var_names, c.required_var_names, c.slot_keys
    FROM public.agx_usage_contract(pvrow.variable_definitions, pvrow.context_slots) c
    WHERE pvrow.id IS NOT NULL
  ) pc ON true
  LEFT JOIN iam.organizations org ON org.id = u.organization_id
  WHERE u.target_agent_id IS NOT NULL
    AND (p_scope = 'all' OR u.target_agent_id = p_agent_id)
),
evaluated AS (
  SELECT
    e.*,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_vars  ELSE e.live_vars  END AS eff_vars,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_req   ELSE e.live_req   END AS eff_req,
    CASE WHEN e.pin_mode = 'pinned' AND e.pin_row_id IS NOT NULL THEN e.pin_slots ELSE e.live_slots END AS eff_slots,
    (e.pin_row_id IS NOT NULL AND NOT (
        e.pin_vars <@ e.live_vars AND e.pin_vars @> e.live_vars
        AND e.pin_req <@ e.live_req AND e.pin_req @> e.live_req
        AND e.pin_slots <@ e.live_slots AND e.pin_slots @> e.live_slots)) AS contract_changed
  FROM enriched e
),
finalized AS (
  SELECT
    v.*,
    CASE WHEN v.usage_type = 'comparison' THEN
      CASE WHEN v.r_stale_pin THEN jsonb_build_array(jsonb_build_object(
        'drift_class', 'stale_pin', 'severity', 'info', 'detail', '{}'::jsonb))
      ELSE '[]'::jsonb END
    ELSE
      public.agx_usage_eval(
        v.usage_type, v.stored_var_keys, v.stored_slot_keys,
        v.eff_vars, v.eff_req, v.eff_slots,
        v.is_interactive, v.pin_mode, v.r_stale_pin, v.contract_changed,
        (v.agent_unavailable AND v.is_usage_active))
    END AS r_findings
  FROM evaluated v
)
SELECT
  f.usage_type,
  f.usage_id,
  f.node_id,
  f.label,
  f.owner_user_id,
  f.organization_id,
  f.r_organization_name,
  f.r_org_managers,
  f.target_agent_id,
  f.r_agent_name,
  f.r_current_version,
  f.pin_mode,
  f.pinned_version_id,
  f.pinned_version_number,
  CASE WHEN f.pin_mode = 'pinned' AND f.pinned_version_number IS NOT NULL
       THEN GREATEST(f.r_current_version - f.pinned_version_number, 0) END,
  f.r_stale_pin,
  f.is_usage_active,
  CASE
    WHEN f.r_findings @> '[{"severity":"breaking"}]'::jsonb        THEN 'breaking'
    WHEN f.r_findings @> '[{"severity":"silent_breaking"}]'::jsonb THEN 'silent_breaking'
    WHEN f.r_findings @> '[{"severity":"warning"}]'::jsonb         THEN 'warning'
    WHEN f.r_findings @> '[{"severity":"info"}]'::jsonb            THEN 'info'
  END,
  f.r_findings,
  f.config || jsonb_build_object('effective', jsonb_build_object(
    'variables', to_jsonb(f.eff_vars),
    'required_variables', to_jsonb(f.eff_req),
    'context_slots', to_jsonb(f.eff_slots))),
  (p_viewer IS NOT NULL AND (
     f.owner_user_id = p_viewer
     OR (f.organization_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM iam.organization_member om
           WHERE om.organization_id = f.organization_id
             AND om.user_id = p_viewer AND om.role IN ('owner', 'admin'))))),
  f.usage_updated_at
FROM finalized f
$function$;

CREATE OR REPLACE FUNCTION public.assoc_for_entity(p_type text, p_id uuid)
 RETURNS TABLE(id uuid, direction text, other_type text, other_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_type and a.source_id = p_id and iam.org_readable(a.organization_id)
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_type and a.target_id = p_id and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
 RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_list(p_type text, p_id uuid, p_direction text DEFAULT 'out'::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(assoc_id uuid, direction text, role text, label text, edge_position integer, other_type text, other_id uuid, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT iam.has_access(p_type, p_id, 'viewer') THEN RAISE EXCEPTION 'access denied'; END IF;
  IF p_direction NOT IN ('out','in','both') THEN RAISE EXCEPTION 'direction must be out|in|both'; END IF;
  RETURN QUERY
    SELECT a.id,'out'::text,a.role,a.label,a.position,a.target_type,a.target_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('out','both') AND a.source_type=p_type AND a.source_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
    UNION ALL
    SELECT a.id,'in'::text,a.role,a.label,a.position,a.source_type,a.source_id,a.metadata,a.created_at
      FROM platform.associations_live a
     WHERE p_direction IN ('in','both') AND a.target_type=p_type AND a.target_id=p_id
       AND (p_role IS NULL OR a.role=p_role)
    ORDER BY 5 NULLS LAST, 9;
END; $function$;

CREATE OR REPLACE FUNCTION public.assoc_members_visible(p_target_type text, p_target_ids uuid[])
 RETURNS TABLE(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewable as (
    -- Evaluate the (heavier) row-level authorization ONCE per distinct target.
    select tid
      from unnest(coalesce(p_target_ids, '{}'::uuid[])) as tid
     where iam.has_access(p_target_type, tid, 'viewer'::permission_level)
  )
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label,
         a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations_live a
   where a.target_type = p_target_type
     and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and (
       iam.has_org_access(a.organization_id)
       or a.target_id in (select tid from viewable)
     )
  order by 7 nulls last, 10;
$function$;

CREATE OR REPLACE FUNCTION public.assoc_remove_for_entity(p_type text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_edge record;
BEGIN
    IF p_type IN ('file', 'conversation') THEN
        RAISE EXCEPTION 'file and conversation associations must be removed through their dedicated mutation paths'
            USING ERRCODE = '42501';
    END IF;

    IF NOT iam.has_access(p_type, p_id, 'editor'::public.permission_level) THEN
        RAISE EXCEPTION 'assoc_remove_for_entity: editor access to the entity is required'
            USING ERRCODE = '42501';
    END IF;

    FOR v_edge IN
        SELECT
            a.source_type,
            a.source_id,
            a.target_type,
            a.target_id,
            a.role
        FROM platform.associations_live a
        WHERE (
            (a.source_type = p_type AND a.source_id = p_id)
            OR (a.target_type = p_type AND a.target_id = p_id)
        )
    LOOP
        PERFORM public.assoc_remove(
            v_edge.source_type,
            v_edge.source_id,
            v_edge.target_type,
            v_edge.target_id,
            v_edge.role
        );
    END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.assoc_set_targets(p_source_type text, p_source_id uuid, p_target_type text, p_target_ids uuid[], p_org_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_target uuid;
    v_pos integer := 0;
BEGIN
    IF p_source_type = 'file' AND p_target_type = 'conversation' THEN
        RAISE EXCEPTION 'file -> conversation set replacement is not supported; use the dedicated attachment RPCs'
            USING ERRCODE = '42501';
    END IF;

    IF NOT iam.has_access(
        p_source_type,
        p_source_id,
        'editor'::public.permission_level
    ) THEN
        RAISE EXCEPTION 'assoc_set_targets: editor access to source required'
            USING ERRCODE = '42501';
    END IF;

    FOR v_target IN
        SELECT a.target_id
        FROM platform.associations_live a
        WHERE a.source_type = p_source_type
          AND a.source_id = p_source_id
          AND a.target_type = p_target_type
          AND a.role IS NOT DISTINCT FROM p_role
          AND a.target_id <> ALL (coalesce(p_target_ids, '{}'::uuid[]))
    LOOP
        PERFORM public.assoc_remove(
            p_source_type,
            p_source_id,
            p_target_type,
            v_target,
            p_role
        );
    END LOOP;

    IF p_target_ids IS NOT NULL THEN
        FOREACH v_target IN ARRAY p_target_ids LOOP
            PERFORM public.assoc_add(
                p_source_type, p_source_id, p_target_type, v_target,
                p_org_id, NULL, '{}'::jsonb, p_role, v_pos
            );
            v_pos := v_pos + 1;
        END LOOP;
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.assoc_unlink(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_count integer;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'assoc_unlink: authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::integer
    INTO v_count
    FROM platform.associations_live a
    WHERE a.source_type = p_source_type
      AND a.source_id = p_source_id
      AND a.target_type = p_target_type
      AND a.target_id = p_target_id
      AND a.role IS NOT DISTINCT FROM p_role;

    PERFORM public.assoc_remove(
        p_source_type,
        p_source_id,
        p_target_type,
        p_target_id,
        p_role
    );

    RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION public.container_resource_counts(p_column text, p_container_id uuid)
 RETURNS TABLE(resource_key text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rec record; v_count bigint; v_has_col boolean; v_has_arch boolean; v_sql text;
begin
  if p_column not in ('organization_id', 'project_id', 'task_id') then
    raise exception 'invalid container column: %', p_column;
  end if;
  if p_container_id is null then return; end if;
  for rec in
    select * from (values
      ('agent',            'agent',       'definition',            'is_archived'),
      ('agent_app',        'app',         'definition',            null),
      ('agent_shortcut',   'agent',       'shortcut',              null),
      ('skill',            'skill',       'definition',            null),
      ('content_template', 'agent',       'message_template',      null),
      ('sandbox',          'public',      'sandbox_instances',     null),
      ('file',             'files',       'files',                 null),
      ('dataset',          'workbench',   'udt_datasets',          null),
      ('structured_list',  'workbench',   'udt_structured_lists',  null),
      ('workbook',         'workbench',   'udt_workbooks',         null),
      ('transcript',       'transcripts', 'transcripts',           null),
      ('note',             'public',      'notes',                 null),
      ('conversation',     'chat',        'conversation',          null),
      ('flashcard',        'education',   'flashcard_data',        null),
      ('quiz',             'education',   'quiz_sessions',         null),
      ('canvas',           'public',      'canvas_items',          'is_archived'),
      ('research',         'research',    'rs_topic',              null),
      ('project',          'workspace',   'projects',              null),
      ('task',             'workspace',   'tasks',                 null),
      ('workflow',         'workflow',    'definition',            null)
    ) as t(k, sch, tbl, arch)
  loop
    begin
      if rec.k = 'research' and p_column = 'project_id' then
        select count(*) into v_count from platform.associations_live a
          join research.rs_topic rt on rt.id = a.source_id and rt.deleted_at is null
          where a.source_type='research_topic' and a.target_type='project' and a.target_id = p_container_id;
        resource_key := rec.k; n := v_count; return next; continue;
      end if;
      if to_regclass(format('%I.%I', rec.sch, rec.tbl)) is null then continue; end if;
      select exists (select 1 from information_schema.columns
        where table_schema = rec.sch and table_name = rec.tbl and column_name = p_column) into v_has_col;
      if not v_has_col then continue; end if;
      v_has_arch := false;
      if rec.arch is not null then
        select exists (select 1 from information_schema.columns
          where table_schema = rec.sch and table_name = rec.tbl and column_name = rec.arch) into v_has_arch;
      end if;
      v_sql := format('select count(*) from %I.%I where %I = $1', rec.sch, rec.tbl, p_column);
      if v_has_arch then v_sql := v_sql || format(' and %I = false', rec.arch); end if;
      execute v_sql into v_count using p_container_id;
      resource_key := rec.k; n := v_count; return next;
    exception when undefined_table or undefined_column or insufficient_privilege then continue;
    end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.conversation_files(p_conversation_id uuid)
 RETURNS TABLE(file_id uuid, label text, metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'conversation_files: authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT iam.has_access('conversation', p_conversation_id, 'viewer'::public.permission_level) THEN
        RAISE EXCEPTION 'conversation_files: viewer access to conversation required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT a.source_id, a.label, a.metadata, a.created_at
    FROM platform.associations_live a
    WHERE a.source_type = 'file'
      AND a.target_type = 'conversation'
      AND a.target_id = p_conversation_id
      AND a.role IS NULL
    ORDER BY a.created_at, a.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_agent_id       uuid;
  v_surface_name   text;
  v_value_maps     jsonb;
  v_write_policies jsonb;
  v_effective_maps jsonb;
  v_agent          record;
  v_new_id         uuid;
  v_label          text;
  v_description    text;
  v_icon_name      text;
begin
  select a.source_id,
         us.name,
         coalesce(a.payload->'value_mappings', a.metadata->'value_mappings', '{}'::jsonb),
         coalesce(a.payload->'write_policies', '{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps, v_write_policies
    from platform.associations_live a
    join ui.ui_surface us on us.id = a.target_id
   where a.id = p_agent_surface_id
     and a.source_type = 'agent'
     and a.target_type = 'surface';

  if v_agent_id is null then
    raise exception 'agent-surface binding association % not found', p_agent_surface_id;
  end if;

  select id, name, description into v_agent
    from agent.definition where id = v_agent_id;
  if not found then
    raise exception 'agent.definition row % not found', v_agent_id;
  end if;

  v_label       := coalesce(p_overrides->>'label',       v_agent.name || ' Shortcut');
  v_description := coalesce(p_overrides->>'description', v_agent.description);
  v_icon_name   := coalesce(p_overrides->>'icon_name',   null);

  v_effective_maps := coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps);
  if v_write_policies <> '{}'::jsonb
     and not (v_effective_maps ? '__write_policies') then
    v_effective_maps := coalesce(v_effective_maps, '{}'::jsonb)
      || jsonb_build_object('__write_policies', v_write_policies);
  end if;

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, created_by, organization_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    v_effective_maps,
    p_user_id, p_organization_id,
    p_overrides->>'keyboard_shortcut',
    coalesce(p_overrides->>'display_mode', 'modal-full'),
    coalesce((p_overrides->>'allow_chat')::boolean, true),
    coalesce((p_overrides->>'auto_run')::boolean, true),
    coalesce((p_overrides->>'show_variable_panel')::boolean, false),
    coalesce(p_overrides->>'variables_panel_style', 'inline'),
    coalesce((p_overrides->>'show_definition_messages')::boolean, false),
    coalesce((p_overrides->>'show_definition_message_content')::boolean, false),
    coalesce((p_overrides->>'hide_reasoning')::boolean, false),
    coalesce((p_overrides->>'hide_tool_results')::boolean, false),
    coalesce((p_overrides->>'show_pre_execution_gate')::boolean, false),
    p_overrides->>'pre_execution_message',
    coalesce((p_overrides->>'bypass_gate_seconds')::int, 3),
    p_overrides->>'default_user_input',
    (p_overrides->'default_variables')::jsonb,
    (p_overrides->'context_overrides')::jsonb,
    (p_overrides->'llm_overrides')::jsonb,
    coalesce(p_overrides->>'response_density', 'comfortable'),
    (p_overrides->'json_extraction')::jsonb,
    coalesce((p_overrides->'enabled_features')::jsonb, '["general"]'::jsonb),
    coalesce((p_overrides->>'use_latest')::boolean, true),
    nullif(p_overrides->>'agent_version_id', '')::uuid,
    true
  )
  returning id into v_new_id;

  if p_project_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'project', p_project_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.projects w where w.id = p_project_id)),
            coalesce(p_user_id, auth.uid()))
    on conflict do nothing;
  end if;
  if p_task_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    values ('agent_shortcut', v_new_id, 'task', p_task_id,
            coalesce(p_organization_id, (select w.organization_id from workspace.tasks w where w.id = p_task_id)),
            coalesce(p_user_id, auth.uid()))
    on conflict do nothing;
  end if;

  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creator_resolve_featured_resource(p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'education'
AS $function$
declare
  v_schema text; v_table text; v_id_col text;
  v_row jsonb; v_title text; v_desc text; v_href text;
  v_extra jsonb := '{}'::jsonb; v_count int;
begin
  begin
    select schema_name, table_name, id_column into v_schema, v_table, v_id_col
    from public.resolve_shareable_resource(p_token);
  exception when others then return null; end;
  if v_table is null then return null; end if;

  begin
    execute format('select to_jsonb(t) from %I.%I t where %I = $1', v_schema, v_table, coalesce(v_id_col,'id'))
      into v_row using p_id;
  exception when others then return null; end;
  if v_row is null then return null; end if;
  if coalesce(v_row->>'visibility','') <> 'public' then return null; end if;

  v_title := coalesce(v_row->>'name', v_row->>'title', v_row->>'label', 'Untitled');
  v_desc  := coalesce(v_row->>'description', v_row->>'summary', v_row->>'tagline');

  if p_token = 'learn_doc' then v_href := '/education/learn/' || coalesce(v_row->>'slug','');
  elsif p_token = 'study_media' then v_href := '/education/media/' || p_id::text;
  else v_href := '/p/e/' || p_token || '/' || p_id::text; end if;

  if p_token = 'fc_set' then
    begin
      execute 'select count(*)::int from platform.associations_live a
                 where a.target_type = ''fc_set'' and a.target_id = $1
                   and a.source_type = ''fc_card'' and a.role = ''member'''
        into v_count using p_id;
      if v_count is not null then v_extra := jsonb_build_object('cardCount', v_count); end if;
    exception when others then v_extra := '{}'::jsonb; end;
  end if;

  return jsonb_build_object('kind','resource','resourceType',p_token,'id',p_id,
    'title',v_title,'description',v_desc,'href',v_href,'extra',v_extra);
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_merge_parties(p_winner uuid, p_loser uuid, p_method text DEFAULT 'manual'::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org uuid; v_merge_id uuid; v_moved jsonb := '{}'::jsonb; v_ids uuid[];
begin
  if p_winner = p_loser then
    raise exception 'crm_merge_parties: cannot merge a party into itself' using errcode = '22023';
  end if;
  select organization_id into v_org from crm.party where id = p_winner and deleted_at is null;
  if v_org is null then
    raise exception 'crm_merge_parties: winner party % not found', p_winner using errcode = 'P0002';
  end if;
  if not exists (select 1 from crm.party where id = p_loser and deleted_at is null and organization_id = v_org) then
    raise exception 'crm_merge_parties: loser party % not found in the same organization', p_loser using errcode = 'P0002';
  end if;
  if not (iam.has_access('party', p_winner, 'editor') and iam.has_access('party', p_loser, 'editor')) then
    raise exception 'crm_merge_parties: editor access required on both parties' using errcode = '42501';
  end if;
  if exists (select 1 from crm.party where id in (p_winner, p_loser) and canonical_id is not null) then
    raise exception 'crm_merge_parties: one of these parties is already merged - unmerge first' using errcode = '22023';
  end if;

  with moved as (
    update crm.party_contact_point cp set party_id = p_winner, is_primary = false
     where cp.party_id = p_loser and cp.deleted_at is null
       and not exists (select 1 from crm.party_contact_point w
                        where w.party_id = p_winner and w.medium_id = cp.medium_id and w.deleted_at is null)
    returning cp.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('party_contact_point', to_jsonb(v_ids));

  with moved as (update crm.address set party_id = p_winner, is_primary = false
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('address', to_jsonb(v_ids));

  with moved as (update crm.affiliation set party_id = p_winner, is_primary = false
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('affiliation', to_jsonb(v_ids));

  with moved as (update crm.interaction set party_id = p_winner
                  where party_id = p_loser and deleted_at is null returning id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('interaction', to_jsonb(v_ids));

  with moved as (
    update crm.outreach_list_member cm set party_id = p_winner
     where cm.party_id = p_loser and cm.deleted_at is null
       and not exists (select 1 from crm.outreach_list_member w
                        where w.outreach_list_id = cm.outreach_list_id and w.party_id = p_winner and w.deleted_at is null)
    returning cm.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('outreach_list_member', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set source_id = p_winner
     where a.source_type = 'party' and a.source_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.source_type = 'party' and w.source_id = p_winner
                          and w.target_type = a.target_type and w.target_id = a.target_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_source', to_jsonb(v_ids));

  with moved as (
    update platform.associations a set target_id = p_winner
     where a.target_type = 'party' and a.target_id = p_loser
       and not exists (select 1 from platform.associations_live w
                        where w.target_type = 'party' and w.target_id = p_winner
                          and w.source_type = a.source_type and w.source_id = a.source_id
                          and w.role is not distinct from a.role)
    returning a.id)
  select coalesce(array_agg(id), '{}') into v_ids from moved;
  v_moved := v_moved || jsonb_build_object('assoc_target', to_jsonb(v_ids));

  update crm.party set canonical_id = p_winner where id = p_loser;

  insert into crm.party_merge (winner_id, loser_id, moved, method, reason, merged_by, organization_id)
  values (p_winner, p_loser, v_moved, p_method, p_reason, auth.uid(), v_org)
  returning id into v_merge_id;

  perform platform.log_activity(v_org, 'crm.party.merge', 'party', p_winner,
    jsonb_build_object('loser_id', p_loser, 'merge_id', v_merge_id, 'method', p_method));
  return v_merge_id;
end $function$;

CREATE OR REPLACE FUNCTION public.cx_fork_conversation(p_conversation_id uuid, p_at_position smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_src chat.conversation;
    v_new_conv_id uuid := gen_random_uuid();
    v_msg_map jsonb;
    v_tc_map jsonb;
    v_copied_count int := 0;
    v_assoc record;
BEGIN
    SELECT * INTO v_src
    FROM chat.conversation
    WHERE id = p_conversation_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conversation not found: %', p_conversation_id;
    END IF;

    INSERT INTO chat.conversation (
        id, created_by, title, description, system_instruction,
        config, variables, overrides, metadata, keywords,
        status, visibility, is_ephemeral,
        source_app, source_feature,
        organization_id, task_id,
        initial_agent_id, initial_agent_version_id, last_model_id,
        forked_from_id, forked_at_position,
        parent_conversation_id, message_count
    ) VALUES (
        v_new_conv_id, v_src.created_by, v_src.title, v_src.description, v_src.system_instruction,
        v_src.config, v_src.variables, v_src.overrides, v_src.metadata, v_src.keywords,
        'active', v_src.visibility, v_src.is_ephemeral,
        v_src.source_app, v_src.source_feature,
        v_src.organization_id, v_src.task_id,
        v_src.initial_agent_id, v_src.initial_agent_version_id, v_src.last_model_id,
        p_conversation_id, p_at_position,
        NULL, 0
    );

    FOR v_assoc IN
        SELECT target_id, role, label, position, metadata
        FROM platform.associations_live
        WHERE source_type = 'conversation'
          AND source_id = p_conversation_id
          AND target_type = 'project'
        ORDER BY position NULLS LAST, created_at, id
    LOOP
        PERFORM public.assoc_link(
            'conversation', v_new_conv_id, 'project', v_assoc.target_id,
            v_assoc.role, v_assoc.label, v_assoc.position, v_assoc.metadata
        );
    END LOOP;

    SELECT COALESCE(jsonb_object_agg(m.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_msg_map
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    INSERT INTO chat.message (
        id, conversation_id, role, position, status,
        content, user_content, content_history,
        source, agent_id, is_visible_to_user, is_visible_to_model, metadata
    )
    SELECT (v_msg_map ->> m.id::text)::uuid, v_new_conv_id,
        m.role, m.position, m.status, m.content, m.user_content, m.content_history,
        m.source, m.agent_id, m.is_visible_to_user, m.is_visible_to_model, m.metadata
    FROM chat.message m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND m.position <= p_at_position;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;
    UPDATE chat.conversation
    SET message_count = v_copied_count
    WHERE id = v_new_conv_id;

    SELECT COALESCE(jsonb_object_agg(tc.id::text, gen_random_uuid()::text), '{}'::jsonb)
    INTO v_tc_map
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.tool_call (
        id, conversation_id, message_id, user_request_id,
        created_by, tool_name, tool_type, call_id, status,
        arguments, success, output, output_type,
        is_error, error_type, error_message,
        duration_ms, started_at, completed_at,
        input_tokens, output_tokens, total_tokens, cost_usd,
        iteration, retry_count, parent_call_id, execution_events,
        persist_key, file_path, metadata
    )
    SELECT (v_tc_map ->> tc.id::text)::uuid, v_new_conv_id,
        (v_msg_map ->> tc.message_id::text)::uuid, NULL,
        tc.created_by, tc.tool_name, tc.tool_type, tc.call_id, tc.status,
        tc.arguments, tc.success, tc.output, tc.output_type,
        tc.is_error, tc.error_type, tc.error_message,
        tc.duration_ms, tc.started_at, tc.completed_at,
        tc.input_tokens, tc.output_tokens, tc.total_tokens, tc.cost_usd,
        tc.iteration, tc.retry_count,
        CASE WHEN tc.parent_call_id IS NOT NULL AND v_tc_map ? tc.parent_call_id::text
             THEN (v_tc_map ->> tc.parent_call_id::text)::uuid ELSE NULL END,
        tc.execution_events, tc.persist_key, tc.file_path, tc.metadata
    FROM chat.tool_call tc
    WHERE tc.conversation_id = p_conversation_id
      AND tc.deleted_at IS NULL
      AND tc.message_id IS NOT NULL
      AND v_msg_map ? tc.message_id::text;

    INSERT INTO chat.artifact (
        conversation_id, message_id, created_by, organization_id, task_id,
        source_system, source_id, artifact_index,
        artifact_type, status, external_system, external_id, external_url,
        title, description, thumbnail_url, metadata
    )
    SELECT v_new_conv_id, (v_msg_map ->> a.message_id::text)::uuid,
        a.created_by, a.organization_id, a.task_id,
        'cx_message', (v_msg_map ->> a.message_id::text)::uuid, a.artifact_index,
        a.artifact_type, a.status, a.external_system, a.external_id, a.external_url,
        a.title, a.description, a.thumbnail_url, a.metadata
    FROM chat.artifact a
    WHERE a.conversation_id = p_conversation_id
      AND a.deleted_at IS NULL
      AND a.message_id IS NOT NULL
      AND v_msg_map ? a.message_id::text;

    INSERT INTO chat.media (conversation_id, created_by, kind, url, file_uri, mime_type, file_size_bytes, metadata)
    SELECT v_new_conv_id, m.created_by, m.kind, m.url, m.file_uri, m.mime_type, m.file_size_bytes,
        CASE WHEN m.metadata ? 'message_id' AND v_msg_map ? (m.metadata->>'message_id')
             THEN jsonb_set(m.metadata, '{message_id}', to_jsonb(v_msg_map ->> (m.metadata->>'message_id')))
             ELSE m.metadata END
    FROM chat.media m
    WHERE m.conversation_id = p_conversation_id
      AND m.deleted_at IS NULL
      AND (m.metadata->>'message_id' IS NULL OR v_msg_map ? (m.metadata->>'message_id'));

    RETURN get_cx_conversation_bundle(v_new_conv_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_child_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope.organization_id
  into v_org
  from context.scopes as scope
  where scope.id = p_scope_id
    and scope.deleted_at is null;

  if v_org is null then
    raise exception 'scope not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = auth.uid()
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  with recursive children as (
    select scope.id
    from context.scopes as scope
    where scope.parent_scope_id = p_scope_id
      and scope.deleted_at is null
    union all
    select scope.id
    from context.scopes as scope
    join children as child on scope.parent_scope_id = child.id
    where scope.deleted_at is null
  )
  select count(*) into v_child_count from children;

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  where association.target_type = 'scope'
    and association.target_id in (select id from all_scopes);

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  update context.scopes
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id in (select id from all_scopes)
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_children', v_child_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_scope_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope_type.organization_id
  into v_org
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is null;

  if v_org is null then
    raise exception 'scope type not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = auth.uid()
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  join context.scopes as scope on association.target_id = scope.id
  where association.target_type = 'scope'
    and scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  select count(*)
  into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  update context.scopes
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where scope_type_id = p_type_id
    and deleted_at is null;

  update context.context_items
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where scope_type_id = p_type_id
    and is_active = true;

  update context.scope_types
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_type_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_scopes', v_scope_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_assignments(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) and not public._edu_is_active_member(v_scope.id, v_uid) then
    raise exception 'not authorized to view this class''s assignments' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at',
           'assigned_by', a.metadata->>'assigned_by'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_rows
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_progress_overview(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_assignments jsonb;
  v_students jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can view class progress' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_assignments
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  select coalesce(jsonb_agg(student order by student->>'email'), '[]'::jsonb)
    into v_students
  from (
    select jsonb_build_object(
             'user_id', m.user_id,
             'email', u.email,
             'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
             'cells', (
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'token', a.source_type,
                   'resource_id', a.source_id,
                   'due_date', a.metadata->>'due_date'
                 ) || public._edu_resource_progress(a.source_type, a.source_id, m.user_id)
                 order by (a.metadata->>'due_date') nulls last, a.created_at
               ), '[]'::jsonb)
               from platform.associations_live a
               where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment'
             )
           ) as student
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id
      and m.status = 'active' and m.role = 'member' and m.deleted_at is null
  ) t;

  return jsonb_build_object('assignments', v_assignments, 'students', v_students);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_student_progress(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_is_owner boolean;
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  v_is_owner := public._edu_is_owner(v_scope);

  if not v_is_owner and v_uid <> p_user then
    raise exception 'not authorized to view this student''s class progress' using errcode = '42501';
  end if;
  if not public._edu_is_active_member(v_scope.id, p_user) then
    raise exception 'user is not an active member of this class' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'token', a.source_type,
             'resource_id', a.source_id,
             'due_date', a.metadata->>'due_date'
           ) || public._edu_resource_progress(a.source_type, a.source_id, p_user)
           order by (a.metadata->>'due_date') nulls last, a.created_at
         ), '[]'::jsonb)
    into v_rows
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_public_decks(p_search text DEFAULT NULL::text, p_certified_only boolean DEFAULT false, p_limit integer DEFAULT 60, p_exam_slug text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, description text, topic text, difficulty text, card_count bigint, certified boolean, certified_note text, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform'
AS $function$
  select
    s.id, s.name, s.description, s.topic, s.difficulty,
    (select count(*) from platform.associations_live a
       where a.target_type='fc_set' and a.target_id=s.id
         and a.source_type='fc_card' and a.role='member')::bigint as card_count,
    (cc.resource_id is not null) as certified,
    cc.note as certified_note,
    s.updated_at
  from education.fc_set s
  left join education.content_certification cc
    on cc.resource_type='fc_set' and cc.resource_id=s.id
  where s.visibility='public'
    and s.deleted_at is null
    and (
      p_search is null or btrim(p_search)=''
      or s.name ilike '%'||p_search||'%'
      or s.topic ilike '%'||p_search||'%'
      or s.description ilike '%'||p_search||'%'
    )
    and (not p_certified_only or cc.resource_id is not null)
    and (p_exam_slug is null or btrim(p_exam_slug)='' or s.metadata->>'exam_slug' = p_exam_slug)
  order by (cc.resource_id is not null) desc, s.updated_at desc
  limit greatest(1, least(coalesce(p_limit,60),200));
$function$;

CREATE OR REPLACE FUNCTION public.fork_shared_flashcard_set(p_set_id uuid, p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_src education.fc_set;
  v_new_set_id uuid := gen_random_uuid();
  v_org uuid; v_shareable boolean; v_shared boolean;
  v_card_map jsonb; v_card_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sign in to save your own copy'); END IF;
  SELECT * INTO v_src FROM education.fc_set WHERE id = p_set_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Flashcard set not found'); END IF;

  SELECT COALESCE(is_link_shareable, false) INTO v_shareable FROM platform.shareable_resource_registry WHERE resource_type='fc_set';
  v_shared := COALESCE(v_shareable,false) AND (
       v_src.visibility IN ('public','link')
    OR (p_token IS NOT NULL AND public.share_link_authorizes(p_token, 'fc_set', p_set_id))
    OR iam.has_access('fc_set', p_set_id, 'viewer'));
  IF NOT v_shared THEN RETURN jsonb_build_object('success', false, 'error', 'This set is not shared'); END IF;

  v_org := public.ensure_personal_organization(v_uid);

  INSERT INTO education.fc_set (id, organization_id, created_by, updated_by, metadata, visibility, name, description, topic, lesson, difficulty)
  VALUES (v_new_set_id, v_org, v_uid, v_uid, v_src.metadata, 'personal', v_src.name, v_src.description, v_src.topic, v_src.lesson, v_src.difficulty);

  SELECT COALESCE(jsonb_object_agg(a.source_id::text, gen_random_uuid()::text), '{}'::jsonb) INTO v_card_map
  FROM platform.associations_live a
  JOIN education.fc_card c ON c.id = a.source_id AND c.deleted_at IS NULL
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member';

  INSERT INTO education.fc_card (id, organization_id, created_by, updated_by, metadata, visibility, front, back, card_kind, difficulty, topic, lesson, personal_notes, dynamic_content)
  SELECT (v_card_map ->> c.id::text)::uuid, v_org, v_uid, v_uid, c.metadata, 'personal', c.front, c.back, c.card_kind, c.difficulty, c.topic, c.lesson, c.personal_notes, c.dynamic_content
  FROM education.fc_card c WHERE c.deleted_at IS NULL AND v_card_map ? c.id::text;
  GET DIAGNOSTICS v_card_count = ROW_COUNT;

  INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, position, created_by)
  SELECT 'fc_card', (v_card_map ->> a.source_id::text)::uuid, 'fc_set', v_new_set_id, v_org, 'member', a.position, v_uid
  FROM platform.associations_live a
  WHERE a.target_type='fc_set' AND a.target_id=p_set_id AND a.source_type='fc_card' AND a.role='member'
    AND v_card_map ? a.source_id::text;

  INSERT INTO education.fc_detail (organization_id, created_by, updated_by, metadata, card_id, kind, text, audio_file_id, generation_status, generated_by, position)
  SELECT v_org, v_uid, v_uid, d.metadata, (v_card_map ->> d.card_id::text)::uuid, d.kind, d.text, NULL, d.generation_status, v_uid, d.position
  FROM education.fc_detail d WHERE d.deleted_at IS NULL AND v_card_map ? d.card_id::text;

  RETURN jsonb_build_object('success', true, 'set_id', v_new_set_id, 'card_count', v_card_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_entity_scopes(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_description', s.description,
            'parent_scope_id', s.parent_scope_id, 'type_id', st.id,
            'type_label', st.label_singular, 'type_label_plural', st.label_plural,
            'type_icon', st.icon, 'type_color', st.color, 'type_sort_order', st.sort_order
        )
        order by st.sort_order, s.sort_order, s.name
    ) into v_result
    from platform.associations_live a
    join context.scopes s on a.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where a.target_type = 'scope' and a.source_type = p_entity_type and a.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_notes_shared_with_me()
 RETURNS TABLE(id uuid, label text, folder_name text, tags text[], created_at timestamp with time zone, updated_at timestamp with time zone, organization_id uuid, project_id uuid, task_id uuid, visibility text, version integer, created_by uuid, permission_level text, owner_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.label,
    n.folder_name,
    n.tags,
    n.created_at,
    n.updated_at,
    n.organization_id,
    (
      select a.target_id
      from platform.associations_live a
      where a.source_type = 'note'
        and a.source_id = n.id
        and a.target_type = 'project'
      order by a.position nulls last, a.created_at, a.id
      limit 1
    ) as project_id,
    (
      select a.target_id
      from platform.associations_live a
      where a.source_type = 'note'
        and a.source_id = n.id
        and a.target_type = 'task'
      order by a.position nulls last, a.created_at, a.id
      limit 1
    ) as task_id,
    n.visibility::text,
    n.version,
    n.created_by,
    max(p.permission_level)::text as permission_level,
    u.email::text as owner_email
  from iam.permissions p
  join workbench.notes n on n.id = p.resource_id
  left join auth.users u on u.id = n.created_by
  where p.resource_type = 'note'
    and (
      p.granted_to_user_id = auth.uid()
      or p.granted_to_organization_id in (select iam.my_orgs())
    )
    and coalesce(p.status, 'active') = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and n.created_by is distinct from auth.uid()
    and n.deleted_at is null
  group by n.id, u.email
  order by n.updated_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_flashcard_set(p_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'education', 'platform'
AS $function$
DECLARE
  v_set education.fc_set;
  v_cards jsonb;
BEGIN
  SELECT * INTO v_set
  FROM education.fc_set
  WHERE id = p_set_id
    AND deleted_at IS NULL
    AND visibility = 'public'::platform.visibility;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_public');
  END IF;

  SELECT COALESCE(jsonb_agg(card ORDER BY pos NULLS LAST, ord), '[]'::jsonb)
    INTO v_cards
  FROM (
    SELECT
      a.position AS pos,
      row_number() OVER (ORDER BY a.position NULLS LAST, a.created_at, c.id) AS ord,
      jsonb_build_object(
        'id', c.id,
        'front', c.front,
        'back', c.back,
        'card_kind', c.card_kind,
        'difficulty', c.difficulty,
        'topic', c.topic,
        'lesson', c.lesson,
        'position', a.position
      ) AS card
    FROM platform.associations_live a
    JOIN education.fc_card c
      ON c.id = a.source_id AND c.deleted_at IS NULL
      AND c.created_by = v_set.created_by
    WHERE a.target_type = 'fc_set'
      AND a.target_id = p_set_id
      AND a.source_type = 'fc_card'
      AND a.role = 'member'
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'set', jsonb_build_object(
      'id', v_set.id,
      'name', v_set.name,
      'description', v_set.description,
      'topic', v_set.topic,
      'lesson', v_set.lesson,
      'difficulty', v_set.difficulty,
      'created_at', v_set.created_at,
      'card_count', jsonb_array_length(v_cards)
    ),
    'cards', v_cards
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.get_task_associations(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_task_visible boolean;
  v_notes jsonb; v_files jsonb; v_messages jsonb; v_cx_messages jsonb;
  v_conversations jsonb; v_cx_conversations jsonb; v_blocks jsonb; v_other jsonb; v_raw jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from workspace.tasks t where t.id = p_task_id
      and (t.created_by = v_uid or (t.organization_id is not null and t.organization_id in (
             select om.organization_id from iam.organization_member om where om.user_id = v_uid)))) into v_task_visible;
  if not v_task_visible then raise exception 'task not found or access denied'; end if;

  -- Generic (non-AI) messaging buckets have no writer today; kept as [] for
  -- return-shape parity (the FE renders them as empty sections).
  v_messages := '[]'::jsonb;
  v_conversations := '[]'::jsonb;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata,'created_at',a.created_at)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id into v_raw;

  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',n.label,'updated_at',n.updated_at,'folder_name',n.folder_name)
      order by n.updated_at desc),'[]'::jsonb)
    from platform.associations_live a join workbench.notes n on n.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='note' into v_notes;

  -- FILES: canonical token `file` (was phantom `user_file`).
  select coalesce(jsonb_agg(jsonb_build_object('id',cf.id,'filename',cf.file_name,'mime_type',cf.mime_type,
      'storage_path',cf.file_path,'created_at',cf.created_at) order by cf.created_at desc),'[]'::jsonb)
    from platform.associations_live a join files.files cf on cf.id = a.source_id and cf.deleted_at is null
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='file' into v_files;

  -- AI MESSAGES: canonical token `message` (was phantom `cx_message`). Return
  -- key stays `cx_messages` (FE parity).
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'role',m.role,
      'preview',coalesce(a.label,left(case when jsonb_typeof(m.content)='array' then
          (select string_agg(coalesce(elem->>'text',''),' ') from jsonb_array_elements(m.content) elem)
        when jsonb_typeof(m.content)='string' then m.content #>> '{}' else m.content::text end,240)),
      'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations_live a join chat.message m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='message' into v_cx_messages;

  -- AI CONVERSATIONS: canonical token `conversation` (was phantom `cx_conversation`).
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,'Untitled conversation')) order by c.updated_at desc),'[]'::jsonb)
    from platform.associations_live a join chat.conversation c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='conversation' into v_cx_conversations;

  -- BLOCKS: `chat_block` was never a registered token — permanently empty, kept
  -- for return-shape parity (the FE no longer renders it). Do not resurrect.
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'message_id',a.source_id,
      'block_index',coalesce((a.metadata->>'block_index')::int,0),'preview',a.label)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id and a.source_type='chat_block' into v_blocks;

  -- OTHER: everything not already bucketed. Exclusion now lists the CANONICAL
  -- tokens so file/message/conversation stop leaking into here.
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id
      and a.source_type not in ('note','file','message','conversation','chat_block') into v_other;

  return jsonb_build_object('task_id',p_task_id,'notes',v_notes,'files',v_files,'messages',v_messages,
    'cx_messages',v_cx_messages,'conversations',v_conversations,'cx_conversations',v_cx_conversations,
    'blocks',v_blocks,'other',v_other,'all',v_raw);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_tasks_for_entity(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_tasks jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority,
      'due_date', t.due_date, 'organization_id', t.organization_id, 'project_id', t.project_id,
      'association_id', a.id, 'associated_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
    from platform.associations_live a
    join workspace.tasks t on t.id = a.target_id
   where a.target_type = 'task' and a.source_type = p_entity_type and a.source_id = p_entity_id
     and (t.created_by = v_uid or (t.organization_id is not null and t.organization_id in (
           select om.organization_id from iam.organization_member om where om.user_id = v_uid)))
    into v_tasks;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_tool_detail(p_name_or_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_tool record; v_bindings jsonb; v_bundles jsonb;
BEGIN
    SELECT d.* INTO v_tool
    FROM tool.definition d
    WHERE d.name = p_name_or_id
       OR (p_name_or_id ~ '^[0-9a-f-]{36}$' AND d.id = p_name_or_id::uuid)
    LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT jsonb_agg(jsonb_build_object('executor_name', b.executor_name, 'is_active', b.is_active)) INTO v_bindings
    FROM tool.binding b WHERE b.tool_id = v_tool.id;

    SELECT jsonb_agg(jsonb_build_object('bundle_id', a.target_id, 'bundle_name', b.name,
                                        'local_alias', a.metadata->>'local_alias')) INTO v_bundles
    FROM platform.associations_live a JOIN tool.bundle b ON b.id = a.target_id
    WHERE a.source_type = 'tool' AND a.source_id = v_tool.id
      AND a.target_type = 'tool_bundle' AND a.role = 'member';

    RETURN jsonb_build_object('def', to_jsonb(v_tool), 'bindings', COALESCE(v_bindings, '[]'::jsonb), 'bundles', COALESCE(v_bundles, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_overview(p_topic_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      coalesce(t.max_keywords, 0)            AS max_keywords,
      coalesce(t.scrapes_per_keyword, 0)     AS scrapes_per_keyword,
      coalesce(t.analyses_per_keyword, 0)    AS analyses_per_keyword,
      coalesce(t.max_keyword_syntheses, 0)   AS max_keyword_syntheses,
      coalesce(t.max_topic_syntheses, 0)     AS max_topic_syntheses,
      coalesce(t.max_documents, 0)           AS max_documents
    FROM research.rs_topic t
    WHERE t.id = p_topic_id
  ),
  latest_page_analyses AS (
    SELECT DISTINCT ON (source_id)
      source_id,
      status
    FROM research.rs_analysis
    WHERE topic_id = p_topic_id
      AND agent_type = 'page_summary'
    ORDER BY
      source_id,
      updated_at DESC,
      created_at DESC NULLS LAST,
      id DESC
  ),
  analysis_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'failed') AS failed
    FROM latest_page_analyses
  ),
  source_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_included = true) AS included
    FROM research.rs_source
    WHERE topic_id = p_topic_id
  ),
  sources_by_status AS (
    SELECT coalesce(json_object_agg(scrape_status, count), '{}'::json) AS counts
    FROM (
      SELECT scrape_status, count(*) AS count
      FROM research.rs_source
      WHERE topic_id = p_topic_id
      GROUP BY scrape_status
    ) grouped
  ),
  kw_edges AS (
    SELECT a.target_id AS keyword_id, a.source_id
    FROM platform.associations_live a
    WHERE a.source_type = 'research_source'
      AND a.target_type = 'research_keyword'
      AND a.target_id IN (
        SELECT id FROM research.rs_keyword WHERE topic_id = p_topic_id
      )
  ),
  kw_synth AS (
    SELECT DISTINCT keyword_id
    FROM research.rs_synthesis
    WHERE topic_id = p_topic_id
      AND scope = 'keyword'
      AND is_current = true
      AND status = 'success'
      AND keyword_id IS NOT NULL
  ),
  kw_cov AS (
    SELECT
      k.id AS keyword_id,
      (k.last_searched_at IS NULL) AS unsearched,
      count(s.id) FILTER (
        WHERE s.is_included = true
          AND coalesce(s.policy_category, '') NOT IN ('gated_login', 'low_value')
          AND (
            s.scrape_status IN ('pending', 'success')
            OR (s.scrape_status = 'skipped' AND coalesce(s.server_attempts, 0) = 0)
          )
      ) AS scrape_eligible,
      count(s.id) FILTER (
        WHERE s.is_included = true AND s.scrape_status = 'success'
      ) AS good_scrapes,
      count(s.id) FILTER (
        WHERE s.is_included = true
          AND s.scrape_status = 'success'
          AND lpa.status = 'success'
      ) AS analyzed,
      (kws.keyword_id IS NOT NULL) AS has_synthesis
    FROM research.rs_keyword k
    LEFT JOIN kw_edges e ON e.keyword_id = k.id
    LEFT JOIN research.rs_source s ON s.id = e.source_id
    LEFT JOIN latest_page_analyses lpa ON lpa.source_id = s.id
    LEFT JOIN kw_synth kws ON kws.keyword_id = k.id
    WHERE k.topic_id = p_topic_id
    GROUP BY k.id, k.last_searched_at, kws.keyword_id
  ),
  kw_pending AS (
    SELECT
      count(*) FILTER (WHERE c.unsearched) AS unsearched,
      count(*) FILTER (
        WHERE NOT c.unsearched
          AND least(cfg.scrapes_per_keyword, c.scrape_eligible) > c.good_scrapes
      ) AS pending_scrape,
      count(*) FILTER (
        WHERE least(cfg.analyses_per_keyword, c.good_scrapes) > c.analyzed
      ) AS pending_analysis,
      count(*) FILTER (
        WHERE NOT c.has_synthesis AND c.analyzed > 0
      ) AS pending_synthesis
    FROM kw_cov c
    CROSS JOIN cfg
  ),
  newest AS (
    SELECT
      (SELECT max(created_at) FROM research.rs_synthesis
        WHERE topic_id = p_topic_id AND scope = 'keyword'
          AND is_current = true AND status = 'success')          AS kw_synth_at,
      (SELECT max(created_at) FROM research.rs_synthesis
        WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
          AND is_current = true AND status = 'success')          AS topic_synth_at,
      (SELECT max(created_at) FROM research.rs_document
        WHERE topic_id = p_topic_id AND is_current = true)       AS document_at
  )

  SELECT json_build_object(
    'total_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id),
    'stale_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id AND is_stale = true),
    'total_sources',
      (SELECT total FROM source_counts),
    'included_sources',
      (SELECT included FROM source_counts),
    'sources_by_status',
      (SELECT counts FROM sources_by_status),
    'total_content',
      (SELECT count(*) FROM research.rs_content WHERE topic_id = p_topic_id AND is_current = true),
    'total_analyses',
      (SELECT total FROM analysis_counts),
    'total_eligible_for_analysis',
      (SELECT count(*) FROM research.rs_content
       WHERE topic_id = p_topic_id AND is_good_scrape = true AND is_current = true),
    'failed_analyses',
      (SELECT failed FROM analysis_counts),
    'keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword' AND is_current = true),
    'failed_keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword'
         AND is_current = true AND status = 'failed'),
    'topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    'project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    'total_tags',
      (SELECT count(*) FROM research.rs_tag WHERE topic_id = p_topic_id),
    'total_documents',
      (SELECT count(*) FROM research.rs_document WHERE topic_id = p_topic_id),

    'pending', json_build_object(
      'keywords_unsearched',        (SELECT unsearched FROM kw_pending),
      'keywords_pending_scrape',    (SELECT pending_scrape FROM kw_pending),
      'keywords_pending_analysis',  (SELECT pending_analysis FROM kw_pending),
      'keywords_pending_synthesis', (SELECT pending_synthesis FROM kw_pending),
      'report_stale', (
        SELECT n.topic_synth_at IS NOT NULL
           AND n.kw_synth_at IS NOT NULL
           AND n.kw_synth_at > n.topic_synth_at
        FROM newest n
      ),
      'document_stale', (
        SELECT n.document_at IS NOT NULL
           AND n.topic_synth_at IS NOT NULL
           AND n.topic_synth_at > n.document_at
        FROM newest n
      ),
      'keyword_slots_remaining', (
        SELECT greatest(0, cfg.max_keywords
          - (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id))
        FROM cfg
      ),
      'keyword_synthesis_slots_remaining', (
        SELECT greatest(0, cfg.max_keyword_syntheses
          - (SELECT count(*) FROM kw_synth))
        FROM cfg
      ),
      'topic_synthesis_slots_remaining', (
        SELECT greatest(0, cfg.max_topic_syntheses
          - (SELECT count(*) FROM research.rs_synthesis
             WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
               AND is_current = true))
        FROM cfg
      ),
      'document_slots_remaining', (
        SELECT greatest(0, cfg.max_documents
          - (SELECT count(*) FROM research.rs_document
             WHERE topic_id = p_topic_id AND is_current = true))
        FROM cfg
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_personal_org_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_result jsonb; v_personal_row jsonb; v_real_rows jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    with
    user_orgs as (
        select o.id, o.name, o.slug, o.is_personal, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    org_scope_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object('id',st.id,'label_singular',st.label_singular,'label_plural',st.label_plural,'icon',st.icon,'color',st.color,'sort_order',st.sort_order,'parent_type_id',st.parent_type_id,'max_assignments_per_entity',st.max_assignments_per_entity) order by st.sort_order) as types
        from context.scope_types st where st.organization_id in (select id from user_orgs) and st.deleted_at is null group by st.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.scope_type_id,'parent_scope_id',s.parent_scope_id,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order, s.name) as scopes
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations_live sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
    ),
    personal_projects as (
        select p.id, p.name, p.slug, true::boolean as is_personal, '[]'::jsonb as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null
        where p.organization_id is null
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                when p.id is not null and p.organization_id is null then v_personal_org_id
                else coalesce((select om.organization_id from iam.organization_member om where om.user_id = coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from user_orgs) limit 1), v_personal_org_id)
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid or t.project_id in (select id from org_projects) or t.project_id in (select id from personal_projects))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_is_personal desc, uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.is_personal as uo_is_personal, uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'is_personal',uo.is_personal,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'is_personal',uo.is_personal,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    with
    personal_projects_v as (
        select p.id, p.name, p.slug,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null where p.organization_id is null
    ),
    personal_tasks_v as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule
        from workspace.tasks t left join workspace.projects p on t.project_id=p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (
            (p.id is not null and p.organization_id is null and exists (select 1 from iam.memberships m where m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null))
            or (p.id is null and (t.created_by=v_uid or t.assignee_id=v_uid) and not exists (select 1 from iam.organization_member om where om.user_id=coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from iam.organization_member where user_id=v_uid)))
        )
    )
    select case when exists (select 1 from personal_projects_v) or exists (select 1 from personal_tasks_v) then
        jsonb_build_object('id',v_personal_org_id,'name','Personal','slug','personal','is_personal',true,'role','owner','scope_types','[]'::jsonb,'scopes','[]'::jsonb,
            'projects',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'slug',pp.slug,'is_personal',true,'scope_tags','[]'::jsonb,'open_task_count',pp.open_task_count,'total_task_count',pp.total_task_count) order by pp.name) from personal_projects_v pp),'[]'::jsonb),
            'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',pt.id,'title',pt.title,'status',pt.status,'priority',pt.priority,'project_id',pt.project_id,'parent_task_id',pt.parent_task_id,'due_date',pt.due_date,'assignee_id',pt.assignee_id,'created_by',pt.created_by,'origin',pt.origin,'source_type',pt.source_type,'source_url',pt.source_url,'source_label',pt.source_label,'start_date',pt.start_date,'completed_at',pt.completed_at,'updated_at',pt.updated_at,'recurrence_rule',pt.recurrence_rule) order by case pt.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, pt.due_date nulls last) from personal_tasks_v pt),'[]'::jsonb))
    end into v_personal_row;
    select jsonb_build_object('organizations', case when v_personal_row is not null then jsonb_build_array(v_personal_row)||v_real_rows else v_real_rows end) into v_result;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_hierarchy()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'is_personal', o.is_personal, 'role', om.role::text,
        'project_count', (select count(*) from workspace.projects p where p.organization_id = o.id
          and exists (select 1 from iam.memberships pm where pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null))
      ) order by o.is_personal desc, o.name asc) from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = uid
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'organization_id', p.organization_id,
        'is_personal', coalesce(po.is_personal, false), 'role', pm.role::text,
        'topic_count', (select count(*) from platform.associations_live a
           join research.rs_topic rt on rt.id = a.source_id and rt.deleted_at is null
           where a.source_type='research_topic' and a.target_type='project' and a.target_id = p.id))
      order by p.name asc) from workspace.projects p join iam.memberships pm on pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null
        left join iam.organizations po on po.id = p.organization_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_entities_by_scopes(p_scope_ids uuid[], p_entity_type text DEFAULT NULL::text, p_match_all boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_result jsonb;
    v_required_count int := array_length(p_scope_ids, 1);
BEGIN
    IF p_match_all THEN
        SELECT jsonb_agg(jsonb_build_object('entity_type', entity_type, 'entity_id', entity_id))
        INTO v_result
        FROM (
            SELECT a.source_type AS entity_type, a.source_id AS entity_id
            FROM platform.associations_live a
            WHERE a.target_type='scope' AND a.target_id = ANY(p_scope_ids)
              AND (p_entity_type IS NULL OR a.source_type = p_entity_type)
            GROUP BY a.source_type, a.source_id
            HAVING count(DISTINCT a.target_id) = v_required_count
        ) matched;
    ELSE
        SELECT jsonb_agg(DISTINCT jsonb_build_object('entity_type', a.source_type, 'entity_id', a.source_id))
        INTO v_result
        FROM platform.associations_live a
        WHERE a.target_type='scope' AND a.target_id = ANY(p_scope_ids)
          AND (p_entity_type IS NULL OR a.source_type = p_entity_type);
    END IF;
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_scopes(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid, p_parent_scope_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color,
      'child_count', (select count(*) from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null),
      'assignment_count', (select count(*) from platform.associations_live a where a.target_type = 'scope' and a.target_id = s.id)
    ) order by s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and (p_type_id is null or s.scope_type_id = p_type_id)
    and ((p_parent_scope_id is null and s.parent_scope_id is null) or s.parent_scope_id = p_parent_scope_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.research_topic_resource_manifest(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_topic research.rs_topic; v_result jsonb;
BEGIN
  SELECT * INTO v_topic FROM research.rs_topic WHERE id = p_topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research topic % not found or not accessible', p_topic_id USING ERRCODE='no_data_found';
  END IF;
  WITH latest_analysis AS (
    SELECT DISTINCT ON (source_id) id, source_id FROM research.rs_analysis
    WHERE topic_id=p_topic_id AND agent_type='page_summary'
    ORDER BY source_id, updated_at DESC, created_at DESC NULLS LAST, id DESC
  ),
  items AS (
    SELECT 'search.result'::text AS k, s.id AS id, NULL::uuid AS p,
      left(coalesce(s.title,s.url),140) AS l, s.hostname AS s2,
      coalesce(length(s.url),0) + coalesce(length(s.page_age),0)
        + coalesce(length(s.title),0) + coalesce(length(s.description),0)
        + coalesce(length(s.extra_snippets::text),0) AS c,
      s.scrape_status AS st, coalesce(s.last_seen_at,s.discovered_at) AS t,
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'authority',s.authority_score,
        'tier',s.authority_tier,'hostname',s.hostname,'url',s.url,'origin',s.origin,'type',s.source_type)) AS f
    FROM research.rs_source s WHERE s.topic_id=p_topic_id
    UNION ALL
    SELECT 'search.raw', s.id, NULL::uuid, left(coalesce(s.title,s.url),140), s.hostname,
      length(s.raw_search_result::text), NULL, coalesce(s.last_seen_at,s.discovered_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.raw_search_result IS NOT NULL
    UNION ALL
    SELECT 'search.keyword_serp', k.id, k.id, left(k.keyword,140), k.search_provider,
      length(k.raw_api_response::text), NULL, k.last_searched_at,
      jsonb_strip_nulls(jsonb_build_object('provider',k.search_provider,'result_count',k.result_count))
    FROM research.rs_keyword k WHERE k.topic_id=p_topic_id AND k.raw_api_response IS NOT NULL
    UNION ALL
    SELECT 'page.content', c.id, c.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), s.hostname,
      coalesce(c.char_count,length(c.content),0),
      CASE WHEN c.is_good_scrape THEN 'success' ELSE 'poor' END,
      coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('good_scrape',c.is_good_scrape,'included',s.is_included,
        'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier,
        'edited',(c.original_content IS NOT NULL),'capture',c.capture_method))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true
    UNION ALL
    SELECT 'page.analysis', a.id, a.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), a.agent_type,
      coalesce(length(a.result),0), a.status, coalesce(a.updated_at,a.created_at),
      jsonb_strip_nulls(jsonb_build_object('agent_type',a.agent_type,'latest',(la.id IS NOT NULL),
        'included',s.is_included,'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_analysis a LEFT JOIN research.rs_source s ON s.id=a.source_id
    LEFT JOIN latest_analysis la ON la.id=a.id WHERE a.topic_id=p_topic_id
    UNION ALL
    SELECT 'page.scoring', s.id, s.id, left(coalesce(s.title,s.url),140), s.recommended_use,
      length(s.page_analysis::text), s.analysis_status, coalesce(s.authority_ranked_at,s.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'pre_read',s.pre_read_score,'post_read',s.post_read_score,'final',s.final_source_score,
        'recommended_use',s.recommended_use,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.page_analysis IS NOT NULL
    UNION ALL
    SELECT 'page.links', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_links::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_links)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_links)='array'
      AND jsonb_array_length(c.extracted_links)>0
    UNION ALL
    SELECT 'page.images', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_images::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_images)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_images)='array'
      AND jsonb_array_length(c.extracted_images)>0
    UNION ALL
    SELECT 'synthesis.keyword', y.id, y.keyword_id, left(coalesce(k.keyword,'Keyword synthesis'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,
        'keyword_id',y.keyword_id,'iteration',y.iteration_mode))
    FROM research.rs_synthesis y LEFT JOIN research.rs_keyword k ON k.id=y.keyword_id
    WHERE y.topic_id=p_topic_id AND y.scope='keyword'
    UNION ALL
    SELECT 'synthesis.tag', y.id, y.tag_id, left(coalesce(g.name,'Tag consolidation'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,'tag_id',y.tag_id))
    FROM research.rs_synthesis y LEFT JOIN research.rs_tag g ON g.id=y.tag_id
    WHERE y.topic_id=p_topic_id AND y.tag_id IS NOT NULL AND y.scope<>'keyword'
    UNION ALL
    SELECT 'synthesis.topic', y.id, NULL::uuid, left(coalesce(v_topic.name,'Topic report'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version))
    FROM research.rs_synthesis y WHERE y.topic_id=p_topic_id
      AND y.scope IN ('topic','project') AND y.tag_id IS NULL
    UNION ALL
    SELECT 'document.report', d.id, NULL::uuid, left(coalesce(d.title,'Document'),140), d.model_id,
      coalesce(length(d.content),0), d.status, coalesce(d.updated_at,d.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',d.is_current,'version',d.version))
    FROM research.rs_document d WHERE d.topic_id=p_topic_id
    UNION ALL
    SELECT 'media.items', m.id, m.source_id,
      left(coalesce(nullif(m.alt_text,''),nullif(m.caption,''),m.url),140), m.media_type,
      coalesce(length(m.alt_text),0)+coalesce(length(m.caption),0)+coalesce(length(m.url),0),
      NULL, m.created_at,
      jsonb_strip_nulls(jsonb_build_object('relevant',m.is_relevant,'type',m.media_type,'url',m.url,
        'thumbnail',m.thumbnail_url,'width',m.width,'height',m.height))
    FROM research.rs_media m WHERE m.topic_id=p_topic_id
  ),
  edges AS (
    SELECT sk.id AS source_id, sk.keyword_id, sk.rank_for_keyword AS rank
    FROM research.rs_source_keywords sk WHERE sk.topic_id=p_topic_id AND sk.keyword_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'topic_id',p_topic_id,'generated_at',now(),
    'topic',jsonb_build_object('id',v_topic.id,'name',v_topic.name,'description',v_topic.description,
      'tone_profile',v_topic.tone_profile,'status',v_topic.status,'created_at',v_topic.created_at),
    'keywords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'keyword',k.keyword,'position',k.position,
      'searched_at',k.last_searched_at,'stale',k.is_stale,'result_count',k.result_count)
      ORDER BY k.position NULLS LAST,k.created_at) FROM research.rs_keyword k WHERE k.topic_id=p_topic_id),'[]'::jsonb),
    'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,
      'sort_order',g.sort_order) ORDER BY g.sort_order NULLS LAST,g.name)
      FROM research.rs_tag g WHERE g.topic_id=p_topic_id),'[]'::jsonb),
    'tag_sources',coalesce((SELECT jsonb_agg(jsonb_build_array(a.target_id,a.source_id))
      FROM platform.associations_live a WHERE a.source_type='research_source' AND a.target_type='research_tag'
        AND a.target_id IN (SELECT id FROM research.rs_tag WHERE topic_id=p_topic_id)),'[]'::jsonb),
    'edges',coalesce((SELECT jsonb_agg(jsonb_build_array(e.source_id,e.keyword_id,e.rank)) FROM edges e),'[]'::jsonb),
    'kinds',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',g.k,'item_count',g.n,'chars',g.chars) ORDER BY g.k)
      FROM (SELECT k,count(*) AS n,coalesce(sum(c),0) AS chars FROM items GROUP BY k) g),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('k',i.k,'id',i.id,'p',i.p,'l',i.l,'s',i.s2,
      'c',coalesce(i.c,0),'st',i.st,'t',i.t,'f',i.f)) FROM items i),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $function$;

CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
begin
    if p_entity_type = 'task' then
        select t.project_id, p.organization_id, t.id into v_project_id, v_org_id, v_task_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id where t.id = p_entity_id;
    elsif p_entity_type = 'project' then
        select p.organization_id, p.id into v_org_id, v_project_id
        from workspace.projects p where p.id = p_entity_id;
    elsif p_entity_type = 'conversation' then
        select
            c.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'conversation'
                  and a.source_id = c.id
                  and a.target_type = 'project'
                  and a.organization_id = c.organization_id
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            c.task_id
        into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select
            n.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'project'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'task'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            )
        into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations_live sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations_live sa join context.scopes s on sa.target_id = s.id
        join context.scope_types st on s.scope_type_id = st.id
        where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = v_project_id
          and s.deleted_at is null and st.deleted_at is null;
    end if;

    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_explicit_scopes
        from context.scopes s
        join context.scope_types st on s.scope_type_id = st.id
        join iam.organization_member om on om.organization_id = s.organization_id and om.user_id = p_user_id
        where s.id = any(p_scope_ids) and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));
        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(elem->>'type_label', elem->>'scope_name'), '{}'::jsonb)
        into v_scope_labels from jsonb_array_elements(v_entity_scopes) elem;
    end if;

    for rec in (
        select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
               s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
               case
                   when civ.value_text is not null then to_jsonb(civ.value_text)
                   when civ.value_number is not null then to_jsonb(civ.value_number)
                   when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                   when civ.value_date is not null then to_jsonb(civ.value_date::text)
                   when civ.value_timestamp is not null then to_jsonb(civ.value_timestamp::text)
                   when civ.value_time is not null then to_jsonb(civ.value_time::text)
                   when civ.value_json is not null then civ.value_json
                   when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                   when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                   else null
               end as value
        from context.context_item_values civ
        join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
        join context.scopes s on s.id = civ.scope_id
        join context.scope_types st on st.id = s.scope_type_id and st.is_system = true
        where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        continue when rec.value is null;
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    end loop;

    for rec in (
        select ci.id as context_item_id, ci.key, ci.description, ci.display_name,
               ci.feed_config as feed_config, sc.scope_id as scope_id, ci.scope_type_id as scope_type_id
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id and st.is_system = true
        left join lateral (
            select s.id as scope_id from context.scopes s
            where s.scope_type_id = ci.scope_type_id and s.deleted_at is null order by s.sort_order limit 1
        ) sc on true
        where ci.is_active = true and ci.fetch_hint != 'never' and ci.feed_type = 'dataset'
          and ci.feed_config ? 'data_store_id' and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', jsonb_build_object('kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code',
                'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
            'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key, 'value', jsonb_build_object('kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code'),
            'type', 'dataset', 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    end loop;

    if v_entity_scopes is not null then
        for rec in (
            select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
                   s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
                   case
                       when civ.value_text is not null then to_jsonb(civ.value_text)
                       when civ.value_number is not null then to_jsonb(civ.value_number)
                       when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                       when civ.value_date is not null then to_jsonb(civ.value_date::text)
                       when civ.value_timestamp is not null then to_jsonb(civ.value_timestamp::text)
                       when civ.value_time is not null then to_jsonb(civ.value_time::text)
                       when civ.value_json is not null then civ.value_json
                       when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                       when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                       else null
                   end as value
            from context.context_item_values civ
            join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
            join context.scopes s on s.id = civ.scope_id
            join context.scope_types st on st.id = s.scope_type_id
            where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem)
            order by st.sort_order asc, ci.sort_order asc
        ) loop
            continue when rec.value is null;
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'scope:' || rec.scope_name));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_scope record; v_count int; v_result jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'set_entity_scopes: not authenticated' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM context.scopes s
        WHERE s.id = ANY(p_scope_ids)
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: scope outside your organizations' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM platform.associations_live a
        JOIN context.scopes s ON s.id = a.target_id
        WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id
          AND NOT EXISTS (SELECT 1 FROM iam.organization_member om
                          WHERE om.organization_id = s.organization_id AND om.user_id = v_uid)
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: entity is tagged with scopes outside your organizations' USING ERRCODE = '42501';
    END IF;

    FOR v_scope IN
        SELECT s.id, s.scope_type_id, st.max_assignments_per_entity, st.label_singular
        FROM context.scopes s JOIN context.scope_types st ON s.scope_type_id = st.id
        WHERE s.id = ANY(p_scope_ids)
    LOOP
        IF v_scope.max_assignments_per_entity IS NOT NULL THEN
            SELECT count(*) INTO v_count
            FROM unnest(p_scope_ids) sid JOIN context.scopes s ON s.id = sid
            WHERE s.scope_type_id = v_scope.scope_type_id;
            IF v_count > v_scope.max_assignments_per_entity THEN
                RAISE EXCEPTION 'Type "%" allows max % assignment(s) per entity, but % were provided',
                    v_scope.label_singular, v_scope.max_assignments_per_entity, v_count;
            END IF;
        END IF;
    END LOOP;

    delete from platform.associations
    WHERE source_type = p_entity_type AND source_id = p_entity_id AND target_type = 'scope';

    -- ON CONFLICT must name the FULL unique index (associations_unique is
    -- (source_type, source_id, target_type, target_id, role) NULLS NOT DISTINCT).
    -- Omitting `role` made every call fail with 42P10 before it could write.
    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
    SELECT p_entity_type, p_entity_id, 'scope', sc.id, sc.organization_id, v_uid
    FROM unnest(p_scope_ids) AS sid JOIN context.scopes sc ON sc.id = sid
    ON CONFLICT (source_type, source_id, target_type, target_id, role) DO NOTHING;

    SELECT jsonb_agg(jsonb_build_object(
        'scope_id', a.target_id, 'scope_name', s.name,
        'type_label', st.label_singular, 'type_icon', st.icon, 'type_color', st.color))
    INTO v_result
    FROM platform.associations_live a
    JOIN context.scopes s ON a.target_id = s.id
    JOIN context.scope_types st ON s.scope_type_id = st.id
    WHERE a.target_type='scope' AND a.source_type = p_entity_type AND a.source_id = p_entity_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.thread_contents(thread_id uuid)
 RETURNS TABLE(module_type text, module_id uuid, origin text, anchor_type text, anchor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
  SELECT a.source_type, a.source_id, 'thread'::text, NULL::text, NULL::uuid
  FROM platform.associations_live a
  WHERE a.target_type = 'thread'
    AND a.target_id = thread_contents.thread_id
    AND a.source_type NOT IN ('project','task','war_room','thread','scope','scope_type','organization')
    AND iam.has_access('thread', thread_contents.thread_id, 'viewer')
  UNION ALL
  SELECT a.source_type, a.source_id, 'anchor'::text, t.anchor_type, t.anchor_id
  FROM workspace.threads t
  JOIN platform.associations_live a ON a.target_type = t.anchor_type AND a.target_id = t.anchor_id
  WHERE t.id = thread_contents.thread_id
    AND t.anchor_type IN ('project', 'task')
    AND t.anchor_id IS NOT NULL
    AND a.source_type NOT IN ('project','task','war_room','thread','scope','scope_type','organization')
    AND iam.has_access('thread', thread_contents.thread_id, 'viewer');
$function$;

CREATE OR REPLACE FUNCTION public.tool_resolve_bundle(p_bundle_name text)
 RETURNS SETOF tool.definition
 LANGUAGE sql
 STABLE
AS $function$
    SELECT d.*
    FROM tool.definition d
    JOIN platform.associations_live a ON a.source_id = d.id AND a.source_type = 'tool'
                                 AND a.target_type = 'tool_bundle' AND a.role = 'member'
    JOIN tool.bundle b ON b.id = a.target_id
    WHERE b.name = p_bundle_name AND b.is_active = true AND d.is_active = true
    ORDER BY a.position, d.name;
$function$;

CREATE OR REPLACE FUNCTION public.tool_resolve_for_request(p_user_id uuid, p_client_executor text, p_surface_name text, p_active_server_executors text[] DEFAULT ARRAY[]::text[])
 RETURNS TABLE(tool_id uuid, tool_name text, description text, parameters jsonb, annotations jsonb, arg_defaults jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_applicable text[];
    v_universe   uuid[];
    v_surface    record;
    v_arg_def    jsonb := '{}'::jsonb;
    v_force_inc  text[] := ARRAY[]::text[];
    v_force_exc  text[] := ARRAY[]::text[];
BEGIN
    SELECT COALESCE(array_agg(te.name), ARRAY[]::text[]) INTO v_applicable
    FROM tool.executor_walk_parents(p_client_executor) te
    WHERE te.is_active = true;

    v_applicable := v_applicable || COALESCE(
        (SELECT array_agg(te.name) FROM tool.executor te
         WHERE te.name = ANY(p_active_server_executors) AND te.is_active = true),
        ARRAY[]::text[]);

    v_applicable := v_applicable || COALESCE(
        (SELECT array_agg(te.name)
         FROM tool.executor te
         JOIN tool.mcp_user_conn c ON c.server_id = te.mcp_server_id
         WHERE te.mcp_server_id IS NOT NULL AND te.is_active = true
           AND c.user_id = p_user_id AND c.status = 'connected'::public.mcp_connection_status),
        ARRAY[]::text[]);

    SELECT COALESCE(array_agg(DISTINCT d.id), ARRAY[]::uuid[]) INTO v_universe
    FROM tool.definition d
    JOIN tool.binding b ON b.tool_id = d.id
    WHERE b.executor_name = ANY(v_applicable) AND d.is_active = true AND b.is_active = true;

    FOR v_surface IN
        SELECT sd.surface_name, sd.always_include_tools, sd.always_include_bundles,
               sd.never_include_tools, sd.never_include_bundles, sd.arg_defaults
        FROM public.tool_surface_walk_parents(p_surface_name) s
        JOIN tool.surface_defaults sd ON sd.surface_name = s.name
        WHERE sd.is_active = true
    LOOP
        v_force_inc := v_force_inc || v_surface.always_include_tools;
        v_force_exc := v_force_exc || v_surface.never_include_tools;

        v_force_inc := v_force_inc || COALESCE(
            (SELECT array_agg(DISTINCT d.name)
             FROM tool.bundle b
             JOIN platform.associations_live a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
                                          AND a.source_type = 'tool' AND a.role = 'member'
             JOIN tool.definition d ON d.id = a.source_id
             WHERE b.name = ANY(v_surface.always_include_bundles)
               AND b.is_system = true AND b.is_active = true AND d.is_active = true),
            ARRAY[]::text[]);

        v_force_exc := v_force_exc || COALESCE(
            (SELECT array_agg(DISTINCT d.name)
             FROM tool.bundle b
             JOIN platform.associations_live a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
                                          AND a.source_type = 'tool' AND a.role = 'member'
             JOIN tool.definition d ON d.id = a.source_id
             WHERE b.name = ANY(v_surface.never_include_bundles) AND b.is_active = true),
            ARRAY[]::text[]);

        v_arg_def := v_arg_def || COALESCE(v_surface.arg_defaults, '{}'::jsonb);
    END LOOP;

    RETURN QUERY
    WITH base AS (
        SELECT d.id, d.name, d.description, d.parameters, d.annotations
        FROM tool.definition d
        WHERE (d.id = ANY(v_universe) OR d.name = ANY(v_force_inc))
          AND NOT (d.name = ANY(v_force_exc))
          AND d.is_active = true
    )
    SELECT b.id, b.name, b.description, b.parameters, b.annotations,
           COALESCE(v_arg_def -> b.name, '{}'::jsonb)
    FROM base b
    ORDER BY b.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.war_room_recent_activity(p_war_room_id uuid, p_limit integer DEFAULT 25, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(occurred_at timestamp with time zone, thread_id uuid, thread_title text, entity_type text, entity_id uuid, label text, action text, actor_id uuid, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'workspace', 'chat', 'workbench', 'transcripts', 'files', 'iam'
AS $function$
#variable_conflict use_column
begin
  if not iam.has_access('war_room', p_war_room_id) then
    raise exception 'not authorized for war_room %', p_war_room_id using errcode = '42501';
  end if;
  return query
  with threads as (
    select a.source_id as thread_id from platform.associations_live a
    where a.target_type='war_room' and a.target_id=p_war_room_id and a.source_type='thread'),
  tmeta as (
    select t.id as thread_id,
      coalesce(t.title,
        case t.anchor_type
          when 'task' then (select tk.title from workspace.tasks tk where tk.id=t.anchor_id)
          when 'project' then (select pj.name from workspace.projects pj where pj.id=t.anchor_id)
          else null end, 'Thread') as thread_title
    from workspace.threads t where t.id in (select thread_id from threads)),
  edges as (
    select a.id edge_id, a.source_type, a.source_id, a.label, a.created_at, a.created_by,
           case when a.target_type='thread' then a.target_id end as thread_id
    from platform.associations_live a
    where (a.target_type='thread' and a.target_id in (select thread_id from threads))
       or (a.target_type='war_room' and a.target_id=p_war_room_id)),
  acts as (
    select mm.last_at as occurred_at, e.thread_id, e.source_type as entity_type, e.source_id as entity_id,
           e.label, 'chat_message'::text as action, mm.actor as actor_id,
           (mm.cnt::text||' message'||case when mm.cnt=1 then '' else 's' end) as detail
    from edges e join lateral (
      select max(m.created_at) last_at, count(*) cnt, (array_agg(m.created_by order by m.created_at desc))[1] actor
      from chat.message m where m.conversation_id=e.source_id and m.deleted_at is null) mm on true
    where e.source_type='conversation' and mm.last_at is not null
    union all select n.updated_at,e.thread_id,'note',e.source_id,e.label,'note_edited',n.created_by,null::text
      from edges e join workbench.notes n on n.id=e.source_id and n.deleted_at is null where e.source_type='note'
    union all select greatest(s.updated_at,s.started_at,s.created_at),e.thread_id,'studio_session',e.source_id,
      coalesce(e.label,s.title),'audio_activity',s.created_by,null::text
      from edges e join transcripts.studio_sessions s on s.id=e.source_id and s.deleted_at is null where e.source_type='studio_session'
    union all select t.updated_at,e.thread_id,'task',e.source_id,coalesce(e.label,t.title),'task_updated',t.created_by,t.title
      from edges e join workspace.tasks t on t.id=e.source_id and t.deleted_at is null where e.source_type='task'
    union all select p.updated_at,e.thread_id,'project',e.source_id,coalesce(e.label,p.name),'project_updated',p.created_by,p.name
      from edges e join workspace.projects p on p.id=e.source_id and p.deleted_at is null where e.source_type='project'
    union all select f.updated_at,e.thread_id,'file',e.source_id,e.label,'file_updated',f.created_by,null::text
      from edges e join files.files f on f.id=e.source_id and f.deleted_at is null where e.source_type='file'
    union all select e.created_at,e.thread_id,e.source_type,e.source_id,e.label,'attached',e.created_by,null::text
      from edges e where e.source_type<>'thread'
    union all select t.updated_at,t.id,'thread',t.id,null,'thread_updated',t.updated_by,null::text
      from workspace.threads t where t.id in (select thread_id from threads) and t.deleted_at is null)
  select a.occurred_at, a.thread_id, tm.thread_title, a.entity_type, a.entity_id, a.label, a.action, a.actor_id, a.detail
  from acts a left join tmeta tm on tm.thread_id=a.thread_id
  where a.occurred_at is not null and (p_since is null or a.occurred_at >= p_since)
  order by a.occurred_at desc
  limit greatest(1, least(coalesce(p_limit,25),200));
end; $function$;

CREATE OR REPLACE FUNCTION public.war_room_threads(room_id uuid)
 RETURNS TABLE(thread_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
  SELECT a.source_id
  FROM platform.associations_live a
  WHERE a.target_type = 'war_room'
    AND a.target_id = war_room_threads.room_id
    AND a.source_type = 'thread'
    AND iam.has_access('war_room', war_room_threads.room_id, 'viewer');
$function$;

notify pgrst, 'reload schema';
