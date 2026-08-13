-- Fixes for three confirmed defects (FOUND_DEFECTS D134, D117, D101 remainder).
--
-- D134 — agx_list_scoped: the shared-scope org-grant branch used
--   `SELECT DISTINCT ON (a.id)` with NO ORDER BY, so when several org grants
--   exist for one agent the surfaced access_level was nondeterministic.
--   Fixed by wrapping the branch in a subquery with
--   `ORDER BY a.id, perm.permission_level::text` — the exact shape of the
--   transcripts twin (migrations/trx_list_scoped.sql, org_shared subquery).
--
-- D117 — platform.shareable_resource_registry row 'content_ir_kind_instance'
--   declared is_public_column='visibility', but that column is the canonical
--   visibility ENUM, not a boolean. Set to NULL (TS mirror + snapshot updated
--   in the same commit).
--
-- D101 remainder — SECURITY DEFINER list/resolve readers of agent.definition
--   missing the soft-delete predicate. Added `deleted_at IS NULL` to:
--     agx_get_shared_with_me, agx_get_shared_for_chat, get_agents_for_chat
--     (both arms), agx_get_shortcuts_for_context (the agent.definition join),
--     agx_get_list_full (builtin arm).
--   Deliberately NOT touched: agx_get_access_level (single-record access
--   resolution — AccessGate needs the TRUE state of deleted rows; authed
--   single-record reads don't gate deleted_at per the soft-delete doctrine)
--   and agx_duplicate_agent (explicit single-id action; duplicating from
--   trash is a legitimate restore-shaped path, not a list leak).

-- ── D117 ────────────────────────────────────────────────────────────────────
UPDATE platform.shareable_resource_registry
SET is_public_column = NULL, updated_at = now()
WHERE resource_type = 'content_ir_kind_instance'
  AND is_public_column = 'visibility';

-- ── D134 ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    -- Aliased to org_id on purpose: a bare `organization_id` resolves to the
    -- RETURNS TABLE OUT variable of the same name (42702 ambiguous reference).
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, false, 'org'::text FROM agent.definition a
    WHERE v_scope='orgs' AND a.created_by IS DISTINCT FROM v_uid
      AND a.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND a.visibility IN ('internal','public')
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
          AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
      ORDER BY a.id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT a.*, false, 'public'::text FROM agent.definition a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid AND a.visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN auth.users u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.agent_type='user' AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

-- ── D101 remainder ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agx_get_shared_with_me()
 RETURNS TABLE(id uuid, name text, description text, agent_type text, category text, tags text[], owner_id uuid, owner_email text, permission_level text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.description, a.agent_type, a.category, a.tags, a.created_by, u.email, perm.permission_level::text, a.created_at, a.updated_at
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = auth.uid()
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != auth.uid() AND NOT a.is_archived AND a.deleted_at IS NULL
  ORDER BY a.name;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_shared_for_chat()
 RETURNS TABLE(id uuid, name text, permission_level text, owner_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, perm.permission_level::text, u.email
  FROM agent.definition a
  INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = auth.uid()
  LEFT JOIN auth.users u ON u.id = a.created_by
  WHERE a.created_by != auth.uid() AND a.is_active AND NOT a.is_archived AND a.deleted_at IS NULL
  ORDER BY a.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_agents_for_chat(p_limit integer DEFAULT 50, p_cursor uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.name::text, 'prompts'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'user'
    AND d.created_by = auth.uid()
    AND NOT d.is_archived
    AND d.deleted_at IS NULL
    AND (p_cursor IS NULL OR d.id > p_cursor)
  ORDER BY d.id
  LIMIT p_limit;

  RETURN QUERY
  SELECT d.id, d.name::text, 'builtins'::text AS source
  FROM agent.definition d
  WHERE d.agent_type = 'builtin' AND d.is_active = true AND NOT d.is_archived
    AND d.deleted_at IS NULL
  ORDER BY d.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_get_list_full()
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM agx_get_list();
  RETURN QUERY SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags, a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at, false, 'system'::text, NULL::text
  FROM agent.definition a WHERE a.agent_type = 'builtin' AND a.is_active = true AND a.deleted_at IS NULL;
END;
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
    SELECT x.target_id FROM platform.associations x
    WHERE x.source_type = 'agent_shortcut' AND x.source_id = s.id AND x.target_type = 'project'
    ORDER BY x.created_at LIMIT 1
  ) sp ON true
  LEFT JOIN LATERAL (
    SELECT x.target_id FROM platform.associations x
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
