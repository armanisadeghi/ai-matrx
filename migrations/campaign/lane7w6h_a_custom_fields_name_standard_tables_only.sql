-- chair-step: replaces six live function bodies (CREATE OR REPLACE) and DROPS TWO FOREIGN KEYS.
-- STRONG LOCK NAMED: each `ALTER TABLE platform.custom_field_definition DROP CONSTRAINT …_fkey` takes ACCESS EXCLUSIVE on
--   platform.custom_field_definition AND on platform.custom_entity_definition (the referenced table) for the
--   instant of the drop; both tables are empty on production (0 rows) and read by no client door; lock_timeout 3s.
-- lock: platform
-- No grant change, no table created. Its inverse puts the six bodies back byte for byte and re-adds the two
-- foreign keys (SHARE ROW EXCLUSIVE on both tables, empty).
-- ORDER (production): independent of lane 7's READY files — r2 -> w2_a -> 5b2 -> 4a a, b, c replace none of
--   these six functions (checked: none names them), so every body here is production's current body
--   (production = clone, sha256 equal at authoring). Apply any time after 4a.
-- based-on: platform.extensibility_knob(text,uuid,text,uuid) 5850260a66c20499194d95125b5775c417c340c60c34ef3f94a8f7e8baa11e03
-- based-on: platform.find_custom_references_to(uuid,text,uuid) 2686323cc91d30b6689d902b809a4008df22e7ddaf6a07ffb54a287f44d363c8
-- based-on: platform.promote_custom_field_index(uuid,boolean) d8312d0c1ebe2b253db465b404fcdc4b612559b7fa616108900d5d17631928d7
-- based-on: platform.custom_field_index_ddl(uuid,boolean) e30d5c33c5ceaa722e3484a76c0d7662b66395672e8d5484a1077969b508e901
-- based-on: platform.backfill_record_names(uuid,integer) c3ca36b2cf70a941805314fee8f04770751c50d7e358b23b8509787bf82fde5d
-- based-on: platform._custom_field_definition_guard() 5608e428b6d8a0c14bf26f18fb97487e5ef0cc101551e279556fd129069703b9
--
-- LANE 7 · W6H — THE OLD FIELD SYSTEM NAMES STANDARD TABLES ONLY: THE CUSTOM-OBJECT BRANCH IS GONE.
-- Custom objects moved to the record store (custom.*). The old field functions still branched on
-- platform.custom_entity_definition / platform.custom_record. Found by CATALOG dependency
-- (plpgsql_show_dependency_tb over every platform plpgsql function, trigger functions with their table),
-- not by text: extensibility_knob, find_custom_references_to, backfill_record_names and the trigger
-- _custom_field_definition_guard depend on the two custom-object tables; custom_field_index_ddl (dynamic SQL)
-- and promote_custom_field_index (target_kind literal) carry the same branch where the catalog cannot see
-- it, so the guard checks their bodies too. adopt_custom_fields and demote_custom_field_index (the rest of the
-- closed set) have no custom-object branch and are unchanged. The triggers ON the two custom-object tables
-- themselves (_custom_entity_definition_guard, _custom_record_guard) leave with those tables (lane 6).
set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION platform.extensibility_knob(p_key text, p_organization_id uuid DEFAULT NULL::uuid, p_target_token text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v jsonb; d record; t record;
BEGIN
  -- AN ORGANIZATION'S KNOBS ARE ITS OWN. The org rung is read by organization id; a
  -- caller who is not in that organization gets the platform rung, never another
  -- tenant's override.
  if p_organization_id is not null
     and iam.is_client_lane()
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization_access_denied: no access to that organization'
      using errcode = '42501';
  end if;

  -- LANE7-W6H (2026-10-03): CUSTOM OBJECTS ARE RETIRED. The definition rung (limits read off a
  -- custom-object definition row) is gone with them; p_definition_id is accepted and ignored so
  -- no caller breaks, and the token, organization and platform rungs answer exactly as before.
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

  -- Org rung + platform rung, overridability, range clamp, and the P0001
  -- missing-knob refusal now all come from the ONE resolver (the hardcoded
  -- NOT IN lock list is overridable_by='{}' curation on the register).
  RETURN platform.knob_resolve('extensibility', p_key, p_organization_id);
END $function$;

CREATE OR REPLACE FUNCTION platform.find_custom_references_to(p_organization_id uuid, p_target_token text, p_target_id uuid)
 RETURNS TABLE(source_token text, source_id uuid, field_key text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
    -- LANE7-W6H: a definition on a retired custom object references nothing any more.
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION platform.promote_custom_field_index(p_definition_id uuid, p_concurrently boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE d record; v_ddl text; v_cap integer; v_count integer; v_name text; v_err text;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promote_custom_field_index: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT d.is_indexed THEN
    RAISE EXCEPTION 'promote_custom_field_index: % is not marked is_indexed', d.field_key
      USING ERRCODE = 'check_violation';
  END IF;

  v_cap := platform.extensibility_knob_int('custom_fields.promoted_indexes_per_target');
  SELECT count(*) INTO v_count FROM platform.custom_field_definition x
   WHERE x.deleted_at IS NULL AND x.index_state = 'active' AND x.id <> p_definition_id
     AND d.target_kind = 'entity_table' AND x.target_kind = 'entity_table' AND x.target_token = d.target_token;  -- LANE7-W6H: standard tables only
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'promote_custom_field_index: this target already carries % of a maximum % promoted indexes', v_count, v_cap
      USING ERRCODE = 'check_violation',
            HINT = 'This field is behaving like a column - consider a real column, or tier 2. Index maintenance is a cost every organization on this table pays. Limit: extensibility.custom_fields.promoted_indexes_per_target (platform-only knob).';
  END IF;

  v_name := platform.custom_field_index_name(p_definition_id);
  v_ddl  := platform.custom_field_index_ddl(p_definition_id, p_concurrently);

  BEGIN
    EXECUTE v_ddl;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    UPDATE platform.custom_field_definition
       SET index_state = 'failed', index_error = v_err, index_name = NULL
     WHERE id = p_definition_id;
    RETURN jsonb_build_object('ok', false, 'definition_id', p_definition_id,
                              'index_state', 'failed', 'error', v_err, 'ddl', v_ddl);
  END;

  UPDATE platform.custom_field_definition
     SET index_state = 'active', index_name = v_name, index_error = NULL
   WHERE id = p_definition_id;

  RETURN jsonb_build_object('ok', true, 'definition_id', p_definition_id,
                            'index_state', 'active', 'index_name', v_name, 'ddl', v_ddl);
END $function$;

CREATE OR REPLACE FUNCTION platform.custom_field_index_ddl(p_definition_id uuid, p_concurrently boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  d record; v_schema text; v_table text; v_col text; v_expr text;
  v_pred text; v_soft boolean; v_on boolean;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom_field_index_ddl: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- RULING (a): THE GUARD IS ON THE GENERATOR. A switch this caller cannot read is CLOSED,
  -- and it says so with the key and the remedy rather than handing back DDL to run.
  -- GUARD-SWITCH (2026-09-19): THE FIFTH READER OF custom/field_index_guard. DOOR-FIX's B1
  -- moved four bodies onto the organization's own system switch and MEASURED THE FOUR IT
  -- KNEW — `custom.promote_field`, `custom.promoted_index_ddl`, `custom._promoted_field_cap_guard`
  -- and `custom.work_slots_declare` — and this one, in schema `platform` rather than `custom`,
  -- was left reading the retired knob. So the instance was fixed and the CLASS was not: this
  -- generator still refused every organization, for ever, with a remedy naming a knob that has
  -- no rung to turn it on. It now asks `custom.store_is_open`, exactly like its four siblings.
  v_on := custom.store_is_open(d.organization_id);
  IF NOT v_on THEN
    RAISE EXCEPTION 'promoting a custom field to an index is switched off here'
      USING ERRCODE = '0A000',
            HINT = 'This organization''s record store is switched off — custom/system_enabled resolves false for it — so no index DDL was generated and nothing was changed. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp) and ask again; there is no separate switch for promotion (GUARD-SWITCH, 2026-09-19).';
  END IF;

  IF d.target_kind = 'entity_table' THEN
    SELECT et.schema_name, et.table_name, et.has_soft_delete INTO v_schema, v_table, v_soft
      FROM platform.entity_types et WHERE et.token = d.target_token;
    IF v_schema IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: token % is not registered', d.target_token
        USING ERRCODE = 'check_violation';
    END IF;

    -- THE COLUMN IS READ, NEVER GUESSED. Both names are live in this database — `custom` on
    -- the hr.* and seo.* tables, `custom_fields` on crm.party, custom.record and
    -- users.user_form_profile — so a literal is right for one half and builds an index over a
    -- column that does not exist for the other.
    SELECT a.attname INTO v_col
      FROM pg_attribute a
     WHERE a.attrelid = format('%I.%I', v_schema, v_table)::regclass
       AND a.attname IN ('custom_fields', 'custom')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY CASE a.attname WHEN 'custom_fields' THEN 0 ELSE 1 END
     LIMIT 1;
    IF v_col IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: %.% has nowhere to keep custom fields', v_schema, v_table
        USING ERRCODE = 'undefined_column',
              HINT = 'A table takes custom fields through a jsonb column named custom_fields (the canonical name) or custom (the older one). This table has neither, so an index over one would be a statement that cannot run.';
    END IF;

    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid';
  ELSE
    -- LANE7-W6H (2026-10-03): custom objects are retired; a field names a standard table or nothing.
    RAISE EXCEPTION 'custom_field_index_ddl: % is a field of a retired custom object, so there is nothing to index', d.field_key
      USING ERRCODE = 'check_violation',
            HINT = 'Custom objects moved to the record store (custom.*); its tables index their own fields.';
  END IF;

  v_expr := platform.custom_field_index_expr(d.field_type, d.field_key, v_col);
  IF v_expr IS NULL THEN
    RAISE EXCEPTION 'custom_field_index_ddl: field_type % is not promotable', d.field_type
      USING ERRCODE = 'check_violation',
            HINT = 'multi_select and file values are served by the GIN containment index on the whole column; promoting them would index a shape, not a value.';
  END IF;

  IF v_soft THEN v_pred := v_pred || ' AND deleted_at IS NULL'; END IF;

  RETURN 'CREATE ' || CASE WHEN d.is_unique THEN 'UNIQUE ' ELSE '' END
      || 'INDEX ' || CASE WHEN p_concurrently THEN 'CONCURRENTLY ' ELSE '' END
      || 'IF NOT EXISTS ' || quote_ident(platform.custom_field_index_name(p_definition_id))
      || ' ON ' || quote_ident(v_schema) || '.' || quote_ident(v_table)
      || ' (' || v_expr || ') WHERE ' || v_pred;
END $function$;

CREATE OR REPLACE FUNCTION platform.backfill_record_names(p_definition_id uuid, p_batch integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- LANE7-W6H (2026-10-03): CUSTOM OBJECTS ARE RETIRED (they moved to the record store, custom.*, whose
  -- records name themselves). This door named the records of the retired custom-object tables, which hold
  -- none; it now says so instead of reading the retired tables. Signature kept so no caller breaks.
  RAISE EXCEPTION 'Custom objects moved to the record store, so there are no record names to backfill here (asked for %).', p_definition_id
    USING ERRCODE = '0A000',
          HINT = 'A store table''s records are named by custom.* on every write; nothing was changed.';
END $function$;

CREATE OR REPLACE FUNCTION platform._custom_field_definition_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    -- LANE7-W6H (2026-10-03): CUSTOM OBJECTS ARE RETIRED. A field names a standard table (entity_table)
    -- and nothing else; a custom object's fields live in the record store (custom.field).
    RAISE EXCEPTION 'custom_field_definition: custom objects moved to the record store, so a field here names a standard table'
      USING ERRCODE = 'check_violation',
            HINT = 'Add the field to the store table instead (custom.field_declare).';
  END IF;

  IF NEW.reference_target_token IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = NEW.reference_target_token AND is_active) THEN
    RAISE EXCEPTION 'custom_field_definition: reference_target_token % is not an active entity token', NEW.reference_target_token
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reference_target_definition_id IS NOT NULL THEN   -- LANE7-W6H: no custom object to point at
    RAISE EXCEPTION 'custom_field_definition: custom objects moved to the record store, so a reference names a standard table'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RD-3's honest defect, defended: workbench.udt_structured_lists.organization_id is
  -- NULLABLE live (legacy). A NULL-org or foreign-org list is refused here rather than
  -- becoming a cross-org read at render time.
  IF NEW.option_list_id IS NOT NULL THEN
    -- SWITCH-STEP-TWO: the older pick lists are in the deprecated, so a field cannot point at one any more.
    IF TG_OP = 'INSERT' OR NEW.option_list_id IS DISTINCT FROM OLD.option_list_id THEN
      RAISE EXCEPTION 'A custom field keeps its choices on itself now; a pick list id is no longer accepted.'
        USING ERRCODE = 'check_violation',
              HINT = 'Put the choices in options. The older pick lists moved to the record store at the final switch and their tables are in the deprecated.';
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
    END IF;   -- LANE7-W6H: only standard tables reach here
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'custom_field_definition: this target already holds % of a maximum % custom fields', v_count, v_cap
        USING ERRCODE = 'check_violation',
              HINT = 'Limit: extensibility.custom_fields.max_fields_per_target' ||
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
    END IF;   -- LANE7-W6H: a retired custom object holds no values

    IF v_used THEN
      RAISE EXCEPTION 'custom_field_definition: field_key / field_type / reference_target_token are immutable once values exist for %', OLD.field_key
        USING ERRCODE = 'check_violation',
              HINT = 'Changing any of them silently re-interprets every stored value. The supported path is: archive this definition, create a new one, migrate deliberately (SPEC-EXTENSIBILITY 2.2).';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- The two SECURITY DEFINER bodies replaced here that had no access declaration: declared IN DATA,
-- server-only (neither is granted to a client role; neither changes who may call it).
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
SELECT d.* FROM (VALUES
  ('platform', 'promote_custom_field_index', 'p_definition_id uuid, p_concurrently boolean', ARRAY['uuid'::regtype,'boolean'::regtype]::oid[],
   'p_definition_id: a platform.custom_field_definition row, unknown -> foreign_key_violation; builds an index only for a standard table.',
   'migrations/campaign/lane7w6h_a_custom_fields_name_standard_tables_only.sql (lane 7 STANDARD-TABLES W6H)',
   'server_only: index promotion is a platform operator''s action on the retiring field system; no client role holds EXECUTE.', false, false,
   '{"version":1,"arguments":{"p_definition_id":{"type":"uuid","position":1,"optional":false,"null_rule":{},"foreign":{"bounded":true,"note":"Server-only; an unknown id is refused before any read."}},"p_concurrently":{"type":"boolean","position":2,"optional":true,"null_rule":{},"foreign":{"not_an_id":true}}}}'::jsonb),
  ('platform', 'backfill_record_names', 'p_definition_id uuid, p_batch integer', ARRAY['uuid'::regtype,'integer'::regtype]::oid[],
   'p_definition_id: no longer read; the door refuses (custom objects retired).',
   'migrations/campaign/lane7w6h_a_custom_fields_name_standard_tables_only.sql (lane 7 STANDARD-TABLES W6H)',
   'server_only: a retired platform job (custom objects moved to the record store); it now only refuses, and no client role holds EXECUTE.', false, false,
   '{"version":1,"arguments":{"p_definition_id":{"type":"uuid","position":1,"optional":false,"null_rule":{},"foreign":{"bounded":true,"note":"Never read: the door refuses every call."}},"p_batch":{"type":"integer","position":2,"optional":true,"null_rule":{},"foreign":{"not_an_id":true}}}}'::jsonb)
) d(schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
 WHERE NOT EXISTS (SELECT 1 FROM platform.client_callable_door c WHERE c.schema_name = d.schema_name AND c.function_name = d.function_name);

ALTER TABLE platform.custom_field_definition DROP CONSTRAINT IF EXISTS custom_field_definition_target_definition_id_fkey;
ALTER TABLE platform.custom_field_definition DROP CONSTRAINT IF EXISTS custom_field_definition_reference_target_definition_id_fkey;
