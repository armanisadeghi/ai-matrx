-- chair-step: it DROPS `public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb)`,
--   the org-less create door, after replacing it with one that takes an explicit organization.
--   A DROP is non-additive by construction and the production deny-list refuses it by name,
--   which is exactly right for an ordinary forward file and exactly wrong for retiring a door
--   that cannot succeed. The door is named here, printed in full, and dropped only when the
--   command names this file with --confirm-chair-step.
--
-- DATA-CREATE-FIX — A NEW DATA TABLE CARRIES ITS ORGANIZATION.
--
-- THE BREAK, reproduced live as `admin@admin.com` on 2026-09-20 through the same RPC
-- `utils/user-table-utls/table-utils.ts → createTable` calls from `/data/create`:
--
--   {"success":false,"error_code":"UNEXPECTED_ERROR",
--    "error":"Failed to create table: null value in column \"organization_id\"
--             of relation \"udt_datasets\" violates not-null constraint"}
--
-- Creating a Data Table has been impossible for EVERY user of the main database since
-- 2026-09-19. Adding columns and rows to a table that already exists still works, because
-- `workbench.udt_dataset_fields` and `workbench.udt_dataset_rows` each carry
-- `_0_inherit_org` (platform.inherit_org_from_parent) and take the parent dataset's
-- organization. Only the ROOT row had nothing to fall back on.
--
-- WHY IT BROKE, and it is not a regression anyone should undo. aidream migration
-- `0929_no_trigger_stamps_a_personal_organization.sql` (2026-09-19) dropped
-- `public._stamp_org_default` and its 328 BEFORE-INSERT attachments — measured here today:
-- the function does not exist on the main database and ZERO attachments remain. That was
-- Arman's ruling, and it is right: "a row written without an organization is a CALLER bug
-- that must fail loudly." 0929 proved every affected table already had `organization_id`
-- NOT NULL so the refusal would be loud, and it was. What 0929 did not do was census the
-- CALLERS that had been leaning on the trigger. `create_new_user_table_dynamic` was one:
-- it has no organization parameter and its INSERT never named the column.
--
-- THE FIX IS THE ONE THE DOCTRINE NAMES, NOT THE TRIGGER BACK.
-- `common-docs/projects/no-db-assigned-org/PLAN.md`: "Every organization-scoped write
-- carries its organization explicitly before it reaches the database. The database refuses
-- an absent organization; it never chooses, creates, copies, inherits, or defaults one."
-- Defects without exception, verbatim from that register: "a trigger or column default
-- filling the org" and "an RPC accepting no org parameter or declaring it DEFAULT NULL and
-- deriving one internally". So: the door grows a REQUIRED `p_organization_id`, refuses a
-- NULL by name instead of deriving anything, and the client passes what `ensureOrgId`
-- already holds (hold → picker → set → resume).
--
-- AND IT CHECKS THE CALLER MAY WRITE THERE. The old door was SECURITY DEFINER with no
-- organization at all, so there was nothing to abuse. A definer door that now ACCEPTS an
-- organization id from the browser and writes a row into it without asking whether the
-- caller belongs to it would be a tenancy hole this migration invented. `iam.has_org_access`
-- is the canonical answer and is asked before the first INSERT.
--
-- WHAT IS NOT CHANGED: the duplicate-name check, the empty-name check, the field loop and
-- its snake_case/enum validation, the default `id` column when no fields are given, the
-- one empty seed row, the return envelope and every error_code the client already reads.
-- `p_authenticated_read` is gone from the signature because the old body never referenced
-- it once and `createTable` never sent it — a parameter that does nothing is a lie the new
-- door does not repeat.
--
-- THE INVERSE is `datacreatefix_a_new_data_table_carries_its_organization.inverse.sql`,
-- which restores the old five-argument door byte-for-byte and takes the new one away. After
-- it runs, creating a table is exactly as broken as it was this morning.

-- ── 1. Pre-state, asserted rather than assumed ──────────────────────────────
DO $$
DECLARE v_old int; v_stampers int;
BEGIN
  SELECT count(*) INTO v_old
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_new_user_table_dynamic'
     AND pg_get_function_identity_arguments(p.oid) =
         'p_table_name text, p_description text, p_is_public boolean, p_authenticated_read boolean, p_initial_fields jsonb';
  IF v_old <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 org-less create door, found %.', v_old;
  END IF;

  SELECT count(*) INTO v_stampers FROM pg_trigger WHERE tgname = '_stamp_org_default' AND NOT tgisinternal;
  IF v_stampers <> 0 THEN
    RAISE EXCEPTION 'ABORT: % _stamp_org_default attachment(s) are back. This fix assumes 0929 stands; settle that first.', v_stampers;
  END IF;

  IF (SELECT attnotnull FROM pg_attribute
       WHERE attrelid = 'workbench.udt_datasets'::regclass AND attname = 'organization_id') IS NOT TRUE THEN
    RAISE EXCEPTION 'ABORT: workbench.udt_datasets.organization_id is not NOT NULL; the refusal this fix relies on is gone.';
  END IF;
END $$;

-- ── 2. The door that carries an organization ────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(
    p_table_name text,
    p_description text,
    p_is_public boolean,
    p_organization_id uuid,
    p_initial_fields jsonb DEFAULT NULL::jsonb
)
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
    -- The organization is REFUSED when absent, never derived. No personal org, no
    -- "active" org, no first membership: the caller holds one and says so, or is held.
    IF p_organization_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Select an organization before creating a table.',
            'error_code', 'ORGANIZATION_REQUIRED'
        );
    END IF;

    -- A definer door that accepts an organization id from a browser asks whether the
    -- caller belongs to it BEFORE it writes anything.
    IF NOT iam.has_org_access(p_organization_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'You are not a member of the selected organization.',
            'error_code', 'ORGANIZATION_FORBIDDEN'
        );
    END IF;

    IF p_table_name IS NULL OR TRIM(p_table_name) = '' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Table name cannot be empty.',
            'error_code', 'EMPTY_TABLE_NAME'
        );
    END IF;

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

    INSERT INTO workbench.udt_datasets (table_name, description, user_id, is_public, organization_id)
    VALUES (p_table_name, COALESCE(p_description, 'New table'), (select auth.uid()), p_is_public, p_organization_id)
    RETURNING id INTO v_table_id;

    -- The children say nothing about the organization on purpose: `_0_inherit_org`
    -- (platform.inherit_org_from_parent) copies the dataset's, which is structural
    -- identity rather than a guess, and is exactly what 0929 left standing.
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

-- ── 3. The DD-169 door register follows the door, BEFORE the GRANT ──────────
-- §6d-4: a client-callable SECURITY DEFINER function needs its `platform.client_callable_door`
-- row in the SAME migration and BEFORE the GRANT, or the DB-wide guard revokes the client
-- EXECUTE from inside the GRANT and logs it. The signature moved, so the row moves with it.
UPDATE platform.client_callable_door
   SET identity_args = 'p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb',
       identity_argtypes = ARRAY[25, 25, 16, 2950, 3802]::oid[],
       reason = 'Signed-in door (DD-169 batch 3, B-75; re-signed by lane DATA-CREATE-FIX 2026-09-20). SECURITY DEFINER; writes; the caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. It now takes an EXPLICIT p_organization_id, refuses a NULL one with ORGANIZATION_REQUIRED rather than deriving one, and asks iam.has_org_access before its first INSERT. `anon` holds no EXECUTE on it.'
 WHERE schema_name = 'public' AND function_name = 'create_new_user_table_dynamic';

-- The same reach the old door had, restated for the new signature (D31, 2026-07-15).
REVOKE EXECUTE ON FUNCTION public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb) TO authenticated, service_role;

-- ── 4. The org-less door is retired, not left standing beside the new one ───
-- A dead door beside a live one is the failure this repo has a law about: the old
-- signature can only ever answer with the not-null violation above, and PostgREST
-- resolves by NAME, so leaving it would mean a stale caller keeps hitting the break
-- forever with no sentence telling it why.
DROP FUNCTION public.create_new_user_table_dynamic(text, text, boolean, boolean, jsonb);

-- ── 5. Falsification, in this file, on this transaction ─────────────────────
DO $$
DECLARE v_new int; v_old int; v_doors int;
BEGIN
  SELECT count(*) INTO v_new
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_new_user_table_dynamic'
     AND pg_get_function_identity_arguments(p.oid) =
         'p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb';
  SELECT count(*) INTO v_old
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_new_user_table_dynamic'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_authenticated_read%';
  IF v_new <> 1 THEN RAISE EXCEPTION 'ABORT: the new door is not there (% found).', v_new; END IF;
  IF v_old <> 0 THEN RAISE EXCEPTION 'ABORT: the org-less door survived (% found).', v_old; END IF;

  SELECT count(*) INTO v_doors FROM platform.client_callable_door
   WHERE schema_name = 'public' AND function_name = 'create_new_user_table_dynamic'
     AND identity_args = 'p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb';
  IF v_doors <> 1 THEN RAISE EXCEPTION 'ABORT: the door register still describes the retired signature.'; END IF;

  -- The refusal is REAL, not a comment: a NULL organization comes back as a named
  -- refusal and writes nothing.
  IF (public.create_new_user_table_dynamic(
        'zz_datacreatefix_probe', 'probe', false, NULL::uuid, NULL::jsonb) ->> 'error_code')
     IS DISTINCT FROM 'ORGANIZATION_REQUIRED' THEN
    RAISE EXCEPTION 'ABORT: a NULL organization did not come back as ORGANIZATION_REQUIRED.';
  END IF;
  IF EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE table_name = 'zz_datacreatefix_probe') THEN
    RAISE EXCEPTION 'ABORT: the refused probe wrote a row anyway.';
  END IF;

  RAISE NOTICE 'DATA-CREATE-FIX: the create door now takes an explicit organization, refuses a NULL one by name, and the org-less signature is gone.';
END $$;

