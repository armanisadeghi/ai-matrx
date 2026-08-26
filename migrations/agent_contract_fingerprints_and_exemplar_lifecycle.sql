-- Contract fingerprints for agent definitions + exemplar lifecycle RPCs.
-- Input contract = structural shape of variable_definitions + context_policies (via agx_usage_contract).
-- Output contract = output_schema::text (json column - key order is meaningful, kept deliberately).
-- Version rows STAMP contract_change (immutable fact); sample staleness is DERIVED at read time.

-- 1. Columns
ALTER TABLE agent.definition
  ADD COLUMN IF NOT EXISTS input_contract jsonb,
  ADD COLUMN IF NOT EXISTS input_contract_hash text,
  ADD COLUMN IF NOT EXISTS output_contract_hash text;

ALTER TABLE agent.definition_version
  ADD COLUMN IF NOT EXISTS input_contract jsonb,
  ADD COLUMN IF NOT EXISTS input_contract_hash text,
  ADD COLUMN IF NOT EXISTS output_contract_hash text,
  ADD COLUMN IF NOT EXISTS contract_change text,
  ADD COLUMN IF NOT EXISTS contract_break_declared text;

ALTER TABLE agent.definition_version DROP CONSTRAINT IF EXISTS definition_version_contract_change_check;
ALTER TABLE agent.definition_version ADD CONSTRAINT definition_version_contract_change_check
  CHECK (contract_change IS NULL OR contract_change IN ('input','output','both'));
ALTER TABLE agent.definition_version DROP CONSTRAINT IF EXISTS definition_version_contract_break_declared_check;
ALTER TABLE agent.definition_version ADD CONSTRAINT definition_version_contract_break_declared_check
  CHECK (contract_break_declared IS NULL OR contract_break_declared IN ('input','output','both'));

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.agx_input_contract(p_vars jsonb, p_slots jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'var_names',          to_jsonb(ARRAY(SELECT unnest(c.var_names) ORDER BY 1)),
    'required_var_names', to_jsonb(ARRAY(SELECT unnest(c.required_var_names) ORDER BY 1)),
    'slot_keys',          to_jsonb(ARRAY(SELECT unnest(c.slot_keys) ORDER BY 1))
  )
  FROM public.agx_usage_contract(p_vars, p_slots) c
$$;

CREATE OR REPLACE FUNCTION public.agx_contract_hash(p_contract jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(p_contract::text, ''))
$$;

-- 3. Backfill BEFORE attaching triggers (so OLD hashes are always populated afterward)
ALTER TABLE agent.definition_version DISABLE TRIGGER USER;

UPDATE agent.definition_version v SET
  input_contract      = public.agx_input_contract(v.variable_definitions, v.context_policies),
  input_contract_hash = public.agx_contract_hash(public.agx_input_contract(v.variable_definitions, v.context_policies)),
  output_contract_hash = md5(coalesce(v.output_schema::text, ''))
WHERE v.input_contract_hash IS NULL;

WITH d AS (
  SELECT id,
    input_contract_hash, output_contract_hash,
    lag(input_contract_hash)  OVER w AS prev_in,
    lag(output_contract_hash) OVER w AS prev_out
  FROM agent.definition_version
  WINDOW w AS (PARTITION BY agent_id ORDER BY version_number)
)
UPDATE agent.definition_version v
SET contract_change = CASE
  WHEN d.prev_in IS NULL AND d.prev_out IS NULL THEN NULL
  WHEN d.input_contract_hash IS DISTINCT FROM d.prev_in
   AND d.output_contract_hash IS DISTINCT FROM d.prev_out THEN 'both'
  WHEN d.input_contract_hash IS DISTINCT FROM d.prev_in  THEN 'input'
  WHEN d.output_contract_hash IS DISTINCT FROM d.prev_out THEN 'output'
  ELSE NULL END
FROM d WHERE d.id = v.id;

ALTER TABLE agent.definition_version ENABLE TRIGGER USER;

ALTER TABLE agent.definition DISABLE TRIGGER USER;
UPDATE agent.definition d SET
  input_contract      = public.agx_input_contract(d.variable_definitions, d.context_policies),
  input_contract_hash = public.agx_contract_hash(public.agx_input_contract(d.variable_definitions, d.context_policies)),
  output_contract_hash = md5(coalesce(d.output_schema::text, ''))
WHERE d.input_contract_hash IS NULL;
ALTER TABLE agent.definition ENABLE TRIGGER USER;

-- Exemplars: stamp the contract they are assumed captured under (current head) + head version
ALTER TABLE agent.exemplar DISABLE TRIGGER USER;
UPDATE agent.exemplar e SET
  input_contract_hash  = d.input_contract_hash,
  output_contract_hash = d.output_contract_hash,
  agent_version        = d.version
FROM agent.definition d
WHERE d.id = e.agent_id AND e.input_contract_hash IS NULL;
ALTER TABLE agent.exemplar ENABLE TRIGGER USER;

-- 4. Always-on contract stamp on the head (fires before trg_agx_* by name order)
CREATE OR REPLACE FUNCTION public.trg_agx_stamp_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.input_contract := public.agx_input_contract(NEW.variable_definitions, NEW.context_policies);
  NEW.input_contract_hash := public.agx_contract_hash(NEW.input_contract);
  NEW.output_contract_hash := md5(coalesce(NEW.output_schema::text, ''));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS _stamp_contract ON agent.definition;
CREATE TRIGGER _stamp_contract BEFORE INSERT OR UPDATE ON agent.definition
  FOR EACH ROW EXECUTE FUNCTION public.trg_agx_stamp_contract();

-- 5. Snapshot trigger: carry hashes + stamp contract_change (auto, immutable fact)
CREATE OR REPLACE FUNCTION public.trg_agx_agent_snapshot_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_next integer; v_note text; v_skip text; v_contract_change text;
BEGIN
  BEGIN v_skip := current_setting('app.skip_version_snapshot', true); EXCEPTION WHEN OTHERS THEN v_skip := NULL; END;
  IF v_skip = 'true' THEN RETURN NEW; END IF;
  IF (OLD.agent_type IS NOT DISTINCT FROM NEW.agent_type
      AND OLD.name IS NOT DISTINCT FROM NEW.name
      AND OLD.description IS NOT DISTINCT FROM NEW.description
      AND OLD.messages IS NOT DISTINCT FROM NEW.messages
      AND OLD.variable_definitions IS NOT DISTINCT FROM NEW.variable_definitions
      AND OLD.model_id IS NOT DISTINCT FROM NEW.model_id
      AND OLD.model_tiers IS NOT DISTINCT FROM NEW.model_tiers
      AND OLD.settings IS NOT DISTINCT FROM NEW.settings
      AND OLD.output_schema::text IS NOT DISTINCT FROM NEW.output_schema::text
      AND OLD.tools IS NOT DISTINCT FROM NEW.tools
      AND OLD.custom_tools IS NOT DISTINCT FROM NEW.custom_tools
      AND OLD.context_policies IS NOT DISTINCT FROM NEW.context_policies
      AND OLD.auto_context_disabled IS NOT DISTINCT FROM NEW.auto_context_disabled
      AND OLD.category IS NOT DISTINCT FROM NEW.category
      AND OLD.tags IS NOT DISTINCT FROM NEW.tags
      AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active
      AND OLD.mcp_servers IS NOT DISTINCT FROM NEW.mcp_servers
      AND OLD.tool_config IS NOT DISTINCT FROM NEW.tool_config
      AND OLD.skill_config IS NOT DISTINCT FROM NEW.skill_config
      AND OLD.matrx_actions IS NOT DISTINCT FROM NEW.matrx_actions
      AND OLD.ui_gates IS NOT DISTINCT FROM NEW.ui_gates
      AND OLD.default_rag_boost IS NOT DISTINCT FROM NEW.default_rag_boost
      AND OLD.rag_awareness_mode IS NOT DISTINCT FROM NEW.rag_awareness_mode
      AND OLD.input_kind IS NOT DISTINCT FROM NEW.input_kind) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
  FROM agent.definition_version WHERE agent_id = OLD.id;
  BEGIN v_note := current_setting('app.change_note', true); EXCEPTION WHEN OTHERS THEN v_note := NULL; END;
  IF OLD.input_contract_hash IS NOT NULL OR OLD.output_contract_hash IS NOT NULL THEN
    v_contract_change := CASE
      WHEN OLD.input_contract_hash IS DISTINCT FROM NEW.input_contract_hash
       AND OLD.output_contract_hash IS DISTINCT FROM NEW.output_contract_hash THEN 'both'
      WHEN OLD.input_contract_hash IS DISTINCT FROM NEW.input_contract_hash THEN 'input'
      WHEN OLD.output_contract_hash IS DISTINCT FROM NEW.output_contract_hash THEN 'output'
      ELSE NULL END;
  END IF;
  INSERT INTO agent.definition_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_policies, auto_context_disabled, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    default_rag_boost, rag_awareness_mode, input_kind,
    input_contract, input_contract_hash, output_contract_hash, contract_change,
    changed_at, change_note
  )
  VALUES (
    NEW.id, v_next, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_policies, NEW.auto_context_disabled, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    NEW.default_rag_boost, NEW.rag_awareness_mode, NEW.input_kind,
    NEW.input_contract, NEW.input_contract_hash, NEW.output_contract_hash, v_contract_change,
    now(), v_note
  );
  NEW.version := v_next;
  RETURN NEW;
END;
$function$;

-- 6. v1 snapshot on INSERT carries the hashes (contract_change NULL - nothing to compare against)
CREATE OR REPLACE FUNCTION public.trg_agx_agent_create_v1_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO agent.definition_version (
    agent_id, version_number, agent_type, name, description, messages,
    variable_definitions, model_id, model_tiers, settings, output_schema,
    tools, custom_tools, context_policies, auto_context_disabled, category, tags, is_active,
    mcp_servers, tool_config, skill_config, matrx_actions, ui_gates,
    default_rag_boost, rag_awareness_mode, input_kind,
    input_contract, input_contract_hash, output_contract_hash,
    changed_at, change_note
  )
  VALUES (
    NEW.id, 1, NEW.agent_type, NEW.name, NEW.description, NEW.messages,
    NEW.variable_definitions, NEW.model_id, NEW.model_tiers, NEW.settings, NEW.output_schema,
    NEW.tools, NEW.custom_tools, NEW.context_policies, NEW.auto_context_disabled, NEW.category, NEW.tags, NEW.is_active,
    NEW.mcp_servers, NEW.tool_config, NEW.skill_config, NEW.matrx_actions, NEW.ui_gates,
    NEW.default_rag_boost, NEW.rag_awareness_mode, NEW.input_kind,
    NEW.input_contract, NEW.input_contract_hash, NEW.output_contract_hash,
    now(), 'Initial creation'
  );
  RETURN NEW;
END;
$function$;

-- 7. Version history returns the contract facts
DROP FUNCTION IF EXISTS public.agx_get_version_history(uuid, integer, integer);
CREATE FUNCTION public.agx_get_version_history(p_agent_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(
  version_id uuid, version_number integer, name text, changed_at timestamptz, change_note text,
  contract_change text, contract_break_declared text, input_contract_hash text, output_contract_hash text
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT av.id, av.version_number, av.name, av.changed_at, av.change_note,
         av.contract_change, av.contract_break_declared, av.input_contract_hash, av.output_contract_hash
  FROM agent.definition_version av
  WHERE av.agent_id = p_agent_id
  ORDER BY av.version_number DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

-- 8. Manual contract-break declaration (for prompt-level breaks hashes cannot see)
CREATE OR REPLACE FUNCTION public.agx_declare_contract_break(p_agent_id uuid, p_version_number integer, p_kind text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_kind IS NOT NULL AND p_kind NOT IN ('input','output','both') THEN
    RAISE EXCEPTION 'invalid contract break kind: %', p_kind;
  END IF;
  IF NOT (is_platform_admin() OR EXISTS (
    SELECT 1 FROM agent.definition d
    WHERE d.id = p_agent_id
      AND (d.created_by = (SELECT auth.uid()) OR iam.has_access('agent', d.id, 'editor'))
  )) THEN
    RAISE EXCEPTION 'not authorized to declare a contract break on this agent';
  END IF;
  UPDATE agent.definition_version
  SET contract_break_declared = p_kind
  WHERE agent_id = p_agent_id AND version_number = p_version_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version % not found for agent %', p_version_number, p_agent_id;
  END IF;
END $$;

-- 9. Approve a test case, enforcing the knob-governed cap
CREATE OR REPLACE FUNCTION public.agx_exemplar_approve(p_exemplar_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_agent uuid; v_cap integer; v_approved integer;
BEGIN
  SELECT e.agent_id INTO v_agent FROM agent.exemplar e
  WHERE e.id = p_exemplar_id AND e.deleted_at IS NULL;
  IF v_agent IS NULL THEN RAISE EXCEPTION 'test case % not found', p_exemplar_id; END IF;
  IF NOT (is_platform_admin() OR EXISTS (
    SELECT 1 FROM agent.exemplar e
    WHERE e.id = p_exemplar_id
      AND (e.created_by = (SELECT auth.uid())
           OR iam.has_access('agent_exemplar', e.id, 'editor')
           OR iam.has_access('agent', e.agent_id, 'editor'))
  )) THEN
    RAISE EXCEPTION 'not authorized to approve this test case';
  END IF;
  SELECT (value #>> '{}')::integer INTO v_cap
  FROM platform.feature_knob WHERE feature='agent_exemplars' AND key='max_approved_per_agent';
  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'feature knob agent_exemplars.max_approved_per_agent is missing';
  END IF;
  SELECT count(*) INTO v_approved FROM agent.exemplar
  WHERE agent_id = v_agent AND status='approved' AND deleted_at IS NULL AND id <> p_exemplar_id;
  IF v_approved >= v_cap THEN
    RAISE EXCEPTION 'approved test-case cap reached for this agent (% of %). Archive one first.', v_approved, v_cap
      USING ERRCODE = 'check_violation';
  END IF;
  -- Approval is a human confirmation that the sample fits the CURRENT contract,
  -- so it (re)stamps the head's hashes + version; staleness stays derived.
  UPDATE agent.exemplar e SET
    status = 'approved',
    input_contract_hash = d.input_contract_hash,
    output_contract_hash = d.output_contract_hash,
    agent_version = d.version
  FROM agent.definition d
  WHERE e.id = p_exemplar_id AND d.id = e.agent_id;
END $$;

-- 10. The cap is a knob, never a constant (limits-are-knobs)
INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description, set_by, basis, review_due)
SELECT 'agent_exemplars', 'max_approved_per_agent', '3'::jsonb, '3'::jsonb, 'number', 'test cases', 1, 20,
  'Max approved test cases per agent',
  'Ceiling on APPROVED sample-input test cases per agent (candidates are unlimited). Enforced by public.agx_exemplar_approve.',
  'agent',
  'Arman specified 1-3 samples per agent (2026-08-25); 3 is the stated maximum. Candidates are capped separately by the auto-capture target.',
  '2026-11-01'
WHERE NOT EXISTS (SELECT 1 FROM platform.feature_knob WHERE feature='agent_exemplars' AND key='max_approved_per_agent');

NOTIFY pgrst, 'reload schema';
