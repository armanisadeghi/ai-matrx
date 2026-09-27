-- INVERSE of migrations/campaign/scopestails_a_template_is_applied_through_the_store_doors.sql (lane SCOPES-TAILS).
-- chair-step: puts back the two bodies it replaced, byte for byte as production held them (custom.context_template_apply over public.apply_template; public.apply_template_definition as the SECURITY DEFINER direct writer), restores the template door's own row reason, declares the put-back definer body server-only (the provisioner's shape guard asks it of every SECURITY DEFINER body), and drops custom.context_template_define with its door row. Writes no scope data.
-- based-on: custom.context_template_apply(uuid, uuid) 49b28ac8a3c8bb673f6ebf795d23a1d91bf5f78a60e6fcac80e847ea9fef17f1
-- based-on: public.apply_template_definition(uuid, jsonb) 4336b30385d64ea9d3e0f91b0c259c1bbd3feace88386095485c7a8f8cc0f0ff
-- lane: SCOPES-TAILS
-- window-class: function bodies and one dropped function. Applied directly (owner, 2026-09-24).

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_apply');
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$;

update platform.client_callable_door
   set reason = 'SECURITY INVOKER scope door over public.apply_template (its own organization check).'
 where schema_name = 'custom' and function_name = 'context_template_apply';

CREATE OR REPLACE FUNCTION public.apply_template_definition(p_org_id uuid, p_definition jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_type_record jsonb;
  v_field jsonb;
  v_new_type_id uuid;
  v_key_to_id jsonb := '{}'::jsonb;
  v_field_sort int;
  v_created jsonb := '[]'::jsonb;
  v_items_count int := 0;
  v_type_sort int := 0;
BEGIN
  -- Validate
  IF p_definition->'scope_types' IS NULL OR jsonb_typeof(p_definition->'scope_types') != 'array' THEN
    RAISE EXCEPTION 'Definition must include scope_types array';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM iam.organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organization % does not exist', p_org_id;
  END IF;

  -- First pass: insert all scope types (without parent refs)
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_definition->'scope_types')
  LOOP
    IF v_type_record->>'singular' IS NULL OR v_type_record->>'plural' IS NULL THEN
      RAISE EXCEPTION 'Each scope_type must have singular and plural';
    END IF;

    INSERT INTO context.scope_types (
      organization_id, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity
    ) VALUES (
      p_org_id,
      v_type_record->>'singular',
      v_type_record->>'plural',
      COALESCE(v_type_record->>'icon', 'folder'),
      COALESCE(v_type_record->>'description', ''),
      COALESCE((v_type_record->>'sort_order')::int, v_type_sort),
      NULLIF(v_type_record->>'max_assignments_per_entity', '')::smallint
    )
    RETURNING id INTO v_new_type_id;

    v_type_sort := v_type_sort + 1;

    -- Track key → id for parent resolution
    IF v_type_record->>'key' IS NOT NULL THEN
      v_key_to_id := v_key_to_id || jsonb_build_object(v_type_record->>'key', v_new_type_id::text);
    END IF;

    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id,
      'key', v_type_record->>'key',
      'label_singular', v_type_record->>'singular',
      'label_plural', v_type_record->>'plural'
    ));

    -- Insert fields
    v_field_sort := 0;
    FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_type_record->'fields', '[]'::jsonb))
    LOOP
      IF v_field->>'key' IS NULL OR v_field->>'display_name' IS NULL THEN
        RAISE EXCEPTION 'Each field must have key and display_name';
      END IF;

      INSERT INTO context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by
      ) VALUES (
        v_new_type_id,
        v_field->>'key',
        v_field->>'display_name',
        COALESCE(v_field->>'description', ''),
        COALESCE(NULLIF(v_field->>'value_type', '')::context_value_type, 'string'::context_value_type),
        'active', 'on_demand', 'internal', 'manual',
        (select auth.uid())
      );
      v_field_sort := v_field_sort + 1;
      v_items_count := v_items_count + 1;
    END LOOP;
  END LOOP;

  -- Second pass: resolve parent_key references
  FOR v_type_record IN SELECT * FROM jsonb_array_elements(p_definition->'scope_types')
  LOOP
    IF v_type_record->>'parent_key' IS NOT NULL AND v_type_record->>'key' IS NOT NULL THEN
      IF (v_key_to_id ? (v_type_record->>'parent_key')) AND (v_key_to_id ? (v_type_record->>'key')) THEN
        UPDATE context.scope_types
        SET parent_type_id = (v_key_to_id->>(v_type_record->>'parent_key'))::uuid
        WHERE id = (v_key_to_id->>(v_type_record->>'key'))::uuid;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'scope_types_created', v_created,
    'context_items_count', v_items_count
  );
END;
$function$;

-- The provisioner's shape guard asks every SECURITY DEFINER body put back to say who calls it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('public', 'apply_template_definition', 'p_org_id uuid, p_definition jsonb', array['uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_org_id is checked only for existence (iam.organizations); the body asks nothing about the caller, which is why no client holds EXECUTE.',
        'scopestails_a_template_is_applied_through_the_store_doors_down.sql',
        'server_only: no caller in any repository; EXECUTE is postgres and service_role only, so no client ever reaches it (writers census S10).',
        false, false)
on conflict do nothing;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'context_template_define';
drop function if exists custom.context_template_define(uuid, jsonb);
