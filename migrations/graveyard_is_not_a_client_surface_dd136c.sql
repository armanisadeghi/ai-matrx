-- DD-136c — THE GRAVEYARD IS NOT A CLIENT SURFACE.
--
-- ── WHY, found by the DD-136 guard on its first live run ────────────────────
-- `pnpm check:admin-door:strict` reported four tables that DECLARE a visibility
-- contract and still carry an UNGUARDED org-admin read arm:
-- `graveyard.mandate`, `graveyard.mandate_binding`, `graveyard.provision`,
-- `graveyard.user_flashcard_sets`. DD-136 could not regenerate them —
-- `iam.apply_rls` refuses a token whose registry row is inactive, and all four
-- are retired — so the arm they were deployed with is frozen in place.
--
-- The obvious move is an allowlist entry. That would be a lie: these tables are
-- REACHABLE. Measured before changing anything:
--
--   authenticated has USAGE on schema graveyard, and SELECT/INSERT/UPDATE/DELETE
--   on all six live graveyard base tables;
--   anon has SELECT on mandate, mandate_binding, user_flashcard_reviews and
--   user_flashcard_sets, and INSERT/UPDATE/DELETE on the last two.
--
-- So a retired table with a frozen, unguarded org-admin read lane is sitting
-- behind a live client grant, and two of them accept writes from a signed-out
-- visitor. A guard finding that is answered with an exception list is a guard
-- that has been switched off; the door itself has to go
-- (`common-docs/policies/closing-a-class-means-removing-the-door.md`).
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
-- Revokes every privilege on schema `graveyard` and everything in it from
-- `anon` and `authenticated`, and takes back the DEFAULT PRIVILEGES that would
-- re-grant them on the next table moved there. `service_role` and `postgres`
-- are untouched: `aidream/aidream/services/mandates/storage.py` still reads
-- `graveyard.mandate` / `provision` / `mandate_binding` through the ORM's own
-- connection, which is not a client role. This is the same treatment
-- `graveyard.client_page_versions` already got (aidream CMS CONTRACT §347).
--
-- No app code reads any of these from a client: grepped across
-- `matrx-frontend/{app,features,lib,utils}` and `aidream/{aidream,db}` — every
-- hit is a comment or a FEATURE.md line saying the table IS graveyarded.
--
-- ── PROVEN IN THIS TRANSACTION, OR NOTHING COMMITS ─────────────────────────
--   RED    before: authenticated and anon can reach at least one graveyard table.
--   GREEN  after: neither role has USAGE on the schema or any privilege on any
--          table in it, default privileges included; service_role still does.

DO $red$
DECLARE v_reachable int;
BEGIN
  SELECT count(*) INTO v_reachable
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'graveyard' AND c.relkind = 'r'
    AND (has_table_privilege('authenticated', c.oid, 'SELECT')
      OR has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'INSERT'));
  IF v_reachable = 0 THEN
    RAISE EXCEPTION 'DD-136c: no graveyard table is client-reachable — there is nothing to close and this file should not be applied';
  END IF;
  RAISE NOTICE 'DD-136c RED: % graveyard table(s) reachable by anon or authenticated', v_reachable;
END
$red$;

ALTER DEFAULT PRIVILEGES IN SCHEMA graveyard REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graveyard REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graveyard REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA graveyard FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA graveyard FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graveyard FROM anon, authenticated;
REVOKE ALL ON SCHEMA graveyard FROM anon, authenticated;

COMMENT ON SCHEMA graveyard IS
  'Retired tables. NOT a client surface: anon and authenticated hold no privilege here and the default privileges do not re-grant one (DD-136c, 2026-09-12). A table moved here stops being readable by a browser on the day it is moved. service_role and the ORM connection are unaffected.';

DO $green$
DECLARE v_bad text;
BEGIN
  IF has_schema_privilege('authenticated', 'graveyard', 'USAGE')
     OR has_schema_privilege('anon', 'graveyard', 'USAGE') THEN
    RAISE EXCEPTION 'DD-136c: a client role still has USAGE on schema graveyard';
  END IF;

  SELECT string_agg(format('%s (%s)', c.relname,
           concat_ws(' ',
             CASE WHEN has_table_privilege('authenticated', c.oid, 'SELECT') THEN 'auth:select' END,
             CASE WHEN has_table_privilege('authenticated', c.oid, 'INSERT') THEN 'auth:insert' END,
             CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'anon:select' END,
             CASE WHEN has_table_privilege('anon', c.oid, 'INSERT') THEN 'anon:insert' END)), ', ')
    INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'graveyard' AND c.relkind = 'r'
    AND (has_table_privilege('authenticated', c.oid, 'SELECT')
      OR has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'INSERT'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'DD-136c: graveyard table(s) still client-reachable after the revoke: %', v_bad;
  END IF;

  -- The server keeps its access. Measured before writing this file: the schema
  -- ACL is {postgres=UC, authenticated=U} — `service_role` never had USAGE here
  -- at all, so the only role that can actually reach these tables is the OWNER,
  -- which is what aidream's ORM connects as (SUPABASE_MATRIX_USER) to read
  -- graveyard.mandate / provision / mandate_binding. Asserting on service_role
  -- would have been asserting on a privilege nobody had — and the first draft of
  -- this file did exactly that and failed its own rehearsal, which is the point
  -- of rehearsing.
  IF NOT has_schema_privilege('postgres', 'graveyard', 'USAGE')
     OR NOT has_table_privilege('postgres', 'graveyard.mandate', 'SELECT') THEN
    RAISE EXCEPTION 'DD-136c: the OWNER lost its access to the graveyard — aidream reads graveyard.mandate through it; refusing to break the server to close a client door';
  END IF;

  RAISE NOTICE 'DD-136c GREEN: no graveyard table is reachable by anon or authenticated; service_role unchanged';
END
$green$;
