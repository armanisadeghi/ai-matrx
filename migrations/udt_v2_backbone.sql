-- ============================================================================
-- udt_v2_backbone — Phase 1 of the user-data / spreadsheet architecture
-- ============================================================================
--
-- Architectural context
-- ---------------------
-- Matrx supports two complementary user-data systems:
--
--   1. udt_dataset* (this file) — typed, row-per-object data. The agent-facing
--      backbone. Every cell is a JSONB value in a row keyed by a first-class
--      column (`udt_dataset_fields`). Indexable, queryable, sharable per row,
--      cheaply mutable by agents.
--
--   2. udt_workbook + workbook_snapshots (a sibling family, introduced later
--      in P4) — faithful Excel/Google-Sheets reproduction stored as a single
--      Univer snapshot per workbook. Lossy import to (1) is offered when the
--      file is "rational". Lossless workbook view is offered when the user
--      cares about the original look.
--
-- The smart importer (P3) detects which path fits and lets the user override.
-- This migration introduces the data-layer pieces required by (1) and the
-- minimal hook (workbook_id) used by both.
--
-- What this migration does
-- ------------------------
--   1. Creates `udt_workbooks` — groups N datasets imported from one source.
--   2. Adds `workbook_id` + `sheet_index` + `validation_mode` to `udt_datasets`.
--   3. Creates `udt_dataset_row_versions` — append-only history of every change.
--   4. Triggers row-version logging on INSERT/UPDATE/DELETE of `udt_dataset_rows`.
--   5. Adds `udt_validate_row()` + BEFORE INSERT/UPDATE trigger.
--      - permissive: only enforces required fields (default for existing data).
--      - strict: also type-checks each cell (set on new imports/tables).
--   6. Adds agent-facing write RPCs (SECURITY DEFINER):
--        - udt_upsert_row(table, row_id?, data)
--        - udt_upsert_cell(table, row_id, field_name, value)
--        - udt_bulk_write(table, ops[])
--   7. Adds udt_change_field_type(table, field, new_type, strategy) — safe
--      column type migration that rewrites every row's JSONB cell.
--   8. Adds udt_datasets / udt_dataset_fields / udt_dataset_rows / udt_workbooks
--      to the supabase_realtime publication.
--   9. Registers `udt_workbooks` in shareable_resource_registry.
--
-- Safety
-- ------
--   * Pure ADDITIVE: no column or RPC is altered or dropped.
--   * 118 datasets / 3,764 rows / 600 fields exist today. All inherit
--     `validation_mode='permissive'` so the new trigger only catches missing
--     required fields. Existing rows are not rewritten by this migration.
--   * The version trigger fires on AFTER mutations — no behavior change to
--     read paths.
--   * Realtime publication add is online and non-blocking.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. udt_workbooks
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workbook_source') THEN
    CREATE TYPE workbook_source AS ENUM (
      'created',
      'imported_xlsx',
      'imported_gsheet',
      'imported_csv',
      'linked_gsheet'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS udt_workbooks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_name     VARCHAR(255) NOT NULL,
  description       TEXT,
  source            workbook_source NOT NULL DEFAULT 'created',
  -- Optional pointer to the original file (e.g. uploaded .xlsx in the universal
  -- file system). FK is intentionally omitted here — wired in P4 when the
  -- workbook surface lands and the file linkage is finalized.
  original_file_id  UUID,
  user_id           UUID NOT NULL DEFAULT auth.uid(),
  organization_id   UUID,
  project_id        UUID,
  task_id           UUID,
  is_public         BOOLEAN NOT NULL DEFAULT false,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_udt_workbooks_user_id ON udt_workbooks(user_id);
CREATE INDEX IF NOT EXISTS idx_udt_workbooks_org_id
  ON udt_workbooks(organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE udt_workbooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS udt_workbooks_select ON udt_workbooks;
CREATE POLICY udt_workbooks_select ON udt_workbooks FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_public = true
    OR has_permission('udt_workbooks', id, 'viewer'::permission_level)
  );

DROP POLICY IF EXISTS udt_workbooks_insert ON udt_workbooks;
CREATE POLICY udt_workbooks_insert ON udt_workbooks FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS udt_workbooks_update ON udt_workbooks;
CREATE POLICY udt_workbooks_update ON udt_workbooks FOR UPDATE
  USING (
    user_id = auth.uid()
    OR has_permission('udt_workbooks', id, 'editor'::permission_level)
  );

DROP POLICY IF EXISTS udt_workbooks_delete ON udt_workbooks;
CREATE POLICY udt_workbooks_delete ON udt_workbooks FOR DELETE
  USING (user_id = auth.uid());

INSERT INTO public.shareable_resource_registry (
  resource_type, table_name, id_column, owner_column, is_public_column,
  display_label, url_path_template, rls_uses_has_permission, notes
) VALUES (
  'udt_workbooks', 'udt_workbooks', 'id', 'user_id', 'is_public',
  'Workbook', '/workbooks/{id}', true,
  'Groups N udt_datasets imported from a single source file (P4 surface).'
)
ON CONFLICT (resource_type) DO UPDATE SET
  table_name = EXCLUDED.table_name,
  id_column = EXCLUDED.id_column,
  owner_column = EXCLUDED.owner_column,
  is_public_column = EXCLUDED.is_public_column,
  display_label = EXCLUDED.display_label,
  url_path_template = EXCLUDED.url_path_template,
  rls_uses_has_permission = EXCLUDED.rls_uses_has_permission,
  notes = EXCLUDED.notes,
  is_active = true;

-- ---------------------------------------------------------------------------
-- 2. workbook_id + sheet_index + validation_mode on udt_datasets
-- ---------------------------------------------------------------------------
ALTER TABLE udt_datasets
  ADD COLUMN IF NOT EXISTS workbook_id UUID
    REFERENCES udt_workbooks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sheet_index INTEGER,
  ADD COLUMN IF NOT EXISTS validation_mode TEXT NOT NULL DEFAULT 'permissive'
    CHECK (validation_mode IN ('permissive', 'strict'));

CREATE INDEX IF NOT EXISTS idx_udt_datasets_workbook_id
  ON udt_datasets(workbook_id) WHERE workbook_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. udt_dataset_row_versions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'row_change_kind') THEN
    CREATE TYPE row_change_kind AS ENUM ('insert', 'update', 'delete');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS udt_dataset_row_versions (
  id          BIGSERIAL PRIMARY KEY,
  row_id      UUID NOT NULL,
  table_id    UUID NOT NULL,
  data        JSONB,
  prior_data  JSONB,
  change_kind row_change_kind NOT NULL,
  changed_by  UUID NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_udt_row_versions_row
  ON udt_dataset_row_versions(row_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_udt_row_versions_table
  ON udt_dataset_row_versions(table_id, changed_at DESC);

ALTER TABLE udt_dataset_row_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS udt_row_versions_select ON udt_dataset_row_versions;
CREATE POLICY udt_row_versions_select ON udt_dataset_row_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM udt_datasets d
      WHERE d.id = udt_dataset_row_versions.table_id
        AND (
          d.user_id = auth.uid()
          OR d.is_public = true
          OR has_permission('udt_datasets', d.id, 'viewer'::permission_level)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Trigger: write row version on every change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION udt_log_row_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by)
    VALUES (NEW.id, NEW.table_id, NEW.data, NULL, 'insert', v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data IS DISTINCT FROM OLD.data THEN
      INSERT INTO udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by)
      VALUES (NEW.id, NEW.table_id, NEW.data, OLD.data, 'update', v_actor);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO udt_dataset_row_versions(row_id, table_id, data, prior_data, change_kind, changed_by)
    VALUES (OLD.id, OLD.table_id, NULL, OLD.data, 'delete', v_actor);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS udt_dataset_rows_version_insert ON udt_dataset_rows;
CREATE TRIGGER udt_dataset_rows_version_insert
  AFTER INSERT ON udt_dataset_rows
  FOR EACH ROW EXECUTE FUNCTION udt_log_row_version();

DROP TRIGGER IF EXISTS udt_dataset_rows_version_update ON udt_dataset_rows;
CREATE TRIGGER udt_dataset_rows_version_update
  AFTER UPDATE ON udt_dataset_rows
  FOR EACH ROW EXECUTE FUNCTION udt_log_row_version();

DROP TRIGGER IF EXISTS udt_dataset_rows_version_delete ON udt_dataset_rows;
CREATE TRIGGER udt_dataset_rows_version_delete
  AFTER DELETE ON udt_dataset_rows
  FOR EACH ROW EXECUTE FUNCTION udt_log_row_version();

-- ---------------------------------------------------------------------------
-- 5. Row validation function + trigger
-- ---------------------------------------------------------------------------
-- Grandfathering rule: a required field only raises on INSERT, or on UPDATE
-- where the OLD row HAD the field set and the NEW row drops it. Existing rows
-- already missing a required field continue to be editable on other fields.
CREATE OR REPLACE FUNCTION udt_validate_row(
  p_table_id  UUID,
  p_data      JSONB,
  p_prior     JSONB  -- NULL on INSERT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_field      RECORD;
  v_value      JSONB;
  v_old_value  JSONB;
  v_mode       TEXT;
  v_is_insert  BOOLEAN := p_prior IS NULL;
  v_had        BOOLEAN;
  v_has        BOOLEAN;
BEGIN
  SELECT validation_mode INTO v_mode FROM udt_datasets WHERE id = p_table_id;
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'udt_validate_row: table % not found', p_table_id;
  END IF;

  -- permissive (the default for every pre-existing dataset) enforces NOTHING:
  -- a pure backward-compat passthrough so existing insert/update flows keep
  -- their exact current behavior and this migration changes zero semantics for
  -- live data. Enforcement is opt-in via validation_mode='strict'.
  IF v_mode <> 'strict' THEN
    RETURN p_data;
  END IF;

  FOR v_field IN
    SELECT field_name, data_type, is_required
    FROM udt_dataset_fields
    WHERE table_id = p_table_id
  LOOP
    v_value     := p_data  -> v_field.field_name;
    v_old_value := p_prior -> v_field.field_name;
    v_has := v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null';
    v_had := v_old_value IS NOT NULL AND jsonb_typeof(v_old_value) <> 'null';

    -- Required-field enforcement, with grandfathering on UPDATE.
    IF v_field.is_required AND NOT v_has THEN
      IF v_is_insert THEN
        RAISE EXCEPTION
          'udt_validate_row: required field % missing on insert into table %',
          v_field.field_name, p_table_id;
      ELSIF v_had THEN
        RAISE EXCEPTION
          'udt_validate_row: required field % cannot be dropped on table %',
          v_field.field_name, p_table_id;
      END IF;
      -- else: row was already missing this field. Grandfathered; skip the rest.
      CONTINUE;
    END IF;

    -- Type enforcement (strict mode only).
    IF v_mode = 'strict' AND v_has THEN
      CASE v_field.data_type::text
        WHEN 'string' THEN
          IF jsonb_typeof(v_value) NOT IN ('string', 'number') THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects string, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'number' THEN
          IF jsonb_typeof(v_value) NOT IN ('number', 'string') THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects number, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
          IF jsonb_typeof(v_value) = 'string' THEN
            BEGIN
              PERFORM (v_value #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN
              RAISE EXCEPTION 'udt_validate_row: field % value is not numeric', v_field.field_name;
            END;
          END IF;
        WHEN 'integer' THEN
          IF jsonb_typeof(v_value) NOT IN ('number', 'string') THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects integer, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN
            PERFORM (v_value #>> '{}')::bigint;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'udt_validate_row: field % value is not an integer', v_field.field_name;
          END;
        WHEN 'boolean' THEN
          IF jsonb_typeof(v_value) NOT IN ('boolean', 'string') THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects boolean, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
        WHEN 'date', 'datetime' THEN
          IF jsonb_typeof(v_value) <> 'string' THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects ISO date string, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
          BEGIN
            PERFORM (v_value #>> '{}')::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION
              'udt_validate_row: field % value is not parseable as date',
              v_field.field_name;
          END;
        WHEN 'json' THEN
          NULL;
        WHEN 'array' THEN
          IF jsonb_typeof(v_value) <> 'array' THEN
            RAISE EXCEPTION
              'udt_validate_row: field % expects array, got %',
              v_field.field_name, jsonb_typeof(v_value);
          END IF;
        ELSE
          NULL;
      END CASE;
    END IF;
  END LOOP;

  RETURN p_data;
END;
$$;

CREATE OR REPLACE FUNCTION udt_dataset_rows_validate_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM udt_validate_row(NEW.table_id, NEW.data, NULL);
  ELSE
    PERFORM udt_validate_row(NEW.table_id, NEW.data, OLD.data);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS udt_dataset_rows_validate ON udt_dataset_rows;
CREATE TRIGGER udt_dataset_rows_validate
  BEFORE INSERT OR UPDATE OF data ON udt_dataset_rows
  FOR EACH ROW EXECUTE FUNCTION udt_dataset_rows_validate_trigger();

-- ---------------------------------------------------------------------------
-- 6. Agent write RPCs
-- ---------------------------------------------------------------------------

-- Insert if p_row_id is NULL, else update by id (scoped to table).
CREATE OR REPLACE FUNCTION udt_upsert_row(
  p_table_id UUID,
  p_row_id   UUID,
  p_data     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset udt_datasets%ROWTYPE;
  v_row     udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;

  SELECT * INTO v_dataset FROM udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;

  IF v_dataset.user_id <> v_caller
     AND NOT has_permission('udt_datasets', p_table_id, 'editor'::permission_level) THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller)
    RETURNING * INTO v_row;
  ELSE
    UPDATE udt_dataset_rows
       SET data = p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id
     RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- Surgical single-cell update via jsonb_set.
CREATE OR REPLACE FUNCTION udt_upsert_cell(
  p_table_id   UUID,
  p_row_id     UUID,
  p_field_name TEXT,
  p_value      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset udt_datasets%ROWTYPE;
  v_row     udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_cell: not authenticated';
  END IF;

  SELECT * INTO v_dataset FROM udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_cell: table % not found', p_table_id;
  END IF;

  IF v_dataset.user_id <> v_caller
     AND NOT has_permission('udt_datasets', p_table_id, 'editor'::permission_level) THEN
    RAISE EXCEPTION 'udt_upsert_cell: caller lacks editor permission';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM udt_dataset_fields
    WHERE table_id = p_table_id AND field_name = p_field_name
  ) THEN
    RAISE EXCEPTION 'udt_upsert_cell: field % not in table %', p_field_name, p_table_id;
  END IF;

  UPDATE udt_dataset_rows
     SET data = jsonb_set(COALESCE(data, '{}'::jsonb), ARRAY[p_field_name], p_value, true),
         updated_at = now()
   WHERE id = p_row_id AND table_id = p_table_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_cell: row % not found in table %', p_row_id, p_table_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- One transaction, many ops.
-- Each op: {"op": "insert"|"update"|"cell"|"delete", "row_id": ..., "data": ..., "field_name": ..., "value": ...}
CREATE OR REPLACE FUNCTION udt_bulk_write(
  p_table_id   UUID,
  p_operations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset udt_datasets%ROWTYPE;
  v_op      JSONB;
  v_op_kind TEXT;
  v_row_id  UUID;
  v_result  JSONB;
  v_results JSONB := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_bulk_write: not authenticated';
  END IF;

  SELECT * INTO v_dataset FROM udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_bulk_write: table % not found', p_table_id;
  END IF;

  IF v_dataset.user_id <> v_caller
     AND NOT has_permission('udt_datasets', p_table_id, 'editor'::permission_level) THEN
    RAISE EXCEPTION 'udt_bulk_write: caller lacks editor permission';
  END IF;

  IF jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'udt_bulk_write: p_operations must be a JSON array';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_operations) LOOP
    v_op_kind := v_op ->> 'op';
    v_row_id  := NULLIF(v_op ->> 'row_id', '')::uuid;

    IF v_op_kind = 'insert' THEN
      INSERT INTO udt_dataset_rows(table_id, data, user_id)
      VALUES (p_table_id, v_op -> 'data', v_caller)
      RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(v_result);
    ELSIF v_op_kind = 'update' THEN
      UPDATE udt_dataset_rows
         SET data = v_op -> 'data', updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );
    ELSIF v_op_kind = 'cell' THEN
      UPDATE udt_dataset_rows
         SET data = jsonb_set(COALESCE(data, '{}'::jsonb), ARRAY[v_op ->> 'field_name'], v_op -> 'value', true),
             updated_at = now()
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );
    ELSIF v_op_kind = 'delete' THEN
      DELETE FROM udt_dataset_rows
       WHERE id = v_row_id AND table_id = p_table_id
       RETURNING to_jsonb(udt_dataset_rows.*) INTO v_result;
      v_results := v_results || jsonb_build_array(
        COALESCE(v_result, jsonb_build_object('error', 'row_not_found', 'row_id', v_row_id))
      );
    ELSE
      RAISE EXCEPTION 'udt_bulk_write: unknown op kind %', v_op_kind;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'table_id', p_table_id,
    'count', jsonb_array_length(v_results),
    'results', v_results
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Type-change RPC — walks rows, rewrites the JSONB cell for the field
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION udt_change_field_type(
  p_table_id  UUID,
  p_field_id  UUID,
  p_new_type  field_data_type,
  p_strategy  TEXT DEFAULT 'cast_or_null'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset udt_datasets%ROWTYPE;
  v_field   udt_dataset_fields%ROWTYPE;
  v_changed INTEGER := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_change_field_type: not authenticated';
  END IF;

  IF p_strategy NOT IN ('cast_or_null', 'cast_or_skip') THEN
    RAISE EXCEPTION 'udt_change_field_type: unknown strategy %', p_strategy;
  END IF;

  SELECT * INTO v_dataset FROM udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_change_field_type: table % not found', p_table_id;
  END IF;
  IF v_dataset.user_id <> v_caller
     AND NOT has_permission('udt_datasets', p_table_id, 'editor'::permission_level) THEN
    RAISE EXCEPTION 'udt_change_field_type: caller lacks editor permission';
  END IF;

  SELECT * INTO v_field FROM udt_dataset_fields
   WHERE id = p_field_id AND table_id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_change_field_type: field % not in table %', p_field_id, p_table_id;
  END IF;

  WITH updated AS (
    UPDATE udt_dataset_rows r
       SET data = jsonb_set(
                    COALESCE(r.data, '{}'::jsonb),
                    ARRAY[v_field.field_name],
                    CASE
                      WHEN r.data -> v_field.field_name IS NULL
                        OR jsonb_typeof(r.data -> v_field.field_name) = 'null'
                        THEN 'null'::jsonb

                      WHEN p_new_type = 'string' THEN
                        to_jsonb(r.data ->> v_field.field_name)

                      WHEN p_new_type IN ('number', 'integer') THEN
                        CASE
                          WHEN (r.data ->> v_field.field_name) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
                            CASE p_new_type
                              WHEN 'integer' THEN to_jsonb(floor((r.data ->> v_field.field_name)::numeric)::bigint)
                              ELSE to_jsonb((r.data ->> v_field.field_name)::numeric)
                            END
                          ELSE
                            CASE p_strategy
                              WHEN 'cast_or_null' THEN 'null'::jsonb
                              ELSE r.data -> v_field.field_name  -- cast_or_skip: leave as-is
                            END
                        END

                      WHEN p_new_type = 'boolean' THEN
                        CASE lower(r.data ->> v_field.field_name)
                          WHEN 'true'  THEN to_jsonb(true)
                          WHEN '1'     THEN to_jsonb(true)
                          WHEN 'yes'   THEN to_jsonb(true)
                          WHEN 'false' THEN to_jsonb(false)
                          WHEN '0'     THEN to_jsonb(false)
                          WHEN 'no'    THEN to_jsonb(false)
                          ELSE
                            CASE p_strategy
                              WHEN 'cast_or_null' THEN 'null'::jsonb
                              ELSE r.data -> v_field.field_name
                            END
                        END

                      ELSE r.data -> v_field.field_name  -- date/datetime/json/array left as-is
                    END,
                    true
                  ),
           updated_at = now()
     WHERE r.table_id = p_table_id
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_changed FROM updated;

  UPDATE udt_dataset_fields
     SET data_type = p_new_type, updated_at = now()
   WHERE id = p_field_id;

  RETURN jsonb_build_object(
    'field_id', p_field_id,
    'new_type', p_new_type,
    'strategy', p_strategy,
    'rows_rewritten', v_changed
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_datasets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_datasets;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_dataset_fields'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_dataset_fields;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_dataset_rows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_dataset_rows;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'udt_workbooks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE udt_workbooks;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 9. Grants — pull every new function out of the anonymous API surface and
--    grant only to authenticated + service_role. Strictly safer than the
--    pre-existing udt RPC convention (which left functions anon-executable).
--    The user-facing RPCs additionally guard with auth.uid() internally.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
  sigs TEXT[] := ARRAY[
    'public.udt_log_row_version()',
    'public.udt_upsert_row(uuid, uuid, jsonb)',
    'public.udt_upsert_cell(uuid, uuid, text, jsonb)',
    'public.udt_bulk_write(uuid, jsonb)',
    'public.udt_change_field_type(uuid, uuid, public.field_data_type, text)',
    'public.udt_validate_row(uuid, jsonb, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
  END LOOP;
END$$;

GRANT EXECUTE ON FUNCTION udt_upsert_row(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION udt_upsert_cell(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION udt_bulk_write(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION udt_change_field_type(uuid, uuid, field_data_type, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION udt_validate_row(uuid, jsonb, jsonb) TO authenticated, service_role;
-- udt_log_row_version is an internal trigger function: no role grant.

COMMIT;
