-- agx_usage_003_remediation_and_drop_legacy.sql
--
-- One-click remediation RPCs for the Find Usages + Drift system, removal of the
-- superseded legacy drift RPCs, and a hardened agx_purge_versions.
--
--   agx_usage_update_to_active(usage_type, usage_id, mode)
--     mode 'repin_active' (default): move the pin to the snapshot matching
--       agx_agent.version — a pin is a deliberate authoring decision; accepting
--       the new version means moving the pin forward, not converting to floating.
--     mode 'follow_active': use_latest = true (stop pinning).
--     Stored-config reconciliation is intentionally NOT performed — deleting a
--     stored variable key destroys user data that may become valid again.
--   agx_usage_update_all_to_active(agent_id, mode)
--     Bulk repin of every stale, remediable usage the caller may manage.
--
--   Auth: usage owner, OR owner/admin of the usage's organization, OR super
--   admin. (Org caveat per spec: org managers one-click in place; everyone
--   else notifies instead.)
--
--   Drops: agx_check_drift / agx_check_references / agx_accept_version —
--   replaced by agx_usage_scan / agx_usage_report / agx_usage_update_to_active.
--   (check_prompt_app_drift stays: legacy prompt system, different feature.)
--
--   agx_purge_versions rewrite: the live version only preserved agx_shortcut
--   pins (aga_apps / aga_versions / comparison / prompt_app / code-registry pins
--   could be silently destroyed — their FKs are ON DELETE SET NULL or absent)
--   and had NO auth gate despite SECURITY DEFINER. Both fixed.

CREATE OR REPLACE FUNCTION public.agx_usage_update_to_active(
  p_usage_type text,
  p_usage_id   uuid,
  p_mode       text DEFAULT 'repin_active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
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
    SELECT s.user_id, s.organization_id, COALESCE(s.agent_id, sv.agent_id)
      INTO v_owner, v_org, v_agent
    FROM agx_shortcut s LEFT JOIN agx_version sv ON sv.id = s.agent_version_id
    WHERE s.id = p_usage_id;
  ELSIF p_usage_type = 'app' THEN
    SELECT ap.user_id, ap.organization_id, COALESCE(ap.agent_id, av.agent_id)
      INTO v_owner, v_org, v_agent
    FROM aga_apps ap LEFT JOIN agx_version av ON av.id = ap.agent_version_id
    WHERE ap.id = p_usage_id;
  ELSIF p_usage_type = 'prompt_app' THEN
    SELECT pa.user_id, pa.organization_id, pa.prompt_id
      INTO v_owner, v_org, v_agent
    FROM prompt_apps pa WHERE pa.id = p_usage_id;
  ELSIF p_usage_type = 'derived_agent' THEN
    SELECT d.user_id, d.organization_id, d.source_agent_id
      INTO v_owner, v_org, v_agent
    FROM agx_agent d WHERE d.id = p_usage_id AND d.source_agent_id IS NOT NULL;
  ELSIF p_usage_type IN ('scheduled_task', 'surface_binding', 'sms_line', 'comparison') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pinnable',
      'message', 'This usage always follows the active version — nothing to update.');
  ELSIF p_usage_type = 'workflow_node' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_remediable_in_sql',
      'workflow_id', p_usage_id,
      'message', 'Update the agent reference inside the workflow editor.');
  ELSIF p_usage_type = 'code' THEN
    SELECT r.code_path INTO v_code_path FROM agx_usage_registry r WHERE r.id = p_usage_id;
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
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = v_org AND om.user_id = v_uid
        AND om.role IN ('owner', 'admin')));
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'agx_usage_update_to_active: not permitted for this usage' USING ERRCODE = '42501';
  END IF;

  SELECT a.version INTO v_live FROM agx_agent a WHERE a.id = v_agent;
  IF v_live IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'agent_not_found');
  END IF;

  -- Apply ----------------------------------------------------------------------
  IF p_usage_type = 'shortcut' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE agx_shortcut SET use_latest = true, agent_version_id = NULL WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agx_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE agx_shortcut SET agent_version_id = v_target, use_latest = false WHERE id = p_usage_id;
    END IF;

  ELSIF p_usage_type = 'app' THEN
    IF p_mode = 'follow_active' THEN
      UPDATE aga_apps SET use_latest = true, agent_version_id = NULL, pinned_version = NULL
        WHERE id = p_usage_id;
    ELSE
      SELECT v.id INTO v_target FROM agx_version v
        WHERE v.agent_id = v_agent AND v.version_number = v_live;
      IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_snapshot_for_active_version');
      END IF;
      UPDATE aga_apps SET agent_version_id = v_target, use_latest = false, pinned_version = v_live
        WHERE id = p_usage_id;
    END IF;

  ELSIF p_usage_type = 'prompt_app' THEN
    -- prompt apps pin by version NUMBER only; both modes accept the active one
    UPDATE prompt_apps SET pinned_version = v_live WHERE id = p_usage_id;

  ELSIF p_usage_type = 'derived_agent' THEN
    BEGIN
      v_res := public.agx_update_from_source(p_usage_id);
      IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
        RETURN v_res;
      END IF;
      UPDATE agx_agent SET source_snapshot_at = now() WHERE id = p_usage_id;
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
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_update_to_active(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_update_to_active(text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Bulk: repin every stale, remediable usage of one agent the caller may manage.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_usage_update_all_to_active(
  p_agent_id uuid,
  p_mode     text DEFAULT 'repin_active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_super   boolean;
  v_row     record;
  v_res     jsonb;
  v_updated integer := 0;
  v_by_type jsonb := '{}'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_usage_update_all_to_active: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_super := public.is_super_admin();

  FOR v_row IN
    SELECT c.usage_type, c.usage_id
    FROM public.agx_usage_scan_core(p_agent_id, v_uid, 'agent') c
    WHERE c.stale_pin
      AND (v_super OR c.managed_by_caller)
      AND c.usage_type IN ('shortcut', 'app', 'prompt_app', 'derived_agent')
  LOOP
    BEGIN
      v_res := public.agx_usage_update_to_active(v_row.usage_type, v_row.usage_id, p_mode);
      IF COALESCE((v_res ->> 'success')::boolean, false) THEN
        v_updated := v_updated + 1;
        v_by_type := jsonb_set(v_by_type, ARRAY[v_row.usage_type],
          to_jsonb(COALESCE((v_by_type ->> v_row.usage_type)::integer, 0) + 1));
      ELSE
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'usage_type', v_row.usage_type, 'usage_id', v_row.usage_id,
          'reason', v_res ->> 'error'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'usage_type', v_row.usage_type, 'usage_id', v_row.usage_id, 'reason', SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'by_type', v_by_type, 'skipped', v_skipped);
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_usage_update_all_to_active(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_usage_update_all_to_active(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Drop superseded legacy RPCs (replacement map in features/agents/FEATURE.md):
--   agx_check_drift      → agx_usage_report / agx_usage_scan
--   agx_check_references → agx_usage_scan
--   agx_accept_version   → agx_usage_update_to_active
-- ---------------------------------------------------------------------------

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('agx_check_drift', 'agx_check_references', 'agx_accept_version')
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- agx_purge_versions, hardened:
--   * auth gate (owner or super admin) — the live version had NONE
--   * preserves EVERY forward-looking pin holder, not just shortcuts:
--     aga_apps, aga_versions, comparisons, prompt_apps (by number),
--     and the code registry (whose FK is RESTRICT as a backstop)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agx_purge_versions(
  p_agent_id   uuid,
  p_keep_count integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_owner        uuid;
  v_live_version integer;
  v_deleted      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_purge_versions: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT a.user_id, a.version INTO v_owner, v_live_version
  FROM agx_agent a WHERE a.id = p_agent_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;
  IF v_owner IS DISTINCT FROM v_uid AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'agx_purge_versions: only the agent owner may purge versions' USING ERRCODE = '42501';
  END IF;

  WITH to_delete AS (
    SELECT av.id
    FROM agx_version av
    WHERE av.agent_id = p_agent_id
      AND av.version_number <> 1
      AND av.version_number <> v_live_version
      AND av.id NOT IN (SELECT s.agent_version_id  FROM agx_shortcut s  WHERE s.agent_version_id  IS NOT NULL)
      AND av.id NOT IN (SELECT ap.agent_version_id FROM aga_apps ap     WHERE ap.agent_version_id IS NOT NULL)
      AND av.id NOT IN (SELECT v2.agent_version_id FROM aga_versions v2 WHERE v2.agent_version_id IS NOT NULL)
      AND av.id NOT IN (SELECT e.agent_version_snapshot_id FROM cmp_comparison_entries e
                        WHERE e.agent_version_snapshot_id IS NOT NULL)
      AND av.id NOT IN (SELECT r.agent_version_id FROM agx_usage_registry r
                        WHERE r.agent_version_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM prompt_apps pa
                      WHERE pa.prompt_id = p_agent_id
                        AND COALESCE(pa.pinned_version, 1) = av.version_number)
    ORDER BY av.version_number DESC
    OFFSET p_keep_count
  )
  DELETE FROM agx_version WHERE id IN (SELECT td.id FROM to_delete td);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted_count', v_deleted, 'kept_count', p_keep_count);
END;
$fn$;

REVOKE ALL ON FUNCTION public.agx_purge_versions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agx_purge_versions(uuid, integer) TO authenticated;
