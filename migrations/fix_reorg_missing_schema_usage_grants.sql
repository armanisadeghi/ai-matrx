-- Post-reorg fix (2026-06-29): sibling schemas missing the schema-level USAGE grant.
--
-- Same root cause as fix_canvas_schema_usage_grant.sql, found by auditing every
-- FE-exposed schema: `code`, `legal`, and `scraper` were each moved/created with
-- TABLE privileges granted to authenticated/anon, but the schema-level USAGE grant
-- was never applied. With no schema USAGE, any FE access (SECURITY INVOKER RPC or
-- direct PostgREST .from()) raises "permission denied for schema <x>" — the exact
-- failure that broke canvas artifact materialization.
--
-- This GRANT only makes the EXISTING table grants reachable; it exposes no table
-- that wasn't already granted. It brings these schemas in line with every other
-- FE-facing schema (chat/files/workbench/etc., all of which grant USAGE to the
-- three roles).
--
-- Idempotent: GRANT is a no-op when the privilege is already present.

GRANT USAGE ON SCHEMA code    TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA legal   TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA scraper TO authenticated, anon, service_role;
