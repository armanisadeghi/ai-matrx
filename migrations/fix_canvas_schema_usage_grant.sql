-- Post-reorg fix (2026-06-29): the canvas schema move forgot the schema-level USAGE grant.
--
-- canvas_canonicalize_and_move_to_canvas_schema.sql relocated canvas_items + siblings
-- into the `canvas` schema and granted TABLE privileges, but never granted USAGE on the
-- schema itself. With no schema USAGE, every SECURITY INVOKER cx_canvas_* RPC (e.g.
-- cx_canvas_upsert) raised "permission denied for schema canvas" when called by an
-- authenticated user — surfacing in the FE as "cx_canvas_upsert returned null" (canvas
-- artifact materialization silently no-op'd; flashcards/diagrams/etc. never persisted).
--
-- canvas was the only FE-facing exposed schema with table grants present but schema
-- USAGE absent. Mirrors the same miss fixed for `users` in
-- fix_users_schema_grants_and_communication_dm_rpcs.sql.
--
-- Idempotent: GRANT is a no-op when the privilege is already present.

GRANT USAGE ON SCHEMA canvas TO authenticated, anon, service_role;
