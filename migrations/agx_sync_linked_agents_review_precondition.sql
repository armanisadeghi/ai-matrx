-- Bind a linked-agent sync to the exact saved definitions the user reviewed.
--
-- The reviewed entry point locks both rows, then rejects either updated_at
-- changing after the comparison loaded. The original RPC remains as a
-- backwards-compatible wrapper; all interactive comparison surfaces use the
-- reviewed entry point.

CREATE OR REPLACE FUNCTION public.agx_sync_linked_agents_reviewed(
  p_from_id uuid,
  p_to_id uuid,
  p_include_identity boolean,
  p_expected_from_updated_at timestamptz,
  p_expected_to_updated_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from        record;
  v_to          record;
  v_uid         uuid := auth.uid();
  v_derived_id  uuid;
  v_identity    boolean := COALESCE(p_include_identity, true);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'Cannot sync an agent with itself';
  END IF;

  -- Stable lock order prevents reverse-direction syncs from deadlocking.
  PERFORM id
  FROM agent.definition
  WHERE id IN (p_from_id, p_to_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_from FROM agent.definition WHERE id = p_from_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source agent not found';
  END IF;

  SELECT * INTO v_to FROM agent.definition WHERE id = p_to_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target agent not found';
  END IF;

  IF p_expected_from_updated_at IS NOT NULL
     AND v_from.updated_at IS DISTINCT FROM p_expected_from_updated_at THEN
    RAISE EXCEPTION 'Source agent changed after review. Refresh the comparison and try again';
  END IF;

  IF p_expected_to_updated_at IS NOT NULL
     AND v_to.updated_at IS DISTINCT FROM p_expected_to_updated_at THEN
    RAISE EXCEPTION 'Target agent changed after review. Refresh the comparison and try again';
  END IF;

  IF v_to.source_agent_id = v_from.id THEN
    v_derived_id := v_to.id;
  ELSIF v_from.source_agent_id = v_to.id THEN
    v_derived_id := v_from.id;
  ELSE
    RAISE EXCEPTION 'Agents are not linked (no shared lineage)';
  END IF;

  IF NOT (v_from.agent_type = 'builtin' AND v_from.is_active) THEN
    IF NOT iam.has_access_for(v_uid, 'agent', v_from.id, 'viewer')
       AND v_from.is_public = false THEN
      RAISE EXCEPTION 'Access denied to source agent';
    END IF;
  END IF;

  IF v_to.agent_type = 'builtin' THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can sync into a system agent';
    END IF;
  ELSE
    IF v_to.user_id IS DISTINCT FROM v_uid AND NOT is_super_admin() THEN
      RAISE EXCEPTION 'You can only sync into an agent you own';
    END IF;
  END IF;

  UPDATE agent.definition SET
    name                 = CASE WHEN v_identity THEN v_from.name         ELSE name        END,
    description          = CASE WHEN v_identity THEN v_from.description ELSE description END,
    category             = CASE WHEN v_identity THEN v_from.category    ELSE category    END,
    tags                 = CASE WHEN v_identity THEN v_from.tags        ELSE tags        END,
    messages             = v_from.messages,
    variable_definitions = v_from.variable_definitions,
    model_id             = v_from.model_id,
    model_tiers          = v_from.model_tiers,
    settings             = v_from.settings,
    output_schema        = v_from.output_schema,
    tools                = v_from.tools,
    custom_tools         = v_from.custom_tools,
    context_slots        = v_from.context_slots,
    mcp_servers          = v_from.mcp_servers,
    tool_config          = v_from.tool_config,
    skill_config         = v_from.skill_config,
    matrx_actions        = v_from.matrx_actions,
    ui_gates             = v_from.ui_gates,
    default_rag_boost    = v_from.default_rag_boost,
    rag_awareness_mode   = v_from.rag_awareness_mode,
    updated_at           = now()
  WHERE id = v_to.id;

  UPDATE agent.definition
  SET source_snapshot_at = now()
  WHERE id = v_derived_id;

  RETURN v_to.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_sync_linked_agents_reviewed(
  uuid,
  uuid,
  boolean,
  timestamptz,
  timestamptz
) TO authenticated;

-- Preserve the established RPC contract for older callers while keeping one
-- implementation of the copy rules. Interactive review surfaces call the
-- reviewed function directly with both saved timestamps.
CREATE OR REPLACE FUNCTION public.agx_sync_linked_agents(
  p_from_id uuid,
  p_to_id uuid,
  p_include_identity boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.agx_sync_linked_agents_reviewed(
    p_from_id,
    p_to_id,
    p_include_identity,
    NULL,
    NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_sync_linked_agents(uuid, uuid, boolean)
  TO authenticated;
