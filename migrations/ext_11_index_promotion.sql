-- ext_11_index_promotion.sql
-- HRB-010 / C6 -- SPEC-EXTENSIBILITY 2.5: is_indexed -> a PER-ORG PARTIAL EXPRESSION
-- INDEX. Never a generated column: a hot key is a per-TENANT fact and a generated column
-- is a per-TABLE resource, so N orgs promoting their own keys would grow the column count
-- without bound against Postgres's 1600-column ceiling. A partial expression index
-- indexes only the promoting org's rows, costs no column, and drops cleanly when the
-- definition is archived.
--
-- 🚨 platform.demote_custom_field_index and platform._custom_field_index_state are
-- re-declared by ext_16 and ext_17. Read those before changing either.

-- 🚨 THE CAST TRAP, SOLVED ONCE. custom->>'k' is TEXT: ordering by it sorts "1","101","2".
-- A query whose cast does not match the index expression CHARACTER FOR CHARACTER will not
-- use the index. This function is THE single emitter both the index and the kit's query
-- builder read, so they cannot drift.
CREATE OR REPLACE FUNCTION platform.custom_field_index_expr(
  p_field_type text, p_field_key text, p_column text DEFAULT 'custom')
RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $fn$
BEGIN
  IF p_field_key !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'custom_field_index_expr: % is not a legal field_key', p_field_key
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE p_field_type
    WHEN 'number'   THEN '(((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || ')::numeric))'
    WHEN 'boolean'  THEN '(((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || ')::boolean))'
    WHEN 'currency' THEN '(((' || quote_ident(p_column) || '->' || quote_literal(p_field_key) || '->>''amount'')::numeric))'
    WHEN 'multi_select' THEN NULL
    WHEN 'file'         THEN NULL
    ELSE '((' || quote_ident(p_column) || '->>' || quote_literal(p_field_key) || '))'
  END;
END $fn$;

GRANT EXECUTE ON FUNCTION platform.custom_field_index_expr(text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION platform.custom_field_index_expr(text, text, text) IS
'THE only sanctioned emitter of a custom-field sort/filter expression (SPEC-EXTENSIBILITY 2.5). The promoted index and the client kit''s query builder BOTH read it, character for character. Returns NULL for multi_select and file, which are served by the GIN containment index and are not promotable. Hand-written PostgREST calls against `custom` are a review failure precisely because they cannot call this.';

CREATE OR REPLACE FUNCTION platform.custom_field_index_name(p_definition_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT 'cf_' || replace(p_definition_id::text, '-', '') $$;

-- The exact DDL. A background job runs THIS text outside a transaction so CONCURRENTLY is
-- legal; the in-transaction path passes p_concurrently => false.
CREATE OR REPLACE FUNCTION platform.custom_field_index_ddl(
  p_definition_id uuid, p_concurrently boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  d record; v_schema text; v_table text; v_col text; v_expr text;
  v_pred text; v_soft boolean;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom_field_index_ddl: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF d.target_kind = 'entity_table' THEN
    SELECT et.schema_name, et.table_name, et.has_soft_delete INTO v_schema, v_table, v_soft
      FROM platform.entity_types et WHERE et.token = d.target_token;
    IF v_schema IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: token % is not registered', d.target_token
        USING ERRCODE = 'check_violation';
    END IF;
    v_col  := 'custom';
    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid';
  ELSE
    v_schema := 'platform'; v_table := 'custom_record'; v_soft := true;
    v_col  := 'data';
    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid'
           || ' AND entity_definition_id = ' || quote_literal(d.target_definition_id::text) || '::uuid';
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
END $fn$;

GRANT EXECUTE ON FUNCTION platform.custom_field_index_ddl(uuid, boolean) TO service_role;

-- Promotion. Owns index_state: pending -> active | failed, with index_error recorded.
-- Quota'd; hitting the ceiling is a real signal and says so in words.
CREATE OR REPLACE FUNCTION platform.promote_custom_field_index(
  p_definition_id uuid, p_concurrently boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
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
     AND ( (d.target_kind = 'entity_table'  AND x.target_kind = 'entity_table'  AND x.target_token = d.target_token)
        OR (d.target_kind = 'custom_entity' AND x.target_kind = 'custom_entity' AND x.target_definition_id = d.target_definition_id) );
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
END $fn$;

GRANT EXECUTE ON FUNCTION platform.promote_custom_field_index(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION platform.demote_custom_field_index(p_definition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_name text;
BEGIN
  v_name := platform.custom_field_index_name(p_definition_id);
  EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(v_name);
  UPDATE platform.custom_field_definition
     SET index_state = 'none', index_name = NULL, index_error = NULL
   WHERE id = p_definition_id;
  RETURN jsonb_build_object('ok', true, 'definition_id', p_definition_id, 'dropped', v_name);
END $fn$;

GRANT EXECUTE ON FUNCTION platform.demote_custom_field_index(uuid) TO service_role;

-- is_indexed is a TOGGLE a tenant flips; the DDL is never a synchronous side effect of
-- that flip (CREATE INDEX CONCURRENTLY cannot run in the flipping transaction). The
-- trigger only moves the queue state; the job does the work.
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
    NEW.index_state := 'pending'; NEW.index_error := NULL;
  ELSIF (NOT NEW.is_indexed AND OLD.is_indexed)
     OR (NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
     OR (NEW.deleted_at  IS NOT NULL AND OLD.deleted_at  IS NULL) THEN
    IF OLD.index_state = 'active' THEN
      PERFORM platform.demote_custom_field_index(OLD.id);
      NEW.index_state := 'none'; NEW.index_name := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS _index_state ON platform.custom_field_definition;
CREATE TRIGGER _index_state
  BEFORE INSERT OR UPDATE ON platform.custom_field_definition
  FOR EACH ROW EXECUTE FUNCTION platform._custom_field_index_state();

-- The background job's work queue (2.5): the aidream worker reads this, runs
-- custom_field_index_ddl(id, true) OUTSIDE a transaction, then records the state.
CREATE OR REPLACE VIEW platform.custom_field_index_due AS
  SELECT d.id AS definition_id, d.organization_id, d.target_kind, d.target_token,
         d.target_definition_id, d.field_key, d.field_type, d.is_unique,
         d.index_state, d.index_error,
         platform.custom_field_index_name(d.id) AS index_name
    FROM platform.custom_field_definition d
   WHERE d.deleted_at IS NULL AND d.archived_at IS NULL
     AND d.is_indexed AND d.index_state IN ('pending','failed');
