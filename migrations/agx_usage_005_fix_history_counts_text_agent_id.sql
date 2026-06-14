-- agx_usage_005_fix_history_counts_text_agent_id.sql
--
-- Fix: agx_usage_history_counts errored for EVERY agent with
--   "operator does not exist: text = uuid"
-- because rs_analysis / rs_document / rs_synthesis store agent_id as TEXT
-- (every other historical table uses uuid). The lazy "Historical usage"
-- expander in the Find Usages window therefore failed 100% of the time.
--
-- Cast p_agent_id to text in the three research branches only. Everything
-- else is unchanged. Function signature is identical, so no db-types churn.

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
  -- rs_* store agent_id as TEXT — compare in text space.
  SELECT 'research', count(*), max(x.created_at) FROM (
    SELECT ra.created_at FROM rs_analysis ra WHERE ra.agent_id = p_agent_id::text
    UNION ALL SELECT rd.created_at FROM rs_document rd WHERE rd.agent_id = p_agent_id::text
    UNION ALL SELECT rsyn.created_at FROM rs_synthesis rsyn WHERE rsyn.agent_id = p_agent_id::text
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
