-- ctx_admin_set_scope_type_system.sql
--
-- Super-admin-only setter for ctx_scope_types.is_system. This flag makes a scope type's
-- context items resolve for EVERY user (platform-global) — exactly the kind of powerful,
-- cross-tenant capability that must NOT be an ungated table write. It follows the
-- protected-resources pattern: a SECURITY DEFINER RPC gated by public.is_super_admin().
-- list_scope_types already returns is_system (to_jsonb(st.*)), so reads/badging need nothing.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

CREATE OR REPLACE FUNCTION public.admin_set_scope_type_system(
  p_scope_type_id uuid,
  p_is_system boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.ctx_scope_types;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins can change a scope type''s system flag'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.ctx_scope_types
  SET is_system = p_is_system, updated_at = now()
  WHERE id = p_scope_type_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'scope type % not found', p_scope_type_id USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

NOTIFY pgrst, 'reload schema';
