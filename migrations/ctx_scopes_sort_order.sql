-- ctx_scopes_sort_order.sql
-- User-controlled display order for scopes (clients, etc.), mirroring the
-- sort_order already on ctx_scope_types and ctx_context_items.
-- Applied to Matrx Main (txzxabzwovsujtloxrus) 2026-06-06 via two migrations:
--   ctx_scopes_sort_order_part1         (column + short scope RPCs)
--   ctx_scopes_sort_order_part2_trees   (get_user_scopes[_with_projects])

ALTER TABLE public.ctx_scopes
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;

-- Backfill sequentially per (org, type), preserving the prior alphabetical order.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY organization_id, scope_type_id ORDER BY name) AS rn
  FROM public.ctx_scopes
)
UPDATE public.ctx_scopes t
SET sort_order = r.rn
FROM ranked r WHERE t.id = r.id;

-- RPC changes applied alongside (full bodies live in the DB):
--   list_scopes               → ORDER BY s.sort_order, s.name (to_jsonb already emits the column)
--   get_scope_tree            → ORDER BY st.sort_order, s.sort_order, s.name
--   get_entity_scopes         → ORDER BY st.sort_order, s.sort_order, s.name
--   search_scopes             → ORDER BY st.sort_order, s.sort_order, s.name
--   get_user_scopes           → type_scopes CTE: emit s.sort_order, ORDER BY s.sort_order, s.name
--   get_user_scopes_with_projects → same as get_user_scopes
--   create_scope              → gains p_sort_order (defaults to append within org/type/parent)
--   update_scope              → gains p_sort_order
-- Scope TYPES + context ITEMS already ordered by their sort_order in their fetch RPCs.