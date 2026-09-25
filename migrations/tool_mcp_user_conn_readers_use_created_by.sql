-- based-on: public.upsert_mcp_connection(uuid, uuid, mcp_transport, text) dac04a0a484a00f158cb2717639f6b27c46a8612630345a448021ebfce65d93c
-- based-on: public.get_mcp_catalog_for_user() 8433dfa7ab61db6d1820089852e1bcd9fc646adcfa68bce6a047301dd49ce623
-- based-on: public.tool_resolve_for_request(uuid, text, text, text[]) 94315a111d52d41cdafd3c9094da43bc638608fb246256d84d0205cf5befaa6e
-- chair-step: re-signs public.upsert_mcp_connection to carry the new connection's organization (DROP FUNCTION of the 4-argument form + its door row, recreated in the same transaction with p_organization_id); the other two statements replace readers to key on created_by. No table, row or policy changes. Rehearsed rolled back 2026-09-25 (lane B-TOOL).
--
-- tool.mcp_user_conn readers and the one DB writer move to created_by (lane B-TOOL; phase 1 is
-- tool_mcp_user_conn_owner_is_created_by.sql, which this file depends on).
--
-- * get_mcp_catalog_for_user — the person's own connection is `created_by = auth.uid()`; archived
--   connections and archived servers drop out.
-- * tool_resolve_for_request — the MCP executors a request may use come from the person's own
--   connected, non-archived rows (created_by).
-- * upsert_mcp_connection — writes created_by (the bridge mirrors the retired user_id while old code
--   is deployed) and FILES the new row in p_organization_id, which the caller names and must belong
--   to (iam.has_org_access). The organization is a write destination, never an access input: the
--   row stays personal. p_organization_id is DEFAULT NULL only while the deployed browser bundle
--   does not send it; phase 2 (window file) makes it required and organization_id NOT NULL.

CREATE OR REPLACE FUNCTION public.get_mcp_catalog_for_user()
 RETURNS TABLE(server_id uuid, slug text, name text, vendor text, description text, category mcp_server_category, icon_url text, color text, website_url text, docs_url text, endpoint_url text, transport mcp_transport, auth_strategy mcp_auth_strategy, is_official boolean, is_featured boolean, has_remote boolean, has_local boolean, supports_mcp_apps boolean, server_status mcp_server_status, connection_ready boolean, connection_id uuid, connection_status mcp_connection_status, connected_at timestamp with time zone, last_used_at timestamp with time zone, transport_used mcp_transport, token_expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        s.id,
        s.slug,
        s.name,
        s.vendor,
        s.description,
        s.category,
        s.icon_url,
        s.color,
        s.website_url,
        s.docs_url,
        s.endpoint_url,
        s.transport,
        s.auth_strategy,
        s.is_official,
        s.is_featured,
        s.has_remote,
        s.has_local,
        s.supports_mcp_apps,
        s.status,
        CASE
            WHEN uc.status = 'connected' THEN true
            WHEN s.metadata ? 'connection_ready'
                THEN COALESCE((s.metadata ->> 'connection_ready')::boolean, false)
            ELSE COALESCE(
                (
                    s.status IN ('active', 'beta', 'community')
                    AND s.has_remote
                    AND s.endpoint_url IS NOT NULL
                    AND s.transport <> 'stdio'
                    AND s.auth_strategy = 'none'
                )
                OR s.slug = 'github'
                OR EXISTS (
                    SELECT 1
                    FROM tool.mcp_user_conn proven
                    WHERE proven.server_id = s.id
                      AND proven.status = 'connected'
                      AND proven.deleted_at IS NULL
                ),
                false
            )
        END AS connection_ready,
        uc.id,
        uc.status,
        uc.connected_at,
        uc.last_used_at,
        uc.transport_used,
        uc.token_expires_at
    FROM tool.mcp_server s
    LEFT JOIN tool.mcp_user_conn uc
      ON uc.server_id = s.id
     AND uc.created_by = auth.uid()
     AND uc.deleted_at IS NULL
    WHERE s.status <> 'deprecated'
      AND s.deleted_at IS NULL
      AND (
          auth.role() = 'service_role'
          OR COALESCE(
              iam.has_access_for(
                  auth.uid(),
                  'mcp_server',
                  s.id,
                  'viewer'::public.permission_level
              ),
              false
          )
      )
    ORDER BY s.sort_order, s.name;
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
           AND c.created_by = p_user_id AND c.deleted_at IS NULL
           AND c.status = 'connected'::public.mcp_connection_status),
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

-- tool_resolve_for_request is a SECURITY DEFINER the server alone calls; replacing it must declare that.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'public', 'tool_resolve_for_request',
       pg_get_function_identity_arguments('public.tool_resolve_for_request(uuid,text,text,text[])'::regprocedure),
       platform.door_argtypes(p.proargtypes),
       'Resolves the tool set for one agent request. p_user_id is the person the SERVER is acting for (the authenticated caller the request was admitted as); it selects only that person''s own connected MCP servers (tool.mcp_user_conn.created_by). NULL p_user_id resolves no personal MCP executors. The other arguments are executor/surface names, not entity ids.',
       'tool_mcp_user_conn_readers_use_created_by.sql (lane B-TOOL)',
       'server_only: aidream db/tool_managers.py resolve_tools_for_request calls it as the platform server for the request''s own user; no client ever calls it (authenticated holds no EXECUTE).',
       false, false
  from pg_proc p where p.oid = 'public.tool_resolve_for_request(uuid,text,text,text[])'::regprocedure
on conflict do nothing;

-- ── upsert_mcp_connection: the new signature carries the organization ────────────────────────────
drop function if exists public.upsert_mcp_connection(uuid, uuid, mcp_transport, text);
delete from platform.client_callable_door
 where schema_name = 'public' and function_name = 'upsert_mcp_connection';

create function public.upsert_mcp_connection(
    p_server_id uuid,
    p_config_id uuid DEFAULT NULL::uuid,
    p_transport mcp_transport DEFAULT 'http'::mcp_transport,
    p_endpoint_override text DEFAULT NULL::text,
    p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_id uuid;
    v_display_name text;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- The organization is where a NEW connection is filed — named by the caller, never chosen here.
    IF p_organization_id IS NOT NULL AND NOT iam.has_org_access(p_organization_id) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
          MESSAGE = 'upsert_mcp_connection: you are not a member of the organization this connection would be filed in.';
    END IF;

    SELECT COALESCE(NULLIF(s.name, ''), s.slug)
      INTO v_display_name
      FROM tool.mcp_server s
     WHERE s.id = p_server_id
       AND s.deleted_at IS NULL;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'MCP server % not found', p_server_id;
    END IF;

    INSERT INTO tool.mcp_user_conn (
        created_by, organization_id, server_id, status, connected_at, last_used_at,
        config_id, transport_used, endpoint_url_override,
        display_name, error_count, last_error, updated_at
    ) VALUES (
        v_uid, p_organization_id, p_server_id, 'connected', now(), now(),
        p_config_id, p_transport, p_endpoint_override,
        v_display_name, 0, NULL, now()
    )
    ON CONFLICT (created_by, server_id) DO UPDATE SET
        status = 'connected',
        connected_at = COALESCE(tool.mcp_user_conn.connected_at, now()),
        last_used_at = now(),
        config_id = COALESCE(p_config_id, tool.mcp_user_conn.config_id),
        transport_used = p_transport,
        endpoint_url_override = COALESCE(p_endpoint_override, tool.mcp_user_conn.endpoint_url_override),
        -- Never rename an existing connection on reconnect.
        display_name = COALESCE(tool.mcp_user_conn.display_name, EXCLUDED.display_name),
        -- A connection keeps the organization it was filed in; a row an old client wrote without
        -- one takes the organization this caller names (and was just checked for).
        organization_id = COALESCE(tool.mcp_user_conn.organization_id, EXCLUDED.organization_id),
        deleted_at = NULL,
        error_count = 0, last_error = NULL, updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

-- The door is declared once the function exists (DD-223 resolves identity_args against the
-- catalogue) and before the GRANT (the definer-grant guard revokes an undeclared client EXECUTE).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, gate_predicate,
   signed_in_callers, anonymous_callers, probe_args, argument_rules)
values
  ('public', 'upsert_mcp_connection',
   'p_server_id uuid, p_config_id uuid, p_transport mcp_transport, p_endpoint_override text, p_organization_id uuid',
   'lane B-TOOL (tool schema certification, 2026-09-25)',
   'Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 3 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it. Re-declared 2026-09-25 (lane B-TOOL): the owner is created_by and the new row is filed in the caller-named organization, which the body checks with iam.has_org_access before writing.',
   'auth.uid()', true, false,
   '{"args": {"p_transport": "literal:http"}, "note": "p_server_id is a tool.mcp_server row and that table holds no row in any organization the callers lack standing in (measured 2026-09-14); the transport enum is filled so the door at least reaches its own lookup."}'::jsonb,
   '{"version": 1, "arguments": {"p_config_id": {"type": "uuid", "check": "p_config_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_config_id in statement comparing identity", "decided_before_read": true}, "optional": true, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}, "sql_default": "NULL::uuid"}, "p_server_id": {"type": "uuid", "check": "p_server_id in statement comparing identity", "foreign": {"note": "decision found by the static reading with helper closure: p_server_id in statement comparing identity", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_transport": {"type": "mcp_transport", "foreign": {"not_an_id": true}, "optional": true, "position": 3, "null_rule": {}, "sql_default": "''http''::mcp_transport"}, "p_endpoint_override": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 4, "null_rule": {}, "sql_default": "NULL::text"}, "p_organization_id": {"type": "uuid", "optional": true, "position": 5, "sql_default": "NULL::uuid", "null_rule": {}, "check": "p_organization_id -> iam.has_org_access(...)", "foreign": {"note": "The organization a NEW connection is filed in (write destination, never access). The body refuses one the caller is not a member of before any write; NULL is accepted only until the deployed clients send it (phase 2 makes it required).", "decided_before_read": true}, "verified": "2026-09-25 lane B-TOOL \u2014 read from this body"}}, "declared_by": "tool_mcp_user_conn_readers_use_created_by.sql"}'::jsonb)
on conflict do nothing;

grant execute on function public.upsert_mcp_connection(uuid, uuid, mcp_transport, text, uuid) to authenticated, service_role;
