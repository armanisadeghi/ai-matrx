-- ctx_add_date_value_type.sql
-- Adds a first-class `date` value type to the CTX scope system.
-- Applied to Matrx Main (txzxabzwovsujtloxrus) on 2026-06-05 via two MCP migrations:
--   1) ctx_add_date_value_type            (enum value — must be its own statement/txn)
--   2) ctx_value_date_column_and_rpcs     (column + RPC plumbing)
-- Recorded here as the canonical repo copy. The enum ADD VALUE is split first because a
-- newly-added enum label cannot be *used* in the same transaction it is added.

-- 1) New enum value.
ALTER TYPE public.context_value_type ADD VALUE IF NOT EXISTS 'date';

-- 2) Dedicated storage column (mirrors the existing value_* column pattern).
ALTER TABLE public.ctx_context_item_values
  ADD COLUMN IF NOT EXISTS value_date date;

-- 3) get_scope_context: emit value_date in both the form view and the agent-fetch view.
CREATE OR REPLACE FUNCTION public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_scope_type_id uuid; v_result jsonb;
BEGIN
  SELECT scope_type_id INTO v_scope_type_id FROM public.ctx_scopes WHERE id = p_scope_id;
  IF v_scope_type_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  IF p_include_empty THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id,
        'key', ci.key,
        'display_name', ci.display_name,
        'description', ci.description,
        'category', ci.category,
        'value_type', ci.value_type,
        'fetch_hint', ci.fetch_hint,
        'sensitivity', ci.sensitivity,
        'has_value', civ.id IS NOT NULL,
        'value_text', civ.value_text,
        'value_number', civ.value_number,
        'value_boolean', civ.value_boolean,
        'value_json', civ.value_json,
        'value_date', civ.value_date,
        'value_document_url', civ.value_document_url,
        'version', civ.version,
        'updated_at', civ.created_at
      )
      ORDER BY ci.category NULLS LAST, ci.display_name
    ) INTO v_result
    FROM public.ctx_context_items ci
    LEFT JOIN public.ctx_context_item_values civ
      ON civ.context_item_id = ci.id AND civ.scope_id = p_scope_id AND civ.is_current = true
    WHERE ci.scope_type_id = v_scope_type_id
      AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id,
        'key', ci.key,
        'display_name', ci.display_name,
        'value_type', ci.value_type,
        'value_text', civ.value_text,
        'value_number', civ.value_number,
        'value_boolean', civ.value_boolean,
        'value_json', civ.value_json,
        'value_date', civ.value_date,
        'value_document_url', civ.value_document_url
      )
      ORDER BY ci.display_name
    ) INTO v_result
    FROM public.ctx_context_item_values civ
    JOIN public.ctx_context_items ci ON civ.context_item_id = ci.id
    WHERE civ.scope_id = p_scope_id
      AND civ.is_current = true
      AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- 4) set_context_value (jsonb payload): accept value_date.
CREATE OR REPLACE FUNCTION public.set_context_value(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             UUID := COALESCE(auth.uid(), (p_payload->>'acting_user_id')::uuid);
  v_item_id         UUID := (p_payload->>'context_item_id')::uuid;
  v_scope_id        UUID := (p_payload->>'scope_id')::uuid;
  v_source_type     TEXT := COALESCE(p_payload->>'source_type', 'ai_enriched');
  v_change_summary  TEXT := p_payload->>'change_summary';
  v_scope_org       UUID;
  v_scope_owner     UUID;
  v_prev_version    INT;
  v_can_write       BOOLEAN;
  v_new_id          UUID := gen_random_uuid();
BEGIN
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
    FROM public.ctx_scopes s
   WHERE s.id = v_scope_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','not_found','message','scope not found'));
  END IF;

  v_can_write := (v_scope_owner = v_uid)
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.organization_id = v_scope_org
         AND om.user_id = v_uid
    );
  IF NOT v_can_write THEN
    RETURN jsonb_build_object('ok', false, 'error',
      jsonb_build_object('code','forbidden_org',
        'message','caller may not write this scope'));
  END IF;

  UPDATE public.ctx_context_item_values
     SET is_current = false
   WHERE context_item_id = v_item_id
     AND scope_id = v_scope_id
     AND is_current = true;

  SELECT COALESCE(MAX(version), 0)
    INTO v_prev_version
    FROM public.ctx_context_item_values
   WHERE context_item_id = v_item_id
     AND scope_id = v_scope_id;

  INSERT INTO public.ctx_context_item_values
    (id, context_item_id, scope_id, version, is_current,
     value_text, value_number, value_boolean, value_json, value_date,
     value_document_url, value_document_size_bytes,
     value_reference_id, value_reference_type,
     has_nested_objects, source_type, authored_by, change_summary, created_at)
  VALUES
    (v_new_id, v_item_id, v_scope_id, v_prev_version + 1, true,
     p_payload->>'value_text',
     CASE WHEN p_payload ? 'value_number'
          THEN (p_payload->>'value_number')::numeric END,
     CASE WHEN p_payload ? 'value_boolean'
          THEN (p_payload->>'value_boolean')::boolean END,
     CASE WHEN p_payload ? 'value_json'
          THEN p_payload->'value_json' END,
     CASE WHEN p_payload ? 'value_date'
          THEN (p_payload->>'value_date')::date END,
     p_payload->>'value_document_url',
     CASE WHEN p_payload ? 'value_document_size_bytes'
          THEN (p_payload->>'value_document_size_bytes')::bigint END,
     CASE WHEN p_payload ? 'value_reference_id'
          THEN (p_payload->>'value_reference_id')::uuid END,
     p_payload->>'value_reference_type',
     false, v_source_type::public.context_source_type, v_uid,
     v_change_summary, now());

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_new_id,
      'context_item_id', v_item_id,
      'scope_id', v_scope_id,
      'version', v_prev_version + 1,
      'is_current', true,
      'value_text', p_payload->>'value_text',
      'value_date', CASE WHEN p_payload ? 'value_date' THEN (p_payload->>'value_date')::date END,
      'source_type', v_source_type));
END;
$function$;

-- 5) set_scope_context_value: add p_value_date (signature change → drop old overload first).
DROP FUNCTION IF EXISTS public.set_scope_context_value(uuid, uuid, text, numeric, boolean, jsonb, text, text);
CREATE OR REPLACE FUNCTION public.set_scope_context_value(
  p_scope_id uuid,
  p_context_item_id uuid,
  p_value_text text DEFAULT NULL::text,
  p_value_number numeric DEFAULT NULL::numeric,
  p_value_boolean boolean DEFAULT NULL::boolean,
  p_value_json jsonb DEFAULT NULL::jsonb,
  p_value_document_url text DEFAULT NULL::text,
  p_value_date date DEFAULT NULL::date,
  p_change_summary text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_new_id uuid;
BEGIN
  INSERT INTO public.ctx_context_item_values (
    context_item_id, scope_id, value_text, value_number, value_boolean,
    value_json, value_date, value_document_url, change_summary, source_type, authored_by
  ) VALUES (
    p_context_item_id, p_scope_id, p_value_text, p_value_number, p_value_boolean,
    p_value_json, p_value_date, p_value_document_url, p_change_summary, 'manual', auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN (
    SELECT jsonb_build_object(
      'id', civ.id, 'context_item_id', civ.context_item_id, 'scope_id', civ.scope_id,
      'version', civ.version, 'is_current', civ.is_current,
      'value_text', civ.value_text, 'value_number', civ.value_number,
      'value_boolean', civ.value_boolean, 'value_json', civ.value_json,
      'value_date', civ.value_date,
      'value_document_url', civ.value_document_url, 'created_at', civ.created_at
    )
    FROM public.ctx_context_item_values civ WHERE civ.id = v_new_id
  );
END;
$function$;
