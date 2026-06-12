-- ctx_set_entity_scopes_auth.sql
--
-- Authorization preamble for set_entity_scopes (the atomic M2M tagging RPC).
--
-- The frontend chokepoint (features/scopes/service/scopesService.ts) is being
-- switched from a non-atomic 3-call read/insert/delete onto this RPC. The RPC
-- was previously SECURITY DEFINER with ZERO caller checks (anon-callable,
-- cross-org writable by UUID). Since we route new traffic through it, it gets
-- proper auth now (the rest of the DEFINER-RPC security overhaul follows in
-- the dedicated security pass):
--
--   1. Caller must be authenticated (no backend/service-role callers exist —
--      verified: only the FE calls this RPC).
--   2. Every scope being assigned must live in an org the caller belongs to.
--   3. The entity's EXISTING assignments must also all be in the caller's
--      orgs (the function delete-alls before inserting; without this check a
--      caller could wipe another org's tags off a shared entity).
--   4. EXECUTE revoked from anon.
--
-- Behavior (atomic replace + max_assignments_per_entity validation + final
-- state return) is unchanged.


CREATE OR REPLACE FUNCTION public.set_entity_scopes(p_entity_type text, p_entity_id uuid, p_scope_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_scope record;
    v_count int;
    v_result jsonb;
BEGIN
    -- ── Authorization ───────────────────────────────────────────────
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'set_entity_scopes: not authenticated'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.ctx_scopes s
        WHERE s.id = ANY(p_scope_ids)
          AND NOT EXISTS (
              SELECT 1 FROM public.organization_members om
              WHERE om.organization_id = s.organization_id AND om.user_id = v_uid
          )
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: scope outside your organizations'
            USING ERRCODE = '42501';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.ctx_scope_assignments sa
        JOIN public.ctx_scopes s ON s.id = sa.scope_id
        WHERE sa.entity_type = p_entity_type AND sa.entity_id = p_entity_id
          AND NOT EXISTS (
              SELECT 1 FROM public.organization_members om
              WHERE om.organization_id = s.organization_id AND om.user_id = v_uid
          )
    ) THEN
        RAISE EXCEPTION 'set_entity_scopes: entity is tagged with scopes outside your organizations'
            USING ERRCODE = '42501';
    END IF;

    -- ── Validate max_assignments_per_entity for each type (unchanged) ──
    FOR v_scope IN
        SELECT s.id, s.scope_type_id, st.max_assignments_per_entity, st.label_singular
        FROM public.ctx_scopes s
        JOIN public.ctx_scope_types st ON s.scope_type_id = st.id
        WHERE s.id = ANY(p_scope_ids)
    LOOP
        IF v_scope.max_assignments_per_entity IS NOT NULL THEN
            SELECT count(*) INTO v_count
            FROM unnest(p_scope_ids) sid
            JOIN public.ctx_scopes s ON s.id = sid
            WHERE s.scope_type_id = v_scope.scope_type_id;

            IF v_count > v_scope.max_assignments_per_entity THEN
                RAISE EXCEPTION 'Type "%" allows max % assignment(s) per entity, but % were provided',
                    v_scope.label_singular, v_scope.max_assignments_per_entity, v_count;
            END IF;
        END IF;
    END LOOP;

    -- ── Atomic replace (unchanged) ──────────────────────────────────
    DELETE FROM public.ctx_scope_assignments
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id;

    INSERT INTO public.ctx_scope_assignments (scope_id, entity_type, entity_id, created_by)
    SELECT unnest(p_scope_ids), p_entity_type, p_entity_id, v_uid
    ON CONFLICT (scope_id, entity_type, entity_id) DO NOTHING;

    -- ── Return the final state (unchanged) ──────────────────────────
    SELECT jsonb_agg(
        jsonb_build_object(
            'scope_id', sa.scope_id,
            'scope_name', s.name,
            'type_label', st.label_singular,
            'type_icon', st.icon,
            'type_color', st.color
        )
    )
    INTO v_result
    FROM public.ctx_scope_assignments sa
    JOIN public.ctx_scopes s ON sa.scope_id = s.id
    JOIN public.ctx_scope_types st ON s.scope_type_id = st.id
    WHERE sa.entity_type = p_entity_type AND sa.entity_id = p_entity_id;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_entity_scopes(text, uuid, uuid[]) FROM anon;


NOTIFY pgrst, 'reload schema';
