-- ctx_context_reference_cells.sql
--
-- Context Reference Cells: a `value_type='reference'` context item now declares
-- WHAT it may point at (`allowed_reference_types`, the Matrx reference-fence
-- taxonomy — never platform.associations) and HOW MANY (`max_items`, default 1).
-- The cell itself always stores the canonical ```matrx kind:"reference" fence in
-- `value_text` (the same encoding picklists already use) — never a bare uuid.
-- A denormalized reverse index (`context_value_refs`) is maintained on every
-- write so "what points at file X / scope Y" is a plain indexed lookup from
-- day one, never a full-table fence scan.
--
-- Both public write RPCs (set_context_value, set_scope_context_value) become
-- thin authz wrappers around one new writer, context.write_context_value —
-- the single place validation + reverse-indexing happens, regardless of which
-- RPC the caller used. The existing trg_ctx_version_context_item_value trigger
-- still owns version/is_current/char_count — untouched.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

-- 1) Item-definition config ---------------------------------------------------
ALTER TABLE context.context_items
  ADD COLUMN IF NOT EXISTS allowed_reference_types text[],
  ADD COLUMN IF NOT EXISTS max_items integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allowed_scope_type_ids uuid[];

-- Backfill the 5 pre-existing value_type='reference' items (predate this slice;
-- their cells still carry legacy value_reference_id/value_reference_type, not a
-- fence — display/write migration for those cells is the matters-qme todo).
UPDATE context.context_items SET allowed_reference_types = ARRAY['scope'],
       allowed_scope_type_ids = ARRAY['2a0fff28-25db-4adc-89f4-e402df1121f5']::uuid[]
  WHERE id = '91399c45-a00d-43f0-a3ec-7e8334afc434' AND allowed_reference_types IS NULL; -- client -> Client scope
UPDATE context.context_items SET allowed_reference_types = ARRAY['scope'],
       allowed_scope_type_ids = ARRAY['eeb30787-c3fa-4492-97f2-af907eb01bb2']::uuid[]
  WHERE id = '892715ce-4151-48ce-9c15-8d3c008dca04' AND allowed_reference_types IS NULL; -- practice_area -> Practice Area scope
UPDATE context.context_items SET allowed_reference_types = ARRAY['scope'],
       allowed_scope_type_ids = ARRAY['d9d9fd0b-1d1a-4f4c-9778-fa7c08bb3882']::uuid[]
  WHERE id = 'fea205df-901a-4c5a-9101-1ce89fa9634d' AND allowed_reference_types IS NULL; -- ame_qme -> Expert scope
UPDATE context.context_items SET allowed_reference_types = ARRAY['agent']
  WHERE id = '42a81446-8854-4059-a43b-12c7e5460501' AND allowed_reference_types IS NULL; -- default_playbook -> agent
UPDATE context.context_items SET allowed_reference_types = ARRAY['file']
  WHERE id = '27fea878-6070-4d15-a497-5001f4d38670' AND allowed_reference_types IS NULL; -- ama_guides -> file

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'context_items_max_items_positive'
  ) THEN
    ALTER TABLE context.context_items
      ADD CONSTRAINT context_items_max_items_positive CHECK (max_items >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'context_items_reference_types_required'
  ) THEN
    ALTER TABLE context.context_items
      ADD CONSTRAINT context_items_reference_types_required CHECK (
        value_type <> 'reference'
        OR (allowed_reference_types IS NOT NULL AND cardinality(allowed_reference_types) > 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN context.context_items.allowed_reference_types IS
  'Matrx reference-fence types (features/matrx-envelope REFERENCE_TYPES, e.g. file/url/scope/note) this item may point at. Required non-empty when value_type=reference.';
COMMENT ON COLUMN context.context_items.max_items IS
  'Max items in the cell''s reference fence. 1 = single value; >1 = list (e.g. QME Report can carry several files). Always explicit — never fake a list with "field 2", "field 3" sibling items.';
COMMENT ON COLUMN context.context_items.allowed_scope_type_ids IS
  'When allowed_reference_types includes "scope", further restricts to scopes of these scope types (e.g. Matter.client -> Client scopes only). NULL/empty = any scope type in the org.';

-- 2) Reverse index -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS context.context_value_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id uuid NOT NULL REFERENCES context.context_item_values(id) ON DELETE CASCADE,
  context_item_id uuid NOT NULL REFERENCES context.context_items(id) ON DELETE CASCADE,
  scope_id uuid NOT NULL REFERENCES context.scopes(id) ON DELETE CASCADE,
  ref_type text NOT NULL,
  ref_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_value_refs_target_idx
  ON context.context_value_refs (ref_type, ref_key);
CREATE INDEX IF NOT EXISTS context_value_refs_value_idx
  ON context.context_value_refs (value_id);
CREATE INDEX IF NOT EXISTS context_value_refs_item_idx
  ON context.context_value_refs (context_item_id);

ALTER TABLE context.context_value_refs ENABLE ROW LEVEL SECURITY;
-- No policies: this is an internal reverse index maintained ONLY by the
-- context.write_context_value SECURITY DEFINER path. Read access is via the
-- org-gated public.list_context_value_refs RPC below, never a direct grant.

COMMENT ON TABLE context.context_value_refs IS
  'Reverse index of every reference cell''s fence items, one row per (value, item) pointed-at entity. Maintained by context.index_reference_value(); query via public.list_context_value_refs(). History-preserving: a superseded value''s rows are kept for audit — join context_item_values.is_current for "currently referenced".';

-- 3) Fence parsing + validation + indexing (the ONE place this logic lives) ---

CREATE OR REPLACE FUNCTION context.parse_reference_fence(p_value_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_body text;
  v_json jsonb;
BEGIN
  IF p_value_text IS NULL THEN RETURN NULL; END IF;
  -- Accept either the fenced form (```matrx ... ```) or a bare envelope object.
  v_body := (regexp_match(p_value_text, '```matrx[ \t]*\r?\n(.*?)\r?\n```', 'ns'))[1];
  IF v_body IS NULL THEN
    v_body := trim(p_value_text);
  END IF;
  IF v_body IS NULL OR v_body = '' THEN RETURN NULL; END IF;

  BEGIN
    v_json := v_body::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF NOT (v_json ? 'matrx_version') OR (v_json->>'kind') IS DISTINCT FROM 'reference' THEN
    RETURN NULL;
  END IF;
  RETURN v_json;
END;
$$;

COMMENT ON FUNCTION context.parse_reference_fence(text) IS
  'Parses a ```matrx kind:"reference" fence (or bare envelope JSON) into its jsonb envelope, or NULL if p_value_text is not a valid reference fence. The single fence reader for context cells — mirrors features/matrx-envelope/referenceFence.ts#parseReferenceFence.';

CREATE OR REPLACE FUNCTION context.reference_item_ref_key(p_type text, p_item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p_item->>'id',
    p_item->>'file_id',
    p_item->>'url',
    p_item->>'row_id',
    p_item->>'item_id',
    p_item->>'table_id',
    p_item->>'list_id'
  );
$$;

COMMENT ON FUNCTION context.reference_item_ref_key(text, jsonb) IS
  'Extracts the reverse-lookup key from one flat reference-fence item, trying each canonical id field in the taxonomy (features/matrx-envelope REFERENCE_TYPES). Extend this (never a parallel extractor) when a new reference type''s identity field is not yet covered.';

CREATE OR REPLACE FUNCTION context.validate_reference_value(p_item_id uuid, p_value_text text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item context.context_items;
  v_envelope jsonb;
  v_type text;
  v_items jsonb;
  v_count int;
  v_scope_type_id uuid;
  v_scope_id uuid;
BEGIN
  SELECT * INTO v_item FROM context.context_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'context item % not found', p_item_id USING ERRCODE = '22023';
  END IF;

  IF v_item.value_type <> 'reference' THEN
    RETURN; -- nothing to validate for non-reference items
  END IF;

  IF p_value_text IS NULL THEN
    RETURN; -- clearing a reference cell is always allowed
  END IF;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    RAISE EXCEPTION 'value is not a valid matrx reference fence for item %', p_item_id
      USING ERRCODE = '22023';
  END IF;

  v_type := v_envelope->>'type';
  IF v_item.allowed_reference_types IS NULL
     OR NOT (v_type = ANY (v_item.allowed_reference_types)) THEN
    RAISE EXCEPTION 'reference type % is not allowed on item % (allowed: %)',
      v_type, p_item_id, v_item.allowed_reference_types
      USING ERRCODE = '22023';
  END IF;

  v_items := v_envelope->'items';
  v_count := COALESCE(jsonb_array_length(v_items), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'reference fence for item % has no items', p_item_id
      USING ERRCODE = '22023';
  END IF;
  IF v_count > v_item.max_items THEN
    RAISE EXCEPTION 'reference fence for item % carries % items, max_items is %',
      p_item_id, v_count, v_item.max_items
      USING ERRCODE = '22023';
  END IF;

  IF v_type = 'scope' AND v_item.allowed_scope_type_ids IS NOT NULL
     AND cardinality(v_item.allowed_scope_type_ids) > 0 THEN
    FOR v_scope_id IN
      SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_items) elem
    LOOP
      SELECT scope_type_id INTO v_scope_type_id FROM context.scopes WHERE id = v_scope_id;
      IF v_scope_type_id IS NULL OR NOT (v_scope_type_id = ANY (v_item.allowed_scope_type_ids)) THEN
        RAISE EXCEPTION 'scope % is not of an allowed scope type for item %', v_scope_id, p_item_id
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION context.validate_reference_value(uuid, text) IS
  'Validates a cell write against its item''s allowed_reference_types / max_items / allowed_scope_type_ids. No-op for non-reference items. The ONLY validation path — called from context.write_context_value before every insert.';

CREATE OR REPLACE FUNCTION context.index_reference_value(p_value_id uuid, p_item_id uuid, p_scope_id uuid, p_value_text text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_envelope jsonb;
  v_type text;
  v_item jsonb;
  v_key text;
BEGIN
  DELETE FROM context.context_value_refs WHERE value_id = p_value_id;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    RETURN;
  END IF;

  v_type := v_envelope->>'type';
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_envelope->'items')
  LOOP
    v_key := context.reference_item_ref_key(v_type, v_item);
    IF v_key IS NOT NULL THEN
      INSERT INTO context.context_value_refs (value_id, context_item_id, scope_id, ref_type, ref_key)
      VALUES (p_value_id, p_item_id, p_scope_id, v_type, v_key);
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION context.index_reference_value(uuid, uuid, uuid, text) IS
  'Rebuilds the context_value_refs rows for one cell version. Called from context.write_context_value after every insert; a no-op (after clearing old rows) when the value is not a reference fence.';

-- 4) The ONE cell writer --------------------------------------------------------
--    Both public.set_context_value and public.set_scope_context_value call this
--    after their own authz check, so validation + reverse-indexing lives exactly
--    once regardless of which RPC the caller used. Version/is_current/char_count
--    remain owned by the existing trg_ctx_version_context_item_value trigger.

CREATE OR REPLACE FUNCTION context.write_context_value(
  p_item_id uuid,
  p_scope_id uuid,
  p_value_text text DEFAULT NULL,
  p_value_number numeric DEFAULT NULL,
  p_value_boolean boolean DEFAULT NULL,
  p_value_json jsonb DEFAULT NULL,
  p_value_date date DEFAULT NULL,
  p_value_document_url text DEFAULT NULL,
  p_change_summary text DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_actor uuid DEFAULT NULL
)
RETURNS context.context_item_values
LANGUAGE plpgsql
AS $$
DECLARE
  v_row context.context_item_values;
BEGIN
  PERFORM context.validate_reference_value(p_item_id, p_value_text);

  -- Serialize concurrent writers on the same cell (item x scope); the version
  -- trigger recomputes MAX(version)+1 and is not otherwise concurrency-safe.
  PERFORM pg_advisory_xact_lock(hashtext('civ:' || p_item_id::text || ':' || p_scope_id::text));

  INSERT INTO context.context_item_values (
    context_item_id, scope_id,
    value_text, value_number, value_boolean, value_json, value_date, value_document_url,
    source_type, authored_by, change_summary
  ) VALUES (
    p_item_id, p_scope_id,
    p_value_text, p_value_number, p_value_boolean, p_value_json, p_value_date, p_value_document_url,
    p_source_type::public.context_source_type, p_actor, p_change_summary
  ) RETURNING * INTO v_row;

  PERFORM context.index_reference_value(v_row.id, p_item_id, p_scope_id, p_value_text);

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION context.write_context_value(uuid, uuid, text, numeric, boolean, jsonb, date, text, text, text, uuid) IS
  'The single writer for context_item_values: validates references, inserts (version/is_current/char_count owned by trg_ctx_version_context_item_value), rebuilds the reverse index. public.set_context_value and public.set_scope_context_value are both thin authz wrappers around this — never insert into context_item_values directly anywhere else.';

-- 5) Rewire the two public write RPCs onto the shared writer -------------------

CREATE OR REPLACE FUNCTION public.set_context_value(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID := auth.uid();
  v_item_id         UUID := (p_payload->>'context_item_id')::uuid;
  v_scope_id        UUID := (p_payload->>'scope_id')::uuid;
  v_source_type     TEXT := COALESCE(p_payload->>'source_type', 'ai_enriched');
  v_change_summary  TEXT := p_payload->>'change_summary';
  v_scope_org       UUID;
  v_scope_owner     UUID;
  v_can_write       BOOLEAN;
  v_row             context.context_item_values;
BEGIN
  -- acting_user_id is honored ONLY on the trusted backend path: a direct
  -- Postgres connection (matrx-orm pool) has no PostgREST JWT-claims GUC.
  IF v_uid IS NULL
     AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN
    v_uid := (p_payload->>'acting_user_id')::uuid;
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;
  IF v_item_id IS NULL OR v_scope_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','invalid_argument',
        'message','context_item_id and scope_id are required'));
  END IF;

  SELECT s.organization_id, s.created_by
    INTO v_scope_org, v_scope_owner
    FROM context.scopes s
   WHERE s.id = v_scope_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope not found'));
  END IF;

  v_can_write := (v_scope_owner = v_uid)
    OR EXISTS (
      SELECT 1 FROM iam.organization_member om
       WHERE om.organization_id = v_scope_org
         AND om.user_id = v_uid
    );
  IF NOT v_can_write THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller may not write this scope'));
  END IF;

  BEGIN
    v_row := context.write_context_value(
      p_item_id => v_item_id,
      p_scope_id => v_scope_id,
      p_value_text => p_payload->>'value_text',
      p_value_number => CASE WHEN p_payload ? 'value_number' THEN (p_payload->>'value_number')::numeric END,
      p_value_boolean => CASE WHEN p_payload ? 'value_boolean' THEN (p_payload->>'value_boolean')::boolean END,
      p_value_json => CASE WHEN p_payload ? 'value_json' THEN p_payload->'value_json' END,
      p_value_date => CASE WHEN p_payload ? 'value_date' THEN (p_payload->>'value_date')::date END,
      p_value_document_url => p_payload->>'value_document_url',
      p_change_summary => v_change_summary,
      p_source_type => v_source_type,
      p_actor => v_uid
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code','conflict',
          'message','concurrent write on this cell — retry'));
    WHEN SQLSTATE '22023' THEN
      RETURN jsonb_build_object('ok', false, 'error',
        jsonb_build_object('code','invalid_argument', 'message', SQLERRM));
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'context_item_id', v_row.context_item_id,
      'scope_id', v_row.scope_id,
      'version', v_row.version,
      'is_current', v_row.is_current,
      'value_text', v_row.value_text,
      'value_date', v_row.value_date,
      'source_type', v_row.source_type));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_scope_context_value(p_scope_id uuid, p_context_item_id uuid, p_value_text text DEFAULT NULL::text, p_value_number numeric DEFAULT NULL::numeric, p_value_boolean boolean DEFAULT NULL::boolean, p_value_json jsonb DEFAULT NULL::jsonb, p_value_document_url text DEFAULT NULL::text, p_value_date date DEFAULT NULL::date, p_change_summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  -- AuthZ: the caller must be a member of the scope's organization.
  IF NOT EXISTS (
    SELECT 1
    FROM context.scopes s
    JOIN iam.organization_member om
      ON om.organization_id = s.organization_id AND om.user_id = auth.uid()
    WHERE s.id = p_scope_id
  ) THEN
    RAISE EXCEPTION 'not authorized to write to scope %', p_scope_id
      USING ERRCODE = '42501';
  END IF;

  -- Integrity: the context item must belong to this scope's scope type.
  IF NOT EXISTS (
    SELECT 1
    FROM context.context_items ci
    JOIN context.scopes s ON s.id = p_scope_id
    WHERE ci.id = p_context_item_id AND ci.scope_type_id = s.scope_type_id
  ) THEN
    RAISE EXCEPTION 'context item % does not belong to scope %', p_context_item_id, p_scope_id
      USING ERRCODE = '22023';
  END IF;

  v_row := context.write_context_value(
    p_item_id => p_context_item_id,
    p_scope_id => p_scope_id,
    p_value_text => p_value_text,
    p_value_number => p_value_number,
    p_value_boolean => p_value_boolean,
    p_value_json => p_value_json,
    p_value_date => p_value_date,
    p_value_document_url => p_value_document_url,
    p_change_summary => p_change_summary,
    p_source_type => 'manual',
    p_actor => auth.uid()
  );

  RETURN jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_number', v_row.value_number,
    'value_boolean', v_row.value_boolean, 'value_json', v_row.value_json,
    'value_date', v_row.value_date,
    'value_document_url', v_row.value_document_url, 'created_at', v_row.created_at
  );
END;
$function$
;

-- 6) Item-definition CRUD + reads emit the new config columns -----------------

CREATE OR REPLACE FUNCTION public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_fetch_hint context_fetch_hint DEFAULT 'on_demand'::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT 'internal'::context_sensitivity, p_tags text[] DEFAULT '{}'::text[], p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_allowed_reference_types text[] DEFAULT NULL::text[], p_max_items integer DEFAULT 1, p_allowed_scope_type_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_id uuid; v_sort smallint;
BEGIN
  v_sort := COALESCE(
    p_sort_order,
    (SELECT COALESCE(MAX(sort_order), 0) + 1
       FROM context.context_items
      WHERE scope_type_id = p_scope_type_id AND is_active = true)::smallint
  );
  INSERT INTO context.context_items (
    scope_type_id, key, display_name, description, category, value_type,
    fetch_hint, sensitivity, status, source_type, tags, slug, sort_order, created_by,
    allowed_reference_types, max_items, allowed_scope_type_ids
  ) VALUES (
    p_scope_type_id, p_key, p_display_name, p_description, p_category, p_value_type,
    p_fetch_hint, p_sensitivity, 'active', 'manual', p_tags, p_slug, v_sort, auth.uid(),
    p_allowed_reference_types, COALESCE(p_max_items, 1), p_allowed_scope_type_ids
  ) RETURNING id INTO v_id;
  RETURN (SELECT to_jsonb(ci.*) FROM context.context_items ci WHERE ci.id = v_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_scope_type_items(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
      'description', ci.description, 'category', ci.category, 'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint, 'sensitivity', ci.sensitivity, 'status', ci.status,
      'tags', ci.tags, 'sort_order', ci.sort_order, 'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids
    )
    ORDER BY ci.sort_order, ci.display_name
  ) INTO v_result
  FROM context.context_items ci
  WHERE ci.scope_type_id = p_scope_type_id AND ci.is_active = true;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_scope_type_id uuid; v_result jsonb;
BEGIN
  SELECT scope_type_id INTO v_scope_type_id FROM context.scopes WHERE id = p_scope_id;
  IF v_scope_type_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  IF p_include_empty THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'description', ci.description, 'category', ci.category, 'value_type', ci.value_type,
        'fetch_hint', ci.fetch_hint, 'sensitivity', ci.sensitivity, 'sort_order', ci.sort_order,
        'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'has_value', civ.id IS NOT NULL,
        'value_text', civ.value_text, 'value_number', civ.value_number, 'value_boolean', civ.value_boolean,
        'value_json', civ.value_json, 'value_date', civ.value_date, 'value_document_url', civ.value_document_url,
        'version', civ.version, 'updated_at', civ.created_at
      )
      ORDER BY ci.sort_order, ci.display_name
    ) INTO v_result
    FROM context.context_items ci
    LEFT JOIN context.context_item_values civ
      ON civ.context_item_id = ci.id AND civ.scope_id = p_scope_id AND civ.is_current = true
    WHERE ci.scope_type_id = v_scope_type_id AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'value_type', ci.value_type, 'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'value_text', civ.value_text, 'value_number', civ.value_number,
        'value_boolean', civ.value_boolean, 'value_json', civ.value_json, 'value_date', civ.value_date,
        'value_document_url', civ.value_document_url
      )
      ORDER BY ci.sort_order, ci.display_name
    ) INTO v_result
    FROM context.context_item_values civ
    JOIN context.context_items ci ON civ.context_item_id = ci.id
    WHERE civ.scope_id = p_scope_id AND civ.is_current = true AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;

-- 7) Reverse lookup read RPC ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_context_value_refs(p_ref_type text, p_ref_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', s.scope_type_id,
      'organization_id', s.organization_id,
      'context_item_id', cvr.context_item_id, 'item_key', ci.key, 'item_display_name', ci.display_name,
      'value_id', cvr.value_id, 'is_current', civ.is_current, 'created_at', cvr.created_at
    )
  ) INTO v_result
  FROM context.context_value_refs cvr
  JOIN context.context_item_values civ ON civ.id = cvr.value_id
  JOIN context.context_items ci ON ci.id = cvr.context_item_id
  JOIN context.scopes s ON s.id = cvr.scope_id
  JOIN iam.organization_member om ON om.organization_id = s.organization_id AND om.user_id = v_uid
  WHERE cvr.ref_type = p_ref_type AND cvr.ref_key = p_ref_key AND civ.is_current = true;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;

REVOKE ALL ON FUNCTION public.list_context_value_refs(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_context_value_refs(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
