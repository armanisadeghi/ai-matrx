-- based-on: public.tool_resolve_for_request(uuid, text, text, text[]) 0aa4efe04efbb5742c9f1281d49bdb37a12092931eaf285d9ab05e1909111e60
-- based-on: public.tool_resolve_bundle(text) 2939a987da72f0a59c53ebd08a3d2e353ac7d448fc2907f327e2f207b5fc9f0b
-- based-on: agent.default_tool_ids_for_organization(uuid) 4685528e57cd1161f08d6bff2582dcf85d61200e739864145a032474d16a7de7
-- based-on: public.get_tools_list(boolean) fb20835fb39883c24f0df6f718197ba2e4d4a968db0f688c8c98b7c8343227fe
-- based-on: public.get_tools_metadata() 87ddd19cc42822ccbff2c3222ed48a235afc74d35b0b084d61bcd19cb3762ac3
-- based-on: public.get_tool_detail(text) 4caf380622e42deb5eb3407641f3af0d1348e9f05b9cc8acd36d91a91f180b23
-- Delete means archive (Arman, 2026-09-27): moving a tool (tool.definition) or
-- one of its executor bindings (tool.binding) to Trash now sets deleted_at
-- instead of destroying the row. Every function that hands tools to agents or
-- lists them must therefore skip rows in Trash, or an archived tool would keep
-- being served. Each body below is the live body with only `deleted_at IS NULL`
-- added on tool.definition / tool.binding.

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
           AND c.created_by = p_user_id AND c.deleted_at IS NULL
           AND c.status = 'connected'::public.mcp_connection_status),
        ARRAY[]::text[]);

    SELECT COALESCE(array_agg(DISTINCT d.id), ARRAY[]::uuid[]) INTO v_universe
    FROM tool.definition d
    JOIN tool.binding b ON b.tool_id = d.id
    WHERE b.executor_name = ANY(v_applicable) AND d.is_active = true AND b.is_active = true
      AND d.deleted_at IS NULL AND b.deleted_at IS NULL;

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
               AND b.is_system = true AND b.is_active = true AND d.is_active = true
               AND d.deleted_at IS NULL),
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
          AND d.deleted_at IS NULL
    )
    SELECT b.id, b.name, b.description, b.parameters, b.annotations,
           COALESCE(v_arg_def -> b.name, '{}'::jsonb)
    FROM base b
    ORDER BY b.name;
END;
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
      AND d.deleted_at IS NULL
    ORDER BY a.position, d.name;
$function$;

CREATE OR REPLACE FUNCTION agent.default_tool_ids_for_organization(p_organization_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
    v_ids uuid[] := '{}';
begin
    if p_organization_id is null then
        return v_ids;
    end if;

    -- A tool is offered only when EVERY switch it declares resolves true for this
    -- organization. bool_and over the tool's own rows is that sentence in one line.
    -- A tool in Trash is never offered.
    select coalesce(array_agg(t.id order by t.name), '{}')
      into v_ids
      from tool.definition t
     where t.is_active
       and t.deleted_at is null
       and t.name in (
             select o.tool_name
               from agent.org_default_tool o
              group by o.tool_name
             having bool_and(
                        platform.knob_resolve(o.feature, o.key, p_organization_id, null, null)
                        = to_jsonb(true)
                    )
           );

    return v_ids;
exception
    -- AN UNREADABLE SWITCH NEVER HANDS OUT A CAPABILITY. A knob that is not seeded raises
    -- P0001; the agent is still created, carrying nothing, and the reason is on the log.
    when others then
        raise warning
            'agent.default_tool_ids_for_organization(%): no default tools were added because a switch could not be read (% %). The agent was created with the tools its writer sent.',
            p_organization_id, sqlstate, sqlerrm;
        return '{}'::uuid[];
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_tools_list(p_active_only boolean DEFAULT true)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, source_kind text, tool_group text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT d.id, d.name, d.description, d.category, d.tags, d.is_active,
           d.source_kind, d.tool_group
    FROM tool.definition d
    WHERE (NOT p_active_only OR d.is_active = true)
      AND d.deleted_at IS NULL
      -- rca5d_k: a tool the caller may not open is not listed (public ones need no question)
      AND (d.visibility = 'public'::platform.visibility
           OR iam.has_access('tool', d.id, 'viewer'::public.permission_level))
    ORDER BY d.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_tools_metadata()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT jsonb_build_object(
        'total',         (SELECT count(*) FROM tool.definition WHERE deleted_at IS NULL),
        'active',        (SELECT count(*) FROM tool.definition WHERE is_active AND deleted_at IS NULL),
        'by_source',     (SELECT jsonb_object_agg(source_kind, n) FROM (SELECT source_kind, count(*) AS n FROM tool.definition WHERE deleted_at IS NULL GROUP BY source_kind) s),
        'by_group',      (SELECT jsonb_object_agg(tool_group, n) FROM (SELECT tool_group, count(*) AS n FROM tool.definition WHERE deleted_at IS NULL GROUP BY tool_group) g),
        'by_category',   (SELECT jsonb_object_agg(COALESCE(category, 'uncategorized'), n) FROM (SELECT category, count(*) AS n FROM tool.definition WHERE deleted_at IS NULL GROUP BY category) c)
    );
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
    FROM tool.binding b WHERE b.tool_id = v_tool.id AND b.deleted_at IS NULL;

    SELECT jsonb_agg(jsonb_build_object('bundle_id', a.target_id, 'bundle_name', b.name,
                                        'local_alias', a.metadata->>'local_alias')) INTO v_bundles
    FROM platform.associations_live a JOIN tool.bundle b ON b.id = a.target_id
    WHERE a.source_type = 'tool' AND a.source_id = v_tool.id
      AND a.target_type = 'tool_bundle' AND a.role = 'member';

    RETURN jsonb_build_object('def', to_jsonb(v_tool), 'bindings', COALESCE(v_bindings, '[]'::jsonb), 'bundles', COALESCE(v_bundles, '[]'::jsonb));
END;
$function$;
