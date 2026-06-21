-- tool_bundle_lister_enforcement.sql
--
-- Make every tool_bundle carry a lister tool, and make it structurally
-- impossible to create one without it.
--
-- A bundle's whole point is to REDUCE the model's tool count: the agent carries
-- ONE lister tool (`bundle:list_<name>`, bound to the generic `matrx-ai-core`
-- bundle_lister handler); at runtime the lister swaps in the bundle's members
-- and removes itself. But the admin "create bundle" path
-- (`create_bundle_with_lister`) never actually created the lister — it only
-- linked a pre-existing one (and the UI passed none), so bundles created in the
-- admin dashboard were born with `lister_tool_id = NULL` (e.g. `agent-core`).
-- The picker then had to fall back to dumping the raw members onto the agent —
-- the exact opposite of what a bundle is for.
--
-- This migration:
--   1. Rewrites create_bundle_with_lister to ALWAYS create + bind the lister.
--   2. Backfills a lister for every existing bundle that lacks one.
--   3. Adds NOT NULL on tool_bundle.lister_tool_id as the permanent backstop.
--
-- Note: bundles that already share a lister (the browser bundles riding
-- `load_browser_tools`, a permission-aware Chrome-extension discovery tool) are
-- left untouched — they already have a non-null lister, so the backfill skips
-- them and the constraint is satisfied. Reworking those is deferred.
--
-- Idempotent: re-running creates nothing new.

-- 1) Creation RPC — always create the lister tool_def + its matrx-ai-core
--    binding, link it to the bundle, then add members. Honors an explicit
--    p_lister_tool_name when given (creating it if missing), else derives
--    `bundle:list_<name>`.
CREATE OR REPLACE FUNCTION public.create_bundle_with_lister(
    p_name text,
    p_description text DEFAULT ''::text,
    p_is_system boolean DEFAULT false,
    p_lister_tool_name text DEFAULT NULL::text,
    p_member_tool_names text[] DEFAULT ARRAY[]::text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_bundle_id uuid;
    v_lister_id uuid;
    v_lister_name text := COALESCE(p_lister_tool_name, 'bundle:list_' || p_name);
    v_lister_desc text := 'Discovery tool — loads the ' || p_name ||
        ' bundle''s tools on demand, then removes itself. Call it when you need that toolkit.';
BEGIN
    -- lister tool_def (create if missing, else keep active)
    SELECT id INTO v_lister_id FROM public.tool_def WHERE name = v_lister_name;
    IF v_lister_id IS NULL THEN
        INSERT INTO public.tool_def (name, description, parameters, category, tool_group, source_kind, is_active)
        VALUES (v_lister_name, v_lister_desc, '{}'::jsonb, 'bundle', 'core', 'native', true)
        RETURNING id INTO v_lister_id;
    ELSE
        UPDATE public.tool_def SET is_active = true, updated_at = now() WHERE id = v_lister_id;
    END IF;

    -- bind the lister to the generic bundle-lister executor
    IF NOT EXISTS (
        SELECT 1 FROM public.tool_binding
        WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core'
    ) THEN
        INSERT INTO public.tool_binding (tool_id, executor_name, is_active)
        VALUES (v_lister_id, 'matrx-ai-core', true);
    ELSE
        UPDATE public.tool_binding SET is_active = true, updated_at = now()
        WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core';
    END IF;

    -- the bundle, always linked to its lister
    SELECT id INTO v_bundle_id FROM public.tool_bundle WHERE name = p_name;
    IF v_bundle_id IS NULL THEN
        INSERT INTO public.tool_bundle (name, description, is_system, lister_tool_id, created_by)
        VALUES (p_name, p_description, p_is_system, v_lister_id, auth.uid())
        RETURNING id INTO v_bundle_id;
    ELSE
        UPDATE public.tool_bundle
        SET description = p_description, is_system = p_is_system,
            lister_tool_id = v_lister_id, updated_at = now()
        WHERE id = v_bundle_id;
    END IF;

    -- members by name (idempotent; local_alias/sort_order take table defaults)
    INSERT INTO public.tool_bundle_member (bundle_id, tool_id)
    SELECT v_bundle_id, d.id FROM public.tool_def d
    WHERE d.name = ANY(p_member_tool_names)
      AND NOT EXISTS (
        SELECT 1 FROM public.tool_bundle_member m
        WHERE m.bundle_id = v_bundle_id AND m.tool_id = d.id
      );

    RETURN v_bundle_id;
END;
$function$;

-- 2) Backfill every bundle that lacks a lister (today: only `agent-core`).
DO $$
DECLARE
    r record;
    v_lister_id uuid;
    v_lister_name text;
BEGIN
    FOR r IN SELECT id, name FROM public.tool_bundle WHERE lister_tool_id IS NULL LOOP
        v_lister_name := 'bundle:list_' || r.name;
        SELECT id INTO v_lister_id FROM public.tool_def WHERE name = v_lister_name;
        IF v_lister_id IS NULL THEN
            INSERT INTO public.tool_def (name, description, parameters, category, tool_group, source_kind, is_active)
            VALUES (
                v_lister_name,
                'Discovery tool — loads the ' || r.name || ' bundle''s tools on demand, then removes itself.',
                '{}'::jsonb, 'bundle', 'core', 'native', true
            )
            RETURNING id INTO v_lister_id;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.tool_binding
            WHERE tool_id = v_lister_id AND executor_name = 'matrx-ai-core'
        ) THEN
            INSERT INTO public.tool_binding (tool_id, executor_name, is_active)
            VALUES (v_lister_id, 'matrx-ai-core', true);
        END IF;
        UPDATE public.tool_bundle SET lister_tool_id = v_lister_id, updated_at = now() WHERE id = r.id;
    END LOOP;
END $$;

-- 3) Permanent backstop: a bundle can never again exist without a lister.
ALTER TABLE public.tool_bundle ALTER COLUMN lister_tool_id SET NOT NULL;
