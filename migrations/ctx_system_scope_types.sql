-- ctx_system_scope_types.sql
--
-- SYSTEM (always-available) context items. A scope type flagged is_system holds context
-- items that resolve for EVERY user with NO scope selection — the home for platform-wide
-- context (Class 2 curated globals; Class 3 industry datasets) and Class 1 ambient items
-- (date/time/user). They reuse the entire existing items/values/components/binding stack.
--
-- This file owns ONLY the column. The resolver that consumes it (the system-cell loop +
-- cell_values + `key`) lives in its own canonical migration
-- (ctx_resolve_full_context_drop_brokers_add_key.sql) so there is exactly ONE resolve_full_context
-- definition in the repo — re-running migrations can never regress it. Setting is_system is
-- locked to super admins (ctx_admin_set_scope_type_system.sql + ctx_lock_down_is_system.sql).
--
-- Applied to Matrx Main (txzxabzwovsujtloxrus). Idempotent.

ALTER TABLE public.ctx_scope_types
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ctx_scope_types.is_system IS
  'When true, this scope type''s context items always resolve for every user (no scope selection). Platform-wide System context. Set by super admins only (admin_set_scope_type_system + a BEFORE trigger).';
