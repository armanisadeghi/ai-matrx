-- ext_01_custom_entity_definition.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 3.1 (M3a): the tier-2 custom object.
-- An ordinary `entity`, so a custom object is shareable, versioned and reachable through every
-- existing platform mechanism for free (comments, files, notifications, share links, grants).
-- No new mechanism is invented for any of them.
-- p_org_default => false per ext_00 recorded decision 1. Idempotent.

DO $mig$
BEGIN
IF to_regclass('platform.custom_entity_definition') IS NULL THEN
  PERFORM platform.create_entity_table(
    p_schema      => 'platform',
    p_table       => 'custom_entity_definition',
    p_token       => 'custom_entity_definition',
    p_label       => 'Custom Object',
    p_fields      => ARRAY[
      'slug text NOT NULL CHECK (slug ~ ''^[a-z][a-z0-9-]{0,62}$'')',
      'name text NOT NULL',
      'name_plural text NOT NULL',
      'description text',
      'icon text',
      'color text',
      'record_name_template text',
      'validation_mode text NOT NULL DEFAULT ''advisory''
         CHECK (validation_mode IN (''advisory'',''strict''))',
      'is_searchable boolean NOT NULL DEFAULT true',
      'allow_record_sharing boolean NOT NULL DEFAULT false',
      'sensitivity_tier text NOT NULL DEFAULT ''standard''
         CHECK (sensitivity_tier IN (''standard'',''confidential'',''restricted''))',
      'ai_exposure text NOT NULL DEFAULT ''allowed''
         CHECK (ai_exposure IN (''allowed'',''aggregate_only'',''never''))',
      'max_fields integer CHECK (max_fields IS NULL OR max_fields > 0)',
      'max_records integer CHECK (max_records IS NULL OR max_records > 0)',
      'archived_at timestamptz',
      'record_name_backfill_state text NOT NULL DEFAULT ''idle''
         CHECK (record_name_backfill_state IN (''idle'',''pending'',''running'',''failed''))',
      'record_name_backfill_done integer NOT NULL DEFAULT 0',
      'record_name_backfill_error text',
      'CONSTRAINT ced_ai_exposure_follows_sensitivity CHECK (
         sensitivity_tier <> ''restricted'' OR ai_exposure = ''never'')'
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

CREATE UNIQUE INDEX IF NOT EXISTS ced_slug_uq
  ON platform.custom_entity_definition (organization_id, slug)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ced_live_idx
  ON platform.custom_entity_definition (organization_id, slug)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_active, is_scopeable, is_link_shareable, notes)
VALUES
  ('custom_entity_definition','platform','custom_entity_definition','id','created_by','Custom Object',
   '/administration/custom-objects/{id}', true, true, false, false,
   'HRB-010 / SPEC-EXTENSIBILITY 3.1. Registered so 6-C test 2 (sharing a DEFINITION makes its RECORDS readable) is expressible at all: db-rules 6c refuses an iam.permissions row whose resource_type is not registered here. Route is owned by HRB-026 / L14 and must be re-pointed if it lands elsewhere.')
ON CONFLICT (resource_type) DO NOTHING;

DO $mig$
DECLARE v_fail text; v_other integer;
BEGIN
  SELECT string_agg(check_name || COALESCE(': ' || detail, ''), '; ')
    INTO v_fail
    FROM iam.verify_canonical('platform','custom_entity_definition','custom_entity_definition')
   WHERE status IN ('FAIL','WARN');
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'ext_01: platform.custom_entity_definition is not certified: %', v_fail;
  END IF;

  PERFORM platform.ddl_guard_ack(
    p_reason => 'HRB-010 ext_01: platform.custom_entity_definition is created org-explicit with p_org_default=false. The NO-BACKSTOP law forbids _stamp_org_default; every definition row is written with an explicit organization_id.',
    p_by     => 'core-c6',
    p_rule   => 'org_not_null_no_backstop',
    p_object_ref => 'platform.custom_entity_definition'
  );

  SELECT count(*) INTO v_other
    FROM platform.ddl_guard_log
   WHERE acknowledged_at IS NULL AND object_ref LIKE 'platform.custom%';
  IF v_other > 0 THEN
    RAISE EXCEPTION 'ext_01: % unacked DDL-guard row(s) on platform.custom%% under a rule this file did not predict', v_other;
  END IF;
END $mig$;
