-- agx_output_schema_preserve_key_order.sql
--
-- Preserve authored property order in agent output schemas.
--
-- PROBLEM (root cause, confirmed live on Matrx Main):
--   `output_schema` was stored as `jsonb`. Postgres `jsonb` does NOT preserve
--   object key order — it canonicalizes keys by (length, then bytewise). For a
--   structured-output JSON Schema this is destructive: the model emits fields in
--   the schema's property order, so reordering `properties` silently changes the
--   shape of every generated row (e.g. a clinical timeline where DATE must come
--   first gets shuffled to DATE, PAGE, SOURCE, ...). Arrays such as `required`
--   were preserved; object key order was not.
--
--   The write path itself is innocent: the editor (JSON5.parse -> JS object) and
--   supabase-js/PostgREST both preserve insertion order. Verified end-to-end that
--   a `json` column round-trips key order intact through PostgREST while a `jsonb`
--   column reorders. So the fix is the column type, nothing in app code.
--
-- FIX:
--   Switch `output_schema` from `jsonb` -> `json` on the agent tables. `json`
--   stores the value text verbatim (order + formatting preserved) which is exactly
--   what a stored-and-retrieved-whole schema document needs. These columns are
--   never queried with jsonb operators, have no indexes, constraints, or
--   dependent views (verified), so the change is transparent to every consumer
--   (TS `Json` type and the Python backend both still receive a JSON object).
--
-- NOTE: existing rows were already canonicalized while stored as jsonb; their
--   original order is unrecoverable. Going forward, re-saving a schema preserves
--   whatever order the user authored. New rows are correct from the first save.
--
-- Idempotent: each ALTER is guarded on the current column type, and the function
-- is CREATE OR REPLACE.

-- ─── 1. agx_get_version_snapshot must return `json` (not re-jsonb the value) ───
-- Drop first: changing a column's type in the RETURNS TABLE signature requires a
-- drop/recreate (CREATE OR REPLACE cannot change the output type).
DROP FUNCTION IF EXISTS public.agx_get_version_snapshot(uuid, integer);

CREATE FUNCTION public.agx_get_version_snapshot(p_agent_id uuid, p_version_number integer)
 RETURNS TABLE(version_id uuid, version_number integer, agent_type text, name text, description text, messages jsonb, variable_definitions jsonb, model_id uuid, model_tiers jsonb, settings jsonb, output_schema json, tools uuid[], mcp_servers uuid[], custom_tools jsonb, context_slots jsonb, category text, tags text[], is_active boolean, changed_at timestamp with time zone, change_note text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        av.id,
        av.version_number,
        av.agent_type,
        av.name,
        av.description,
        av.messages,
        av.variable_definitions,
        av.model_id,
        av.model_tiers,
        av.settings,
        av.output_schema,
        av.tools,
        av.mcp_servers,
        av.custom_tools,
        av.context_slots,
        av.category,
        av.tags,
        av.is_active,
        av.changed_at,
        av.change_note
    FROM agx_version av
    WHERE av.agent_id = p_agent_id
      AND av.version_number = p_version_number;
$function$;

-- ─── 2. Flip the column type on all three agent tables ─────────────────────────
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agx_agent'
        AND column_name = 'output_schema') = 'jsonb' THEN
    ALTER TABLE public.agx_agent
      ALTER COLUMN output_schema TYPE json USING output_schema::text::json;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agx_version'
        AND column_name = 'output_schema') = 'jsonb' THEN
    ALTER TABLE public.agx_version
      ALTER COLUMN output_schema TYPE json USING output_schema::text::json;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agx_agent_templates'
        AND column_name = 'output_schema') = 'jsonb' THEN
    ALTER TABLE public.agx_agent_templates
      ALTER COLUMN output_schema TYPE json USING output_schema::text::json;
  END IF;
END $$;
