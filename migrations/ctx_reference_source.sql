-- ctx_reference_source.sql
-- Dimensional reference values (datasets + structured lists): a context item can
-- bind to a CONTAINER (a dataset/table or a structured list) fixed on the
-- definition, and set a DIMENSION per scope (row/column/cell/group) or resolve it
-- dynamically via a filter. The bound-source config lives in this one JSONB.
--
-- INTERIM representation (Arman, 2026-07-13): JSONB chosen to ship fast + get the
-- feature functional in the UI and with agents. The permanent model is likely one
-- or more dedicated tables — revisit. See docs/handoffs/dimensional-reference-values.md.
--
-- Shape:
--   { container_type: "dataset" | "structured_list",
--     container_id:   "<table_id | list_id>",         -- fixed on the definition
--     dimension:      "whole" | "row" | "column" | "cell" | "group",
--     column:         "<column_name>",                -- for column/cell/dynamic
--     filter:         { column, op, value: "$scope.id" }  -- dynamic case only
--   }
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus) on 2026-07-13. Idempotent.

-- The read RPCs `list_scope_type_items` and `get_scope_context` were also updated
-- (applied live, migration `ctx_reference_source_rpc_emit`) to emit `reference_source`
-- in every item object, so the editor + value pickers can read the binding. Their
-- current bodies live in the DB; this file records the schema change.

ALTER TABLE context.context_items
  ADD COLUMN IF NOT EXISTS reference_source jsonb;

COMMENT ON COLUMN context.context_items.reference_source IS
  'Dimensional reference binding (INTERIM jsonb): {container_type, container_id, dimension, column?, filter?}. Fixes a dataset/structured-list container on the definition; the per-scope value sets the dimension (or a filter resolves it dynamically). See docs/handoffs/dimensional-reference-values.md.';
