-- ext_17_reference_resolver_metadata_lookup.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.6 reference resolution, and the promoted-index
-- drop. This file carries the REPLAYABLE definitions for everything ext_13 and ext_16
-- attempted; both of those are deliberate no-ops.
--
-- 🚨 THE SPLIT THAT MAKES REDACTION CORRECT. resolve_custom_references is SECURITY INVOKER
-- on purpose (2.6 rule 3 -- the ROW read must happen under the caller's RLS). But it also
-- has to look the token up in platform.entity_types and pick a label column out of the
-- catalog, and BOTH of those are metadata reads that a caller's own privileges filter.
-- That is not tenant data and must not be subject to the caller: when the lookup came back
-- empty the resolver took its unresolvable-token branch and redacted EVERYTHING, including
-- rows the caller could plainly read. Metadata resolves DEFINER; rows resolve INVOKER. A
-- token that genuinely is not registered now comes back with reason 'unregistered_token'
-- instead of looking like a redaction, so the two failure modes can never be confused.
--
-- 🚨 THE DROP MUST BE SCHEMA-QUALIFIED. An unqualified `DROP INDEX IF EXISTS cf_...`
-- resolves against search_path, and a promoted index lives in the TARGET TABLE's schema
-- (hr, crm, ...) -- so IF EXISTS silently matched nothing and archiving left the index in
-- place. Isolation assertion B7c caught it.
--
-- RECORDED DECISION -- user_reference resolves to legality, never to a name. 2.6 says a
-- user_reference stores an auth.users id, but auth.users is not readable by an ordinary
-- client and there is no org-scoped person-label view this lane owns. Answering "is this a
-- legal reference here" is the data layer's job; rendering a person is a UI concern with
-- its own privacy rules and belongs to the client kit (HRB-026 / L14). Inventing a name
-- path here would be inventing a name LEAK. 2.6 owes the note.

CREATE OR REPLACE FUNCTION platform.custom_reference_source(p_token text)
RETURNS TABLE (schema_name text, table_name text, label_column text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $$
  SELECT et.schema_name, et.table_name,
         (SELECT a.attname::text
            FROM pg_attribute a
           WHERE a.attrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
             AND a.attnum > 0 AND NOT a.attisdropped
             AND a.attname IN ('record_name','display_name','name','title','label','slug')
           ORDER BY array_position(ARRAY['record_name','display_name','name','title','label','slug'], a.attname::text)
           LIMIT 1)
    FROM platform.entity_types et
   WHERE et.token = p_token AND et.is_active
$$;

GRANT EXECUTE ON FUNCTION platform.custom_reference_source(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform.resolve_custom_references(
  p_organization_id uuid,
  p_definitions     jsonb,
  p_values          jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $fn$
DECLARE
  v_out    jsonb := '{}'::jsonb;
  d        jsonb;
  v_key    text;
  v_ft     text;
  v_token  text;
  v_ids    uuid[];
  v_val    jsonb;
  v_src    record;
  v_schema text;
  v_table  text;
  v_label  text;
  v_per    jsonb;
  r        record;
  v_id     uuid;
BEGIN
  IF p_definitions IS NULL OR jsonb_typeof(p_definitions) <> 'array' THEN RETURN v_out; END IF;

  FOR d IN SELECT e FROM jsonb_array_elements(p_definitions) t(e) LOOP
    v_key := d ->> 'field_key';
    v_ft  := d ->> 'field_type';
    IF v_ft NOT IN ('entity_reference','user_reference') OR v_key IS NULL THEN CONTINUE; END IF;

    v_val := p_values -> v_key;
    IF v_val IS NULL OR jsonb_typeof(v_val) = 'null' THEN CONTINUE; END IF;

    SELECT array_agg(x::uuid) INTO v_ids
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(v_val) = 'array' THEN v_val ELSE jsonb_build_array(v_val) END) t(x)
     WHERE x ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN CONTINUE; END IF;

    v_per := '{}'::jsonb;

    IF v_ft = 'user_reference' THEN
      FOREACH v_id IN ARRAY v_ids LOOP
        v_per := v_per || jsonb_build_object(v_id::text, jsonb_build_object(
          'valid', EXISTS (SELECT 1 FROM iam.organization_member om
                            WHERE om.user_id = v_id AND om.organization_id = p_organization_id),
          'redacted', true, 'label', NULL, 'token', 'user', 'reason', 'people_labels_are_not_the_data_layer'));
      END LOOP;
      v_out := v_out || jsonb_build_object(v_key, v_per);
      CONTINUE;
    END IF;

    v_token := d ->> 'reference_target_token';
    IF v_token IS NULL THEN
      v_schema := 'platform'; v_table := 'custom_record'; v_label := 'record_name';
    ELSE
      SELECT * INTO v_src FROM platform.custom_reference_source(v_token);
      IF NOT FOUND THEN
        FOREACH v_id IN ARRAY v_ids LOOP
          v_per := v_per || jsonb_build_object(v_id::text, jsonb_build_object(
            'valid', false, 'redacted', true, 'label', NULL, 'token', v_token,
            'reason', 'unregistered_token'));
        END LOOP;
        v_out := v_out || jsonb_build_object(v_key, v_per);
        CONTINUE;
      END IF;
      v_schema := v_src.schema_name; v_table := v_src.table_name; v_label := v_src.label_column;
    END IF;

    -- Every requested id starts UNRESOLVED; only the read can upgrade it. There is no code
    -- path that forgets to hide a row the caller cannot see.
    FOREACH v_id IN ARRAY v_ids LOOP
      v_per := v_per || jsonb_build_object(v_id::text, jsonb_build_object(
        'valid', false, 'redacted', true, 'label', NULL,
        'token', COALESCE(v_token,'custom_record'), 'reason', 'not_readable_or_cross_org'));
    END LOOP;

    FOR r IN EXECUTE format(
      'SELECT id, organization_id, %s AS lbl FROM %I.%I WHERE id = ANY($1)',
      CASE WHEN v_label IS NULL THEN 'NULL::text' ELSE quote_ident(v_label) || '::text' END,
      v_schema, v_table) USING v_ids
    LOOP
      IF r.organization_id = p_organization_id THEN
        v_per := v_per || jsonb_build_object(r.id::text, jsonb_build_object(
          'valid', true, 'redacted', false, 'label', r.lbl,
          'token', COALESCE(v_token,'custom_record'), 'reason', NULL));
      END IF;
      -- A row from ANOTHER organization stays valid=false / redacted=true:
      -- 2.6 rule 5 -- a cross-org id is INVALID, not merely unreadable.
    END LOOP;

    v_out := v_out || jsonb_build_object(v_key, v_per);
  END LOOP;

  RETURN v_out;
END $fn$;

GRANT EXECUTE ON FUNCTION platform.resolve_custom_references(uuid, jsonb, jsonb) TO authenticated, service_role;

-- The narrow {field_key: {id: bool}} map platform.validate_custom_row expects.
CREATE OR REPLACE FUNCTION platform.custom_reference_validity(
  p_organization_id uuid, p_definitions jsonb, p_values jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS
$$
  SELECT COALESCE(jsonb_object_agg(f.key,
           (SELECT COALESCE(jsonb_object_agg(i.key, (i.value -> 'valid')), '{}'::jsonb)
              FROM jsonb_each(f.value) i)), '{}'::jsonb)
    FROM jsonb_each(platform.resolve_custom_references(p_organization_id, p_definitions, p_values)) f
$$;

GRANT EXECUTE ON FUNCTION platform.custom_reference_validity(uuid, jsonb, jsonb) TO authenticated, service_role;

-- 2.6: "what references this employee?" is an index-backed containment scan per
-- participating table -- a fan-out, wrapped by ONE helper so no module writes it.
CREATE OR REPLACE FUNCTION platform.find_custom_references_to(
  p_organization_id uuid, p_target_token text, p_target_id uuid)
RETURNS TABLE (source_token text, source_id uuid, field_key text)
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $fn$
DECLARE t record; d record;
BEGIN
  FOR d IN
    SELECT DISTINCT cfd.target_kind, cfd.target_token, cfd.target_definition_id, cfd.field_key
      FROM platform.custom_field_definition cfd
     WHERE cfd.organization_id = p_organization_id
       AND cfd.deleted_at IS NULL AND cfd.archived_at IS NULL
       AND cfd.field_type = 'entity_reference'
       AND cfd.reference_target_token = p_target_token
  LOOP
    IF d.target_kind = 'entity_table' THEN
      SELECT * INTO t FROM platform.custom_reference_source(d.target_token);
      CONTINUE WHEN NOT FOUND;
      RETURN QUERY EXECUTE format(
        'SELECT %L::text, id, %L::text FROM %I.%I WHERE organization_id = $1 AND (custom @> $2 OR custom @> $3)',
        d.target_token, d.field_key, t.schema_name, t.table_name)
      USING p_organization_id,
            jsonb_build_object(d.field_key, to_jsonb(p_target_id::text)),
            jsonb_build_object(d.field_key, jsonb_build_array(to_jsonb(p_target_id::text)));
    ELSE
      RETURN QUERY
        SELECT 'custom_record'::text, r.id, d.field_key
          FROM platform.custom_record r
         WHERE r.organization_id = p_organization_id
           AND r.entity_definition_id = d.target_definition_id
           AND (r.data @> jsonb_build_object(d.field_key, to_jsonb(p_target_id::text))
             OR r.data @> jsonb_build_object(d.field_key, jsonb_build_array(to_jsonb(p_target_id::text))));
    END IF;
  END LOOP;
END $fn$;

GRANT EXECUTE ON FUNCTION platform.find_custom_references_to(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform._drop_custom_field_index(p_definition_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_oid oid;
BEGIN
  SELECT c.oid INTO v_oid FROM pg_class c
   WHERE c.relkind = 'i' AND c.relname = platform.custom_field_index_name(p_definition_id);
  IF v_oid IS NULL THEN RETURN false; END IF;
  EXECUTE 'DROP INDEX ' || v_oid::regclass::text;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION platform.demote_custom_field_index(p_definition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_dropped boolean;
BEGIN
  v_dropped := platform._drop_custom_field_index(p_definition_id);
  UPDATE platform.custom_field_definition
     SET is_indexed = false, index_state = 'none', index_name = NULL, index_error = NULL
   WHERE id = p_definition_id;
  RETURN jsonb_build_object('ok', true, 'definition_id', p_definition_id, 'dropped', v_dropped);
END $fn$;

CREATE OR REPLACE FUNCTION platform._custom_field_index_state()
RETURNS trigger LANGUAGE plpgsql AS
$fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.index_state := CASE WHEN NEW.is_indexed THEN 'pending' ELSE 'none' END;
    NEW.index_name  := NULL;
    RETURN NEW;
  END IF;

  IF NEW.is_indexed AND NOT OLD.is_indexed THEN
    NEW.index_state := 'pending'; NEW.index_error := NULL; NEW.index_name := NULL;
  ELSIF NEW.is_indexed AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    -- un-archiving a still-flagged field re-queues it rather than leaving it in the limbo
    -- state is_indexed = true / index_state = 'none'
    NEW.index_state := 'pending'; NEW.index_error := NULL; NEW.index_name := NULL;
  ELSIF (NOT NEW.is_indexed AND OLD.is_indexed)
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
     OR (NEW.deleted_at  IS NOT NULL AND OLD.deleted_at  IS NULL) THEN
    -- Drop the physical index HERE and set our OWN columns. Calling
    -- demote_custom_field_index() would UPDATE this row from inside its own BEFORE
    -- trigger, which Postgres refuses with 27000.
    IF OLD.index_state = 'active' THEN
      PERFORM platform._drop_custom_field_index(OLD.id);
    END IF;
    NEW.index_state := 'none'; NEW.index_name := NULL; NEW.index_error := NULL;
  END IF;
  RETURN NEW;
END $fn$;
