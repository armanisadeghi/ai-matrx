-- ext_07_extensibility_knobs.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 8: the configuration register (D13).
-- Every ceiling in this primitive is a knob with an agent-set platform default, a recorded
-- basis and a dated review. Nothing here is a constant in code.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due)
VALUES
 ('extensibility','custom_fields.enabled','true','true','boolean',NULL,NULL,NULL,NULL,
  'Custom fields enabled','Whether a registered target may carry tenant-defined fields at all.','agent',
  'Participation is data, not a hardcoded list (RD-2). True per registered target; the allowlist row is the real gate.','2026-10-25'),
 ('extensibility','custom_fields.validation_mode','"advisory"','"advisory"','enum',NULL,NULL,NULL,'["advisory","strict"]',
  'Default validation mode','Mode handed to platform.validate_custom_values when a target declares none.','agent',
  'Matches the CMS default; strict is opt-in per target so adopting the primitive never breaks an existing writer.','2026-10-25'),
 ('extensibility','custom_fields.max_fields_per_target','50','50','integer','fields',1,500,NULL,
  'Max custom fields per target','Ceiling on live definitions for one token in one organization.','agent',
  'Between BambooHR''s small HR set and Salesforce''s 25-800 per edition; generous for real HR use, far under index pain.','2026-10-25'),
 ('extensibility','custom_fields.max_options_per_select','500','500','integer','options',1,5000,NULL,
  'Max options per select','Ceiling on a single_select / multi_select option list.','agent',
  'Attio allows 5,000; 500 keeps a dropdown usable and the validation fixture finite.','2026-10-25'),
 ('extensibility','custom_fields.max_option_label_chars','200','200','integer','characters',1,3000,NULL,
  'Max option label length','Ceiling on one option label.','agent',
  'HubSpot allows 3,000; 200 is a label, not a document.','2026-10-25'),
 ('extensibility','custom_fields.max_custom_bytes_per_row','65536','65536','integer','bytes',1024,1048576,NULL,
  'Max custom bytes per row','Ceiling on one row''s custom jsonb, counted by platform.cf_item_byte_size.','agent',
  'Keeps a row''s jsonb inside a page-ish budget; the CMS byte-cap precedent.','2026-10-25'),
 ('extensibility','custom_fields.max_keys_per_row','200','200','integer','keys',1,2000,NULL,
  'Max custom keys per row','Backstop against unbounded key growth in one row.','agent',
  'The named jsonb anti-pattern is an unbounded key set; 200 is far above any real form and far below pain.','2026-10-25'),
 ('extensibility','custom_fields.promoted_indexes_per_target','12','12','integer','indexes',0,50,NULL,
  'Promoted indexes per target','Ceiling on per-org partial expression indexes on one target token.','agent',
  'Index maintenance is a shared cost paid by every org on the table; hitting this is the make-it-a-real-column signal.','2026-10-25'),
 ('extensibility','custom_fields.multi_select_max_values','50','50','integer','values',1,500,NULL,
  'Default multi_select max values','Applied when a definition declares no max_values.','agent',
  'A multi-select a person actually operates; a definition may declare its own lower value.','2026-10-25'),
 ('extensibility','custom_entities.max_definitions_per_org','10','10','integer','objects',1,100,NULL,
  'Max custom objects per organization','Ceiling on live custom_entity_definition rows in one org.','agent',
  'HubSpot''s Enterprise ceiling exactly - a deliberate anchor rather than an invented number.','2026-10-25'),
 ('extensibility','custom_entities.max_fields_per_definition','50','50','integer','fields',1,500,NULL,
  'Max fields per custom object','Ceiling on live field definitions for one custom object.','agent',
  'Same reasoning as tier 1; the two ceilings stay equal so a tier-1 to tier-2 promotion never loses fields.','2026-10-25'),
 ('extensibility','custom_entities.max_records_per_definition','250000','250000','integer','records',1,5000000,NULL,
  'Max records per custom object','Ceiling on live custom_record rows for one definition.','agent',
  'Comfortably inside a shared table''s healthy range; crossing it is a tier-3 conversation, not a bigger number.','2026-10-25'),
 ('extensibility','custom_entities.record_name_backfill_batch','5000','5000','integer','records',100,100000,NULL,
  'record_name backfill batch','Batch size for the template-change backfill job (3.5).','agent',
  'Large enough to finish a 250k definition in 50 passes, small enough that one batch is a short transaction.','2026-10-25'),
 ('extensibility','custom_entities.search_enabled','true','true','boolean',NULL,NULL,NULL,NULL,
  'Custom record search enabled','Whether custom records are offered in search.','agent',
  'search_vector is a GENERATED column and is therefore always maintained; this knob gates whether search is OFFERED, which is the part that is not free at high write rates. SPEC 8 owes that clarification.','2026-10-25'),
 ('extensibility','custom_fields.ai_exposure_default','"allowed"','"allowed"','enum',NULL,NULL,NULL,'["allowed","aggregate_only","never"]',
  'Default AI exposure','Default ai_exposure for a new definition.','agent',
  'Forced to never when sensitivity_tier = restricted - enforced by a table CHECK, not by convention.','2026-10-25'),
 ('extensibility','tier3.enabled','false','false','boolean',NULL,NULL,NULL,NULL,
  'Tier 3 (ext_<tenant> schemas) enabled','THE GATE of SPEC-EXTENSIBILITY 5.','agent',
  'Section 5''s gate expressed as a knob so it is visible and auditable. No org override: opening it is a named-enterprise-requirement decision, never a per-tenant toggle.','2026-10-25')
ON CONFLICT (feature, key) DO NOTHING;

-- The 8 settings ladder: nearest scope with an answer wins.
-- definition / target -> organization -> platform default.
-- "Use the inherited value" CLEARS the local key; it never copies the parent's number down.
CREATE OR REPLACE FUNCTION platform.extensibility_knob(
  p_key             text,
  p_organization_id uuid DEFAULT NULL,
  p_target_token    text DEFAULT NULL,
  p_definition_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v jsonb; d record; t record;
BEGIN
  IF p_definition_id IS NOT NULL THEN
    SELECT max_fields, max_records, is_searchable, validation_mode, ai_exposure
      INTO d FROM platform.custom_entity_definition WHERE id = p_definition_id;
    IF FOUND THEN
      v := CASE p_key
             WHEN 'custom_entities.max_fields_per_definition'  THEN to_jsonb(d.max_fields)
             WHEN 'custom_entities.max_records_per_definition' THEN to_jsonb(d.max_records)
             WHEN 'custom_entities.search_enabled'             THEN to_jsonb(d.is_searchable)
             WHEN 'custom_fields.validation_mode'              THEN to_jsonb(d.validation_mode)
             WHEN 'custom_fields.ai_exposure_default'          THEN to_jsonb(d.ai_exposure)
           END;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'null' THEN RETURN v; END IF;
    END IF;
  END IF;

  IF p_target_token IS NOT NULL THEN
    SELECT is_enabled, validation_mode, max_fields, max_custom_bytes, ai_exposure_ceiling
      INTO t FROM platform.custom_field_target
     WHERE target_token = p_target_token AND deleted_at IS NULL;
    IF FOUND THEN
      v := CASE p_key
             WHEN 'custom_fields.enabled'                 THEN to_jsonb(t.is_enabled)
             WHEN 'custom_fields.validation_mode'         THEN to_jsonb(t.validation_mode)
             WHEN 'custom_fields.max_fields_per_target'   THEN to_jsonb(t.max_fields)
             WHEN 'custom_fields.max_custom_bytes_per_row' THEN to_jsonb(t.max_custom_bytes)
             WHEN 'custom_fields.ai_exposure_default'     THEN to_jsonb(t.ai_exposure_ceiling)
           END;
      IF v IS NOT NULL AND jsonb_typeof(v) <> 'null' THEN RETURN v; END IF;
    END IF;
  END IF;

  IF p_organization_id IS NOT NULL
     AND p_key NOT IN ('custom_fields.promoted_indexes_per_target',
                       'custom_entities.record_name_backfill_batch',
                       'tier3.enabled') THEN
    SELECT settings -> 'extensibility' -> p_key INTO v
      FROM iam.organizations WHERE id = p_organization_id;
    IF v IS NOT NULL AND jsonb_typeof(v) <> 'null' THEN RETURN v; END IF;
  END IF;

  SELECT COALESCE(k.value, k.default_value) INTO v
    FROM platform.feature_knob k WHERE k.feature = 'extensibility' AND k.key = p_key;
  IF v IS NULL THEN
    RAISE EXCEPTION 'extensibility_knob: knob extensibility.% is not seeded', p_key
      USING ERRCODE = 'P0001',
            HINT = 'D13: a missing knob raises rather than falling back to a hard-coded value. Seed it in the knob register.';
  END IF;
  RETURN v;
END $fn$;

GRANT EXECUTE ON FUNCTION platform.extensibility_knob(text, uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform.extensibility_knob_int(
  p_key text, p_organization_id uuid DEFAULT NULL, p_target_token text DEFAULT NULL, p_definition_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE sql STABLE AS
$$ SELECT (platform.extensibility_knob(p_key, p_organization_id, p_target_token, p_definition_id) #>> '{}')::integer $$;

GRANT EXECUTE ON FUNCTION platform.extensibility_knob_int(text, uuid, text, uuid) TO authenticated, service_role;
