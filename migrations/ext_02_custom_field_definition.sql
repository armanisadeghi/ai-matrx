-- ext_02_custom_field_definition.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.2 (M3b): THE ONE field registry, target-parameterized.
-- One row per (organization_id, target, field_key). Serves BOTH tiers (RD-2): `entity_table`
-- rows extend an existing platform record, `custom_entity` rows are a custom object's fields.
-- That single fact is what keeps the client kit small enough to meet D5's few-lines bar.
-- Order matters: the FK points at platform.custom_entity_definition, so ext_01 runs first.
-- p_org_default => false per ext_00 recorded decision 1. Idempotent.

DO $mig$
BEGIN
IF to_regclass('platform.custom_field_definition') IS NULL THEN
  PERFORM platform.create_entity_table(
    p_schema      => 'platform',
    p_table       => 'custom_field_definition',
    p_token       => 'custom_field_definition',
    p_label       => 'Custom Field',
    p_fields      => ARRAY[
      'target_kind text NOT NULL CHECK (target_kind IN (''entity_table'',''custom_entity''))',
      'target_token text',
      'target_definition_id uuid REFERENCES platform.custom_entity_definition(id)',
      'field_key text NOT NULL CHECK (field_key ~ ''^[a-z][a-z0-9_]{0,62}$'')',
      'display_name text NOT NULL',
      'field_type text NOT NULL CHECK (field_type IN (
          ''text'',''long_text'',''number'',''currency'',''boolean'',''date'',''datetime'',
          ''single_select'',''multi_select'',''entity_reference'',''user_reference'',
          ''file'',''url'',''email'',''phone''))',
      'field_order integer NOT NULL DEFAULT 0',
      'is_required boolean NOT NULL DEFAULT false',
      'default_value jsonb',
      'validation_rules jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'display_config jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'options jsonb',
      'option_list_id uuid REFERENCES workbench.udt_structured_lists(id)',
      'reference_target_token text',
      'reference_target_definition_id uuid REFERENCES platform.custom_entity_definition(id)',
      'is_multi boolean NOT NULL DEFAULT false',
      'is_indexed boolean NOT NULL DEFAULT false',
      'index_state text NOT NULL DEFAULT ''none''
         CHECK (index_state IN (''none'',''pending'',''active'',''failed''))',
      'index_name text',
      'index_error text',
      'is_unique boolean NOT NULL DEFAULT false',
      'is_searchable boolean NOT NULL DEFAULT false',
      'sensitivity_tier text NOT NULL DEFAULT ''standard''
         CHECK (sensitivity_tier IN (''standard'',''confidential'',''restricted''))',
      'ai_exposure text NOT NULL DEFAULT ''allowed''
         CHECK (ai_exposure IN (''allowed'',''aggregate_only'',''never''))',
      'archived_at timestamptz',
      'CONSTRAINT cfd_target_xor CHECK (
         (target_kind = ''entity_table''  AND target_token IS NOT NULL AND target_definition_id IS NULL)
      OR (target_kind = ''custom_entity'' AND target_definition_id IS NOT NULL AND target_token IS NULL))',
      'CONSTRAINT cfd_options_xor CHECK (NOT (options IS NOT NULL AND option_list_id IS NOT NULL))',
      'CONSTRAINT cfd_options_only_select CHECK (
         (options IS NULL AND option_list_id IS NULL)
         OR field_type IN (''single_select'',''multi_select''))',
      'CONSTRAINT cfd_options_is_array CHECK (options IS NULL OR jsonb_typeof(options) = ''array'')',
      'CONSTRAINT cfd_reference_only_ref CHECK (
         (reference_target_token IS NULL AND reference_target_definition_id IS NULL)
         OR field_type = ''entity_reference'')',
      'CONSTRAINT cfd_reference_target_xor CHECK (NOT (
         reference_target_token IS NOT NULL AND reference_target_definition_id IS NOT NULL))',
      'CONSTRAINT cfd_multi_only_where_meaningful CHECK (
         NOT is_multi OR field_type IN (''entity_reference'',''user_reference''))',
      'CONSTRAINT cfd_unique_requires_index CHECK (NOT is_unique OR is_indexed)',
      'CONSTRAINT cfd_ai_exposure_follows_sensitivity CHECK (
         sensitivity_tier <> ''restricted'' OR ai_exposure = ''never'')',
      'CONSTRAINT cfd_rules_are_objects CHECK (
         jsonb_typeof(validation_rules) = ''object'' AND jsonb_typeof(display_config) = ''object'')'
    ],
    p_variant     => 'entity',
    p_versioned   => true,
    p_soft_delete => true,
    p_visibility  => 'internal',
    p_category    => false,
    p_listed      => true,
    p_org_default => false,
    p_gin_jsonb   => false,
    p_parents     => NULL
  );
END IF;
END $mig$;

CREATE UNIQUE INDEX IF NOT EXISTS cfd_key_per_table_uq
  ON platform.custom_field_definition (organization_id, target_token, field_key)
  WHERE deleted_at IS NULL AND target_kind = 'entity_table';

CREATE UNIQUE INDEX IF NOT EXISTS cfd_key_per_definition_uq
  ON platform.custom_field_definition (organization_id, target_definition_id, field_key)
  WHERE deleted_at IS NULL AND target_kind = 'custom_entity';

CREATE INDEX IF NOT EXISTS cfd_lookup_idx
  ON platform.custom_field_definition
     (organization_id, target_kind, target_token, target_definition_id, field_order)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS cfd_promotion_due_idx
  ON platform.custom_field_definition (index_state)
  WHERE deleted_at IS NULL AND index_state IN ('pending','failed');

DO $mig$
DECLARE v_fail text; v_other integer;
BEGIN
  SELECT string_agg(check_name || COALESCE(': ' || detail, ''), '; ')
    INTO v_fail
    FROM iam.verify_canonical('platform','custom_field_definition','custom_field_definition')
   WHERE status IN ('FAIL','WARN');
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'ext_02: platform.custom_field_definition is not certified: %', v_fail;
  END IF;

  PERFORM platform.ddl_guard_ack(
    p_reason => 'HRB-010 ext_02: platform.custom_field_definition is created org-explicit with p_org_default=false. The NO-BACKSTOP law forbids _stamp_org_default; every definition row is written with an explicit organization_id (the system org for platform-shipped field packs, per RD-2).',
    p_by     => 'core-c6',
    p_rule   => 'org_not_null_no_backstop',
    p_object_ref => 'platform.custom_field_definition'
  );

  SELECT count(*) INTO v_other
    FROM platform.ddl_guard_log
   WHERE acknowledged_at IS NULL AND object_ref LIKE 'platform.custom%';
  IF v_other > 0 THEN
    RAISE EXCEPTION 'ext_02: % unacked DDL-guard row(s) on platform.custom%% under a rule this file did not predict', v_other;
  END IF;
END $mig$;
