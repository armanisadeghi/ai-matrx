-- chair-step: INVERSE of migrations/campaign/scopesfts1e_value_references_are_read_from_the_store.sql (lane FINISH-THE-SWITCH, FTS-1e): restores public.list_context_value_refs as production held it on 2026-10-05 (reads context.context_value_refs) and drops custom._ctx_value_refs_of.
-- lane: FINISH-THE-SWITCH (FTS-1e)
-- lock: custom

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
  WHERE context._scope_readable(s.id, 'viewer')
    AND cvr.ref_type = p_ref_type AND cvr.ref_key = p_ref_key AND civ.is_current = true;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$
;

DROP FUNCTION IF EXISTS custom._ctx_value_refs_of(uuid, jsonb, jsonb);
