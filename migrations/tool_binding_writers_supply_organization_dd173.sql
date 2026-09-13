-- tool_binding_writers_supply_organization_dd173 — EVERY WRITER OF `tool.binding` NAMES THE
-- ORGANIZATION (DD-173, lane B-83; DD-154's contract). Prerequisite for DD-173 batch 6.
--
-- WHY
-- ---
-- Batch 6 corrects `tool_binding` from the `system` variant to `component` and, through
-- `platform.retrofit_entity`, gives `tool.binding` the base contract its variant requires —
-- including `organization_id NOT NULL` (db-rules §6d-3; NO NULL ORG, owner ruling 2026-08-21).
--
-- The backfill answers the 645 rows that exist. It says nothing about the NEXT insert, and
-- `tool.binding` has four live writers, every one of them a SECURITY DEFINER function that names
-- no organization at all:
--
--   public.tool_register(jsonb, text[])                 -- the main tool registration path
--   public.tool_register_mcp_discovered(uuid, jsonb)    -- MCP tool discovery
--   public.provision_mcp_server(...)                    -- user-facing MCP server provisioning
--   public.create_bundle_with_lister(...)               -- bundle + lister tool creation
--
-- Applied without this file, batch 6 would have made all four fail at the next call with
-- `null value in column "organization_id" of relation "binding" violates not-null constraint`.
-- Caught by batch 6's WRITE proof — a read gate cannot see a write disappear.
--
-- 🚨 THE FIX IS THE WRITER, NOT A TRIGGER. The first attempt attached
--    `platform.inherit_org_from_parent` inside `platform.retrofit_entity`. `platform._ddl_guard`
--    refused it, correctly and by name: `dd154_org_assignment_ddl_prevention` blocks every new
--    organization-assignment trigger, and DD-154's contract is "explicit organization ownership at
--    every writer". The 117 tables that already carry that trigger are the historical attachments
--    DD-154 deliberately did not detach; they are not a licence to add the 118th. So each writer
--    now states the organization: the row's own parent tool's, read from `tool.definition` in the
--    same statement. That is the same organization the backfill wrote, said by the writer.
set local lock_timeout = '20s';

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
        INSERT INTO tool.binding (tool_id, executor_name, is_active, organization_id)
        SELECT v_lister_id, 'matrx-ai-core', true, d.organization_id FROM tool.definition d WHERE d.id = v_lister_id;
    ELSE
        UPDATE tool.binding SET is_active = true, updated_at = now()
        WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core';
    END IF;

    SELECT id INTO v_bundle_id FROM tool.bundle WHERE name = p_name;
    IF v_bundle_id IS NULL THEN
        INSERT INTO tool.bundle (name, description, is_system, lister_tool_id, created_by)
        VALUES (p_name, p_description, p_is_system, v_lister_id, (select auth.uid()))
        RETURNING id INTO v_bundle_id;
    ELSE
        UPDATE tool.bundle
        SET description = p_description, is_system = p_is_system, lister_tool_id = v_lister_id, updated_at = now()
        WHERE id = v_bundle_id;
    END IF;

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


CREATE OR REPLACE FUNCTION public.provision_mcp_server(p_slug text, p_name text, p_vendor text, p_category mcp_server_category, p_transport mcp_transport, p_auth_strategy mcp_auth_strategy, p_endpoint_url text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_icon_url text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_docs_url text DEFAULT NULL::text, p_website_url text DEFAULT NULL::text, p_status mcp_server_status DEFAULT 'beta'::mcp_server_status, p_is_official boolean DEFAULT false, p_oauth_scopes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_system_org_id uuid := '39c38960-d30c-4840-b0c1-c9960de95582'::uuid;
    v_server_id uuid := gen_random_uuid();
    v_executor text := 'mcp.' || p_slug;
    v_bundle_id uuid := gen_random_uuid();
    v_lister_id uuid := gen_random_uuid();
    v_lister_name text := 'bundle:list_' || p_slug;
    v_executor_cfg jsonb;
BEGIN
    IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
        RAISE EXCEPTION 'Slug must match ^[a-z0-9][a-z0-9-]*$ (got: %)', p_slug;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM tool.executor WHERE name = 'matrx-ai-core' AND is_active
    ) THEN
        RAISE EXCEPTION 'Required active executor is missing: matrx-ai-core';
    END IF;
    IF EXISTS (SELECT 1 FROM tool.mcp_server WHERE slug = p_slug) THEN
        RAISE EXCEPTION 'MCP server slug already exists: %', p_slug;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.executor WHERE name = v_executor) THEN
        RAISE EXCEPTION 'Executor already exists: %', v_executor;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.bundle WHERE name = p_slug) THEN
        RAISE EXCEPTION 'Bundle name already exists: %', p_slug;
    END IF;
    IF EXISTS (SELECT 1 FROM tool.definition WHERE name = v_lister_name) THEN
        RAISE EXCEPTION 'Lister tool name already exists: %', v_lister_name;
    END IF;

    INSERT INTO tool.mcp_server (
        id, slug, name, vendor, category, description, transport, auth_strategy,
        endpoint_url, icon_url, color, docs_url, website_url,
        status, is_official, is_featured, has_remote, has_local, supports_mcp_apps,
        oauth_scopes, sort_order
    ) VALUES (
        v_server_id, p_slug, p_name, p_vendor, p_category, p_description,
        p_transport, p_auth_strategy, p_endpoint_url, p_icon_url, p_color, p_docs_url, p_website_url,
        p_status, p_is_official, false,
        p_transport IN ('http','sse'), p_transport = 'stdio', false,
        p_oauth_scopes, 100
    );

    v_executor_cfg := jsonb_build_object(
        'transport', p_transport::text,
        'server_slug', p_slug,
        'endpoint_url', COALESCE(p_endpoint_url, ''),
        'auth_strategy', p_auth_strategy::text
    );
    INSERT INTO tool.executor (name, description, mcp_server_id, config, is_active)
    VALUES (v_executor, 'MCP server runtime - ' || p_name, v_server_id, v_executor_cfg, true);

    INSERT INTO tool.definition (
        id, name, description, parameters, category, source_kind, tool_group,
        is_active, gating, organization_id
    ) VALUES (
        v_lister_id, v_lister_name,
        'Discovery tool - loads the ' || p_name || ' MCP server tool catalog into the active toolset.',
        '{}'::jsonb, 'mcp', 'native', 'core', true, '[]'::jsonb, v_system_org_id
    );

    PERFORM platform.upsert_unit_purpose(
        'tool',
        v_lister_id,
        'Load the ' || p_name || ' tool catalog',
        'Load the registered ' || p_name || ' MCP server tool catalog into the active agent toolset on demand.',
        'A'
    );

    INSERT INTO tool.binding (tool_id, executor_name, is_active, organization_id)
    SELECT v_lister_id, 'matrx-ai-core', true, d.organization_id FROM tool.definition d WHERE d.id = v_lister_id
    ON CONFLICT (tool_id, executor_name) DO UPDATE
    SET is_active = true, updated_at = now();

    INSERT INTO tool.bundle (
        id, name, description, is_system, created_by, lister_tool_id, metadata,
        is_active, organization_id
    ) VALUES (
        v_bundle_id, p_slug,
        'Auto-managed bundle for the ' || p_name || ' MCP server.',
        true, NULL, v_lister_id,
        jsonb_build_object('kind','mcp','server_slug',p_slug,'server_id',v_server_id::text),
        true, v_system_org_id
    );

    RETURN jsonb_build_object(
        'server_id', v_server_id,
        'server_slug', p_slug,
        'executor', v_executor,
        'bundle_id', v_bundle_id,
        'bundle_name', p_slug,
        'lister_tool_id', v_lister_id,
        'lister_name', v_lister_name,
        'next_step', 'POST /api/mcp/servers/' || v_server_id || '/refresh to fetch the catalog'
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.tool_register_mcp_discovered(p_server_id uuid, p_tool_specs jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tool', 'iam'
AS $function$
DECLARE
    v_slug         text;
    v_server_name  text;
    v_executor     text;
    v_spec         jsonb;
    v_count        integer := 0;
    v_local_name   text;
    v_canonical    text;
    v_tool_id      uuid;
    v_allowlist    jsonb;
    v_seen         text[] := '{}';
    v_system_org   constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
    IF jsonb_typeof(p_tool_specs) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: p_tool_specs must be an array';
    END IF;

    SELECT slug, name, metadata->'tool_allowlist'
      INTO v_slug, v_server_name, v_allowlist
      FROM tool.mcp_server
     WHERE id = p_server_id;
    IF v_slug IS NULL THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: server % not found', p_server_id;
    END IF;

    v_executor := 'mcp.' || v_slug;
    IF NOT EXISTS (SELECT 1 FROM tool.executor WHERE name = v_executor AND is_active) THEN
        RAISE EXCEPTION 'tool_register_mcp_discovered: active executor "%" not found', v_executor;
    END IF;

    FOR v_spec IN SELECT value FROM jsonb_array_elements(p_tool_specs) LOOP
        v_local_name := nullif(btrim(coalesce(v_spec->>'name', v_spec->>'local_name')), '');
        IF v_local_name IS NULL THEN
            RAISE EXCEPTION 'tool_register_mcp_discovered: tool spec missing name';
        END IF;
        IF v_allowlist IS NOT NULL
           AND jsonb_typeof(v_allowlist) = 'array'
           AND NOT (v_allowlist ? v_local_name) THEN
            CONTINUE;
        END IF;

        v_canonical := v_executor || '.' || v_local_name;
        v_seen := array_append(v_seen, v_canonical);

        INSERT INTO tool.definition (
            name, description, parameters, output_schema, annotations,
            source_kind, managed_by_server_id, tool_group, organization_id,
            visibility, is_active, deactivated_at
        ) VALUES (
            v_canonical,
            COALESCE(v_spec->>'description', ''),
            COALESCE(v_spec->'parameters', '{}'::jsonb),
            v_spec->'output_schema',
            COALESCE(v_spec->'annotations', '[]'::jsonb),
            'mcp_discovered',
            p_server_id,
            'mcp',
            v_system_org,
            'public',
            true,
            null
        )
        ON CONFLICT (name) DO UPDATE SET
            description          = EXCLUDED.description,
            parameters           = EXCLUDED.parameters,
            output_schema        = EXCLUDED.output_schema,
            annotations          = EXCLUDED.annotations,
            source_kind          = 'mcp_discovered',
            managed_by_server_id = p_server_id,
            tool_group           = 'mcp',
            organization_id      = v_system_org,
            visibility           = 'public',
            is_active            = true,
            deactivated_at       = null,
            updated_at           = now()
        RETURNING id INTO v_tool_id;

        IF NOT EXISTS (
            SELECT 1
              FROM platform.associations_live a
             WHERE a.source_type = 'purpose'
               AND a.target_type = 'tool'
               AND a.target_id = v_tool_id
               AND a.role = 'served_by'
               AND COALESCE(a.position, 0) = 0
        ) THEN
            PERFORM platform.upsert_unit_purpose(
                'tool',
                v_tool_id,
                'Use ' || v_server_name || ': ' || v_local_name,
                COALESCE(
                    nullif(btrim(v_spec->>'description'), ''),
                    'Run the ' || v_local_name || ' capability provided by ' || v_server_name || '.'
                ),
                'A'
            );
        END IF;

        INSERT INTO tool.binding (tool_id, executor_name, is_active, organization_id)
        SELECT v_tool_id, v_executor, true, d.organization_id FROM tool.definition d WHERE d.id = v_tool_id
        ON CONFLICT (tool_id, executor_name) DO UPDATE
        SET is_active = true, updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    UPDATE tool.definition
       SET is_active = false,
           deactivated_at = now(),
           updated_at = now()
     WHERE managed_by_server_id = p_server_id
       AND is_active
       AND NOT (name = ANY(v_seen));

    RETURN v_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.tool_register(p_def jsonb, p_executor_names text[] DEFAULT ARRAY[]::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_id    uuid;
    v_exec  text;
BEGIN
    FOREACH v_exec IN ARRAY p_executor_names LOOP
        IF NOT EXISTS (SELECT 1 FROM tool.executor WHERE name = v_exec) THEN
            RAISE EXCEPTION 'tool_register: executor "%" does not exist', v_exec;
        END IF;
    END LOOP;

    INSERT INTO tool.definition (
        name, description, parameters, output_schema, annotations,
        category, tags, icon, semver, admin_only, tier, gating,
        dedupe_exempt, validation_exempt, source_kind, managed_by_server_id,
        max_client_wait_seconds, tool_group, is_active
    ) VALUES (
        p_def->>'name',
        COALESCE(p_def->>'description', ''),
        COALESCE(p_def->'parameters', '{}'::jsonb),
        p_def->'output_schema',
        COALESCE(p_def->'annotations', '[]'::jsonb),
        p_def->>'category',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_def->'tags', '[]'::jsonb))),
        p_def->>'icon',
        COALESCE(p_def->>'semver', '1.0.0'),
        COALESCE((p_def->>'admin_only')::boolean, false),
        p_def->>'tier',
        COALESCE(p_def->'gating', '[]'::jsonb),
        COALESCE((p_def->>'dedupe_exempt')::boolean, false),
        COALESCE((p_def->>'validation_exempt')::boolean, false),
        COALESCE(p_def->>'source_kind', 'native'),
        (p_def->>'managed_by_server_id')::uuid,
        (p_def->>'max_client_wait_seconds')::integer,
        COALESCE(p_def->>'tool_group', 'core'),
        COALESCE((p_def->>'is_active')::boolean, true)
    )
    RETURNING id INTO v_id;

    INSERT INTO tool.binding (tool_id, executor_name, organization_id)
    SELECT v_id, unnest(p_executor_names), d.organization_id FROM tool.definition d WHERE d.id = v_id
    ON CONFLICT (tool_id, executor_name) DO NOTHING;

    RETURN v_id;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE FORCING PROOF. `tool.binding.organization_id` does not exist yet (batch 6 adds it), so the
-- proof runs the shape on a throwaway copy: the column NOT NULL, the patched statement's SELECT
-- form filling it from the parent, and the OLD statement's VALUES form failing the way it would
-- have in production. Self-undoing: the block ends by raising.
do $proof$
declare v_tool uuid; v_org uuid; v_err text;
begin
  select id, organization_id into v_tool, v_org from tool.definition where organization_id is not null limit 1;
  create table b83_binding_proof (
    tool_id uuid not null, executor_name text not null, is_active boolean not null default true,
    organization_id uuid not null, primary key (tool_id, executor_name));

  -- RED: the statement as it was — no organization named — is exactly the production failure.
  begin
    insert into b83_binding_proof (tool_id, executor_name, is_active) values (v_tool, 'aidream', true);
    raise exception 'proof: the old statement was allowed to write a binding with no organization';
  exception when not_null_violation then
    raise notice 'b83 proof: RED half — the pre-fix statement fails with the production error (null organization_id).';
  end;

  -- GREEN: the statement as this file rewrites it names the parent tool's organization.
  insert into b83_binding_proof (tool_id, executor_name, is_active, organization_id)
  select v_tool, 'aidream', true, d.organization_id from tool.definition d where d.id = v_tool;
  if not exists (select 1 from b83_binding_proof where organization_id = v_org) then
    raise exception 'proof: the rewritten statement did not carry the parent tool''s organization';
  end if;
  raise notice 'b83 proof: GREEN half — the rewritten statement writes the parent tool''s own organization.';
  raise exception 'B83_BINDING_PROOF_UNDO';
exception when others then
  v_err := sqlerrm;
  if v_err <> 'B83_BINDING_PROOF_UNDO' then raise exception 'b83 binding-writer proof FAILED: %', v_err; end if;
  raise notice 'b83 proof: both halves passed; the throwaway table is rolled back.';
end $proof$;
