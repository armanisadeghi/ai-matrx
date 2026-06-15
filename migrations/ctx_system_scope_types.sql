-- ctx_system_scope_types.sql
--
-- SYSTEM (always-available) context items. A scope type flagged is_system holds context
-- items that resolve for EVERY user with NO scope selection — the home for platform-wide
-- context (Class 2 curated globals like top_headlines; Class 3 industry datasets). They
-- reuse the entire existing items/values/components/binding stack; the only difference is
-- the resolver always includes their current cells, regardless of active scope or org.
--
-- A variable/slot bound to a system item resolves automatically everywhere (no call, no
-- pick). Because system cells are keyed by context_item_id (UUID) in cell_values, binding
-- resolution stays collision-proof. Scope-specific cells override a system default on a key
-- collision (system is unioned BEFORE scope cells); brokers (being removed) still win last.
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

ALTER TABLE public.ctx_scope_types
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ctx_scope_types.is_system IS
  'When true, this scope type''s context items always resolve for every user (no scope selection). Platform-wide System context. Set by platform admins only.';

CREATE OR REPLACE FUNCTION public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
BEGIN
    -- 1) Entity FK resolution
    IF p_entity_type = 'task' THEN
        SELECT t.project_id, p.organization_id, t.id INTO v_project_id, v_org_id, v_task_id
        FROM public.ctx_tasks t LEFT JOIN public.ctx_projects p ON t.project_id = p.id WHERE t.id = p_entity_id;
    ELSIF p_entity_type = 'project' THEN
        SELECT p.organization_id, p.id INTO v_org_id, v_project_id
        FROM public.ctx_projects p WHERE p.id = p_entity_id;
    ELSIF p_entity_type = 'conversation' THEN
        SELECT c.organization_id, c.project_id, c.task_id INTO v_org_id, v_project_id, v_task_id
        FROM public.cx_conversation c WHERE c.id = p_entity_id;
    ELSIF p_entity_type = 'note' THEN
        SELECT n.organization_id, n.project_id, n.task_id INTO v_org_id, v_project_id, v_task_id
        FROM public.notes n WHERE n.id = p_entity_id;
    END IF;

    -- 2) Entity-tagged scopes
    SELECT jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) INTO v_entity_scopes
    FROM public.ctx_scope_assignments sa JOIN public.ctx_scopes s ON sa.scope_id = s.id
    JOIN public.ctx_scope_types st ON s.scope_type_id = st.id
    WHERE sa.entity_type = p_entity_type AND sa.entity_id = p_entity_id;

    IF v_entity_scopes IS NULL AND v_project_id IS NOT NULL AND p_entity_type != 'project' THEN
        SELECT jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) INTO v_entity_scopes
        FROM public.ctx_scope_assignments sa JOIN public.ctx_scopes s ON sa.scope_id = s.id
        JOIN public.ctx_scope_types st ON s.scope_type_id = st.id
        WHERE sa.entity_type = 'project' AND sa.entity_id = v_project_id;
    END IF;

    -- 3) explicit active scopes (global selections), membership-guarded, deduped
    IF p_scope_ids IS NOT NULL AND array_length(p_scope_ids, 1) > 0 THEN
        SELECT jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) INTO v_explicit_scopes
        FROM public.ctx_scopes s
        JOIN public.ctx_scope_types st ON s.scope_type_id = st.id
        JOIN public.organization_members om
          ON om.organization_id = s.organization_id AND om.user_id = p_user_id
        WHERE s.id = ANY(p_scope_ids)
          AND (v_entity_scopes IS NULL
               OR NOT (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));

        IF v_explicit_scopes IS NOT NULL THEN
            v_entity_scopes := COALESCE(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        END IF;
    END IF;

    -- 4) Scope labels
    IF v_entity_scopes IS NOT NULL THEN
        SELECT COALESCE(jsonb_object_agg(elem->>'type_label', elem->>'scope_name'), '{}'::jsonb)
        INTO v_scope_labels
        FROM jsonb_array_elements(v_entity_scopes) elem;
    END IF;

    -- 4b) SYSTEM cells — every is_system scope type's current cells, for ALL users, with NO
    -- scope selection. Unioned BEFORE the scope-cell loop so a scope-specific value overrides
    -- a system default on a key collision (keys are unique per type, so collisions are rare).
    FOR rec IN (
        SELECT ci.id AS context_item_id, ci.key, ci.description, ci.value_type::text AS value_type,
               s.id AS scope_id, s.name AS scope_name, s.scope_type_id AS scope_type_id,
               CASE
                   WHEN civ.value_text IS NOT NULL THEN to_jsonb(civ.value_text)
                   WHEN civ.value_number IS NOT NULL THEN to_jsonb(civ.value_number)
                   WHEN civ.value_boolean IS NOT NULL THEN to_jsonb(civ.value_boolean)
                   WHEN civ.value_date IS NOT NULL THEN to_jsonb(civ.value_date::text)
                   WHEN civ.value_json IS NOT NULL THEN civ.value_json
                   WHEN civ.value_document_url IS NOT NULL THEN to_jsonb(civ.value_document_url)
                   WHEN civ.value_reference_id IS NOT NULL THEN to_jsonb(civ.value_reference_id::text)
                   ELSE NULL
               END AS value
        FROM public.ctx_context_item_values civ
        JOIN public.ctx_context_items ci ON ci.id = civ.context_item_id AND ci.is_active = true
        JOIN public.ctx_scopes s ON s.id = civ.scope_id
        JOIN public.ctx_scope_types st ON st.id = s.scope_type_id AND st.is_system = true
        WHERE civ.is_current = true AND ci.fetch_hint != 'never'
        ORDER BY st.sort_order ASC, ci.sort_order ASC
    ) LOOP
        CONTINUE WHEN rec.value IS NULL;
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    END LOOP;

    -- 5) scope CELLS -> variables (keyed by key) AND cell_values (keyed by context_item_id UUID)
    IF v_entity_scopes IS NOT NULL THEN
        FOR rec IN (
            SELECT ci.id AS context_item_id, ci.key, ci.description, ci.value_type::text AS value_type,
                   s.id AS scope_id, s.name AS scope_name, s.scope_type_id AS scope_type_id,
                   CASE
                       WHEN civ.value_text IS NOT NULL THEN to_jsonb(civ.value_text)
                       WHEN civ.value_number IS NOT NULL THEN to_jsonb(civ.value_number)
                       WHEN civ.value_boolean IS NOT NULL THEN to_jsonb(civ.value_boolean)
                       WHEN civ.value_date IS NOT NULL THEN to_jsonb(civ.value_date::text)
                       WHEN civ.value_json IS NOT NULL THEN civ.value_json
                       WHEN civ.value_document_url IS NOT NULL THEN to_jsonb(civ.value_document_url)
                       WHEN civ.value_reference_id IS NOT NULL THEN to_jsonb(civ.value_reference_id::text)
                       ELSE NULL
                   END AS value
            FROM public.ctx_context_item_values civ
            JOIN public.ctx_context_items ci ON ci.id = civ.context_item_id AND ci.is_active = true
            JOIN public.ctx_scopes s ON s.id = civ.scope_id
            JOIN public.ctx_scope_types st ON st.id = s.scope_type_id
            WHERE civ.is_current = true
              AND ci.fetch_hint != 'never'
              AND civ.scope_id IN (
                  SELECT (elem->>'scope_id')::uuid FROM jsonb_array_elements(v_entity_scopes) elem
              )
            ORDER BY st.sort_order ASC, ci.sort_order ASC
        ) LOOP
            CONTINUE WHEN rec.value IS NULL;
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'scope:' || rec.scope_name));
        END LOOP;
    END IF;

    -- 6) Broker variables (legacy; being removed — overrides cells on collision)
    FOR rec IN (
        SELECT cv.key, cv.value, cv.value_type, cv.inject_as, cv.description, cv.is_secret,
               CASE WHEN cv.task_id IS NOT NULL THEN 50 WHEN cv.project_id IS NOT NULL THEN 40
                    WHEN cv.scope_id IS NOT NULL THEN 10 + COALESCE((SELECT st.sort_order FROM ctx_scope_types st JOIN ctx_scopes s ON s.scope_type_id = st.id WHERE s.id = cv.scope_id), 0)
                    WHEN cv.organization_id IS NOT NULL THEN 2 WHEN cv.user_id IS NOT NULL THEN 1 ELSE 0 END AS priority,
               CASE WHEN cv.task_id IS NOT NULL THEN 'task' WHEN cv.project_id IS NOT NULL THEN 'project'
                    WHEN cv.scope_id IS NOT NULL THEN 'scope:' || (SELECT s.name FROM ctx_scopes s WHERE s.id = cv.scope_id)
                    WHEN cv.organization_id IS NOT NULL THEN 'organization' WHEN cv.user_id IS NOT NULL THEN 'user' ELSE 'system' END AS source_label
        FROM public.ctx_context_variables cv
        WHERE cv.is_active = true AND (cv.user_id = p_user_id OR cv.organization_id = v_org_id
              OR (cv.scope_id IS NOT NULL AND v_entity_scopes IS NOT NULL AND cv.scope_id IN (SELECT (elem->>'scope_id')::uuid FROM jsonb_array_elements(v_entity_scopes) elem))
              OR cv.project_id = v_project_id OR cv.task_id = v_task_id)
        ORDER BY priority ASC
    ) LOOP
        IF rec.is_secret THEN
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object('value', '***REDACTED***', 'type', rec.value_type, 'inject_as', rec.inject_as, 'source', rec.source_label, 'is_secret', true));
        ELSE
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object('value', rec.value, 'type', rec.value_type, 'inject_as', rec.inject_as, 'source', rec.source_label, 'description', rec.description));
        END IF;
        v_sources := v_sources || jsonb_build_object(rec.key, rec.source_label);
    END LOOP;

    RETURN jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', COALESCE((SELECT jsonb_agg(elem->'scope_id') FROM jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
END;
$function$;

NOTIFY pgrst, 'reload schema';
