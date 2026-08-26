-- ext_12_adopt_custom_fields.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 4.3 step 1+2, as ONE call.
-- This IS the "one migration line, one registry row" half of D5's bar: a module adopting
-- tier 1 writes exactly one statement per table and never touches DDL, an index shape, or
-- an org id by hand.

CREATE OR REPLACE FUNCTION platform.adopt_custom_fields(
  p_target_token        text,
  p_validation_mode     text    DEFAULT 'advisory',
  p_sensitivity_ceiling text    DEFAULT 'standard',
  p_ai_exposure_ceiling text    DEFAULT 'allowed',
  p_max_fields          integer DEFAULT NULL,
  p_max_custom_bytes    integer DEFAULT NULL,
  p_notes               text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_schema text; v_table text; v_sys uuid; v_added boolean := false;
  v_index text; v_unacked integer;
BEGIN
  SELECT et.schema_name, et.table_name INTO v_schema, v_table
    FROM platform.entity_types et WHERE et.token = p_target_token AND et.is_active;
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'adopt_custom_fields: % is not an active platform.entity_types token', p_target_token
      USING ERRCODE = 'check_violation',
            HINT = 'Register the table through platform.create_entity_table first. Unregistered = does not exist canonically.';
  END IF;

  -- Platform-level allowlist rows belong to the SYSTEM org (RD-2): NO NULL ORG is
  -- absolute, and matrx-system is global_readable, so every tenant reads it.
  SELECT so.organization_id INTO v_sys FROM iam.system_orgs so WHERE so.global_readable LIMIT 1;
  IF v_sys IS NULL THEN
    RAISE EXCEPTION 'adopt_custom_fields: no global-readable system org is registered'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = v_schema AND c.table_name = v_table AND c.column_name = 'custom') THEN
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN custom jsonb NOT NULL DEFAULT ''{}''::jsonb', v_schema, v_table);
    v_added := true;
  END IF;

  -- jsonb_path_ops, never the default jsonb_ops: 20-30% of table size instead of 60-80%,
  -- and far better degradation as data grows. The ?/?|/?& operators it drops are not
  -- emitted by platform.custom_field_index_expr.
  v_index := v_table || '_custom_gin';
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I USING gin (custom jsonb_path_ops)',
                 v_index, v_schema, v_table);

  INSERT INTO platform.custom_field_target
    (organization_id, target_token, is_enabled, validation_mode,
     max_fields, max_custom_bytes, sensitivity_ceiling, ai_exposure_ceiling, notes)
  VALUES (v_sys, p_target_token, true, p_validation_mode,
          p_max_fields, p_max_custom_bytes, p_sensitivity_ceiling, p_ai_exposure_ceiling, p_notes)
  ON CONFLICT DO NOTHING;

  -- Log-driven ack, scoped to the one rule an ALTER on an org-explicit table re-fires. A
  -- finding under ANY other rule is left unacked on purpose so the caller's own
  -- conformance assertion catches it.
  PERFORM platform.ddl_guard_ack(
    p_reason => 'HRB-010 adopt_custom_fields: added the custom jsonb column to an existing org-explicit table. The NO-BACKSTOP law forbids _stamp_org_default; this ALTER changes nothing about how organization_id is written.',
    p_by     => 'core-c6',
    p_rule   => 'org_not_null_no_backstop',
    p_object_ref => v_schema || '.' || v_table);

  SELECT count(*) INTO v_unacked FROM platform.ddl_guard_log
   WHERE acknowledged_at IS NULL AND object_ref = v_schema || '.' || v_table;

  RETURN jsonb_build_object(
    'ok', true, 'token', p_target_token, 'table', v_schema || '.' || v_table,
    'column_added', v_added, 'gin_index', v_index,
    'unacked_guard_rows', v_unacked);
END $fn$;

GRANT EXECUTE ON FUNCTION platform.adopt_custom_fields(text, text, text, text, integer, integer, text) TO service_role;

COMMENT ON FUNCTION platform.adopt_custom_fields(text, text, text, text, integer, integer, text) IS
'SPEC-EXTENSIBILITY 4.3: a module adopts tier 1 for one table with ONE call. It adds the custom jsonb column, the jsonb_path_ops GIN index, and the participation row together - which is why platform._custom_field_target_validate can refuse an allowlist row for a table that cannot store values.';
