-- ext_15_loader_is_invoker.sql
-- HRB-010 / C6 -- 🚨 A HOLE THIS LANE INTRODUCED AND CLOSED BEFORE PROVING.
--
-- platform.custom_field_defs and platform.validate_custom_row shipped SECURITY DEFINER,
-- and both take p_organization_id as a PARAMETER. That combination lets any authenticated
-- caller enumerate ANOTHER organization's field definitions -- display names, option lists,
-- sensitivity tiers -- simply by passing that org's id. Isolation must be INHERITED, never
-- re-implemented, and the way to inherit it here is to read as the caller.
--
-- Both are now SECURITY INVOKER. RLS on platform.custom_field_definition then answers the
-- question: a foreign org id yields an EMPTY definition list, so every key reads as
-- unknown_key and nothing is disclosed. The trigger path is unaffected --
-- platform._custom_record_guard is SECURITY DEFINER, and an INVOKER callee inside a
-- DEFINER caller runs with the definer's rights. Proven by isolation assertions B1a/B1b.

CREATE OR REPLACE FUNCTION platform.custom_field_defs(
  p_target_kind     text,
  p_organization_id uuid,
  p_target_token    text DEFAULT NULL,
  p_definition_id   uuid DEFAULT NULL,
  p_include_archived boolean DEFAULT true
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
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

CREATE OR REPLACE FUNCTION platform.validate_custom_row(
  p_target_kind     text,
  p_organization_id uuid,
  p_values          jsonb,
  p_target_token    text DEFAULT NULL,
  p_definition_id   uuid DEFAULT NULL,
  p_mode            text DEFAULT NULL,
  p_resolved        jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $fn$
DECLARE
  v_defs jsonb;
  v_mode text;
  v_lim  jsonb;
BEGIN
  v_defs := platform.custom_field_defs(p_target_kind, p_organization_id, p_target_token, p_definition_id, true);

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
