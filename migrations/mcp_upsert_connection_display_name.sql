-- D128: `upsert_mcp_connection` could never insert a row.
--
-- The Phase-4 vault cutover rewrote this RPC as metadata-only (no token
-- columns). The rewrite dropped `display_name` from the INSERT column list —
-- but `tool.mcp_user_conn.display_name` is NOT NULL with no default, so every
-- first-time connect raised
--   23502: null value in column "display_name" ... violates not-null constraint
-- for every server and every user. The four surviving rows all predate the
-- cutover (April 2026), which is why nothing looked obviously broken.
--
-- Fix: derive the name from the server registry, exactly as aidream's
-- credential paths already do (`server.name or server.slug`). On conflict the
-- existing display_name is preserved — a reconnect must not rename a
-- connection the user may have seen under its old label.

CREATE OR REPLACE FUNCTION public.upsert_mcp_connection(
    p_server_id uuid,
    p_config_id uuid DEFAULT NULL::uuid,
    p_transport mcp_transport DEFAULT 'http'::mcp_transport,
    p_endpoint_override text DEFAULT NULL::text
)
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

    SELECT COALESCE(NULLIF(s.name, ''), s.slug)
      INTO v_display_name
      FROM tool.mcp_server s
     WHERE s.id = p_server_id;

    IF v_display_name IS NULL THEN
        RAISE EXCEPTION 'MCP server % not found', p_server_id;
    END IF;

    INSERT INTO tool.mcp_user_conn (
        user_id, server_id, status, connected_at, last_used_at,
        config_id, transport_used, endpoint_url_override,
        display_name, error_count, last_error, updated_at
    ) VALUES (
        v_uid, p_server_id, 'connected', now(), now(),
        p_config_id, p_transport, p_endpoint_override,
        v_display_name, 0, NULL, now()
    )
    ON CONFLICT (user_id, server_id) DO UPDATE SET
        status = 'connected',
        connected_at = COALESCE(tool.mcp_user_conn.connected_at, now()),
        last_used_at = now(),
        config_id = COALESCE(p_config_id, tool.mcp_user_conn.config_id),
        transport_used = p_transport,
        endpoint_url_override = COALESCE(p_endpoint_override, tool.mcp_user_conn.endpoint_url_override),
        -- Never rename an existing connection on reconnect.
        display_name = COALESCE(tool.mcp_user_conn.display_name, EXCLUDED.display_name),
        error_count = 0, last_error = NULL, updated_at = now()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;
