-- ext_09_definition_loader_and_row_validation.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 4.2 (load_definitions) + 2.4.2 (the write path's
-- validate step), expressed DB-side so tier 2 -- which has no app layer between a
-- PostgREST client and the row -- is actually enforced.
--
-- 🚨 platform.custom_field_defs and platform.validate_custom_row are re-declared
-- SECURITY INVOKER by ext_15. Read that file before changing either: the DEFINER form
-- shipped here let any caller enumerate another organization's field definitions by
-- passing that org's id.

CREATE OR REPLACE FUNCTION platform.custom_field_defs(
  p_target_kind     text,
  p_organization_id uuid,
  p_target_token    text DEFAULT NULL,
  p_definition_id   uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT true
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY ord, key), '[]'::jsonb)
    FROM (
      SELECT d.field_order AS ord, d.field_key AS key,
             jsonb_build_object(
               'field_key',              d.field_key,
               'field_type',             d.field_type,
               'display_name',           d.display_name,
               'field_order',            d.field_order,
               'is_required',            d.is_required,
               'is_multi',               d.is_multi,
               'default_value',          d.default_value,
               'validation_rules',       d.validation_rules,
               'display_config',         d.display_config,
               'reference_target_token', d.reference_target_token,
               'reference_target_definition_id', d.reference_target_definition_id,
               'sensitivity_tier',       d.sensitivity_tier,
               'ai_exposure',            d.ai_exposure,
               'is_indexed',             d.is_indexed,
               'index_state',            d.index_state,
               'archived',               (d.archived_at IS NOT NULL),
               'options',
                 CASE
                   WHEN d.options IS NOT NULL THEN d.options
                   WHEN d.option_list_id IS NOT NULL THEN (
                     SELECT COALESCE(jsonb_agg(to_jsonb(i.label::text) ORDER BY i.group_name NULLS FIRST, i.label), '[]'::jsonb)
                       FROM workbench.udt_structured_list_items i
                      WHERE i.list_id = d.option_list_id
                        AND i.deleted_at IS NULL
                        AND i.organization_id = p_organization_id )
                 END
             ) AS x
        FROM platform.custom_field_definition d
       WHERE d.organization_id = p_organization_id
         AND d.deleted_at IS NULL
         AND d.target_kind = p_target_kind
         AND (p_target_kind <> 'entity_table'  OR d.target_token = p_target_token)
         AND (p_target_kind <> 'custom_entity' OR d.target_definition_id = p_definition_id)
         AND (p_include_archived OR d.archived_at IS NULL)
    ) s
$$;

GRANT EXECUTE ON FUNCTION platform.custom_field_defs(text, uuid, text, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION platform.custom_field_defs(text, uuid, text, uuid, boolean) IS
'The org-scoped registry read (SPEC-EXTENSIBILITY 4.2 load_definitions). ARCHIVED definitions are INCLUDED by default and flagged, because the validator needs them to emit archived_field; a form renderer passes p_include_archived => false. option_list_id resolves to inline option strings from the structured list''s LABELS ordered by (group_name, label) - udt_structured_list_items carries no value or position column, which RD-3 owes as a note.';

CREATE OR REPLACE FUNCTION platform.validate_custom_row(
  p_target_kind     text,
  p_organization_id uuid,
  p_values          jsonb,
  p_target_token    text DEFAULT NULL,
  p_definition_id   uuid DEFAULT NULL,
  p_mode            text DEFAULT NULL,
  p_resolved        jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_defs jsonb;
  v_mode text;
  v_lim  jsonb;
BEGIN
  v_defs := platform.custom_field_defs(p_target_kind, p_organization_id, p_target_token, p_definition_id, true);

  -- The caller resolved references under ITS OWN RLS and hands the result in;
  -- the validator never reads. Shape: {field_key: {id: true|false}}.
  IF p_resolved IS NOT NULL AND jsonb_typeof(p_resolved) = 'object' THEN
    SELECT COALESCE(jsonb_agg(
             CASE WHEN p_resolved ? (e ->> 'field_key')
                  THEN e || jsonb_build_object('resolved', p_resolved -> (e ->> 'field_key'))
                  ELSE e END ORDER BY ord), '[]'::jsonb)
      INTO v_defs
      FROM jsonb_array_elements(v_defs) WITH ORDINALITY t(e, ord);
  END IF;

  v_mode := COALESCE(p_mode, platform.extensibility_knob(
              'custom_fields.validation_mode', p_organization_id, p_target_token, p_definition_id) #>> '{}');

  v_lim := jsonb_build_object(
    'max_custom_bytes', platform.extensibility_knob_int('custom_fields.max_custom_bytes_per_row', p_organization_id, p_target_token, p_definition_id),
    'max_keys_per_row', platform.extensibility_knob_int('custom_fields.max_keys_per_row', p_organization_id, p_target_token, p_definition_id));

  RETURN platform.validate_custom_values(v_defs, p_values, v_mode, v_lim);
END $fn$;

GRANT EXECUTE ON FUNCTION platform.validate_custom_row(text, uuid, jsonb, text, uuid, text, jsonb) TO authenticated, service_role;

-- 3.5 record_name: the denormalisation that makes a list view, a picker, a reference chip
-- and a search result renderable WITHOUT extracting jsonb per row.
CREATE OR REPLACE FUNCTION platform.render_record_name(
  p_template text, p_data jsonb, p_first_text_key text DEFAULT NULL, p_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $fn$
DECLARE v_out text; v_key text;
BEGIN
  IF p_template IS NOT NULL AND btrim(p_template) <> '' THEN
    v_out := p_template;
    FOR v_key IN
      SELECT DISTINCT m[1] FROM regexp_matches(p_template, '\{([a-z][a-z0-9_]{0,62})\}', 'g') m
    LOOP
      v_out := replace(v_out, '{' || v_key || '}',
                       COALESCE(CASE WHEN jsonb_typeof(p_data -> v_key) IN ('object','array')
                                     THEN NULL ELSE p_data ->> v_key END, ''));
    END LOOP;
    v_out := btrim(regexp_replace(v_out, '[ ]{2,}', ' ', 'g'));
    IF v_out <> '' THEN RETURN v_out; END IF;
  END IF;

  IF p_first_text_key IS NOT NULL THEN
    v_out := btrim(COALESCE(p_data ->> p_first_text_key, ''));
    IF v_out <> '' THEN RETURN v_out; END IF;
  END IF;

  RETURN CASE WHEN p_id IS NULL THEN NULL ELSE left(p_id::text, 8) END;
END $fn$;

-- The custom_record guard: org coherence, the definition's liveness, the record quota,
-- the validated write, and the record_name stamp -- in that order.
--
-- RECORDED DECISION -- there IS a DB trigger here, and 2.4.2's "no DB trigger in v1"
-- still holds where it was aimed. 2.4.2 refuses a registry-driven trigger on the
-- PLATFORM'S HOTTEST TABLES (the tier-1 participating tables), because every writer
-- there goes through an app layer that already validates. platform.custom_record has NO
-- app layer: it is a plain PostgREST-reachable table, so an unvalidated insert is one
-- HTTP call away. The registry read the trigger pays for is a single indexed lookup on
-- the definition it is already joining to. Tier-1 target tables get NO trigger.
CREATE OR REPLACE FUNCTION platform._custom_record_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_defn   record;
  v_cap    integer;
  v_count  integer;
  v_report jsonb;
  v_first  text;
BEGIN
  SELECT * INTO v_defn FROM platform.custom_entity_definition WHERE id = NEW.entity_definition_id;
  IF NOT FOUND OR v_defn.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'custom_record: custom object % does not exist', NEW.entity_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Isolation is INHERITED, never re-implemented: a record and its definition carry the
  -- same organization_id, always. This is what makes the component RLS deferral to the
  -- definition actually mean tenant isolation.
  IF NEW.organization_id <> v_defn.organization_id THEN
    RAISE EXCEPTION 'custom_record: organization_id must match the custom object''s organization'
      USING ERRCODE = 'check_violation',
            HINT = 'Every write carries an explicit organization_id and it must be the definition''s. No resolver and no trigger chooses one.';
  END IF;

  IF v_defn.archived_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.deleted_at IS NULL) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'custom_record: custom object % is archived and no longer accepts new records', v_defn.slug
        USING ERRCODE = 'check_violation',
              HINT = 'Existing records stay readable. Un-archive the object to resume writes.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_cap := platform.extensibility_knob_int('custom_entities.max_records_per_definition',
                                             NEW.organization_id, NULL, NEW.entity_definition_id);
    SELECT count(*) INTO v_count FROM platform.custom_record
     WHERE entity_definition_id = NEW.entity_definition_id AND deleted_at IS NULL;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_record: % already holds % of a maximum % records', v_defn.slug, v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: extensibility.custom_entities.max_records_per_definition. An organization admin raises it in the extensibility settings; crossing 250,000 is a tier-3 conversation, not a bigger number.';
    END IF;
  END IF;

  -- The validated write. Reference resolution is NOT done here (the validator is pure and
  -- a trigger has no caller context to resolve under); a client that needs
  -- invalid_reference calls platform.validate_custom_row with a resolution map first.
  IF TG_OP = 'INSERT' OR NEW.data IS DISTINCT FROM OLD.data THEN
    v_report := platform.validate_custom_row(
      'custom_entity', NEW.organization_id, NEW.data, NULL, NEW.entity_definition_id, v_defn.validation_mode);
    IF NOT (v_report ->> 'ok')::boolean THEN
      RAISE EXCEPTION 'custom_record: data failed % validation for %', v_defn.validation_mode, v_defn.slug
        USING ERRCODE = 'check_violation',
              DETAIL = v_report ->> 'errors',
              HINT = 'Call platform.validate_custom_row(...) before writing to get the full errors/warnings envelope.';
    END IF;
  END IF;

  SELECT d.field_key INTO v_first
    FROM platform.custom_field_definition d
   WHERE d.organization_id = NEW.organization_id AND d.target_kind = 'custom_entity'
     AND d.target_definition_id = NEW.entity_definition_id
     AND d.deleted_at IS NULL AND d.archived_at IS NULL
     AND d.field_type IN ('text','long_text')
   ORDER BY d.field_order, d.field_key LIMIT 1;

  NEW.record_name := platform.render_record_name(v_defn.record_name_template, NEW.data, v_first, NEW.id);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _guard_custom_record ON platform.custom_record;
CREATE TRIGGER _guard_custom_record
  BEFORE INSERT OR UPDATE ON platform.custom_record
  FOR EACH ROW EXECUTE FUNCTION platform._custom_record_guard();
