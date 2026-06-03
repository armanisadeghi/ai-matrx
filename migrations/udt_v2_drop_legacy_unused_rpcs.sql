-- ============================================================================
-- udt_v2_drop_legacy_unused_rpcs — remove 4 dead legacy UDT RPCs
-- ============================================================================
--
-- Applied live to Supabase project txzxabzwovsujtloxrus (Matrx Main) on
-- 2026-06-02 via the Supabase migration API (migration name
-- `udt_v2_drop_legacy_unused_rpcs`). This file is the schema-of-record copy.
--
-- Why
-- ---
-- `udt_v2_backbone` (2026-05-29) consolidated UDT writes onto the new
-- `udt_upsert_row` / `udt_upsert_cell` / `udt_bulk_write` / `udt_change_field_type`
-- RPCs. The four functions dropped below are pre-consolidation legacy stubs.
--
-- A four-repo + DB-internal audit (2026-06-02) confirmed they are dead:
--   * ai-matrx (this repo): present only as TYPE ENTRIES in
--     types/database.types.ts — zero `.rpc()` call sites.
--   * aidream: zero call sites (names appear only as CREATE defs in its origin
--     migration 0011_udt_rename_and_rpc_consolidation.sql + one test comment).
--   * matrx-extend: comment-only (the two KEEP RPCs are what it actually calls).
--   * matrx-local (Tauri): zero references of any kind.
--   * DB internals: the ONLY function-body reference was
--     create_new_user_table_wrapper -> create_new_user_table (both dropped here,
--     intra-set). Zero views, zero RLS policies, zero pg_depend hard deps.
-- Evidence: matrx-frontend features/data-tables/CROSS_REPO_{TASKS,HANDOFF}.md.
--
-- NOT dropped (kept intentionally)
-- --------------------------------
--   * create_user_table_with_fields  — LIVE in matrx-extend (Showcase save flow)
--   * append_rows_to_user_table       — LIVE in matrx-extend (Showcase save flow)
--   * create_new_user_table_dynamic   — the LIVE canonical create path
--     (ai-matrx utils/user-table-utls/table-utils.ts). A sibling name to the two
--     create_new_user_table* stubs dropped below — do NOT confuse them.
--
-- Order note: create_new_user_table_wrapper calls create_new_user_table; plpgsql
-- bodies are late-bound so there is no RESTRICT dependency, but we drop the
-- wrapper first regardless.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_new_user_table_wrapper(text, text, boolean, boolean, jsonb);
DROP FUNCTION IF EXISTS public.create_new_user_table(text, text, boolean, boolean, jsonb);
DROP FUNCTION IF EXISTS public.batch_update_rows_in_user_table(uuid, jsonb);
DROP FUNCTION IF EXISTS public.remove_column_from_user_table(uuid, uuid);
