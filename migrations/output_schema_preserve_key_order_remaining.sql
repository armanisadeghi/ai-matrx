-- output_schema_preserve_key_order_remaining.sql
--
-- Companion to agx_output_schema_preserve_key_order.sql (which fixed the agent
-- tables). Flips the remaining `output_schema` columns from `jsonb` -> `json`
-- so authored JSON-Schema property order survives a save/reload, same root
-- cause: `jsonb` canonicalizes object keys by (length, then bytewise).
--
-- Scope — the schema-document columns that are stored and retrieved WHOLE:
--   prompts, prompt_versions, prompt_builtins, prompt_builtin_versions,
--   tool_def, tool_def_version, page_extraction_jobs
--
-- Verified before writing this: no indexes, constraints, or generated columns
-- reference these columns; the only dependent object is
-- `prompt_builtins_with_source_view` (dropped + recreated below). `promote_version`
-- copies output_schema column-to-column (type-agnostic — safe once both sides
-- are `json`). `json`/`jsonb` both map to the TS `Json` type, so no app/type
-- change is needed.
--
-- KNOWN RESIDUAL RE-CANONICALIZATION (NOT fixed by a column flip — left as-is by
-- decision, flagged loudly here so a future reader doesn't assume order is
-- guaranteed end-to-end on these paths):
--   1. get_prompt_app_execution_payload(uuid) rebuilds the run payload with
--      jsonb_build_object('output_schema', …) -> reorders keys in the prompt-APP
--      execution payload regardless of column type. (Legacy prompt-apps; prompts
--      are mid-deprecation in favor of agents.) Would require json_build_object +
--      a json return to preserve.
--   2. tool_register(p_def jsonb) / tool_register_mcp_discovered(…, jsonb) accept
--      the whole tool definition as a jsonb PARAMETER, so tools registered via
--      these RPCs lose key order at the parameter boundary, before the column.
--      Direct PostgREST writes from the admin UI are preserved by this flip.
--
-- page_extraction_jobs.output_schema in practice stores the array-based
-- { kind:"extraction_columns", columns:[…] } shape whose order is carried by the
-- `columns` ARRAY (jsonb already preserves arrays); the flip is defensive/
-- consistent. The grid's raw-row column inference reads page_extraction_results
-- .payload (jsonb), deliberately NOT changed here.
--
-- Idempotent: ALTERs guarded on current type; view drop/recreate is CREATE OR REPLACE-safe via DROP IF EXISTS.

-- ─── 1. Drop the dependent view so the column type can change ──────────────────
DROP VIEW IF EXISTS public.prompt_builtins_with_source_view;

-- ─── 2. Flip each column jsonb -> json (guarded) ───────────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'prompts', 'prompt_versions', 'prompt_builtins', 'prompt_builtin_versions',
    'tool_def', 'tool_def_version', 'page_extraction_jobs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t
          AND column_name = 'output_schema') = 'jsonb' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN output_schema TYPE json USING output_schema::text::json',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ─── 3. Recreate the view + its comment exactly ───────────────────────────────
CREATE VIEW public.prompt_builtins_with_source_view AS
 SELECT pb.id,
    pb.created_at,
    pb.updated_at,
    pb.name,
    pb.description,
    pb.messages,
    pb.variable_defaults,
    pb.tools,
    pb.settings,
    pb.is_active,
    pb.source_prompt_id,
    pb.source_prompt_snapshot_at,
    pb.tags,
    pb.category,
    pb.model_id,
    pb.output_format,
    pb.output_schema,
    pb.is_favorite,
    pb.is_archived,
    pb.created_by_user_id,
    p.name AS source_prompt_name,
    p.description AS source_prompt_description,
    p.updated_at AS source_prompt_updated_at
   FROM prompt_builtins pb
     LEFT JOIN prompts p ON pb.source_prompt_id = p.id
  ORDER BY pb.name;

COMMENT ON VIEW public.prompt_builtins_with_source_view IS
'Optimized view for prompt builtins with source prompt information.
Includes all builtin fields (including new tags, category, model_id, output_format, output_schema, is_favorite, is_archived)
plus source_prompt_name for display. Eliminates N+1 query problem.';
