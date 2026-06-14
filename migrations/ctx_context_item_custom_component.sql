-- ctx_context_item_custom_component.sql
--
-- Give context items the SAME custom-component system the Agent Builder + Smart
-- Input use for agent variables. A context item can now carry a
-- `custom_component` JSONB (the VariableCustomComponent shape: type + options +
-- picklist binding + min/max/toggle labels) so its per-scope value is authored
-- and entered with the identical Smart-Input components instead of a bare
-- textarea. `value_type` stays the storage discriminator (which value_* column
-- the cell uses); it is auto-derived from the chosen component on the client.
--
-- Structured values (multi-select arrays, picklist refs, MediaRefs) land in the
-- existing `value_json` column — no new value_type enum members are needed.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

-- 1) Column — nullable; NULL means "legacy primitive item, render the textarea".
ALTER TABLE public.ctx_context_items
  ADD COLUMN IF NOT EXISTS custom_component jsonb;

-- 2) list_scope_type_items → emit custom_component (feeds the context-item editor).
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
      'tags', ci.tags, 'sort_order', ci.sort_order, 'custom_component', ci.custom_component
    )
    ORDER BY ci.sort_order, ci.display_name
  ) INTO v_result
  FROM public.ctx_context_items ci
  WHERE ci.scope_type_id = p_scope_type_id AND ci.is_active = true;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- 3) get_scope_context → emit custom_component (feeds ScopeFieldInput value entry).
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
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'description', ci.description, 'category', ci.category, 'value_type', ci.value_type,
        'fetch_hint', ci.fetch_hint, 'sensitivity', ci.sensitivity, 'sort_order', ci.sort_order,
        'custom_component', ci.custom_component,
        'has_value', civ.id IS NOT NULL,
        'value_text', civ.value_text, 'value_number', civ.value_number, 'value_boolean', civ.value_boolean,
        'value_json', civ.value_json, 'value_date', civ.value_date, 'value_document_url', civ.value_document_url,
        'version', civ.version, 'updated_at', civ.created_at
      )
      ORDER BY ci.sort_order, ci.display_name
    ) INTO v_result
    FROM public.ctx_context_items ci
    LEFT JOIN public.ctx_context_item_values civ
      ON civ.context_item_id = ci.id AND civ.scope_id = p_scope_id AND civ.is_current = true
    WHERE ci.scope_type_id = v_scope_type_id AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'value_type', ci.value_type, 'custom_component', ci.custom_component,
        'value_text', civ.value_text, 'value_number', civ.value_number,
        'value_boolean', civ.value_boolean, 'value_json', civ.value_json, 'value_date', civ.value_date,
        'value_document_url', civ.value_document_url
      )
      ORDER BY ci.sort_order, ci.display_name
    ) INTO v_result
    FROM public.ctx_context_item_values civ
    JOIN public.ctx_context_items ci ON civ.context_item_id = ci.id
    WHERE civ.scope_id = p_scope_id AND civ.is_current = true AND ci.is_active = true
      AND (p_item_ids IS NULL OR ci.id = ANY(p_item_ids));
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

NOTIFY pgrst, 'reload schema';
