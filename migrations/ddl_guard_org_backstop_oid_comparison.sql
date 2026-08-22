-- ddl_guard_org_backstop_oid_comparison.sql — fix FOUND_DEFECTS D241.
--
-- THE BUG
-- -------
-- platform._ddl_guard()'s `org_not_null_no_backstop` WARN rule detected the org
-- backstop trigger by RENDERED TEXT:
--
--     AND t.tgfoid::regproc::text IN
--         ('public._stamp_org_default','platform.inherit_org_from_parent')
--
-- `regproc::text` OMITS the schema for anything on the search_path, so a trigger
-- on public._stamp_org_default renders as the bare string `_stamp_org_default`
-- and the IN never matches. Measured live 2026-08-21: 282 of 282 live triggers
-- on that function render bare -- the NOT EXISTS was unconditionally true and
-- the rule warned on EVERY qualifying table, correctly backstopped or not.
-- Every org_not_null_no_backstop row ever written (875 of them, the largest
-- single group in platform.ddl_guard_log) carried no signal.
--
-- This is the exact class db-rules §1 already warns about for regclass::text,
-- reappearing inside the guard itself.
--
-- THE FIX
-- -------
-- 1. Compare by OID, never by rendered text. to_regproc() (not ::regproc) so a
--    future rename of a backstop degrades to "warn on everything" -- the LOUD
--    direction -- instead of throwing inside the exception-wrapped WARN lane.
--
-- 2. Widen the accept-list from TWO legal backstops to FOUR. An accept-list
--    missing entries IS the D241 defect in a smaller costume, and this one was
--    missing half the platform. Each was verified by READING ITS BODY -- a
--    backstop is a BEFORE INSERT function that cannot RETURN with a NULL
--    organization_id:
--      public._stamp_org_default        actor -> personal org        (302 tables)
--      platform.inherit_org_from_parent parent FK -> parent's org    (115 tables)
--      plan._stamp_from_node            parent node -> its org, else RAISE
--      platform.stamp_run_org           owner -> personal org, unattended ->
--                                       SYSTEM org, else RAISE        (10 tables)
--    db-rules §2 names only three; the live catalog has four.
--
--    platform.stamp_run_org was missing from this rule AND from aidream's
--    BLOCKING gate (matrx_orm.catalog.org_backstop_coverage). That gate is green
--    only by luck: 8 of stamp_run_org's 10 tables ALSO carry _stamp_org_default,
--    and the 2 that rely on it alone (docproc.page_extraction_runs,
--    legal.ingest_runs) have no owner column, so it skips them as no_owner_col.
--    Add a created_by to either and the BLOCKING gate would fail a correctly
--    backstopped table. Fixed on both sides in the same change.
--
-- NOT DONE ON PURPOSE: detecting the PROPERTY ("a BEFORE INSERT trigger whose
-- body assigns NEW.organization_id") instead of enumerating names. ~13 trigger
-- functions match that pattern and some assign only CONDITIONALLY, so the
-- heuristic would buy a false NEGATIVE -- the silent direction -- to avoid a
-- false positive. This rule stays explicit and loud.
--
-- WHY THIS IS A SURGICAL TRANSFORM AND NOT A CREATE OR REPLACE OF THE WHOLE
-- FUNCTION: platform._ddl_guard() is edited concurrently by several sessions
-- (its grandfather lists move almost daily). A full-body replace here would
-- silently revert whatever landed between this file being written and being
-- run. This edits ONE predicate, verifies the result, and RAISEs if the guard
-- is in a shape it does not recognise -- it never guesses.
--
-- Idempotent: re-running when the four-backstop predicate is already present is
-- a no-op.

DO $migration$
DECLARE
  body text;
  newbody text;
  -- the defective original (D241)
  v_broken text := E'                           AND t.tgfoid::regproc::text IN\n                               (''public._stamp_org_default'',''platform.inherit_org_from_parent'')) THEN';
  -- intermediate states from this same fix landing in steps
  v_two text := E'                           AND t.tgfoid IN (to_regproc(''public._stamp_org_default''),\n                                            to_regproc(''platform.inherit_org_from_parent''))) THEN';
  v_three text := E'                           AND t.tgfoid IN (to_regproc(''public._stamp_org_default''),\n                                            to_regproc(''platform.inherit_org_from_parent''),\n                                            to_regproc(''plan._stamp_from_node''))) THEN';
  -- the target
  v_fixed text := E'                           -- FOUR legal backstops, not three: platform.stamp_run_org\n                           -- (10 tables) resolves owner -> personal org, unattended ->\n                           -- SYSTEM org, else RAISEs, so it cannot return a NULL org.\n                           -- Missing here AND in aidream''s blocking gate; green there\n                           -- only by luck (its 2 solo tables are ownerless). D241.\n                           AND t.tgfoid IN (to_regproc(''public._stamp_org_default''),\n                                            to_regproc(''platform.inherit_org_from_parent''),\n                                            to_regproc(''plan._stamp_from_node''),\n                                            to_regproc(''platform.stamp_run_org''))) THEN';
BEGIN
  body := split_part(pg_get_functiondef('platform._ddl_guard()'::regprocedure), '$function$', 2);

  IF position(v_fixed in body) > 0 THEN
    RAISE NOTICE 'ddl_guard org backstop predicate already at four-OID form — no-op';
    RETURN;
  END IF;

  IF    position(v_broken in body) > 0 THEN newbody := replace(body, v_broken, v_fixed);
  ELSIF position(v_three  in body) > 0 THEN newbody := replace(body, v_three,  v_fixed);
  ELSIF position(v_two    in body) > 0 THEN newbody := replace(body, v_two,    v_fixed);
  ELSE
    RAISE EXCEPTION 'ddl_guard: org_not_null_no_backstop predicate is in an unrecognised shape — refusing to guess. Re-read pg_get_functiondef(''platform._ddl_guard()'') and update this migration.';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION platform._ddl_guard() RETURNS event_trigger LANGUAGE plpgsql AS $function$' || newbody || '$function$';

  -- prove it landed, in the same transaction
  body := split_part(pg_get_functiondef('platform._ddl_guard()'::regprocedure), '$function$', 2);
  IF position(v_fixed in body) = 0 THEN
    RAISE EXCEPTION 'ddl_guard: predicate replacement did not take';
  END IF;
  RAISE NOTICE 'ddl_guard org backstop predicate now compares four backstops by OID';
END
$migration$;
