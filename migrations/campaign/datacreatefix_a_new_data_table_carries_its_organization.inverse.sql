-- chair-step: THE INVERSE of `datacreatefix_a_new_data_table_carries_its_organization.sql`.
--   It DROPS the organization-carrying door and restores the org-less five-argument one
--   byte-for-byte as it was live on the main database before that file ran. A DROP is
--   refused by the production allow-list by name, which is exactly right for a forward
--   file and exactly wrong for the reversal of one, so this is named, printed in full and
--   run only when the command names it with --confirm-chair-step.
--
-- WHAT IT COSTS, SAID PLAINLY. After this runs, creating a Data Table on `/data` FAILS
-- AGAIN for every user with `null value in column "organization_id" of relation
-- "udt_datasets" violates not-null constraint`, because the trigger that used to fill
-- that column was dropped from the main database by aidream's 0929 on 2026-09-19 and is
-- not coming back. This reversal restores the BROKEN state on purpose; it exists so the
-- forward file can be proven reversible (rule 27), not because anyone should want it.
--
-- IT DOES NOT DELETE ANY TABLE ANYONE CREATED with the fixed door. Those rows are real
-- datasets with a real organization on them and are none of a reversal's business.

-- ── 1. The org-less door, exactly as it was ───────────────────────────
CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_table_id UUID;
    v_field_id UUID;
    v_field JSONB;
    v_data_type public.field_data_type;
    v_initial_row_id UUID;
    v_field_name TEXT;
    v_display_name TEXT;
    v_existing_count INT;
BEGIN
    SELECT COUNT(*) INTO v_existing_count
    FROM workbench.udt_datasets
    WHERE user_id = (select auth.uid()) AND table_name = p_table_name;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('A table named "%s" already exists.', p_table_name),
            'error_code', 'DUPLICATE_TABLE_NAME'
        );
    END IF;

    IF p_table_name IS NULL OR TRIM(p_table_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Table name cannot be empty.',
            'error_code', 'EMPTY_TABLE_NAME'
        );
    END IF;

    INSERT INTO workbench.udt_datasets (table_name, description, user_id, is_public)
    VALUES (p_table_name, COALESCE(p_description, 'New table'), (select auth.uid()), p_is_public)
    RETURNING id INTO v_table_id;

    IF p_initial_fields IS NOT NULL AND jsonb_array_length(p_initial_fields) > 0 THEN
        FOR v_field IN SELECT * FROM jsonb_array_elements(p_initial_fields) LOOP
            EXECUTE format('SELECT %L::public.field_data_type', v_field->>'data_type') INTO v_data_type;
            v_display_name := COALESCE(NULLIF(v_field->>'display_name', ''), v_field->>'field_name');
            v_field_name := public.to_snake_case(v_field->>'field_name');

            IF NOT (v_field_name ~ '^[a-z][a-z0-9_]*$') THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'error', format('Invalid field name: "%s".', v_field_name),
                    'error_code', 'INVALID_FIELD_NAME'
                );
            END IF;

            INSERT INTO workbench.udt_dataset_fields (
                table_id, field_name, display_name, data_type, field_order,
                is_required, default_value, validation_rules, user_id
            )
            VALUES (
                v_table_id, v_field_name, v_display_name, v_data_type,
                COALESCE((v_field->>'field_order')::INT, 0),
                COALESCE((v_field->>'is_required')::BOOLEAN, FALSE),
                COALESCE(v_field->'default_value', 'null'::jsonb),
                COALESCE(v_field->'validation_rules', 'null'::jsonb),
                (select auth.uid())
            )
            RETURNING id INTO v_field_id;
        END LOOP;
    ELSE
        EXECUTE format('SELECT %L::public.field_data_type', 'integer') INTO v_data_type;
        INSERT INTO workbench.udt_dataset_fields (
            table_id, field_name, display_name, data_type, field_order,
            is_required, default_value, validation_rules, user_id
        )
        VALUES (v_table_id, 'id', 'ID', v_data_type, 0, TRUE, 'null'::jsonb, 'null'::jsonb, (select auth.uid()))
        RETURNING id INTO v_field_id;
    END IF;

    INSERT INTO workbench.udt_dataset_rows (table_id, data, user_id)
    VALUES (v_table_id, '{}'::jsonb, (select auth.uid()))
    RETURNING id INTO v_initial_row_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'table_id', v_table_id,
        'table_name', p_table_name,
        'message', 'Table created successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', format('Failed to create table: %s', SQLERRM),
        'error_code', 'UNEXPECTED_ERROR'
    );
END;
$function$;

-- ── 2. The register goes back to describing it ──────────────────────
UPDATE platform.client_callable_door
   SET identity_args = 'p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean, p_initial_fields jsonb',
       identity_argtypes = ARRAY[25, 25, 16, 16, 3802]::oid[],
       reason = 'Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.'
 WHERE schema_name = 'public' AND function_name = 'create_new_user_table_dynamic';

ALTER FUNCTION public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb) TO authenticated, service_role;

-- ── 3. The fixed door goes away ────────────────────────────────
DROP FUNCTION IF EXISTS public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb);

-- ── 4. Falsification ──────────────────────────────────────
DO $inv$
DECLARE v_old int; v_new int;
BEGIN
  SELECT count(*) INTO v_old FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_new_user_table_dynamic'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_authenticated_read%';
  SELECT count(*) INTO v_new FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_new_user_table_dynamic'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_organization_id%';
  IF v_old <> 1 OR v_new <> 0 THEN
    RAISE EXCEPTION 'ABORT: reversal left % org-less and % org-carrying door(s); expected 1 and 0.', v_old, v_new;
  END IF;
  RAISE NOTICE 'DATA-CREATE-FIX inverse: the org-less door is back and creating a Data Table is broken again, as intended.';
END $inv$;
