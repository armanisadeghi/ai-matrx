-- Canonicalization flip (2026-07-02): collapse tool.bundle_member into
-- platform.associations, per canonicalization_worklog.md §4.3.
--
--   tool.bundle_member → association  tool → tool_bundle  role='member'
--   (88 rows · position=sort_order · metadata.local_alias · legacy_id={bundle_id,tool_id})
--
-- 4 dependent DB fns repointed onto associations: create_bundle_with_lister,
-- get_tool_detail, tool_resolve_bundle, tool_resolve_for_request (the last was
-- ALREADY broken pre-flip). FE/API repoint tracked separately (worklog §6).
-- Atomic; data collapse guarded on the table still living in `tool`.

-- ── 1. Data collapse + retire (guarded, count-verified) ──────────────────────
DO $$
DECLARE n_j int; n_a int;
BEGIN
  IF to_regclass('tool.bundle_member') IS NOT NULL THEN
    INSERT INTO platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position, metadata, created_at)
    SELECT 'tool', m.tool_id, 'tool_bundle', m.bundle_id, b.organization_id, 'member', m.sort_order,
           jsonb_build_object('local_alias', m.local_alias,
                              'legacy_table','tool.bundle_member',
                              'legacy_id', jsonb_build_object('bundle_id', m.bundle_id, 'tool_id', m.tool_id)),
           COALESCE(m.created_at, now())
    FROM tool.bundle_member m
    JOIN tool.bundle b ON b.id = m.bundle_id
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    SELECT count(*) INTO n_j FROM tool.bundle_member;
    SELECT count(*) INTO n_a FROM platform.associations
      WHERE source_type='tool' AND target_type='tool_bundle' AND role='member'
        AND metadata->>'legacy_table'='tool.bundle_member';
    IF n_j <> n_a THEN
      RAISE EXCEPTION 'bundle_member edge count mismatch: junction=% assoc=%', n_j, n_a;
    END IF;

    ALTER TABLE tool.bundle_member SET SCHEMA graveyard;
    INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, archived_as)
    VALUES ('tool.bundle_member',
            'platform.associations (tool→tool_bundle role=member)',
            'M2M collapse to canonical associations (worklog §4.3)',
            'graveyard.bundle_member');
  END IF;
END $$;

-- ── 2. Repoint the 4 dependent functions onto platform.associations ──────────

-- 2a. create_bundle_with_lister — members now inserted as tool→tool_bundle edges.
CREATE OR REPLACE FUNCTION public.create_bundle_with_lister(p_name text, p_description text DEFAULT ''::text, p_is_system boolean DEFAULT false, p_lister_tool_name text DEFAULT NULL::text, p_member_tool_names text[] DEFAULT ARRAY[]::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bundle_id uuid;
    v_lister_id uuid;
    v_lister_name text := COALESCE(p_lister_tool_name, 'bundle:list_' || p_name);
    v_lister_desc text := 'Discovery tool — loads the ' || p_name ||
        ' bundle''s tools on demand, then removes itself. Call it when you need that toolkit.';
BEGIN
    SELECT id INTO v_lister_id FROM tool.definition WHERE name = v_lister_name;
    IF v_lister_id IS NULL THEN
        INSERT INTO tool.definition (name, description, parameters, category, tool_group, source_kind, is_active)
        VALUES (v_lister_name, v_lister_desc, '{}'::jsonb, 'bundle', 'core', 'native', true)
        RETURNING id INTO v_lister_id;
    ELSE
        UPDATE tool.definition SET is_active = true, updated_at = now() WHERE id = v_lister_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tool.binding WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core') THEN
        INSERT INTO tool.binding (tool_id, executor_name, is_active) VALUES (v_lister_id, 'matrx-ai-core', true);
    ELSE
        UPDATE tool.binding SET is_active = true, updated_at = now()
        WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core';
    END IF;

    SELECT id INTO v_bundle_id FROM tool.bundle WHERE name = p_name;
    IF v_bundle_id IS NULL THEN
        INSERT INTO tool.bundle (name, description, is_system, lister_tool_id, created_by)
        VALUES (p_name, p_description, p_is_system, v_lister_id, auth.uid())
        RETURNING id INTO v_bundle_id;
    ELSE
        UPDATE tool.bundle
        SET description = p_description, is_system = p_is_system, lister_tool_id = v_lister_id, updated_at = now()
        WHERE id = v_bundle_id;
    END IF;

    -- members → tool → tool_bundle edges (idempotent)
    INSERT INTO platform.associations (source_type, source_id, target_type, target_id, organization_id, role, metadata)
    SELECT 'tool', d.id, 'tool_bundle', v_bundle_id,
           (SELECT organization_id FROM tool.bundle WHERE id = v_bundle_id),
           'member', jsonb_build_object('local_alias', d.name)
    FROM tool.definition d
    WHERE d.name = ANY(p_member_tool_names)
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    RETURN v_bundle_id;
END;
$function$;

-- 2b. get_tool_detail — a tool's bundles come from its outgoing member edges.
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
    FROM platform.associations a JOIN tool.bundle b ON b.id = a.target_id
    WHERE a.source_type = 'tool' AND a.source_id = v_tool.id
      AND a.target_type = 'tool_bundle' AND a.role = 'member';

    RETURN jsonb_build_object('def', to_jsonb(v_tool), 'bindings', COALESCE(v_bindings, '[]'::jsonb), 'bundles', COALESCE(v_bundles, '[]'::jsonb));
END;
$function$;

-- 2c. tool_resolve_bundle — a bundle's tools come from its incoming member edges.
CREATE OR REPLACE FUNCTION public.tool_resolve_bundle(p_bundle_name text)
 RETURNS SETOF tool.definition
 LANGUAGE sql
 STABLE
AS $function$
    SELECT d.*
    FROM tool.definition d
    JOIN platform.associations a ON a.source_id = d.id AND a.source_type = 'tool'
                                 AND a.target_type = 'tool_bundle' AND a.role = 'member'
    JOIN tool.bundle b ON b.id = a.target_id
    WHERE b.name = p_bundle_name AND b.is_active = true AND d.is_active = true
    ORDER BY a.position, d.name;
$function$;

-- 2d. tool_resolve_for_request — bundle expansion (force include/exclude) via edges.
-- (also fixes a pre-existing break: unqualified mcp_connection_status did not
--  resolve without an explicit search_path — the reason table_impact flagged it
--  currently_broken.)
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
             JOIN platform.associations a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
                                          AND a.source_type = 'tool' AND a.role = 'member'
             JOIN tool.definition d ON d.id = a.source_id
             WHERE b.name = ANY(v_surface.always_include_bundles)
               AND b.is_system = true AND b.is_active = true AND d.is_active = true),
            ARRAY[]::text[]);

        v_force_exc := v_force_exc || COALESCE(
            (SELECT array_agg(DISTINCT d.name)
             FROM tool.bundle b
             JOIN platform.associations a ON a.target_id = b.id AND a.target_type = 'tool_bundle'
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
