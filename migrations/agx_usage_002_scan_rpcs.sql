-- agx_usage_002_scan_rpcs.sql
--
-- The Find Usages + Drift Detection scan engine.
--
-- Approach: agent → versions → scan. The target agent's version-id set is
-- resolved first (indexed probes), then every usage surface is UNION-scanned
-- matching EITHER the base agent id OR any of its version ids — version-based
-- usages can never be missed. Every reference column is dual-resolved (a uuid
-- might be an agent id or a version id; LEFT JOIN both and COALESCE).
--
-- Usage surfaces scanned (forward-looking only):
--   shortcut         agx_shortcut          (pin: agent_version_id + use_latest)
--   app              aga_apps              (pin: agent_version_id + use_latest)
--   prompt_app       prompt_apps           (pin: pinned_version NUMBER; prompts
--                                           share UUIDs with agx_agent post-migration)
--   scheduled_task   sch_agent_task        (follows active)
--   surface_binding  agx_agent_surface     (follows active)
--   sms_line         sms_conversations     (text ai_agent_id, follows active)
--   workflow_node    wf_definition.nodes[] (config.agent_id + is_version)
--   derived_agent    agx_agent.source_agent_id (snapshot via source_snapshot_at)
--   comparison       cmp_comparison_entries (severity capped at info)
--   code             agx_usage_registry    (backend code pins, agx_usage_001)
--
-- Drift model (severity: breaking > silent_breaking > warning > info):
--   missing_variable         stored var key absent from effective definition  → breaking
--   unmet_required_variable  required+defaultless var absent from stored keys → breaking
--                            (suppressed for interactive usages — a visible
--                             variable panel collects it at runtime)
--   missing_context_slot     stored slot key absent from effective definition → silent_breaking
--   stale_pin                pinned version_number <> agx_agent.version       → warning
--                            (info when the pinned↔live contract is identical —
--                             only instructions/model/settings moved)
--   source_snapshot_stale    derived agent behind its source                  → warning/info
--   agent_unavailable        archived/inactive agent with an active usage     → breaking
--
-- Drift is computed against the EFFECTIVE definition: pinned usages run their
-- snapshot (compare stored config to the snapshot; the stale pin itself is a
-- separate finding); follow-active usages run the live agx_agent row.
-- "Pinned to active" means version_number == agx_agent.version — a promoted
-- older version that is now active is NOT stale.
--
-- Privacy (user variant): full-detail rows only for usages the caller owns or
-- org-manages (owner/admin in organization_members) — everyone else's collapse
-- to per-(usage_type, org) aggregates. Not a security wall: a "don't decide on
-- someone else's behalf" wall. Admin variant (super admin) sees everything.

-- ---------------------------------------------------------------------------
-- Helpers (pure)
-- ---------------------------------------------------------------------------

-- Keys of a jsonb object, '{}' for anything else (incl. NULL / arrays).
CREATE OR REPLACE FUNCTION public.agx_usage_jsonb_keys(p jsonb)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'object'
              THEN COALESCE((SELECT array_agg(k) FROM jsonb_object_keys(p) k
                             WHERE btrim(k) <> ''), '{}'::text[])
              ELSE '{}'::text[] END
$$;

-- Text values of a jsonb object (e.g. legacy scope_mappings {uiKey: varName}).
CREATE OR REPLACE FUNCTION public.agx_usage_jsonb_text_values(p jsonb)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p) = 'object'
              THEN COALESCE((SELECT array_agg(v) FROM jsonb_each_text(p) e(k, v)
                             WHERE v IS NOT NULL AND btrim(v) <> ''), '{}'::text[])
              ELSE '{}'::text[] END
$$;

-- Extract the structural contract from definition jsonb:
--   var_names          [{name,...}] array names (or object keys)
--   required_var_names required entries WITHOUT a usable default — only those
--                      can break a usage that stores no value
--   slot_keys          [{key,...}] array keys, plain-string arrays, or object keys
CREATE OR REPLACE FUNCTION public.agx_usage_contract(p_vars jsonb, p_slots jsonb)
RETURNS TABLE (var_names text[], required_var_names text[], slot_keys text[])
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    CASE jsonb_typeof(p_vars)
      WHEN 'array' THEN COALESCE(
        (SELECT array_agg(e ->> 'name') FROM jsonb_array_elements(p_vars) e
          WHERE e ? 'name' AND btrim(e ->> 'name') <> ''), '{}'::text[])
      WHEN 'object' THEN public.agx_usage_jsonb_keys(p_vars)
      ELSE '{}'::text[]
    END,
    CASE jsonb_typeof(p_vars)
      WHEN 'array' THEN COALESCE(
        (SELECT array_agg(e ->> 'name') FROM jsonb_array_elements(p_vars) e
          WHERE e ? 'name' AND btrim(e ->> 'name') <> ''
            AND COALESCE((e ->> 'required')::boolean, false)
            AND COALESCE(e ->> 'defaultValue', e ->> 'default', '') = ''), '{}'::text[])
      ELSE '{}'::text[]
    END,
    CASE jsonb_typeof(p_slots)
      WHEN 'array' THEN COALESCE(
        (SELECT array_agg(x.k) FROM (
           SELECT COALESCE(e ->> 'key', e ->> 'name',
                           CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' END) AS k
           FROM jsonb_array_elements(p_slots) e
         ) x WHERE x.k IS NOT NULL AND btrim(x.k) <> ''), '{}'::text[])
      WHEN 'object' THEN public.agx_usage_jsonb_keys(p_slots)
      ELSE '{}'::text[]
    END
$$;

-- Build the findings array for one usage row.
CREATE OR REPLACE FUNCTION public.agx_usage_eval(
  p_usage_type        text,
  p_stored_var_keys   text[],
  p_stored_slot_keys  text[],
  p_var_names         text[],
  p_required_var_names text[],
  p_slot_keys         text[],
  p_is_interactive    boolean,
  p_pin_mode          text,
  p_stale_pin         boolean,
  p_contract_changed  boolean,
  p_agent_unavailable boolean
) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  WITH missing_vars AS (
    -- a stored key naming a current slot is fine: value mappings may target slots
    SELECT DISTINCT k FROM unnest(p_stored_var_keys) k
    WHERE NOT (k = ANY (p_var_names)) AND NOT (k = ANY (p_slot_keys))
  ),
  unmet_required AS (
    SELECT DISTINCT k FROM unnest(p_required_var_names) k
    WHERE NOT (k = ANY (p_stored_var_keys))
  ),
  missing_slots AS (
    SELECT DISTINCT k FROM unnest(p_stored_slot_keys) k
    WHERE NOT (k = ANY (p_slot_keys))
  ),
  f(j) AS (
    SELECT jsonb_build_object(
             'drift_class', 'agent_unavailable', 'severity', 'breaking',
             'detail', '{}'::jsonb)
    WHERE p_agent_unavailable
    UNION ALL
    SELECT jsonb_build_object(
             'drift_class', 'missing_variable', 'severity', 'breaking',
             'detail', jsonb_build_object('keys', (SELECT jsonb_agg(k ORDER BY k) FROM missing_vars)))
    WHERE EXISTS (SELECT 1 FROM missing_vars)
    UNION ALL
    SELECT jsonb_build_object(
             'drift_class', 'unmet_required_variable', 'severity', 'breaking',
             'detail', jsonb_build_object('keys', (SELECT jsonb_agg(k ORDER BY k) FROM unmet_required)))
    WHERE NOT p_is_interactive AND EXISTS (SELECT 1 FROM unmet_required)
    UNION ALL
    SELECT jsonb_build_object(
             'drift_class', 'missing_context_slot', 'severity', 'silent_breaking',
             'detail', jsonb_build_object('keys', (SELECT jsonb_agg(k ORDER BY k) FROM missing_slots)))
    WHERE EXISTS (SELECT 1 FROM missing_slots)
    UNION ALL
    SELECT jsonb_build_object(
             'drift_class', CASE WHEN p_usage_type = 'derived_agent'
                                 THEN 'source_snapshot_stale' ELSE 'stale_pin' END,
             'severity', CASE WHEN p_contract_changed THEN 'warning' ELSE 'info' END,
             'detail', '{}'::jsonb)
    WHERE p_pin_mode = 'pinned' AND p_stale_pin
  )
  SELECT COALESCE(jsonb_agg(j), '[]'::jsonb) FROM f
$$;

REVOKE ALL ON FUNCTION public.agx_usage_jsonb_keys(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agx_usage_jsonb_text_values(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agx_usage_contract(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agx_usage_eval(text, text[], text[], text[], text[], text[], boolean, text, boolean, boolean, boolean) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Core engine — NOT callable by clients (no EXECUTE for anon/authenticated).
-- p_scope: 'agent' (one agent) | 'all' (every agent — weekly scan / reports).
-- p_viewer feeds managed_by_caller only (NULL = nothing managed).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_scan_core(
  p_agent_id uuid,
  p_viewer   uuid,
  p_scope    text DEFAULT 'agent'
) RETURNS TABLE (
  usage_type            text,
  usage_id              uuid,
  node_id               text,
  label                 text,
  owner_user_id         uuid,
  organization_id       uuid,
  organization_name     text,
  org_manager_user_ids  uuid[],
  agent_id              uuid,
  agent_name            text,
  current_version       integer,
  pin_mode              text,
  pinned_version_id     uuid,
  pinned_version_number integer,
  versions_behind       integer,
  stale_pin             boolean,
  is_usage_active       boolean,
  severity              text,
  findings              jsonb,
  config                jsonb,
  managed_by_caller     boolean,
  usage_updated_at      timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
WITH usages AS (
  -- ---- shortcut ------------------------------------------------------------
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
  FROM agx_shortcut s
  LEFT JOIN agx_version sv ON sv.id = s.agent_version_id

  UNION ALL
  -- ---- app (aga_apps) -------------------------------------------------------
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
  FROM aga_apps ap
  LEFT JOIN agx_version av ON av.id = ap.agent_version_id

  UNION ALL
  -- ---- prompt_app (prompt_apps; prompts share UUIDs with agx_agent) ----------
  SELECT
    'prompt_app', pa.id, NULL, pa.name, pa.user_id, pa.organization_id,
    pa.prompt_id,
    'pinned',
    pv.id,
    COALESCE(pa.pinned_version, 1),
    (SELECT c.var_names FROM public.agx_usage_contract(pa.variable_schema, '[]'::jsonb) c),
    '{}'::text[],
    false,
    (pa.status = 'published'),
    jsonb_build_object(
      'variable_schema', pa.variable_schema, 'pinned_version', pa.pinned_version,
      'status', pa.status, 'slug', pa.slug),
    pa.updated_at
  FROM prompt_apps pa
  JOIN agx_agent pag ON pag.id = pa.prompt_id
  LEFT JOIN agx_version pv ON pv.agent_id = pa.prompt_id
                          AND pv.version_number = COALESCE(pa.pinned_version, 1)

  UNION ALL
  -- ---- scheduled_task --------------------------------------------------------
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
  FROM sch_agent_task sat
  JOIN sch_task st ON st.id = sat.id
  LEFT JOIN agx_agent ta ON ta.id = sat.agent_id
  LEFT JOIN agx_version tv ON tv.id = sat.agent_id
  WHERE st.kind = 'agent' AND st.deleted_at IS NULL AND sat.agent_id IS NOT NULL

  UNION ALL
  -- ---- surface_binding -------------------------------------------------------
  SELECT
    'surface_binding', sf.id, NULL, sf.surface_name, sf.user_id, sf.organization_id,
    COALESCE(sa.id, sv2.agent_id),
    CASE WHEN sv2.id IS NOT NULL THEN 'pinned' ELSE 'follow_active' END,
    sv2.id, sv2.version_number,
    public.agx_usage_jsonb_keys(sf.value_mappings),
    '{}'::text[],
    false,
    true,
    jsonb_build_object('value_mappings', sf.value_mappings, 'surface_name', sf.surface_name),
    sf.created_at
  FROM agx_agent_surface sf
  LEFT JOIN agx_agent sa ON sa.id = sf.agent_id
  LEFT JOIN agx_version sv2 ON sv2.id = sf.agent_id

  UNION ALL
  -- ---- sms_line (ai_agent_id is TEXT) -----------------------------------------
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
  FROM sms_conversations sc
  CROSS JOIN LATERAL (
    SELECT CASE WHEN sc.ai_agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN sc.ai_agent_id::uuid END AS ref_id
  ) rid
  LEFT JOIN agx_agent ma ON ma.id = rid.ref_id
  LEFT JOIN agx_version mv ON mv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  -- ---- workflow_node -----------------------------------------------------------
  SELECT
    'workflow_node', w.id, n.elem ->> 'id',
    w.name || ' · ' || COALESCE(n.elem -> 'data' ->> 'label', n.elem ->> 'id'),
    w.user_id, w.organization_id,
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
  FROM wf_definition w
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.nodes) = 'array' THEN w.nodes ELSE '[]'::jsonb END) n(elem)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN (n.elem -> 'data' -> 'config' ->> 'agent_id')
                     ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (n.elem -> 'data' -> 'config' ->> 'agent_id')::uuid END AS ref_id
  ) rid
  LEFT JOIN agx_agent wa ON wa.id = rid.ref_id
  LEFT JOIN agx_version wv ON wv.id = rid.ref_id
  WHERE rid.ref_id IS NOT NULL

  UNION ALL
  -- ---- derived_agent ------------------------------------------------------------
  SELECT
    'derived_agent', d.id, NULL, d.name, d.user_id, d.organization_id,
    d.source_agent_id,
    'pinned',
    dpv.id, dpv.version_number,
    '{}'::text[], '{}'::text[],
    true,  -- its own definition is independently editable; unmet-required N/A
    (d.is_active AND NOT d.is_archived),
    jsonb_build_object('source_snapshot_at', d.source_snapshot_at, 'derived_version', d.version),
    d.updated_at
  FROM agx_agent d
  LEFT JOIN LATERAL (
    SELECT v.id, v.version_number FROM agx_version v
    WHERE v.agent_id = d.source_agent_id
      AND (d.source_snapshot_at IS NULL OR v.changed_at <= d.source_snapshot_at)
    ORDER BY v.version_number DESC LIMIT 1
  ) dpv ON true
  WHERE d.source_agent_id IS NOT NULL

  UNION ALL
  -- ---- comparison (info-only context; severity capped in final select) ----------
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
  FROM cmp_comparison_entries e
  LEFT JOIN cmp_comparison_sets cs ON cs.id = e.comparison_set_id
  LEFT JOIN agx_agent ca ON ca.id = e.agent_id
  LEFT JOIN agx_version cv ON cv.id = e.agent_id
  LEFT JOIN agx_version cv2 ON cv2.id = e.agent_version_snapshot_id

  UNION ALL
  -- ---- code (agx_usage_registry) --------------------------------------------------
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
  FROM agx_usage_registry r
  LEFT JOIN agx_version rv ON rv.id = r.agent_version_id
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
    (SELECT array_agg(om.user_id) FROM organization_members om
      WHERE om.organization_id = u.organization_id AND om.role IN ('owner', 'admin')) AS r_org_managers,
    (u.pin_mode = 'pinned' AND u.pinned_version_number IS NOT NULL
      AND u.pinned_version_number <> ag.version) AS r_stale_pin
  FROM usages u
  JOIN agx_agent ag ON ag.id = u.target_agent_id
  CROSS JOIN LATERAL public.agx_usage_contract(ag.variable_definitions, ag.context_slots) lc
  LEFT JOIN agx_version pvrow ON pvrow.id = u.pinned_version_id
  LEFT JOIN LATERAL (
    SELECT c.var_names, c.required_var_names, c.slot_keys
    FROM public.agx_usage_contract(pvrow.variable_definitions, pvrow.context_slots) c
    WHERE pvrow.id IS NOT NULL
  ) pc ON true
  LEFT JOIN organizations org ON org.id = u.organization_id
  WHERE u.target_agent_id IS NOT NULL
    AND (p_scope = 'all' OR u.target_agent_id = p_agent_id)
),
evaluated AS (
  SELECT
    e.*,
    -- effective contract: the pinned snapshot when pinned (and found), else live
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
           SELECT 1 FROM organization_members om
           WHERE om.organization_id = f.organization_id
             AND om.user_id = p_viewer AND om.role IN ('owner', 'admin'))))),
  f.usage_updated_at
FROM finalized f
$$;

REVOKE ALL ON FUNCTION public.agx_usage_scan_core(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- User variant: own + org-managed usages in full detail; everyone else's
-- collapsed to per-(usage_type, org) aggregates. Code rows always detailed
-- (registry metadata is platform-public).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_scan(p_agent_id uuid)
RETURNS TABLE (
  row_kind              text,
  usage_type            text,
  usage_id              uuid,
  node_id               text,
  label                 text,
  owner_user_id         uuid,
  organization_id       uuid,
  organization_name     text,
  org_manager_user_ids  uuid[],
  agent_id              uuid,
  agent_name            text,
  current_version       integer,
  pin_mode              text,
  pinned_version_id     uuid,
  pinned_version_number integer,
  versions_behind       integer,
  stale_pin             boolean,
  is_usage_active       boolean,
  severity              text,
  findings              jsonb,
  config                jsonb,
  managed_by_caller     boolean,
  usage_updated_at      timestamptz,
  agg_usage_count       integer,
  agg_breaking          integer,
  agg_silent            integer,
  agg_warning           integer,
  agg_info              integer,
  agg_stale_pins        integer,
  agg_owner_user_ids    uuid[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_super  boolean;
  v_access text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_scan: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_super := public.is_super_admin();

  SELECT gal.access_level INTO v_access
  FROM public.agx_get_access_level(p_agent_id) gal;
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'agx_usage_scan: agent % not found', p_agent_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_super OR v_access IN ('owner', 'admin', 'editor')) THEN
    RAISE EXCEPTION 'agx_usage_scan: edit access to the agent is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(p_agent_id, v_uid, 'agent')
  )
  SELECT
    'usage'::text,
    r.usage_type, r.usage_id, r.node_id, r.label,
    r.owner_user_id, r.organization_id, r.organization_name, r.org_manager_user_ids,
    r.agent_id, r.agent_name, r.current_version,
    r.pin_mode, r.pinned_version_id, r.pinned_version_number, r.versions_behind,
    r.stale_pin, r.is_usage_active, r.severity, r.findings, r.config,
    r.managed_by_caller, r.usage_updated_at,
    NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
    NULL::integer, NULL::uuid[]
  FROM r
  WHERE v_super OR r.managed_by_caller OR r.usage_type = 'code'

  UNION ALL

  SELECT
    'aggregate'::text,
    r.usage_type, NULL::uuid, NULL::text, NULL::text,
    NULL::uuid, r.organization_id, r.organization_name, r.org_manager_user_ids,
    r.agent_id, r.agent_name, r.current_version,
    NULL::text, NULL::uuid, NULL::integer, NULL::integer,
    false, NULL::boolean,
    CASE
      WHEN bool_or(r.severity = 'breaking')        THEN 'breaking'
      WHEN bool_or(r.severity = 'silent_breaking') THEN 'silent_breaking'
      WHEN bool_or(r.severity = 'warning')         THEN 'warning'
      WHEN bool_or(r.severity = 'info')            THEN 'info'
    END,
    '[]'::jsonb, NULL::jsonb, false, NULL::timestamptz,
    count(*)::integer,
    (count(*) FILTER (WHERE r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.stale_pin))::integer,
    array_agg(DISTINCT r.owner_user_id) FILTER (WHERE r.owner_user_id IS NOT NULL)
  FROM r
  WHERE NOT (v_super OR r.managed_by_caller OR r.usage_type = 'code')
  GROUP BY r.usage_type, r.organization_id, r.organization_name, r.org_manager_user_ids,
           r.agent_id, r.agent_name, r.current_version;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_scan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_scan(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin variant: super admin only, full detail for everyone. Same shape.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_scan_admin(p_agent_id uuid)
RETURNS TABLE (
  row_kind              text,
  usage_type            text,
  usage_id              uuid,
  node_id               text,
  label                 text,
  owner_user_id         uuid,
  organization_id       uuid,
  organization_name     text,
  org_manager_user_ids  uuid[],
  agent_id              uuid,
  agent_name            text,
  current_version       integer,
  pin_mode              text,
  pinned_version_id     uuid,
  pinned_version_number integer,
  versions_behind       integer,
  stale_pin             boolean,
  is_usage_active       boolean,
  severity              text,
  findings              jsonb,
  config                jsonb,
  managed_by_caller     boolean,
  usage_updated_at      timestamptz,
  agg_usage_count       integer,
  agg_breaking          integer,
  agg_silent            integer,
  agg_warning           integer,
  agg_info              integer,
  agg_stale_pins        integer,
  agg_owner_user_ids    uuid[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'agx_usage_scan_admin: super admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'usage'::text,
    r.usage_type, r.usage_id, r.node_id, r.label,
    r.owner_user_id, r.organization_id, r.organization_name, r.org_manager_user_ids,
    r.agent_id, r.agent_name, r.current_version,
    r.pin_mode, r.pinned_version_id, r.pinned_version_number, r.versions_behind,
    r.stale_pin, r.is_usage_active, r.severity, r.findings, r.config,
    r.managed_by_caller, r.usage_updated_at,
    NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
    NULL::integer, NULL::uuid[]
  FROM public.agx_usage_scan_core(p_agent_id, v_uid, 'agent') r;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_scan_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_scan_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Report (user): one row per agent the caller owns, org-manages, or has
-- usages of — red flags across ALL the caller's agents at once.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_report()
RETURNS TABLE (
  agent_id              uuid,
  agent_name            text,
  current_version       integer,
  agent_is_active       boolean,
  owned_by_caller       boolean,
  my_usage_count        integer,
  my_breaking           integer,
  my_silent             integer,
  my_warning            integer,
  my_info               integer,
  my_stale_pins         integer,
  others_usage_count    integer,
  others_redflag_count  integer,
  by_type               jsonb,
  alert_id              uuid,
  alert_status          text,
  alert_severity        text,
  alert_detected_at     timestamptz,
  alert_last_scanned_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_report: not authenticated' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, v_uid, 'all')
  ),
  agent_scope AS (
    SELECT a.id, a.name, a.version, (a.is_active AND NOT a.is_archived) AS live,
           (a.user_id = v_uid
            OR (a.organization_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM organization_members om
                  WHERE om.organization_id = a.organization_id
                    AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))) AS oversees
    FROM agx_agent a
    WHERE a.user_id = v_uid
       OR (a.organization_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM organization_members om
             WHERE om.organization_id = a.organization_id
               AND om.user_id = v_uid AND om.role IN ('owner', 'admin')))
       OR EXISTS (SELECT 1 FROM r WHERE r.agent_id = a.id AND r.managed_by_caller)
  )
  SELECT
    s.id, s.name, s.version, s.live, s.oversees,
    (count(*) FILTER (WHERE r.managed_by_caller))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.managed_by_caller AND r.stale_pin))::integer,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller))::integer END,
    CASE WHEN s.oversees THEN (count(*) FILTER (WHERE NOT r.managed_by_caller AND r.is_usage_active
                                AND r.severity IN ('breaking', 'silent_breaking', 'warning')))::integer END,
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r2.usage_type, count(*) AS n FROM r r2
       WHERE r2.agent_id = s.id AND (r2.managed_by_caller OR s.oversees)
       GROUP BY r2.usage_type) t), '{}'::jsonb),
    al.id, al.status, al.severity, al.detected_at, al.last_scanned_at
  FROM agent_scope s
  LEFT JOIN r ON r.agent_id = s.id
  LEFT JOIN LATERAL (
    SELECT a2.id, a2.status, a2.severity, a2.detected_at, a2.last_scanned_at
    FROM agx_drift_alert a2
    WHERE a2.user_id = v_uid AND a2.agent_id = s.id
      AND a2.status IN ('pending', 'acknowledged')
    ORDER BY a2.detected_at DESC LIMIT 1
  ) al ON true
  GROUP BY s.id, s.name, s.version, s.live, s.oversees,
           al.id, al.status, al.severity, al.detected_at, al.last_scanned_at;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_report() TO authenticated;

-- ---------------------------------------------------------------------------
-- Report (admin): platform-wide rollup per agent with any usages.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_report_admin()
RETURNS TABLE (
  agent_id          uuid,
  agent_name        text,
  current_version   integer,
  agent_is_active   boolean,
  agent_owner_id    uuid,
  agent_owner_email text,
  usage_count       integer,
  breaking          integer,
  silent            integer,
  warning           integer,
  info              integer,
  stale_pins        integer,
  affected_users    integer,
  owners            jsonb,
  by_type           jsonb,
  open_alerts       integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'agx_usage_report_admin: super admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public.agx_usage_scan_core(NULL, NULL, 'all')
  )
  SELECT
    a.id, a.name, a.version, (a.is_active AND NOT a.is_archived),
    a.user_id, u.email::text,
    count(r.usage_id)::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'breaking'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'silent_breaking'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'warning'))::integer,
    (count(*) FILTER (WHERE r.is_usage_active AND r.severity = 'info'))::integer,
    (count(*) FILTER (WHERE r.stale_pin))::integer,
    (count(DISTINCT r.owner_user_id))::integer,
    COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('user_id', r2.owner_user_id))
              FROM r r2 WHERE r2.agent_id = a.id AND r2.owner_user_id IS NOT NULL), '[]'::jsonb),
    COALESCE((SELECT jsonb_object_agg(t.usage_type, t.n) FROM (
       SELECT r3.usage_type, count(*) AS n FROM r r3
       WHERE r3.agent_id = a.id GROUP BY r3.usage_type) t), '{}'::jsonb),
    (SELECT count(*) FROM agx_drift_alert al
      WHERE al.agent_id = a.id AND al.status IN ('pending', 'acknowledged'))::integer
  FROM agx_agent a
  JOIN r ON r.agent_id = a.id
  LEFT JOIN auth.users u ON u.id = a.user_id
  GROUP BY a.id, a.name, a.version, a.is_active, a.is_archived, a.user_id, u.email;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_report_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_report_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Historical context counts (lazy, separate from the interactive scan).
-- No drift is computed on history — counts only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_history_counts(p_agent_id uuid)
RETURNS TABLE (source text, total bigint, last_used_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_super  boolean;
  v_access text;
  v_vids   uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_history_counts: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_super := public.is_super_admin();
  SELECT gal.access_level INTO v_access FROM public.agx_get_access_level(p_agent_id) gal;
  IF NOT (v_super OR v_access IN ('owner', 'admin', 'editor')) THEN
    RAISE EXCEPTION 'agx_usage_history_counts: edit access to the agent is required' USING ERRCODE = '42501';
  END IF;

  v_vids := ARRAY(SELECT v.id FROM agx_version v WHERE v.agent_id = p_agent_id);

  RETURN QUERY
  SELECT 'conversations'::text, count(*), max(c.created_at) FROM cx_conversation c
    WHERE c.initial_agent_id = p_agent_id OR c.initial_agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'requests', count(*), max(q.created_at) FROM cx_user_request q
    WHERE q.agent_id = p_agent_id OR q.agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'messages', count(*), max(m.created_at) FROM cx_message m
    WHERE m.agent_id = p_agent_id
  UNION ALL
  SELECT 'workflow_runs', count(*), max(w.created_at) FROM wf_run w
    WHERE w.agent_id = p_agent_id OR w.agent_version_id = ANY (v_vids)
  UNION ALL
  SELECT 'research', count(*), max(x.created_at) FROM (
    SELECT ra.created_at FROM rs_analysis ra WHERE ra.agent_id = p_agent_id
    UNION ALL SELECT rd.created_at FROM rs_document rd WHERE rd.agent_id = p_agent_id
    UNION ALL SELECT rsyn.created_at FROM rs_synthesis rsyn WHERE rsyn.agent_id = p_agent_id
  ) x
  UNION ALL
  SELECT 'page_extractions', count(*), max(pj.created_at) FROM page_extraction_jobs pj
    WHERE pj.agent_id = p_agent_id
  UNION ALL
  SELECT 'context_access', count(*), NULL::timestamptz FROM ctx_context_access_log cl
    WHERE cl.agent_id = p_agent_id
  UNION ALL
  SELECT 'errors', count(*), NULL::timestamptz FROM system_error se
    WHERE se.agent_id = p_agent_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_history_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_history_counts(uuid) TO authenticated;
