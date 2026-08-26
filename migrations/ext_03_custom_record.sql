-- ext_03_custom_record.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 3.2 (M4): the shared records table.
--
-- RD-1: ONE physical table under ONE registered token, the live workbench.udt_dataset_rows
-- precedent. A `component` of custom_entity_definition, so access resolves through
-- iam.accessible_entity_ids('custom_entity_definition', level) ONCE PER QUERY, never per row.
--
-- RECORDED DECISIONS:
--  1. p_visibility => 'none' (the literal string), NOT NULL as 3.2 writes it.
--     platform.create_entity_table tests `p_visibility <> 'none'` and REFUSES a component that
--     carries visibility; NULL makes that test evaluate to NULL and works only by accident.
--  2. The three-argument jsonb_to_tsvector(regconfig, jsonb, jsonb) is IMMUTABLE live
--     (verified: provolatile = 'i'), so the generated search_vector column stands and the
--     trigger fallback 3.2 anticipated is not needed.
--  3. The declared association type seeded here is corrected by ext_18a/ext_18b/ext_18c --
--     read those before touching custom_record edges.
-- p_org_default => false per ext_00 recorded decision 1. Idempotent.

DO $mig$
BEGIN
IF to_regclass('platform.custom_record') IS NULL THEN
  PERFORM platform.create_entity_table(
    p_schema      => 'platform',
    p_table       => 'custom_record',
    p_token       => 'custom_record',
    p_label       => 'Custom Record',
    p_fields      => ARRAY[
      'entity_definition_id uuid NOT NULL REFERENCES platform.custom_entity_definition(id)',
      'data jsonb NOT NULL DEFAULT ''{}''::jsonb',
      'record_name text',
      'external_key text',
      'CONSTRAINT custom_record_data_is_object CHECK (jsonb_typeof(data) = ''object'')'
    ],
    p_variant     => 'component',
    p_versioned   => true,
    p_soft_delete => true,
    p_visibility  => 'none',
    p_category    => false,
    p_listed      => false,
    p_org_default => false,
    p_gin_jsonb   => false,
    p_parents     => ARRAY['custom_entity_definition:entity_definition_id']
  );
END IF;
END $mig$;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='platform' AND table_name='custom_record' AND column_name='search_vector'
  ) THEN
    ALTER TABLE platform.custom_record
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english'::regconfig, coalesce(record_name, ''))
        || jsonb_to_tsvector('english'::regconfig, data, '["string"]'::jsonb)
      ) STORED;
  END IF;
END $mig$;

CREATE INDEX IF NOT EXISTS custom_record_scope_idx
  ON platform.custom_record (organization_id, entity_definition_id, id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS custom_record_data_gin
  ON platform.custom_record USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS custom_record_search_idx
  ON platform.custom_record USING gin (search_vector);
CREATE UNIQUE INDEX IF NOT EXISTS custom_record_external_key_uq
  ON platform.custom_record (organization_id, entity_definition_id, external_key)
  WHERE deleted_at IS NULL AND external_key IS NOT NULL;

INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, display_label,
   url_path_template, rls_uses_has_permission, is_active, is_scopeable, is_link_shareable, notes)
VALUES
  ('custom_record','platform','custom_record','id','created_by','Custom Record',
   '/administration/custom-objects/record/{id}', true, true, false, false,
   'HRB-010 / SPEC-EXTENSIBILITY 3.2. Registered so the definition-level allow_record_sharing arm is expressible at all (db-rules 6c refuses an unregistered resource_type). Whether a grant may actually be CREATED is gated per definition by platform._custom_record_grant_guard (ext_10) - the generated component policy''s direct-grant arm is unconditional, so the gate has to live at grant time.')
ON CONFLICT (resource_type) DO NOTHING;

INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
VALUES ('custom_record','custom_record',NULL,'none','viewer', true,
        'RD-1: a custom relationship is NEVER an access grant. container_side=none is the platform expression of no conveyance; conveys_max is NOT NULL and inert while container_side=none. label is deliberately NULL -- see ext_18a.')
ON CONFLICT (source_type, target_type) DO NOTHING;

DO $mig$
DECLARE v_fail text; v_other integer; v_n integer;
BEGIN
  SELECT string_agg(check_name || COALESCE(': ' || detail, ''), '; ')
    INTO v_fail
    FROM iam.verify_canonical('platform','custom_record','custom_record')
   WHERE status IN ('FAIL','WARN');
  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'ext_03: platform.custom_record is not certified: %', v_fail;
  END IF;

  SELECT count(*) INTO v_n FROM platform.entity_relationships
   WHERE child_type='custom_record' AND parent_type='custom_entity_definition'
     AND fk_column='entity_definition_id' AND kind='composition';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ext_03: expected exactly 1 composition row custom_record -> custom_entity_definition, found %', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='platform' AND table_name='custom_record' AND column_name='visibility') THEN
    RAISE EXCEPTION 'ext_03: custom_record must not carry a visibility column (THE COMPONENT OWNERSHIP LAW)';
  END IF;

  PERFORM platform.ddl_guard_ack(
    p_reason => 'HRB-010 ext_03: platform.custom_record is created org-explicit with p_org_default=false. The NO-BACKSTOP law forbids _stamp_org_default; every record is written with an explicit organization_id matching its definition.',
    p_by     => 'core-c6',
    p_rule   => 'org_not_null_no_backstop',
    p_object_ref => 'platform.custom_record'
  );

  SELECT count(*) INTO v_other
    FROM platform.ddl_guard_log
   WHERE acknowledged_at IS NULL AND object_ref LIKE 'platform.custom%';
  IF v_other > 0 THEN
    RAISE EXCEPTION 'ext_03: % unacked DDL-guard row(s) on platform.custom%% under a rule this file did not predict', v_other;
  END IF;
END $mig$;
