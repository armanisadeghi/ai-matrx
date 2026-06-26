-- sharing_make_public_drives_visibility.sql
-- ---------------------------------------------------------------------------
-- Reconcile the sharing "make public/private" RPCs with the canonical access
-- model: `visibility` (the enum) is the access driver, not the `is_public`
-- boolean. Previously make_resource_public flipped `is_public`, which canonical
-- RLS (has_access + the anon pub_read policy) does NOT read — so "Make public"
-- in ShareModal did nothing on a canonical table.
--
-- New behavior:
--  • make_resource_public  → sets visibility='public' where the column exists,
--                            AND mirrors is_public=true where that column exists
--                            (transition: legacy readers/useSharingStatus stay correct).
--  • make_resource_private → sets visibility back to the entity's registered
--                            default (entity_types.default_visibility, fallback
--                            'internal'), AND mirrors is_public=false.
--  • A table is now "publishable" if it has EITHER a visibility column OR an
--    is_public column (canonical-only tables were previously rejected).
--
-- is_public is dropped later (gated) once every reader uses visibility.
-- Idempotent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.make_resource_public(p_resource_type text, p_resource_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_has_vis  boolean;
  v_set      text := '';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=v_resolved.table_name AND column_name='visibility')
    INTO v_has_vis;

  IF NOT v_has_vis AND v_resolved.is_public_column IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Resource %s does not support public visibility', v_resolved.resource_type));
  END IF;
  IF NOT public.is_resource_owner(v_resolved.table_name, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can change visibility');
  END IF;

  IF v_has_vis THEN v_set := 'visibility = ''public''::platform.visibility'; END IF;
  IF v_resolved.is_public_column IS NOT NULL THEN
    v_set := v_set || CASE WHEN v_set <> '' THEN ', ' ELSE '' END || format('%I = true', v_resolved.is_public_column);
  END IF;

  EXECUTE format('UPDATE %I SET %s WHERE %I = $1', v_resolved.table_name, v_set, v_resolved.id_column)
    USING p_resource_id;
  RETURN jsonb_build_object('success', true, 'message', v_resolved.display_label || ' is now public');
END;
$function$;

CREATE OR REPLACE FUNCTION public.make_resource_private(p_resource_type text, p_resource_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_has_vis  boolean;
  v_default  text;
  v_set      text := '';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=v_resolved.table_name AND column_name='visibility')
    INTO v_has_vis;

  IF NOT v_has_vis AND v_resolved.is_public_column IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Resource %s does not support public visibility', v_resolved.resource_type));
  END IF;
  IF NOT public.is_resource_owner(v_resolved.table_name, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can change visibility');
  END IF;

  IF v_has_vis THEN
    SELECT e.default_visibility::text INTO v_default
      FROM platform.entity_types e
     WHERE e.schema_name='public' AND e.table_name=v_resolved.table_name;
    v_default := COALESCE(v_default, 'internal');
    v_set := format('visibility = %L::platform.visibility', v_default);
  END IF;
  IF v_resolved.is_public_column IS NOT NULL THEN
    v_set := v_set || CASE WHEN v_set <> '' THEN ', ' ELSE '' END || format('%I = false', v_resolved.is_public_column);
  END IF;

  EXECUTE format('UPDATE %I SET %s WHERE %I = $1', v_resolved.table_name, v_set, v_resolved.id_column)
    USING p_resource_id;
  RETURN jsonb_build_object('success', true, 'message', v_resolved.display_label || ' is now private');
END;
$function$;
