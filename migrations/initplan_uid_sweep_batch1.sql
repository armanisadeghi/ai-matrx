-- bare auth.uid() -> (select auth.uid()) : InitPlan sweep, batch 1 of 3 (STABLE read helpers, incl. the per-row RLS helpers)
--
-- THE BUG CLASS. A bare `auth.uid()` in a query is re-evaluated PER ROW
-- (current_setting + jsonb parse each time) and the planner will not treat it
-- as a constant, so it also refuses an index on the compared column. On a
-- SECURITY DEFINER helper that RLS calls per row, that is a whole-table scan
-- with iam.has_access firing for every row.
--
-- THE FIX. `(select auth.uid())` is an InitPlan: evaluated once per query,
-- then a constant the planner can index against. Identical rows, identical
-- security. Proven on public.get_cx_conversation_source_facets:
-- 2,869 ms -> 18 ms (migrations/cx_source_facets_initplan_uid.sql).
--
-- EQUIVALENCE. Every body below was produced mechanically from the LIVE
-- pg_get_functiondef by wrapping bare occurrences and nothing else. The
-- generator asserts the round trip: unwrapping only the occurrences it
-- inserted must reproduce the previous prosrc BYTE FOR BYTE. Occurrences
-- inside string literals, `--` comments, and plpgsql scalar assignments /
-- IF guards were deliberately left bare -- they are not per-row predicates,
-- and in iam.apply_rls / iam.verify_canonical the literal text IS the product.
-- SECURITY DEFINER/INVOKER, volatility, search_path and signatures are
-- carried through unchanged by construction (whole definition reused).
--
-- Idempotent: CREATE OR REPLACE, and re-running finds nothing left to wrap.
-- Campaign: docs/handoffs/access-kernel-scan-performance.md (ATTACHED CAMPAIGN).

-- 61 functions, 90 occurrences.

-- billing.usage_my_summary(p_from timestamp with time zone, p_to timestamp with time zone) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION billing.usage_my_summary(p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(capability text, total_quantity bigint, event_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
  select ul.capability, coalesce(sum(ul.quantity),0)::bigint, count(*)::bigint
  from billing.usage_ledger ul
  where ul.user_id = (select auth.uid()) and ul.created_at >= p_from and ul.created_at < p_to
  group by ul.capability order by 2 desc;
$function$;

-- files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'files', 'web', 'iam', 'auth'
AS $function$
begin
  return case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
    when p_user_id is null then false
    when files.is_crawl_artifact(p_file_id) then
      case
        -- Canonical immutable evidence: VIEWER-CEILING for everyone.
        -- Read conveys from the site (either lane) OR from the base kernel at
        -- viewer (owner, org-internal, explicit grants, super-admin) so a
        -- deleted site never locks the owning org out. Write/admin: nobody.
        when exists (
          select 1 from files.files fi
          where fi.id = p_file_id and fi.metadata @> '{"system_immutable": true}'::jsonb
        )
        then p_required = 'viewer'::public.permission_level and (
          files.crawl_site_conveys(p_user_id, p_file_id)
          or iam.has_access_for_base(p_user_id, 'file', p_file_id, 'viewer'::public.permission_level)
        )
        -- Derived (variants) / legacy reference-classified files: site
        -- conveyance grants READ, and the base kernel keeps normal rights
        -- (owner write/admin for re-render/cleanup, org-internal read, …).
        else (
          p_required = 'viewer'::public.permission_level
          and files.crawl_site_conveys(p_user_id, p_file_id)
        )
        or iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
      end
    else iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
  end;
end;
$function$;

-- files.is_discoverable_for(p_user_id uuid, p_file_id uuid, p_required permission_level) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION files.is_discoverable_for(p_user_id uuid, p_file_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'files', 'iam', 'auth'
AS $function$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
    else not files.is_crawl_artifact(p_file_id)
      and iam.is_discoverable_base(p_user_id, 'file', p_file_id, p_required)
  end;
$function$;

-- files.is_listable_for(p_user_id uuid, p_file_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION files.is_listable_for(p_user_id uuid, p_file_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'files', 'iam', 'auth'
AS $function$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
    when p_user_id is null then false
    else exists (
      select 1
      from files.files f
      where f.id = p_file_id
        and not files.is_crawl_artifact(f.id)
        and (
          f.created_by = p_user_id
          or public.has_permission_for(p_user_id, 'file', f.id, 'viewer'::public.permission_level)
          or exists (
            select 1
            from iam.memberships m
            join iam.membership_grant g
              on g.member_role = m.role and g.container_type in ('file', '*')
            where m.container_type = 'file' and m.container_id = f.id
              and m.user_id = p_user_id and m.deleted_at is null
              and g.confers >= 'viewer'::public.permission_level
          )
        )
    )
  end;
$function$;

-- iam.discoverable_ids(p_user_id uuid, p_type text, p_required permission_level, p_depth integer, p_include_public boolean) — 2 occurrence(s)
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
begin
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

  v_trusted := case when v_owner_col is not null
    then format('t.%I = $1', v_owner_col) else 'false' end;
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
    select distinct c.id from (
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

-- iam.is_discoverable(p_user_id uuid, p_type text, p_id uuid, p_required permission_level) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION iam.is_discoverable(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'files', 'iam', 'auth'
AS $function$
  select case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
    when p_type = 'file'
      then files.is_discoverable_for(p_user_id, p_id, p_required)
    else iam.is_discoverable_base(p_user_id, p_type, p_id, p_required)
  end;
$function$;

-- platform.list_my_presentable_assists(p_limit integer) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION platform.list_my_presentable_assists(p_limit integer DEFAULT 50)
 RETURNS SETOF platform.assists
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT a.*
    FROM platform.assists a
    JOIN LATERAL platform.resolve_assist_producer_policy(a.source_key) policy
      ON true
   WHERE (select auth.uid()) IS NOT NULL
     AND a.user_id = (select auth.uid())
     AND a.status = 'pending'
     AND a.deleted_at IS NULL
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND (a.suppressed_until IS NULL OR a.suppressed_until < now())
     AND policy.production_enabled
     AND policy.presentation_enabled
     AND policy.disposition = 'assist'
   ORDER BY a.priority DESC, a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
$function$;

-- platform.my_assist_admission_decision(p_source_key text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION platform.my_assist_admission_decision(p_source_key text)
 RETURNS TABLE(allowed boolean, reason text, pending_count integer, pending_limit integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT *
    FROM platform.assist_admission_decision(p_source_key, (select auth.uid()))
$function$;

-- platform.purpose_for_unit(p_unit_type text, p_unit_id uuid, p_position integer) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION platform.purpose_for_unit(p_unit_type text, p_unit_id uuid, p_position integer DEFAULT 0)
 RETURNS platform.purpose
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.*
    from platform.associations_live a
    join platform.purpose p on p.id = a.source_id
   where a.source_type = 'purpose'
     and a.target_type = p_unit_type
     and a.target_id   = p_unit_id
     and a.role        = 'served_by'
     and coalesce(a.position, 0) = p_position
     and ((select auth.uid()) is null or iam.has_access(p_unit_type, p_unit_id, 'viewer'))
   limit 1;
$function$;

-- public.agx_get_shared_for_chat() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.agx_get_shared_for_chat()
 RETURNS TABLE(id uuid, name text, permission_level text, owner_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, perm.permission_level::text, u.email
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = (select auth.uid())
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != (select auth.uid()) AND a.is_active AND NOT a.is_archived AND a.deleted_at IS NULL
  ORDER BY a.name;
$function$;

-- public.agx_get_shared_with_me() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.agx_get_shared_with_me()
 RETURNS TABLE(id uuid, name text, description text, agent_type text, category text, tags text[], owner_id uuid, owner_email text, permission_level text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.description, a.agent_type, a.category, a.tags, a.created_by, u.email, perm.permission_level::text, a.created_at, a.updated_at
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = (select auth.uid())
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != (select auth.uid()) AND NOT a.is_archived AND a.deleted_at IS NULL
  ORDER BY a.name;
$function$;

-- public.agx_get_shortcuts_for_context(p_project_id uuid, p_task_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_for_context(p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, shortcut_project_id uuid, shortcut_task_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
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
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
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
            p.granted_to_user_id = (select auth.uid())
            OR p.granted_to_organization_id IN (
              SELECT organization_id FROM iam.organization_member WHERE user_id = (select auth.uid())
            )
          )
      )
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

-- public.agx_get_shortcuts_initial() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.agx_get_shortcuts_initial()
 RETURNS TABLE(shortcut_id uuid, category_id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, resolved_id uuid, is_version boolean, is_behind boolean, agent_id uuid, agent_version_id uuid, current_version integer, use_latest boolean, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, shortcut_user_id uuid, shortcut_org_id uuid, agent_name text, agent_variable_definitions jsonb, agent_context_policies jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = (select auth.uid())
  )
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
    s.created_by, s.organization_id,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.name
         ELSE av.name END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.variable_definitions
         ELSE av.variable_definitions END,
    CASE WHEN s.agent_id IS NULL THEN NULL
         WHEN s.use_latest OR COALESCE(av.version_number, a.version) >= a.version THEN a.context_policies
         ELSE av.context_policies END
  FROM agent.shortcut s
  LEFT JOIN agent.definition a ON a.id = s.agent_id
  LEFT JOIN agent.definition_version av ON av.id = s.agent_version_id
  WHERE s.is_active = true
    AND (
      (s.created_by IS NULL AND s.organization_id IS NULL)
      OR s.created_by = (select auth.uid())
      OR s.organization_id IN (SELECT mo.organization_id FROM my_orgs mo)
    )
  ORDER BY s.category_id, s.sort_order;
END;
$function$;

-- public.agx_list_scope_counts(p_search text, p_deep boolean, p_archived text, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per non-personal org the caller belongs to, WITH its name.
  -- Personal orgs are excluded: their content IS "Mine".
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.agx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- public.can_read_extraction_job(p_job uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.can_read_extraction_job(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'iam'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = p_job
      AND (
        j.owner_id = (select auth.uid())
        OR (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
        OR (j.processed_document_id IS NOT NULL
            AND public.can_read_processed_document(j.processed_document_id, (select auth.uid())))
      )
  );
$function$;

-- public.check_rate_limit(p_app_id uuid, p_user_id uuid, p_fingerprint text, p_ip_address inet) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_app_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet)
 RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone, is_blocked boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
declare
  v_app app.definition%rowtype;
  v_limit_record app.rate_limit%rowtype;
  v_max_executions integer;
  v_window_hours integer;
begin
  if p_user_id is not null
    and (auth.role() = 'service_role' or p_user_id = (select auth.uid())) is not true
  then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select * into v_app
  from app.definition
  where id = p_app_id;

  if not found then
    raise exception 'App not found';
  end if;

  if p_user_id is not null then
    v_max_executions := coalesce(v_app.rate_limit_authenticated, 100);
  else
    v_max_executions := coalesce(v_app.rate_limit_per_ip, 20);
  end if;

  v_window_hours := greatest(
    coalesce(v_app.rate_limit_window_hours, 24),
    1
  );

  if p_user_id is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id and created_by = p_user_id;
  elsif p_fingerprint is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id
      and created_by is null
      and fingerprint = p_fingerprint;
  elsif p_ip_address is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id
      and created_by is null
      and fingerprint is null
      and ip_address = p_ip_address;
  end if;

  if v_limit_record is null then
    return query
    select
      true,
      v_max_executions - 1,
      now() + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  if v_limit_record.is_blocked
    and (
      v_limit_record.blocked_until is null
      or v_limit_record.blocked_until > now()
    )
  then
    return query
    select false, 0, v_limit_record.blocked_until, true;
    return;
  end if;

  if v_limit_record.window_start_at + make_interval(hours => v_window_hours) < now() then
    return query
    select
      true,
      v_max_executions - 1,
      now() + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  if v_limit_record.execution_count >= v_max_executions then
    return query
    select
      false,
      0,
      v_limit_record.window_start_at + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  return query
  select
    true,
    v_max_executions - v_limit_record.execution_count - 1,
    v_limit_record.window_start_at + make_interval(hours => v_window_hours),
    false;
end;
$function$;

-- public.crm_inbox_list_scope_counts(p_search text, p_deep boolean, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.crm_inbox_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','orgs'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.crm_inbox_list_scoped(v_scope, NULL, p_search, p_deep, 'occurred', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, coalesce(o.name, 'Unnamed org'), coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.memberships m
    ON m.container_id = o.id AND m.container_type = 'organization' AND m.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.crm_inbox_list_scoped('orgs', o.id, p_search, p_deep, 'occurred','desc',
    p_filters, 1, 0) r ON true
  GROUP BY o.id, o.name;
END;
$function$;

-- public.current_personal_org_id() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.current_personal_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT iam.personal_org_id((select auth.uid()))
$function$;

-- public.cvx_list_scope_counts(p_search text, p_deep boolean, p_archived text, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.cvx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.cvx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown. Labels come from THIS query,
  -- never a Redux slice — a tab bar must be self-sufficient.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.cvx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- public.edu_coppa_gate() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.edu_coppa_gate()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.edu_coppa_gate_for((select auth.uid()));
$function$;

-- public.get_admin_status() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_admin_status()
 RETURNS TABLE(is_admin boolean, admin_level admin_level)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT true, a.level
  FROM admin.admins a
  WHERE a.user_id = (select auth.uid())
  UNION ALL
  SELECT false, NULL::public.admin_level
  WHERE NOT EXISTS (SELECT 1 FROM admin.admins a2 WHERE a2.user_id = (select auth.uid()))
  LIMIT 1;
$function$;

-- public.get_dm_user_info(p_user_id uuid) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_dm_user_info(p_user_id uuid)
 RETURNS TABLE(user_id uuid, email text, display_name text, avatar_url text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() <> 'service_role'
     and p_user_id is distinct from (select auth.uid())
     and coalesce(public.is_platform_admin(), false) is not true
     and not exists (
       select 1
       from communication.dm_conversation_participants as caller_participant
       join communication.dm_conversation_participants as target_participant
         on target_participant.conversation_id = caller_participant.conversation_id
        and target_participant.user_id = p_user_id
        and target_participant.deleted_at is null
       where caller_participant.user_id = (select auth.uid())
         and caller_participant.deleted_at is null
     )
     and not exists (
       select 1
       from iam.memberships as caller_membership
       join iam.memberships as target_membership
         on target_membership.organization_id = caller_membership.organization_id
        and target_membership.user_id = p_user_id
        and target_membership.status = 'active'
        and target_membership.deleted_at is null
       where caller_membership.user_id = (select auth.uid())
         and caller_membership.status = 'active'
         and caller_membership.deleted_at is null
     ) then
    raise exception 'messaging relationship required' using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.email::text,
    coalesce(
      account.raw_user_meta_data ->> 'full_name',
      account.raw_user_meta_data ->> 'name',
      split_part(account.email, '@', 1)
    )::text,
    coalesce(
      account.raw_user_meta_data ->> 'avatar_url',
      account.raw_user_meta_data ->> 'picture'
    )::text
  from auth.users as account
  where account.id = p_user_id;
end;
$function$;

-- public.get_note_version(p_id text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_note_version(p_id text)
 RETURNS TABLE(id text, note_id uuid, version_number integer, content text, label text, change_source text, change_type text, diff_metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'workbench', 'history', 'iam'
AS $function$
declare r history.row_versions%rowtype;
begin
  select * into r from history.row_versions h where h.id = p_id::bigint and h.entity_type='note';
  if not found then return; end if;
  if not exists (select 1 from workbench.notes n where n.id=r.row_id and (n.created_by=(select auth.uid()) or iam.has_access('note', n.id, 'viewer'))) then return; end if;
  return query select r.id::text, r.row_id, r.version,
    r.row_data->>'content', r.row_data->>'label',
    coalesce(r.row_data->>'_change_source', r.row_data#>>'{metadata,last_change_source}','user'),
    coalesce(r.row_data->>'_change_type',  r.row_data#>>'{metadata,last_change_type}'),
    '{}'::jsonb, r.occurred_at;
end $function$;

-- public.get_note_versions(p_note_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_note_versions(p_note_id uuid)
 RETURNS TABLE(id text, version_number integer, content text, label text, change_source text, change_type text, diff_metadata jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'workbench', 'history', 'iam'
AS $function$
begin
  if not exists (select 1 from workbench.notes n where n.id=p_note_id and (n.created_by = (select auth.uid()) or iam.has_access('note', n.id, 'viewer'))) then
    return;
  end if;
  return query
    select h.id::text, h.version,
           h.row_data->>'content', h.row_data->>'label',
           coalesce(h.row_data->>'_change_source', h.row_data#>>'{metadata,last_change_source}', 'user'),
           coalesce(h.row_data->>'_change_type',  h.row_data#>>'{metadata,last_change_type}'),
           '{}'::jsonb, h.occurred_at
    from history.row_versions h
    where h.entity_type='note' and h.row_id=p_note_id
    order by h.version desc, h.occurred_at desc;
end $function$;

-- public.get_notes_shared_with_me() — 2 occurrence(s)
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
      p.granted_to_user_id = (select auth.uid())
      or p.granted_to_organization_id in (select iam.my_orgs())
    )
    and coalesce(p.status, 'active') = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and n.created_by is distinct from (select auth.uid())
    and n.deleted_at is null
  group by n.id, u.email
  order by n.updated_at desc;
$function$;

-- public.get_org_module_settings(p_org_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_org_module_settings(p_org_id uuid)
 RETURNS TABLE(module_key text, members_can_add boolean, requires_approval boolean, default_permission permission_level, auto_ingest boolean, is_scopeable boolean, members_can_add_custom_values boolean, custom_values jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
begin
  if auth.uid() is null then return; end if;
  if not exists (
    select 1 from iam.organization_member m
    where m.organization_id=p_org_id and m.user_id=(select auth.uid())
  ) then return; end if;
  return query
  select c.module_token,c.members_can_add,c.needs_approval,c.default_permission,
         c.auto_ingest,c.scopeable,c.members_can_add_custom_values,c.custom_values
  from platform.org_module_config c where c.organization_id=p_org_id;
end;
$function$;

-- public.get_project_members_with_users(p_project_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_project_members_with_users(p_project_id uuid)
 RETURNS TABLE(id uuid, project_id uuid, user_id uuid, role project_role, joined_at timestamp with time zone, invited_by uuid, user_email text, user_display_name text, user_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.container_id, m.user_id, m.role::project_role, m.created_at, m.created_by,
    u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
    u.raw_user_meta_data->>'avatar_url'
  from iam.memberships m join auth.users u on m.user_id = u.id
  where m.container_type='project' and m.container_id = p_project_id and m.deleted_at is null and (
    exists (select 1 from iam.memberships caller where caller.container_type='project' and caller.container_id = p_project_id and caller.user_id = (select auth.uid()) and caller.deleted_at is null)
    or exists (select 1 from workspace.projects p join iam.organization_member om on om.organization_id = p.organization_id
      where p.id = p_project_id and om.user_id = (select auth.uid()) and om.role in ('owner', 'admin'))
  )
  order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at asc;
$function$;

-- public.get_prompt_app_execution_payload(p_app_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_prompt_app_execution_payload(p_app_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app record;
  v_result jsonb;
begin
  select app_row.agent_id, app_row.agent_version_id, app_row.use_latest
    into v_app
  from app.definition as app_row
  where app_row.id = p_app_id
    and app_row.deleted_at is null
    and (
      auth.role() = 'service_role'
      or app_row.visibility = 'public'::platform.visibility
      or app_row.created_by = (select auth.uid())
      or iam.has_access('app', app_row.id, 'viewer'::public.permission_level)
    );

  if not found then
    return jsonb_build_object('error', 'App not found');
  end if;

  if v_app.agent_version_id is not null and not coalesce(v_app.use_latest, true) then
    select jsonb_build_object(
      'messages', version_row.messages,
      'variable_defaults', version_row.variable_definitions,
      'tools', version_row.tools,
      'settings', version_row.settings,
      'model_id', version_row.model_id,
      'output_format', null,
      'output_schema', version_row.output_schema,
      'source_type', 'agent',
      'source_id', version_row.agent_id,
      'version_number', version_row.version_number
    )
      into v_result
    from agent.definition_version as version_row
    where version_row.id = v_app.agent_version_id;
  end if;

  if v_result is null then
    select jsonb_build_object(
      'messages', agent_row.messages,
      'variable_defaults', agent_row.variable_definitions,
      'tools', agent_row.tools,
      'settings', agent_row.settings,
      'model_id', agent_row.model_id,
      'output_format', null,
      'output_schema', agent_row.output_schema,
      'source_type', 'agent',
      'source_id', agent_row.id,
      'version_number', agent_row.version,
      '_fallback', true
    )
      into v_result
    from agent.definition as agent_row
    where agent_row.id = v_app.agent_id;
  end if;

  return coalesce(v_result, jsonb_build_object('error', 'No agent data found'));
end;
$function$;

-- public.get_usage_status(p_user_id uuid, p_is_guest boolean) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_usage_status(p_user_id uuid, p_is_guest boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare
  v_limits jsonb;
  v_usage files.user_storage_usage%rowtype;
begin
  if (auth.role() = 'service_role'
      or session_user = 'postgres'
      or p_user_id = (select auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  v_limits := public.get_user_limits(p_user_id, p_is_guest);

  select * into v_usage
  from files.user_storage_usage
  where user_id = p_user_id;

  return jsonb_build_object(
    'limits', v_limits,
    'usage', coalesce(
      row_to_json(v_usage)::jsonb,
      jsonb_build_object(
        'bytes_used', 0,
        'files_count', 0,
        'daily_upload_count', 0,
        'daily_upload_bytes', 0
      )
    )
  );
end;
$function$;

-- public.get_user_limits(p_user_id uuid, p_is_guest boolean) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_limits(p_user_id uuid, p_is_guest boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare
  v_tier_id text;
  v_tier files.account_tiers%rowtype;
  v_custom jsonb := '{}'::jsonb;
  v_blocked boolean := false;
  v_block_reason text;
begin
  if (auth.role() = 'service_role'
      or session_user = 'postgres'
      or p_user_id = (select auth.uid())) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select tier_id, custom_limits, is_blocked, blocked_reason
  into v_tier_id, v_custom, v_blocked, v_block_reason
  from files.user_account
  where user_id = p_user_id;

  if v_tier_id is null then
    if p_is_guest then
      select id into v_tier_id
      from files.account_tiers
      where is_default_for_guests = true
      limit 1;
    else
      select id into v_tier_id
      from files.account_tiers
      where is_default_for_users = true
      limit 1;
    end if;
  end if;

  select * into v_tier
  from files.account_tiers
  where id = v_tier_id;

  if v_tier.id is null then
    v_tier.id := 'free';
  end if;

  return jsonb_build_object(
    'tier_id', v_tier.id,
    'tier_name', v_tier.name,
    'is_blocked', v_blocked,
    'blocked_reason', v_block_reason,
    'max_storage_bytes', coalesce(
      (v_custom->>'max_storage_bytes')::bigint,
      v_tier.max_storage_bytes
    ),
    'max_file_size_bytes', coalesce(
      (v_custom->>'max_file_size_bytes')::bigint,
      v_tier.max_file_size_bytes
    ),
    'max_files', coalesce(
      (v_custom->>'max_files')::int,
      v_tier.max_files
    ),
    'max_versions_per_file', coalesce(
      (v_custom->>'max_versions_per_file')::int,
      v_tier.max_versions_per_file
    ),
    'max_daily_uploads', coalesce(
      (v_custom->>'max_daily_uploads')::int,
      v_tier.max_daily_uploads
    ),
    'max_daily_upload_bytes', coalesce(
      (v_custom->>'max_daily_upload_bytes')::bigint,
      v_tier.max_daily_upload_bytes
    ),
    'max_share_links_per_resource', coalesce(
      (v_custom->>'max_share_links_per_resource')::int,
      v_tier.max_share_links_per_resource
    ),
    'max_bulk_items', coalesce(
      (v_custom->>'max_bulk_items')::int,
      v_tier.max_bulk_items
    ),
    'rate_limit_uploads_per_min', coalesce(
      (v_custom->>'rate_limit_uploads_per_min')::int,
      v_tier.rate_limit_uploads_per_min
    ),
    'rate_limit_downloads_per_min', coalesce(
      (v_custom->>'rate_limit_downloads_per_min')::int,
      v_tier.rate_limit_downloads_per_min
    ),
    'rate_limit_general_per_min', coalesce(
      (v_custom->>'rate_limit_general_per_min')::int,
      v_tier.rate_limit_general_per_min
    ),
    'features', coalesce(v_custom->'features', v_tier.features)
  );
end;
$function$;

-- public.get_user_list_with_items(p_list_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(public.has_permission('structured_list', p_list_id, 'viewer'), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

-- public.get_user_messages(p_feedback_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_messages(p_feedback_id uuid)
 RETURNS SETOF users.feedback_user_messages
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role()='service_role'
    or coalesce(public.is_platform_admin(),false)
    or exists (
      select 1 from users.user_feedback f
      where f.id=p_feedback_id and f.deleted_at is null
        and (f.user_id=(select auth.uid()) or f.created_by=(select auth.uid()))
    )
  ) is not true then
    raise exception 'feedback access denied' using errcode='42501';
  end if;
  return query select * from public._d31_impl_get_user_messages(p_feedback_id);
end;
$function$;

-- public.get_user_table_complete(p_table_id uuid, p_sort_field text, p_sort_direction text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_datasets d
      where d.id = p_table_id
        and (d.is_public or d.user_id = (select auth.uid()))
    )
    or coalesce(public.has_permission('dataset', p_table_id, 'viewer'), false)
  ) is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction);
end;
$function$;

-- public.has_access_as(p_user uuid, p_type text, p_id uuid, p_required permission_level) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.has_access_as(p_user uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'iam'
AS $function$
  -- Service-role only in practice (EXECUTE revoked from authenticated/anon).
  -- If a JWT is present, never allow impersonating another user.
  SELECT iam.has_access_as(
    CASE WHEN (select auth.uid()) IS NOT NULL THEN (select auth.uid()) ELSE p_user END,
    p_type, p_id, p_required
  );
$function$;

-- public.inv_for_me() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.inv_for_me()
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, role text, status text, token text, expires_at timestamp with time zone, created_at timestamp with time zone, created_by uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = (select auth.uid())
          or lower(i.email) = lower((select u.email from auth.users u where u.id = (select auth.uid()))))
   order by i.created_at desc;
$function$;

-- public.inv_get_by_token(p_token text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.inv_get_by_token(p_token text)
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, invited_user_id uuid, role text, status text, expires_at timestamp with time zone, accepted_at timestamp with time zone, created_at timestamp with time zone, created_by uuid, target_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    i.id,
    i.organization_id,
    i.target_type,
    i.target_id,
    i.email,
    i.invited_user_id,
    i.role,
    i.status,
    i.expires_at,
    i.accepted_at,
    i.created_at,
    i.created_by,
    CASE
      WHEN i.target_type = 'organization' THEN (
        SELECT o.name FROM iam.organizations o WHERE o.id = i.target_id
      )
      WHEN i.target_type = 'project' THEN (
        SELECT p.name FROM workspace.projects p WHERE p.id = i.target_id
      )
      WHEN i.target_type = 'scope' THEN (
        SELECT s.name FROM context.scopes s WHERE s.id = i.target_id
      )
      ELSE NULL
    END AS target_name
  FROM iam.invitations i
  WHERE i.token = p_token
    AND i.deleted_at IS NULL
    AND (
      i.invited_user_id = (select auth.uid())
      OR lower(i.email) = lower((
        SELECT u.email FROM auth.users u WHERE u.id = (select auth.uid())
      ))
    );
$function$;

-- public.is_admin() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM admin.admins a
    WHERE a.user_id = (select auth.uid())
  );
$function$;

-- public.is_platform_admin() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.current_user_is_admin cua
    WHERE cua.user_id = (select auth.uid())
      AND cua.is_admin IS TRUE
  );
$function$;

-- public.ivw_list_scope_counts(p_search text, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.ivw_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.ivw_list_scoped(v_scope, NULL, p_search, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.ivw_list_scoped('orgs', o.id, p_search, 'updated','desc',
    p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- public.kg_caller_can_target_scope(p_scope_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.kg_caller_can_target_scope(p_scope_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_scope_id IS NULL OR EXISTS (
    SELECT 1 FROM context.scopes s
     WHERE s.id = p_scope_id
       AND (s.created_by = (select auth.uid())
            OR EXISTS (SELECT 1 FROM iam.organization_member om
                        WHERE om.organization_id = s.organization_id
                          AND om.user_id = (select auth.uid())))
  );
$function$;

-- public.library_grant_provenance(p_store uuid) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.library_grant_provenance(p_store uuid)
 RETURNS TABLE(audience text, industry_id uuid, industry_name text, industry_slug text, organization_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
  select g.audience, g.industry_id, i.name, i.slug, g.organization_id
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  where g.data_store_id = p_store
    and (select auth.uid()) is not null
    and (
      g.audience = 'global'
      or (g.audience = 'organization'
          and g.organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = (select auth.uid())))
      or (g.audience = 'industry'
          and exists (
            select 1
            from iam.org_industries oi
            join iam.organization_member om
              on om.organization_id = oi.organization_id
            where om.user_id = (select auth.uid())
              and oi.industry_id = g.industry_id))
    );
$function$;

-- public.library_grant_provenance_batch(p_stores uuid[]) — 3 occurrence(s)
CREATE OR REPLACE FUNCTION public.library_grant_provenance_batch(p_stores uuid[])
 RETURNS TABLE(store_id uuid, audience text, industry_id uuid, industry_name text, industry_slug text, organization_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
  select g.data_store_id, g.audience, g.industry_id, i.name, i.slug, g.organization_id
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  where g.data_store_id = any(p_stores)
    and (select auth.uid()) is not null
    and (
      g.audience = 'global'
      or (g.audience = 'organization'
          and g.organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = (select auth.uid())))
      or (g.audience = 'industry'
          and exists (
            select 1
            from iam.org_industries oi
            join iam.organization_member om
              on om.organization_id = oi.organization_id
            where om.user_id = (select auth.uid())
              and oi.industry_id = g.industry_id))
    );
$function$;

-- public.mbr_count(p_container_type text, p_container_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.mbr_count(p_container_type text, p_container_ids uuid[])
 RETURNS TABLE(container_id uuid, member_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.container_id, count(*)::bigint
    from iam.memberships m
   where m.container_type = p_container_type
     and m.container_id = any(coalesce(p_container_ids, '{}'::uuid[]))
     and m.deleted_at is null
     and (iam.has_org_access(m.organization_id)
          or m.container_id in (select me.container_id from iam.memberships me
                                 where me.container_type = p_container_type
                                   and me.user_id = (select auth.uid()) and me.deleted_at is null))
   group by m.container_id;
$function$;

-- public.mbr_for_user(p_container_type text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.mbr_for_user(p_container_type text)
 RETURNS TABLE(id uuid, organization_id uuid, container_id uuid, user_id uuid, role text, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.organization_id, m.container_id, m.user_id, m.role, m.status, m.created_at
    from iam.memberships m
   where m.container_type = p_container_type and m.user_id = (select auth.uid()) and m.deleted_at is null;
$function$;

-- public.mbr_list_with_users(p_container_type text, p_container_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.mbr_list_with_users(p_container_type text, p_container_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, container_id uuid, user_id uuid, role text, status text, created_at timestamp with time zone, created_by uuid, user_email text, user_display_name text, user_avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.organization_id, m.container_id, m.user_id, m.role, m.status, m.created_at, m.created_by,
         u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
         u.raw_user_meta_data->>'avatar_url'
    from iam.memberships m
    join auth.users u on u.id = m.user_id
   where m.container_type = p_container_type and m.container_id = p_container_id
     and m.deleted_at is null
     and (iam.has_org_access(m.organization_id)
          or exists (select 1 from iam.memberships me
                      where me.container_type = p_container_type and me.container_id = p_container_id
                        and me.user_id = (select auth.uid()) and me.deleted_at is null))
   order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at asc;
$function$;

-- public.org_module_custom_values(p_org_id uuid, p_module_key text, p_namespace text) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.org_module_custom_values(p_org_id uuid, p_module_key text, p_namespace text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare v_row platform.org_module_config%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from iam.organization_member where organization_id=p_org_id and user_id=(select auth.uid())
  ) then raise exception 'You do not have access to these organization settings.' using errcode='42501'; end if;
  select * into v_row from platform.org_module_config
   where organization_id=p_org_id and module_token=p_module_key;
  return jsonb_build_object(
    'values',case when jsonb_typeof(v_row.custom_values->p_namespace)='array'
      then v_row.custom_values->p_namespace else '[]'::jsonb end,
    'members_can_add',coalesce(v_row.members_can_add_custom_values,false),
    'can_admin',exists(select 1 from iam.organization_member
      where organization_id=p_org_id and user_id=(select auth.uid()) and role in ('owner','admin'))
  );
end;$function$;

-- public.rag_user_can_see_note(p_note_id uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.rag_user_can_see_note(p_note_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'workbench'
AS $function$
  select exists (
           select 1
             from iam.permissions p
            where p.resource_type = 'note'
              and p.resource_id = p_note_id
              and p.status = 'active'
              and (p.expires_at is null or p.expires_at > now())
              and (
                    p.granted_to_user_id = (select auth.uid())
                 or (p.granted_to_organization_id is not null
                     and exists (
                           select 1
                             from iam.memberships m
                            where m.organization_id = p.granted_to_organization_id
                              and m.user_id = (select auth.uid())))
                  )
         )
      or exists (
           select 1
             from workbench.notes n
            where n.id = p_note_id
              and n.visibility = 'public'
              and n.deleted_at is null
         );
$function$;

-- public.readable_extraction_job_ids() — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.readable_extraction_job_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'iam'
AS $function$
  SELECT j.id
  FROM docproc.page_extraction_jobs j
  WHERE j.owner_id = (select auth.uid())
     OR (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
     OR (j.processed_document_id IS NOT NULL
         AND public.can_read_processed_document(j.processed_document_id, (select auth.uid())))
$function$;

-- public.readable_processed_doc_for_file(p_file uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.readable_processed_doc_for_file(p_file uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'files', 'docproc'
AS $function$
  SELECT f.canonical_processed_document_id
  FROM files.files f
  WHERE f.id = p_file
    AND f.deleted_at IS NULL
    AND f.canonical_processed_document_id IS NOT NULL
    AND public.can_read_processed_document(f.canonical_processed_document_id, (select auth.uid()));
$function$;

-- public.seo_rank_target_list_scope_counts(p_search text, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scope_counts(p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.seo_rank_target_list_scoped(
      v_scope, NULL, p_search, 'created_at', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;

  RETURN QUERY
  SELECT
    'orgs'::text,
    o.id,
    o.name,
    coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.seo_rank_target_list_scoped(
    'orgs', o.id, p_search, 'created_at', 'desc', p_filters, 1, 0
  ) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- public.trx_list_scope_counts(p_search text, p_deep boolean, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.trx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.trx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.trx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- public.ues_get_bulk(p_entity_type text, p_entity_ids uuid[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.ues_get_bulk(p_entity_type text, p_entity_ids uuid[])
 RETURNS TABLE(entity_id uuid, is_favorite boolean, is_pinned boolean, is_hidden boolean, last_viewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select entity_id, is_favorite, is_pinned, is_hidden, last_viewed_at
    from platform.user_entity_state
   where user_id = (select auth.uid()) and entity_type = p_entity_type
     and entity_id = any(coalesce(p_entity_ids,'{}'::uuid[]));
$function$;

-- public.ues_list(p_kind text) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.ues_list(p_kind text DEFAULT NULL::text)
 RETURNS TABLE(entity_type text, entity_id uuid, is_favorite boolean, is_pinned boolean, is_hidden boolean, last_viewed_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select entity_type, entity_id, is_favorite, is_pinned, is_hidden, last_viewed_at, updated_at
    from platform.user_entity_state
   where user_id = (select auth.uid())
     and (p_kind is null
          or (p_kind='favorite' and is_favorite)
          or (p_kind='pinned'   and is_pinned)
          or (p_kind='hidden'   and is_hidden));
$function$;

-- public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid) — 2 occurrence(s)
CREATE OR REPLACE FUNCTION public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
begin
  return p_user is not null and p_store is not null
     and ((select auth.uid()) is null or (select auth.uid()) = p_user or public.is_admin())
     and exists (
       select 1 from rag.data_store_grants g
       where g.data_store_id = p_store
         and (g.audience = 'global'
           or (g.audience = 'organization' and g.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = p_user))
           or (g.audience = 'industry' and exists (select 1 from iam.org_industries oi join iam.organization_member om on om.organization_id = oi.organization_id where om.user_id = p_user and oi.industry_id = g.industry_id)))
     );
end;
$function$;

-- public.user_container_ids(p_container_type text, p_role_filter text[]) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.user_container_ids(p_container_type text, p_role_filter text[] DEFAULT NULL::text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.container_id from iam.memberships m
   where m.container_type = p_container_type and m.user_id = (select auth.uid()) and m.deleted_at is null
     and (p_role_filter is null or m.role = any(p_role_filter));
$function$;

-- public.user_owns_file(p_file_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.user_owns_file(p_file_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM files.files WHERE id = p_file_id AND created_by = (select auth.uid()));
$function$;

-- public.user_owns_folder(p_folder_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.user_owns_folder(p_folder_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM files.folders WHERE id = p_folder_id AND created_by = (select auth.uid()));
$function$;

-- public.wfx_list_scope_counts(p_search text, p_deep boolean, p_archived text, p_filters jsonb) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION public.wfx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.wfx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per non-personal org the caller belongs to, WITH its name. Personal
  -- orgs are excluded: their content IS "Mine", and surfacing it again under My
  -- Orgs would double-count the same rows in two tabs.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.wfx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

-- rag.fn_list_library_catalog(p_organization_id uuid) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION rag.fn_list_library_catalog(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, short_code text, description text, kind text, member_count bigint, subscribed boolean, entitled_via text, entitled_industry_name text, entitled_industry_slug text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_admin boolean := exists (select 1 from admin.admins a where a.user_id = (select auth.uid()));
begin
  if p_organization_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return query
  select
    store.id,
    store.name,
    store.short_code,
    store.description,
    store.kind,
    coalesce(member_count.count, 0),
    p_organization_id is not null and exists (
      select 1
      from rag.data_store_grants as grant_row
      where grant_row.data_store_id = store.id
        and grant_row.audience = 'organization'
        and grant_row.organization_id = p_organization_id
    ),
    coalesce(ent.via, case when v_admin then 'admin' end),
    ent.ind_name,
    ent.ind_slug
  from rag.data_stores as store
  left join (
    select member.data_store_id, count(*) as count
    from rag.data_store_members as member
    where member.deleted_at is null
    group by member.data_store_id
  ) as member_count on member_count.data_store_id = store.id
  left join lateral (
    select
      case
        when bool_or(g.audience = 'organization') then 'organization'
        when bool_or(g.audience = 'industry') then 'industry'
        when bool_or(g.audience = 'global') then 'global'
      end as via,
      (array_agg(i.name order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_name,
      (array_agg(i.slug order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_slug
    from rag.data_store_grants g
    left join iam.industries i on i.id = g.industry_id
    where g.data_store_id = store.id
      and v_user is not null
      and (
        g.audience = 'global'
        or (g.audience = 'organization'
            and g.organization_id in (
              select om.organization_id
              from iam.organization_member om
              where om.user_id = v_user))
        or (g.audience = 'industry'
            and exists (
              select 1
              from iam.org_industries oi
              join iam.organization_member om
                on om.organization_id = oi.organization_id
              where om.user_id = v_user
                and oi.industry_id = g.industry_id))
      )
  ) as ent on true
  where store.discoverable
    and store.is_active
  order by store.name;
end;
$function$;

-- rag.fn_list_library_trash() — 1 occurrence(s)
CREATE OR REPLACE FUNCTION rag.fn_list_library_trash()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'docproc', 'files'
AS $function$
  select coalesce(jsonb_agg(row order by row->>'deleted_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', pd.id,
      'name', pd.name,
      'source_kind', pd.source_kind,
      'source_id', pd.source_id,
      'derivation_kind', pd.derivation_kind,
      'parent_processed_id', pd.parent_processed_id,
      'total_pages', pd.total_pages,
      'deleted_at', pd.deleted_at,
      'deleted_via', pd.metadata->>'deleted_via',
      'file_name', case when pd.source_kind = 'cld_file'
                        then (select f.file_name from files.files f where f.id = pd.source_id::uuid)
                        end,
      'hidden_chunks', (select count(*) from rag.kg_chunks c
                         where c.processed_document_id = pd.id and c.deleted_at is not null)
    ) as row
    from docproc.processed_documents pd
    where pd.owner_id = (select auth.uid())
      and pd.deleted_at is not null
  ) t;
$function$;

-- rag.fn_list_user_data_stores(p_include_inactive boolean) — 1 occurrence(s)
CREATE OR REPLACE FUNCTION rag.fn_list_user_data_stores(p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, short_code text, description text, kind text, member_count bigint, is_active boolean, access text, read_only boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
  WITH v_user AS (SELECT (select auth.uid()) AS uid),
  v_orgs AS (
    SELECT om.organization_id FROM iam.organization_member om, v_user
    WHERE om.user_id = v_user.uid
  ),
  visible AS (
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'owner'::text AS access
    FROM rag.data_stores s, v_user
    WHERE s.created_by = v_user.uid
      AND (p_include_inactive OR s.is_active)
    UNION
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'org'::text AS access
    FROM rag.data_stores s
    WHERE s.organization_id IN (SELECT organization_id FROM v_orgs)
      AND (p_include_inactive OR s.is_active)
      AND s.id NOT IN (SELECT id FROM rag.data_stores s2, v_user WHERE s2.created_by = v_user.uid)
    UNION
    SELECT s.id, s.name, s.short_code, s.description, s.kind, s.is_active,
           'granted'::text AS access
    FROM rag.data_stores s
    WHERE (p_include_inactive OR s.is_active)
      AND EXISTS (
        SELECT 1 FROM rag.data_store_grants g
        WHERE g.data_store_id = s.id
          AND (
            g.audience = 'global'
            OR (g.audience = 'organization' AND g.organization_id IN (SELECT organization_id FROM v_orgs))
            OR (g.audience = 'industry' AND EXISTS (
                  SELECT 1 FROM iam.org_industries oi, v_orgs
                  WHERE oi.organization_id = v_orgs.organization_id
                    AND oi.industry_id = g.industry_id))
          )
      )
      AND s.id NOT IN (
        SELECT id FROM rag.data_stores s3, v_user WHERE s3.created_by = v_user.uid
        UNION
        SELECT s4.id FROM rag.data_stores s4, v_orgs WHERE s4.organization_id = v_orgs.organization_id
      )
  )
  SELECT
    v.id, v.name, v.short_code, v.description, v.kind,
    COALESCE(mc.cnt, 0) AS member_count,
    v.is_active,
    v.access,
    (v.access = 'granted') AS read_only
  FROM visible v
  LEFT JOIN (
    SELECT data_store_id, COUNT(*) AS cnt
    FROM rag.data_store_members
    WHERE deleted_at IS NULL
    GROUP BY data_store_id
  ) mc ON mc.data_store_id = v.id
  ORDER BY (NOT v.is_active), v.name;
$function$;

