-- Fix: ctx_context_reference_cells.sql used CREATE OR REPLACE FUNCTION on
-- create_context_item with 3 new trailing params (p_allowed_reference_types,
-- p_max_items, p_allowed_scope_type_ids). In Postgres, REPLACE with a
-- different signature creates a NEW overload rather than replacing the old
-- one — so the pre-reference 11-arg signature was left behind alongside the
-- new 14-arg one. PostgREST then can't disambiguate calls that omit the
-- trailing (all-default) params, and throws PGRST203.
--
-- Fix: drop the stale 11-arg overload. The 14-arg version is a strict
-- superset (identical first 11 params, 3 new ones all defaulted), so every
-- existing call site keeps working unchanged.

DROP FUNCTION IF EXISTS public.create_context_item(
  uuid, text, text, context_value_type, text, text,
  context_fetch_hint, context_sensitivity, text[], text, smallint
);
