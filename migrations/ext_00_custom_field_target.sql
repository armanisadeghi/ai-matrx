-- ext_00_custom_field_target.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.1 (M2): the participation allowlist.
--
-- ONE row per platform.entity_types token that MAY carry tenant-defined custom fields.
-- This table is the whole "adoption is configuration, not surgery" claim (RD-2).
--
-- RECORDED DECISIONS:
--  1. p_org_default => FALSE. `true` attaches public._stamp_org_default, the personal-org
--     backstop the NO-BACKSTOP law forbids and the one HRB-005 refused on all 22 hr.* tables.
--     The resulting org_not_null_no_backstop DDL-guard WARN is acked below, LOG-DRIVEN.
--  2. Target rows carry organization_id = the SYSTEM org. 2.1 describes a platform-level
--     allowlist and NO NULL ORG is absolute, so "platform-level" is expressed the way RD-2
--     already expresses platform-shipped field packs: owned by matrx-system, read by everyone
--     through visibility='public' + system_orgs.global_readable.
--  3. A TARGET ROW CANNOT EXIST BEFORE THE TABLE CAN HOLD VALUES -- enforced structurally by
--     platform._custom_field_target_validate(). ext_14 carries the HR v1 seed, and the live
--     finding that unblocked it.
--
-- Idempotent.

DO $mig$
BEGIN
IF to_regclass('platform.custom_field_target') IS NULL THEN
  PERFORM platform.create_entity_table(
    p_schema      => 'platform',
    p_table       => 'custom_field_target',
    p_token       => 'custom_field_target',
    p_label       => 'Custom Field Target',
    p_fields      => ARRAY[
      'target_token text NOT NULL',
      'is_enabled boolean NOT NULL DEFAULT true',
      'validation_mode text NOT NULL DEFAULT ''advisory''
         CHECK (validation_mode IN (''advisory'',''strict''))',
      'max_fields integer CHECK (max_fields IS NULL OR max_fields > 0)',
      'max_custom_bytes integer CHECK (max_custom_bytes IS NULL OR max_custom_bytes > 0)',
      'sensitivity_ceiling text NOT NULL DEFAULT ''standard''
         CHECK (sensitivity_ceiling IN (''standard'',''confidential'',''restricted''))',
      'ai_exposure_ceiling text NOT NULL DEFAULT ''allowed''
         CHECK (ai_exposure_ceiling IN (''allowed'',''aggregate_only'',''never''))',
      'notes text'
    ],
    p_variant     => 'system',
    p_versioned   => false,
    p_soft_delete => true,
    p_visibility  => 'public',
    p_category    => false,
    p_listed      => true,
    p_org_default => false,
    p_gin_jsonb   => false,
    p_parents     => NULL
  );
END IF;
END $mig$;

CREATE UNIQUE INDEX IF NOT EXISTS cft_token_uq
  ON platform.custom_field_target (target_token)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION platform._custom_field_target_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_schema text;
  v_table  text;
BEGIN
  SELECT et.schema_name, et.table_name INTO v_schema, v_table
    FROM platform.entity_types et
   WHERE et.token = NEW.target_token AND et.is_active;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'custom_field_target: % is not an active platform.entity_types token', NEW.target_token
      USING ERRCODE = 'check_violation',
            HINT = 'A custom-field target is addressed by TOKEN, never by table name. Register the table first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = v_schema AND c.table_name = v_table
       AND c.column_name = 'custom' AND c.data_type = 'jsonb'
  ) THEN
    RAISE EXCEPTION '%.% has no `custom jsonb` column, so token % cannot participate yet', v_schema, v_table, NEW.target_token
      USING ERRCODE = 'check_violation',
            HINT = 'Use platform.adopt_custom_fields(token, ...) — it adds the column, the GIN index and this row in one call (SPEC-EXTENSIBILITY §4.3).';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _validate_target ON platform.custom_field_target;
CREATE TRIGGER _validate_target
  BEFORE INSERT OR UPDATE OF target_token ON platform.custom_field_target
  FOR EACH ROW EXECUTE FUNCTION platform._custom_field_target_validate();

DO $mig$
DECLARE
  v_fail text;
  v_other integer;
BEGIN
  SELECT string_agg(check_name || COALESCE(': ' || detail, ''), '; ')
    INTO v_fail
    FROM iam.verify_canonical('platform','custom_field_target','custom_field_target')
   WHERE status IN ('FAIL','WARN');
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'ext_00: platform.custom_field_target is not certified: %', v_fail;
  END IF;

  PERFORM platform.ddl_guard_ack(
    p_reason => 'HRB-010 ext_00: platform.custom_field_target is created org-explicit with p_org_default=false. The NO-BACKSTOP law (no-db-assigned-org) forbids _stamp_org_default; rows are written with an explicit organization_id (the system org for platform-level allowlist rows).',
    p_by     => 'core-c6',
    p_rule   => 'org_not_null_no_backstop',
    p_object_ref => 'platform.custom_field_target'
  );

  SELECT count(*) INTO v_other
    FROM platform.ddl_guard_log
   WHERE acknowledged_at IS NULL
     AND object_ref LIKE 'platform.custom%';
  IF v_other > 0 THEN
    RAISE EXCEPTION 'ext_00: % unacked DDL-guard row(s) on platform.custom%% under a rule this file did not predict', v_other;
  END IF;
END $mig$;
