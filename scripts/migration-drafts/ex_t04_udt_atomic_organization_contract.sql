-- PREPARED ONLY — DO NOT MOVE TO migrations/ OR APPLY.
--
-- EX-T04 activation barrier (captured 2026-09-12): live Matrx Main exposes
--   public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
--   public.create_user_table_with_fields(p_table_name text, p_description text,
--     p_is_public boolean, p_organization_id uuid, p_project_id uuid,
--     p_task_id uuid, p_fields jsonb)
-- where create has defaults for every argument after p_table_name and append
-- has no organization parameter. The only runtime callers found in the six
-- repository/package census are matrx-extend's user-tables helpers.
--
-- This draft intentionally hard-cuts append to
--   public.append_rows_to_user_table(uuid, jsonb, uuid)
-- and removes all create defaults. It provides no overload, shim, or fallback.
-- Promote it only after the owner freezes this signature, generated database
-- types are refreshed from the activated database, and every installed
-- extension client sends p_organization_id. Until then, applying it would
-- break old extension artifacts at the RPC boundary.
--
-- The migration applier must run this whole file in its transaction. Do not
-- execute fragments through a console or Supabase MCP.

DO $$
BEGIN
  IF to_regprocedure('public.append_rows_to_user_table(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'EX-T04 precondition failed: expected old append signature is absent';
  END IF;
  IF to_regprocedure('public.append_rows_to_user_table(uuid,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'EX-T04 precondition failed: new append signature already exists; inspect before retrying';
  END IF;
  IF to_regprocedure('public.create_user_table_with_fields(text,text,boolean,uuid,uuid,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'EX-T04 precondition failed: expected create signature is absent';
  END IF;
END $$;

-- Dropping/recreating ensures the defaulted parameters are actually removed.
-- No CASCADE: an unanticipated dependency must stop activation. The new
-- function has the same identity arguments but no defaults, so
-- p_organization_id and every following argument must be supplied explicitly.
DROP FUNCTION public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb);

CREATE FUNCTION public.create_user_table_with_fields(
  p_table_name text,
  p_description text,
  p_is_public boolean,
  p_organization_id uuid,
  p_project_id uuid,
  p_task_id uuid,
  p_fields jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_id uuid;
  v_field jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = '22004';
  END IF;

  INSERT INTO workbench.udt_datasets (
    table_name, description, is_public, organization_id, project_id, task_id, user_id
  )
  VALUES (
    p_table_name, p_description, p_is_public, p_organization_id,
    p_project_id, p_task_id, (select auth.uid())
  )
  RETURNING id INTO v_table_id;

  FOR v_field IN SELECT * FROM jsonb_array_elements(p_fields)
  LOOP
    INSERT INTO workbench.udt_dataset_fields (
      table_id, user_id, organization_id, field_name, display_name,
      data_type, field_order, is_required, default_value, validation_rules
    )
    VALUES (
      v_table_id, (select auth.uid()), p_organization_id,
      v_field->>'field_name',
      COALESCE(v_field->>'display_name', v_field->>'field_name'),
      COALESCE((v_field->>'data_type')::public.field_data_type, 'string'::public.field_data_type),
      COALESCE((v_field->>'field_order')::int, 0),
      COALESCE((v_field->>'is_required')::boolean, false),
      v_field->'default_value', v_field->'validation_rules'
    );
  END LOOP;

  RETURN v_table_id;
END;
$function$;

-- Changing input arguments cannot use CREATE OR REPLACE. Dropping and creating
-- inside the sanctioned migration transaction leaves no observable half-state.
-- No CASCADE: an unanticipated dependency must stop activation.
DROP FUNCTION public.append_rows_to_user_table(uuid, jsonb);

CREATE FUNCTION public.append_rows_to_user_table(
  p_table_id uuid,
  p_rows jsonb,
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inserted integer := 0;
  v_allowed text[];
  v_dataset_organization_id uuid;
  v_row jsonb;
  v_clean jsonb;
  v_key text;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required' USING ERRCODE = '22004';
  END IF;

  -- FOR UPDATE serializes an ownership move with this equality check and all
  -- following child writes. A client-side parent read alone cannot do that.
  SELECT organization_id
  INTO v_dataset_organization_id
  FROM workbench.udt_datasets
  WHERE id = p_table_id
    AND user_id = (select auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'dataset % is not available to this account — it may not exist, or your access may not reach it',
      p_table_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_dataset_organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'dataset % belongs to a different organization', p_table_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(field_name)
  INTO v_allowed
  FROM workbench.udt_dataset_fields
  WHERE table_id = p_table_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_clean := '{}'::jsonb;
    FOR v_key IN SELECT jsonb_object_keys(v_row)
    LOOP
      IF v_allowed IS NULL OR v_key = ANY(v_allowed) THEN
        v_clean := v_clean || jsonb_build_object(v_key, v_row -> v_key);
      END IF;
    END LOOP;

    INSERT INTO workbench.udt_dataset_rows (table_id, user_id, organization_id, data)
    VALUES (p_table_id, (select auth.uid()), p_organization_id, v_clean);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- Restore the live callable surface after dropping append. Live catalog at
-- drafting time grants append to PUBLIC/authenticated/service_role and create
-- to authenticated/service_role; do not add a new access layer in this packet.
GRANT EXECUTE ON FUNCTION public.append_rows_to_user_table(uuid, jsonb, uuid)
  TO PUBLIC, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_user_table_with_fields(
  text, text, boolean, uuid, uuid, uuid, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_table_with_fields(
  text, text, boolean, uuid, uuid, uuid, jsonb
) TO authenticated, service_role;

-- Activation verification must run after the ledgered migration:
-- 1) inspect pg_get_functiondef + identity args and regenerated types;
-- 2) run a rolled-back authenticated probe: table A/org B append raises,
--    missing p_organization_id raises, exact org inserts a row whose
--    organization_id equals its parent; and
-- 3) rerun the extension SaveAsPattern flow on the installed artifact.
