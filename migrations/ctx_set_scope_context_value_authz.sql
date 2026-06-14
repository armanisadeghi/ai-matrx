-- ctx_set_scope_context_value_authz.sql
--
-- 🔒 SECURITY FIX (pre-existing hole). set_scope_context_value was SECURITY DEFINER with
-- NO authorization check, and p_scope_id is fully client-controlled. Because SECURITY
-- DEFINER bypasses the RLS that IS enabled on ctx_context_item_values, ANY authenticated
-- user could write a context value into ANY organization's scope (cross-tenant write) by
-- passing a foreign scope id. This is the per-user ownership class CLAUDE.md calls out.
--
-- The sibling write path set_context_value(jsonb) and the read path resolve_full_context
-- already membership-guard via public.organization_members; this brings the per-scope
-- writer to parity, and adds a scope-type integrity check (the item must belong to the
-- scope's type). Behaviour for legitimate org members is unchanged.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent (CREATE OR REPLACE).

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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new_id uuid;
BEGIN
  -- AuthZ: the caller must be a member of the scope's organization.
  IF NOT EXISTS (
    SELECT 1
    FROM public.ctx_scopes s
    JOIN public.organization_members om
      ON om.organization_id = s.organization_id AND om.user_id = auth.uid()
    WHERE s.id = p_scope_id
  ) THEN
    RAISE EXCEPTION 'not authorized to write to scope %', p_scope_id
      USING ERRCODE = '42501';
  END IF;

  -- Integrity: the context item must belong to this scope's scope type.
  IF NOT EXISTS (
    SELECT 1
    FROM public.ctx_context_items ci
    JOIN public.ctx_scopes s ON s.id = p_scope_id
    WHERE ci.id = p_context_item_id AND ci.scope_type_id = s.scope_type_id
  ) THEN
    RAISE EXCEPTION 'context item % does not belong to scope %', p_context_item_id, p_scope_id
      USING ERRCODE = '22023';
  END IF;

  -- Unchanged write path (the is_current/version flip is handled by the table trigger).
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

NOTIFY pgrst, 'reload schema';
