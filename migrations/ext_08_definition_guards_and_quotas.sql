-- ext_08_definition_guards_and_quotas.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.2 / 2.1 / 3.6 / RD-3.
-- Definition-side invariants that need a LOOKUP and therefore cannot be CHECKs.
-- Every refusal names the limit, the current value and who can raise it (3.6):
-- a quota refusal is a first-class explained refusal, never a silent truncation
-- and never an unexplained 500.

CREATE OR REPLACE FUNCTION platform._custom_field_definition_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_target   record;
  v_defn     record;
  v_schema   text;
  v_table    text;
  v_used     boolean;
  v_count    integer;
  v_cap      integer;
  v_opt_cap  integer;
  v_label_cap integer;
  v_list_org uuid;
  v_rank     jsonb := '{"standard":0,"confidential":1,"restricted":2}'::jsonb;
  v_ai_rank  jsonb := '{"allowed":0,"aggregate_only":1,"never":2}'::jsonb;
BEGIN
  IF NEW.target_kind = 'entity_table' THEN
    SELECT * INTO v_target FROM platform.custom_field_target
     WHERE target_token = NEW.target_token AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'custom_field_definition: token % is not a registered custom-field target', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Participation is a row in platform.custom_field_target, never a hardcoded list. A platform admin adds it with platform.adopt_custom_fields(token, ...).';
    END IF;
    IF NOT v_target.is_enabled THEN
      RAISE EXCEPTION 'custom_field_definition: custom fields are disabled for target %', NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'Set platform.custom_field_target.is_enabled = true for this token; a platform admin owns that row.';
    END IF;

    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_target.sensitivity_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the % ceiling on target %',
        NEW.sensitivity_tier, v_target.sensitivity_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'A custom field is never a side door around a sensitivity tier (SPEC-EXTENSIBILITY 2.1). Raise the target ceiling deliberately, or lower the field.';
    END IF;
    IF (v_ai_rank -> NEW.ai_exposure)::int < (v_ai_rank -> v_target.ai_exposure_ceiling)::int THEN
      RAISE EXCEPTION 'custom_field_definition: ai_exposure % is looser than the % ceiling on target %',
        NEW.ai_exposure, v_target.ai_exposure_ceiling, NEW.target_token
        USING ERRCODE = 'check_violation',
              HINT = 'AR B2.20: the target''s AI sensitivity ceiling reaches custom fields. Equal or stricter, never looser.';
    END IF;
  ELSE
    SELECT * INTO v_defn FROM platform.custom_entity_definition
     WHERE id = NEW.target_definition_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'custom_field_definition: custom object % does not exist', NEW.target_definition_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_defn.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: a field may not be defined on another organization''s custom object'
        USING ERRCODE = 'check_violation',
              HINT = 'Tenant isolation is inherited, never re-implemented: the field row and the definition row carry the same organization_id.';
    END IF;
    IF (v_rank -> NEW.sensitivity_tier)::int > (v_rank -> v_defn.sensitivity_tier)::int THEN
      RAISE EXCEPTION 'custom_field_definition: sensitivity_tier % exceeds the custom object''s % tier',
        NEW.sensitivity_tier, v_defn.sensitivity_tier
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.reference_target_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = NEW.reference_target_token AND is_active) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_token % is not an active entity token', NEW.reference_target_token
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference_target_definition_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.custom_entity_definition
                      WHERE id = NEW.reference_target_definition_id
                        AND organization_id = NEW.organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_definition_id must name a live custom object in the same organization'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RD-3's honest defect, defended: workbench.udt_structured_lists.organization_id is
  -- NULLABLE live (legacy). A NULL-org or foreign-org list is refused here rather than
  -- becoming a cross-org read at render time.
  IF NEW.option_list_id IS NOT NULL THEN
    SELECT organization_id INTO v_list_org FROM workbench.udt_structured_lists WHERE id = NEW.option_list_id;
    IF v_list_org IS NULL OR v_list_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'custom_field_definition: option_list_id must name a structured list owned by this organization'
        USING ERRCODE = 'check_violation',
              HINT = 'RD-3 ratchet item: workbench.udt_structured_lists.organization_id is nullable live, which conflicts with NO NULL ORG. The pointer path defends against it instead of trusting it.';
    END IF;
  END IF;

  IF NEW.options IS NOT NULL THEN
    v_opt_cap   := platform.extensibility_knob_int('custom_fields.max_options_per_select', NEW.organization_id);
    v_label_cap := platform.extensibility_knob_int('custom_fields.max_option_label_chars', NEW.organization_id);
    IF jsonb_array_length(NEW.options) > v_opt_cap THEN
      RAISE EXCEPTION 'custom_field_definition: % options exceeds the limit of % (extensibility.custom_fields.max_options_per_select)',
        jsonb_array_length(NEW.options), v_opt_cap
        USING ERRCODE = 'check_violation',
              HINT = 'The limit is a knob, not a constant. An organization admin can raise it through the extensibility settings; a platform admin can raise the platform default.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(NEW.options) e
       WHERE char_length(COALESCE(CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' ELSE e ->> 'label' END,
                                  CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'value' ELSE '' END, '')) > v_label_cap
    ) THEN
      RAISE EXCEPTION 'custom_field_definition: an option label exceeds % characters (extensibility.custom_fields.max_option_label_chars)', v_label_cap
        USING ERRCODE = 'check_violation',
              HINT = 'An option label is a label, not a document. The limit is a knob.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.target_kind = 'entity_table' THEN
      v_cap := platform.extensibility_knob_int('custom_fields.max_fields_per_target', NEW.organization_id, NEW.target_token);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'entity_table'
         AND target_token = NEW.target_token AND deleted_at IS NULL AND archived_at IS NULL;
    ELSE
      v_cap := platform.extensibility_knob_int('custom_entities.max_fields_per_definition', NEW.organization_id, NULL, NEW.target_definition_id);
      SELECT count(*) INTO v_count FROM platform.custom_field_definition
       WHERE organization_id = NEW.organization_id AND target_kind = 'custom_entity'
         AND target_definition_id = NEW.target_definition_id AND deleted_at IS NULL AND archived_at IS NULL;
    END IF;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_field_definition: this target already holds % of a maximum % custom fields', v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: ' || CASE WHEN NEW.target_kind = 'entity_table'
                                       THEN 'extensibility.custom_fields.max_fields_per_target'
                                       ELSE 'extensibility.custom_entities.max_fields_per_definition' END ||
                     '. An organization admin raises it in the extensibility settings; archiving a field frees a slot.';
    END IF;
  END IF;

  -- THE THREE IMMUTABLE COLUMNS (2.2) -- once any value has been written.
  -- Changing any of them silently re-interprets every stored value.
  IF TG_OP = 'UPDATE' AND (
       NEW.field_key IS DISTINCT FROM OLD.field_key
    OR NEW.field_type IS DISTINCT FROM OLD.field_type
    OR NEW.reference_target_token IS DISTINCT FROM OLD.reference_target_token) THEN

    v_used := false;
    IF OLD.target_kind = 'entity_table' THEN
      SELECT et.schema_name, et.table_name INTO v_schema, v_table
        FROM platform.entity_types et WHERE et.token = OLD.target_token;
      IF v_schema IS NOT NULL THEN
        -- Scoped by organization_id (indexed) so the containment test never walks another
        -- tenant's rows. jsonb_path_ops does not serve `?`, which is why this is
        -- deliberately an org-scoped scan on a rare admin action and not a hot path.
        EXECUTE format(
          'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE organization_id = $1 AND custom ? $2 LIMIT 1)',
          v_schema, v_table) INTO v_used USING OLD.organization_id, OLD.field_key;
      END IF;
    ELSE
      SELECT EXISTS (SELECT 1 FROM platform.custom_record
                      WHERE entity_definition_id = OLD.target_definition_id
                        AND data ? OLD.field_key LIMIT 1) INTO v_used;
    END IF;

    IF v_used THEN
      RAISE EXCEPTION 'custom_field_definition: field_key / field_type / reference_target_token are immutable once values exist for %', OLD.field_key
        USING ERRCODE = 'check_violation',
              HINT = 'Changing any of them silently re-interprets every stored value. The supported path is: archive this definition, create a new one, migrate deliberately (SPEC-EXTENSIBILITY 2.2).';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _guard_definition ON platform.custom_field_definition;
CREATE TRIGGER _guard_definition
  BEFORE INSERT OR UPDATE ON platform.custom_field_definition
  FOR EACH ROW EXECUTE FUNCTION platform._custom_field_definition_guard();

CREATE OR REPLACE FUNCTION platform._custom_entity_definition_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_cap integer; v_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_cap := platform.extensibility_knob_int('custom_entities.max_definitions_per_org', NEW.organization_id);
    SELECT count(*) INTO v_count FROM platform.custom_entity_definition
     WHERE organization_id = NEW.organization_id AND deleted_at IS NULL AND archived_at IS NULL;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_entity_definition: this organization already holds % of a maximum % custom objects', v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: extensibility.custom_entities.max_definitions_per_org. An organization admin raises it in the extensibility settings; archiving an object frees a slot.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug
     AND EXISTS (SELECT 1 FROM platform.custom_record WHERE entity_definition_id = OLD.id AND deleted_at IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'custom_entity_definition: slug is immutable once the object holds records'
      USING ERRCODE = 'check_violation',
            HINT = 'The slug addresses the object in routes and in the client kit; changing it under live records orphans every saved view and link.';
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _guard_custom_object ON platform.custom_entity_definition;
CREATE TRIGGER _guard_custom_object
  BEFORE INSERT OR UPDATE ON platform.custom_entity_definition
  FOR EACH ROW EXECUTE FUNCTION platform._custom_entity_definition_guard();
