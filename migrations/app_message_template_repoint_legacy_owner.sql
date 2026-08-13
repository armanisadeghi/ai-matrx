-- app.definition + agent.message_template — repoint every DB-side consumer off the
-- legacy owner/visibility columns (user_id, is_public) onto the canonical
-- created_by / visibility, ahead of dropping those columns.
--
-- Doctrine: database-changeover-doctrine.md §8a-1 — this is the "make the DB
-- bivalent, then ship the new writers" step. Both generations of column are
-- still present and populated while this runs, so nothing can fail mid-flight.
--
-- Verified live 2026-08-13 before writing:
--   app.definition            80 rows, created_by 0 null / 0 mismatch vs user_id
--   agent.message_template    10 rows, created_by 0 null / 0 mismatch vs user_id,
--                             visibility already fully migrated (8 public, 0 disagreement)
--
-- The brief for this change asserted ZERO Postgres functions still referenced
-- app.definition.user_id/is_public. That was WRONG — six did, listed below. This
-- is exactly the §8a trap: "function bodies are text and break silently".

begin;

-- ---------------------------------------------------------------------------
-- 1. Backfill the 10 app.definition rows where is_public disagrees with visibility.
--    app.definition has NO constraint banning visibility='public' (unlike
--    agent.definition) — an app IS the public face of an agent.
-- ---------------------------------------------------------------------------
update app.definition
   set visibility = 'public'::platform.visibility
 where is_public
   and visibility <> 'public'::platform.visibility;

-- ---------------------------------------------------------------------------
-- 2. Six functions reading the doomed columns. Bodies only — every signature,
--    volatility, security and search_path is preserved byte-for-byte.
-- ---------------------------------------------------------------------------

-- 2a. agx_usage_scan_core — the 'app' arm selected ap.user_id as owner_user_id.
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

-- 2b. agx_usage_update_to_active — the 'app' ownership lookup.
CREATE OR REPLACE FUNCTION public.agx_usage_update_to_active(p_usage_type text, p_usage_id uuid, p_mode text DEFAULT 'repin_active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_super     boolean;
  v_owner     uuid;
  v_org       uuid;
  v_agent     uuid;
  v_live      integer;
  v_target    uuid;
  v_has_perm  boolean;
  v_res       jsonb;
  v_code_path text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('repin_active', 'follow_active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_mode');
  END IF;
  v_super := public.is_super_admin();

  -- Resolve owner / org / target agent per usage type --------------------------
  IF p_usage_type = 'shortcut' THEN
    SELECT s.created_by, s.organization_id, COALESCE(s.agent_id, sv.agent_id)
      INTO v_owner, v_org, v_agent
    FROM agent.shortcut s LEFT JOIN agent.definition_version sv ON sv.id = s.agent_version_id
    WHERE s.id = p_usage_id;
  ELSIF p_usage_type = 'app' THEN
    SELECT ap.created_by, ap.organization_id, COALESCE(ap.agent_id, av.agent_id)
      INTO v_owner, v_org, v_agent
    FROM app.definition ap LEFT JOIN agent.definition_version av ON av.id = ap.agent_version_id
    WHERE ap.id = p_usage_id;
  ELSIF p_usage_type = 'derived_agent' THEN
    SELECT d.created_by, d.organization_id, d.source_agent_id
      INTO v_owner, v_org, v_agent
    FROM agent.definition d WHERE d.id = p_usage_id AND d.source_agent_id IS NOT NULL;
  ELSIF p_usage_type IN ('scheduled_task', 'surface_binding', 'sms_line', 'comparison') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pinnable',
      'message', 'This usage always follows the active version — nothing to update.');
  ELSIF p_usage_type = 'workflow_node' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_remediable_in_sql',
      'workflow_id', p_usage_id,
      'message', 'Update the agent reference inside the workflow editor.');
  ELSIF p_usage_type = 'code' THEN
    SELECT r.code_path INTO v_code_path FROM agent.usage r WHERE r.id = p_usage_id;
    RETURN jsonb_build_object('success', false, 'error', 'code_managed',
      'code_path', v_code_path,
      'message', 'This usage is pinned in backend code — update the declaration and redeploy.');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_usage_type');
  END IF;

  IF v_agent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  v_has_perm := v_super OR v_owner = v_uid OR (
    v_org IS NOT NULL AND EXISTS (
      SELECT 1 FROM iam.organization_member om
      WHERE om.organization_id = v_org AND om.user_id = v_uid
        AND om.role IN ('owner', 'admin')));
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not permitted for this usage' USING ERRCODE = '42501';
  END IF;

  SELECT a.version INTO v_live FROM agent.definition a WHERE a.id = v_agent;
  IF v_live IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  -- Apply ----------------------------------------------------------------------
  IF p_usage_type = 'shortcut' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE agent.shortcut SET use_latest = true, agent_version_id = NULL WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE agent.shortcut SET agent_version_id = v_target, use_latest = false WHERE id = p_usage_id;
    END IF;

  ELSIF p_usage_type = 'app' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE app.definition SET use_latest = true, agent_version_id = NULL, pinned_version = NULL
        WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agent.definition_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE app.definition SET agent_version_id = v_target, use_latest = false, pinned_version = v_live
        WHERE id = p_usage_id;
    END IF;


  ELSIF p_usage_type = 'derived_agent' THEN
    BEGIN
      v_res := public.agx_update_from_source(p_usage_id);
      IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
        RETURN v_res;
      END IF;
      UPDATE agent.definition SET source_snapshot_at = now() WHERE id = p_usage_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'sync_failed', 'message', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'usage_type', p_usage_type,
    'usage_id', p_usage_id,
    'mode', p_mode,
    'pinned_version_number', CASE WHEN p_mode = 'repin_active' THEN v_live END);
END;
$function$;

-- 2c. check_prompt_app_drift — owner filter.
CREATE OR REPLACE FUNCTION public.check_prompt_app_drift(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(app_id uuid, app_name text, prompt_id uuid, prompt_source_type text, pinned_version integer, current_version integer, versions_behind integer, prompt_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $function$
  SELECT a.id, a.name::text, a.agent_id, 'agent'::text,
    COALESCE(a.pinned_version, av.version_number, ag.version), ag.version,
    GREATEST(ag.version - COALESCE(a.pinned_version, av.version_number, ag.version), 0), ag.name::text
  FROM app.definition a
  JOIN agent.definition ag ON ag.id = a.agent_id
  LEFT JOIN agent.definition_version av ON av.id = a.agent_version_id
  WHERE (p_user_id IS NULL OR a.created_by = p_user_id)
    AND NOT COALESCE(a.use_latest, true)
    AND COALESCE(a.pinned_version, av.version_number, 1) < ag.version;
$function$;

-- 2d. get_aga_public_data — anon publish gate. is_public -> visibility='public'.
CREATE OR REPLACE FUNCTION public.get_aga_public_data(p_slug text DEFAULT NULL::text, p_app_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, slug text, name text, tagline text, description text, category text, tags text[], preview_image_url text, favicon_url text, component_code text, component_language text, allowed_imports jsonb, variable_schema jsonb, layout_config jsonb, styling_config jsonb, shell_kind text, shell_config jsonb, slot_overrides jsonb, slot_code jsonb, total_executions integer, success_rate numeric, agent_id uuid, agent_version_id uuid, use_latest boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    a.id, a.slug, a.name, a.tagline, a.description,
    a.category, a.tags, a.preview_image_url, a.favicon_url,
    a.component_code, a.component_language, a.allowed_imports,
    a.variable_schema, a.layout_config, a.styling_config,
    a.shell_kind, a.shell_config, a.slot_overrides, a.slot_code,
    a.total_executions, a.success_rate,
    a.agent_id, a.agent_version_id, a.use_latest
  FROM app.definition a
  WHERE a.status = 'published'
    AND a.visibility = 'public'::platform.visibility
    AND a.deleted_at IS NULL
    AND (
      (p_app_id IS NOT NULL AND a.id = p_app_id)
      OR (p_slug IS NOT NULL AND a.slug = p_slug)
    )
  LIMIT 1;
$function$;

-- 2e. get_prompt_app_public_data — same gate.
CREATE OR REPLACE FUNCTION public.get_prompt_app_public_data(p_slug text DEFAULT NULL::text, p_app_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, slug text, name text, tagline text, description text, category text, tags text[], preview_image_url text, favicon_url text, component_code text, component_language text, variable_schema jsonb, allowed_imports jsonb, layout_config jsonb, styling_config jsonb, total_executions integer, success_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
  SELECT a.id, a.slug, a.name, a.tagline, a.description, a.category, a.tags, a.preview_image_url, a.favicon_url,
    a.component_code, a.component_language, a.variable_schema, a.allowed_imports, a.layout_config, a.styling_config,
    a.total_executions, a.success_rate
  FROM app.definition a
  WHERE a.status = 'published'
    AND a.visibility = 'public'::platform.visibility
    AND a.deleted_at IS NULL
    AND ((p_app_id IS NOT NULL AND a.id = p_app_id) OR (p_slug IS NOT NULL AND a.slug = p_slug))
  LIMIT 1;
$function$;

-- 2f. get_published_app_with_prompt — the RETURNS TABLE column stays named
--     `user_id` (that IS the client wire contract, per doctrine §8a-1: "API wire
--     field names may stay put — source them from the new column"). Only the
--     source expression moves to created_by.
CREATE OR REPLACE FUNCTION public.get_published_app_with_prompt(p_slug text DEFAULT NULL::text, p_app_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, user_id uuid, prompt_id uuid, slug text, name text, tagline text, description text, category text, tags text[], preview_image_url text, favicon_url text, component_code text, component_language text, variable_schema jsonb, allowed_imports jsonb, layout_config jsonb, styling_config jsonb, status text, total_executions integer, success_rate numeric, prompt_messages jsonb, prompt_settings jsonb, prompt_variable_defaults jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app', 'agent', 'pg_temp'
AS $function$
  SELECT a.id, a.created_by, a.agent_id AS prompt_id, a.slug, a.name, a.tagline, a.description, a.category, a.tags,
    a.preview_image_url, a.favicon_url, a.component_code, a.component_language, a.variable_schema, a.allowed_imports,
    a.layout_config, a.styling_config, a.status, a.total_executions, a.success_rate,
    COALESCE(av.messages, ag.messages), COALESCE(av.settings, ag.settings),
    COALESCE(av.variable_definitions, ag.variable_definitions)
  FROM app.definition a
  JOIN agent.definition ag ON ag.id = a.agent_id
  LEFT JOIN agent.definition_version av ON av.id = a.agent_version_id
  WHERE a.status = 'published'
    AND ((p_app_id IS NOT NULL AND a.id = p_app_id) OR (p_slug IS NOT NULL AND a.slug = p_slug))
  LIMIT 1;
$function$;

-- ---------------------------------------------------------------------------
-- 3. container_resource_counts carried a STALE table reference for this very
--    entity: ('content_template', 'public', 'content_template'). That table
--    moved to agent.message_template, and the function's to_regclass guard
--    silently skipped it — every container reported 0 message templates instead
--    of the real count. Fix-on-sight: the table being certified in this change.
-- ---------------------------------------------------------------------------
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
        select count(*) into v_count from platform.associations a
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

-- ---------------------------------------------------------------------------
-- 4. Shareable-resource registry: message_template still pointed its owner at
--    user_id. ('app' was already created_by.)
-- ---------------------------------------------------------------------------
update platform.shareable_resource_registry
   set owner_column = 'created_by'
 where resource_type = 'message_template'
   and owner_column = 'user_id';

-- ---------------------------------------------------------------------------
-- 5. Replace the two app.definition indexes that are keyed on doomed columns.
--    DROP COLUMN would take them with it and leave the canonical lookups
--    unindexed; create the replacements first.
-- ---------------------------------------------------------------------------
create index if not exists idx_app_definition_status_visibility
  on app.definition using btree (status, visibility)
  where status = 'published';

create index if not exists idx_app_definition_created_by
  on app.definition using btree (created_by)
  where created_by is not null;

commit;
