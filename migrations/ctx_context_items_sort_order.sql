-- ctx_context_items_sort_order.sql
-- User-controlled display order for context items. Applied to Matrx Main
-- (txzxabzwovsujtloxrus) 2026-06-06 via migration ctx_context_items_sort_order.

ALTER TABLE public.ctx_context_items
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;

-- Backfill sequentially per scope type, preserving the prior (category, name) order.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY scope_type_id ORDER BY category NULLS LAST, display_name) AS rn
  FROM public.ctx_context_items WHERE is_active = true
)
UPDATE public.ctx_context_items t
SET sort_order = r.rn
FROM ranked r WHERE t.id = r.id;

-- RPC changes applied in the same migration (full bodies live in the DB):
--   list_scope_type_items  → emits sort_order, ORDER BY sort_order, display_name
--   get_scope_context      → emits sort_order, ORDER BY sort_order, display_name
--   create_context_item    → gains p_sort_order (default: append at end of the type)
-- updateContextItem (FE) writes sort_order via a direct ctx_context_items UPDATE.