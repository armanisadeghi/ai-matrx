-- agent_surface_to_associations.sql
--
-- Retires the condemned `agent.agent_surface` bespoke M2M in favor of the
-- canonical `platform.associations` edge (source agent → target surface).
-- Scope tier is encoded in the edge `role`:
--   binding:global | binding:u:<user_id> | binding:o:<org_id>
--   | binding:p:<project_id> | binding:t:<task_id>
-- so multiple tiers per (agent, surface) coexist under associations_unique.
-- Binding payload (value_mappings) + tier ids live in edge metadata.
--
-- Idempotent. Count-verified — raises (rolling back) on any unmigrated row.

DO $$
DECLARE
  v_missing integer;
BEGIN
  IF to_regclass('agent.agent_surface') IS NOT NULL THEN

    -- 1. Normalize role on existing agent→surface edges written role-less by
    --    the FE bridge paths. Tier comes from edge metadata.
    --    First drop role-less duplicates whose tier-role twin already exists.
    DELETE FROM platform.associations a
    WHERE a.source_type = 'agent' AND a.target_type = 'surface' AND a.role IS NULL
      AND EXISTS (
        SELECT 1 FROM platform.associations b
        WHERE b.source_type = 'agent' AND b.target_type = 'surface'
          AND b.source_id = a.source_id AND b.target_id = a.target_id
          AND b.role = CASE COALESCE(a.metadata ->> 'tier', 'global')
            WHEN 'user'    THEN 'binding:u:' || COALESCE(a.metadata ->> 'user_id', '')
            WHEN 'org'     THEN 'binding:o:' || COALESCE(a.organization_id::text, '')
            WHEN 'project' THEN 'binding:p:' || COALESCE(a.metadata ->> 'project_id', '')
            WHEN 'task'    THEN 'binding:t:' || COALESCE(a.metadata ->> 'task_id', '')
            ELSE 'binding:global' END
      );

    UPDATE platform.associations a
    SET role = CASE COALESCE(a.metadata ->> 'tier', 'global')
      WHEN 'user'    THEN 'binding:u:' || COALESCE(a.metadata ->> 'user_id', '')
      WHEN 'org'     THEN 'binding:o:' || COALESCE(a.organization_id::text, '')
      WHEN 'project' THEN 'binding:p:' || COALESCE(a.metadata ->> 'project_id', '')
      WHEN 'task'    THEN 'binding:t:' || COALESCE(a.metadata ->> 'task_id', '')
      ELSE 'binding:global' END
    WHERE a.source_type = 'agent' AND a.target_type = 'surface' AND a.role IS NULL;

    -- 2. Backfill any live agent_surface row that never dual-wrote an edge.
    INSERT INTO platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role,
       metadata, created_by, created_at)
    SELECT
      'agent', s.agent_id, 'surface', us.id, s.organization_id,
      CASE
        WHEN s.user_id IS NOT NULL         THEN 'binding:u:' || s.user_id
        WHEN s.organization_id IS NOT NULL THEN 'binding:o:' || s.organization_id
        WHEN s.project_id IS NOT NULL      THEN 'binding:p:' || s.project_id
        WHEN s.task_id IS NOT NULL         THEN 'binding:t:' || s.task_id
        ELSE 'binding:global' END,
      jsonb_build_object(
        'tier', CASE
          WHEN s.user_id IS NOT NULL         THEN 'user'
          WHEN s.organization_id IS NOT NULL THEN 'org'
          WHEN s.project_id IS NOT NULL      THEN 'project'
          WHEN s.task_id IS NOT NULL         THEN 'task'
          ELSE 'global' END,
        'user_id', s.user_id,
        'project_id', s.project_id,
        'task_id', s.task_id,
        'visibility', 'internal',
        'version', 1,
        'value_mappings', COALESCE(s.value_mappings, '{}'::jsonb),
        'legacy_id', s.id,
        'legacy_table', 'agent.agent_surface'),
      s.created_by, s.created_at
    FROM agent.agent_surface s
    JOIN ui.ui_surface us ON us.name = s.surface_name
    WHERE s.deleted_at IS NULL
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    -- 3. Count-verify: every live junction row must now have a tier-role edge.
    SELECT count(*) INTO v_missing
    FROM agent.agent_surface s
    JOIN ui.ui_surface us ON us.name = s.surface_name
    WHERE s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM platform.associations a
        WHERE a.source_type = 'agent' AND a.target_type = 'surface'
          AND a.source_id = s.agent_id AND a.target_id = us.id
          AND a.role = CASE
            WHEN s.user_id IS NOT NULL         THEN 'binding:u:' || s.user_id
            WHEN s.organization_id IS NOT NULL THEN 'binding:o:' || s.organization_id
            WHEN s.project_id IS NOT NULL      THEN 'binding:p:' || s.project_id
            WHEN s.task_id IS NOT NULL         THEN 'binding:t:' || s.task_id
            ELSE 'binding:global' END);
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'agent_surface → associations migration incomplete: % rows unmigrated', v_missing;
    END IF;

    -- 4. Retire the junction (data preserved in graveyard, never dropped).
    ALTER TABLE agent.agent_surface SET SCHEMA graveyard;
    INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, archived_as)
    VALUES ('agent.agent_surface', 'platform.associations',
            'Condemned bespoke agent↔surface M2M (P1–P4, features/surfaces FEATURE.md) replaced by canonical association edges with tier-encoded role',
            'graveyard.agent_surface')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 5. Repoint the entity token: a "binding" row now lives on the edge table.
UPDATE platform.entity_types
SET schema_name = 'platform', table_name = 'associations'
WHERE token = 'agent_surface_binding';
DELETE FROM platform.entity_relationships WHERE child_type = 'agent_surface_binding';

-- 6. menu_surface: same shape + `role` appended (tier-encoded edge role).
CREATE OR REPLACE VIEW agent.menu_surface AS
SELECT a.id,
    a.source_id AS agent_id,
    us.name AS surface_name,
    NULLIF(a.metadata ->> 'user_id', '')::uuid AS user_id,
    a.organization_id,
    NULLIF(a.metadata ->> 'project_id', '')::uuid AS project_id,
    NULLIF(a.metadata ->> 'task_id', '')::uuid AS task_id,
    COALESCE(a.metadata -> 'value_mappings', '{}'::jsonb) AS value_mappings,
    COALESCE((a.metadata ->> 'version')::integer, 1) AS version,
    COALESCE((a.metadata ->> 'visibility')::platform.visibility, 'internal'::platform.visibility) AS visibility,
    a.created_at,
    a.created_at AS updated_at,
    a.created_by,
    a.created_by AS updated_by,
    c.name AS agent_name,
    c.description AS agent_description,
    c.agent_type,
    c.category AS agent_category,
    c.tags AS agent_tags,
    c.variable_definitions AS agent_variable_definitions,
    c.output_schema AS agent_output_schema,
    c.is_active AS agent_is_active,
    c.card_visibility AS agent_card_visibility,
    to_jsonb(c.*) AS agent,
    CASE
        WHEN o.id IS NOT NULL THEN jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description, 'logo_url', o.logo_url, 'is_personal', o.is_personal, 'is_system', o.is_system)
        ELSE NULL::jsonb
    END AS organizations,
    a.role
FROM platform.associations a
    JOIN agent.card c ON c.id = a.source_id
    LEFT JOIN iam.organizations o ON o.id = a.organization_id
    JOIN ui.ui_surface us ON us.id = a.target_id
WHERE a.source_type = 'agent' AND a.target_type = 'surface';

-- 7. Diagram Editor agent ↔ mermaid-editor surface (deliberately skipped while
--    the mechanism was condemned). Global-tier edge, no value mappings.
DO $$
DECLARE
  v_surface uuid;
BEGIN
  SELECT id INTO v_surface FROM ui.ui_surface WHERE name = 'matrx-user/mermaid-editor';
  IF v_surface IS NULL THEN
    RAISE EXCEPTION 'ui_surface matrx-user/mermaid-editor missing — cannot seed Diagram Editor bind';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM agent.definition WHERE id = 'bdaf5ee0-b490-46a4-884c-3786121bb126') THEN
    RAISE EXCEPTION 'Diagram Editor agent bdaf5ee0-b490-46a4-884c-3786121bb126 missing';
  END IF;
  INSERT INTO platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, metadata)
  VALUES
    ('agent', 'bdaf5ee0-b490-46a4-884c-3786121bb126', 'surface', v_surface,
     (SELECT organization_id FROM agent.definition WHERE id = 'bdaf5ee0-b490-46a4-884c-3786121bb126'),
     'binding:global',
     jsonb_build_object('tier', 'global', 'user_id', NULL, 'project_id', NULL,
                        'task_id', NULL, 'visibility', 'internal', 'version', 1,
                        'value_mappings', '{}'::jsonb))
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';

-- 8. create_shortcut_from_agent_surface: associations-only (legacy fallback removed).
CREATE OR REPLACE FUNCTION public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_agent_id      uuid;
  v_surface_name  text;
  v_value_maps    jsonb;
  v_agent         record;
  v_new_id        uuid;
  v_label         text;
  v_description   text;
  v_icon_name     text;
begin
  select a.source_id, us.name, coalesce(a.metadata->'value_mappings','{}'::jsonb)
    into v_agent_id, v_surface_name, v_value_maps
    from platform.associations a
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

  insert into agent.shortcut (
    category_id, label, description, icon_name, agent_id, surface_name,
    value_mappings, user_id, organization_id, project_id, task_id,
    keyboard_shortcut, display_mode, allow_chat, auto_run, show_variable_panel,
    variables_panel_style, show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate, pre_execution_message,
    bypass_gate_seconds, default_user_input, default_variables, context_overrides,
    llm_overrides, response_density, json_extraction, enabled_features, use_latest,
    agent_version_id, is_active
  ) values (
    p_category_id, v_label, v_description, v_icon_name, v_agent_id, v_surface_name,
    coalesce((p_overrides->'value_mappings')::jsonb, v_value_maps),
    p_user_id, p_organization_id, p_project_id, p_task_id,
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

  return v_new_id;
end;
$function$;

-- 9. agx_usage_scan_core: surface_binding branch reads platform.associations.
CREATE OR REPLACE FUNCTION public.agx_usage_scan_core(p_agent_id uuid, p_viewer uuid, p_scope text DEFAULT 'agent'::text)
 RETURNS TABLE(usage_type text, usage_id uuid, node_id text, label text, owner_user_id uuid, organization_id uuid, organization_name text, org_manager_user_ids uuid[], agent_id uuid, agent_name text, current_version integer, pin_mode text, pinned_version_id uuid, pinned_version_number integer, versions_behind integer, stale_pin boolean, is_usage_active boolean, severity text, findings jsonb, config jsonb, managed_by_caller boolean, usage_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'scheduler', 'communication', 'agent', 'iam', 'app', 'workflow', 'pg_temp'
AS $function$
WITH usages AS (
  SELECT
    'shortcut'::text AS usage_type, s.id AS usage_id, NULL::text AS node_id,
    s.label, s.user_id AS owner_user_id, s.organization_id,
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
    'app', ap.id, NULL, ap.name, ap.user_id, ap.organization_id,
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
  FROM platform.associations sf
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
    'derived_agent', d.id, NULL, d.name, d.user_id, d.organization_id,
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
    cs.user_id, cs.organization_id,
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

NOTIFY pgrst, 'reload schema';
