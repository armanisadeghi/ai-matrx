-- D146 FOLLOW-UP — the last four SELECT policies that call
-- `public.is_resource_owner()` once per candidate row.
--
-- THE DEFECT CLASS (db-rules §6d). A `SECURITY DEFINER` function in a policy's
-- `USING` clause is called ONCE PER CANDIDATE ROW — `SET search_path` alone
-- forecloses inlining and hoisting. `is_resource_owner` is the worst member of
-- the family: each call re-resolves `platform.shareable_resource_registry`,
-- queries `information_schema`, and only then runs a dynamic single-row lookup.
-- The permanent COMMENT this repo attached to that function says so by name:
--
--   "NEVER call this from an RLS USING clause ... On a table that already
--    carries its own owner column, compare that column directly, exactly as
--    that table's INSERT/UPDATE/DELETE policies do (D146; files.pages,
--    2026-08-15)."
--
-- All four tables below already carry `owner_id`, and each table's OWN
-- UPDATE/DELETE policies already assert
-- `(SELECT is_platform_admin()) OR (owner_id = auth.uid())`. This migration
-- makes SELECT say what its siblings on the same table already say.
--
-- 🚨 A CORRECTION I OWE THIS FILE. On 2026-08-21 I wrote "the LAST live
-- instance of the exact shape D146 banned" into
-- `pdf_redaction_mapping_select_owner_arm_d146_followup.sql`. That was wrong —
-- I had checked the drift-audit's list, not the database. SIX policies still
-- had the shape. These four are the ones that reduce; the remaining two
-- (`iam.permissions` update + delete) are POLYMORPHIC — their token is a
-- COLUMN (`is_resource_owner(resource_type, resource_id)`), so there is no
-- single owner column to compare against and no set-wise twin without
-- re-deriving the access model (the move that broke component reads on
-- 2026-08-13). They are deliberately left alone and are filed in aidream's
-- FOUND_DEFECTS.
--
-- ============================================================================
-- WHY EACH REWRITE IS EXACTLY EQUIVALENT — READ OUT OF THE LIVE OBJECTS
-- ============================================================================
-- For each table, `is_resource_owner(tok, K)` expands to:
--   1. `resolve_shareable_resource(tok)` — CHECKED LIVE for all four: each
--      returns a row AND each token has a `platform.entity_types` row, so the
--      exception arm (which would make the policy fail SILENT-CLOSED, §6c) is
--      NOT taken. This check was not a formality — the same audit found
--      `pdf_redaction_audits` passing a TABLE NAME where the token belongs,
--      which left that table unreadable by everyone. These four are clean.
--   2. `shareable_owner_column(...)` -> 'owner_id' on all four (the column
--      exists, so the `created_by` fallback is never reached).
--   3. `SELECT owner_id FROM <tbl> WHERE <id_column> = $1`.
--   4. returns `v_owner_id IS NOT NULL AND v_owner_id = v_uid`, and FALSE (never
--      NULL) when `auth.uid()` is NULL, via its `v_uid IS NULL` early return.
--
-- THE KEY IS THE PRIMARY KEY IN ALL FOUR CASES, so step 3 returns exactly the
-- scanned row's own `owner_id` and the reduction is exact by construction:
--
--   files.entities          id_column='id'       -> PK
--   files.overrides         id_column='id'       -> PK
--   files.page_annotations  id_column='id'       -> PK
--   files.analysis          id_column='file_id'  -> **`file_id` IS the PRIMARY
--                           KEY of files.analysis** (`file_analysis_pkey
--                           PRIMARY KEY (file_id)`). Verified explicitly
--                           because the registry pointing at something other
--                           than `id` is unusual and would otherwise let the
--                           helper's non-STRICT `INTO` pick an arbitrary row
--                           among duplicates. There can be no duplicates: it is
--                           the PK. (Belt and braces: 0 file_ids today have
--                           more than one distinct owner.)
--
-- `owner_id` is NOT NULL on all four with 0 NULL rows live, so step 4's
-- `IS NOT NULL` guard is always true. Therefore, in all THREE truth values:
--
--     is_resource_owner(tok, <pk>)
--   <=> (SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())
--
-- The `IS NOT NULL` guard is not decoration: without it a NULL `auth.uid()`
-- yields NULL where the helper yielded FALSE. Both reject the row, but only the
-- guard keeps the predicate identical in truth VALUE, not merely in outcome.
--
-- THE `is_platform_admin()` ARM IS COPIED VERBATIM and is NOT the problem: it
-- is already written `(SELECT is_platform_admin())`, which is uncorrelated and
-- plans as a single InitPlan evaluated ONCE per query, not once per row.
--
-- ROLES ARE UNCHANGED (`PUBLIC` on all four). `anon` evaluated the old helper to
-- FALSE through its `v_uid IS NULL` early return and evaluates the new
-- predicate to FALSE through the same guard. Anon is not widened by one row.
-- The separate `*_grant_read` policies (`iam.has_access('file', file_id,
-- 'viewer')`) are UNTOUCHED — that is the sharing lane, a different question,
-- and the files.pages precedent measured that hoisting it makes things WORSE.
--
-- ============================================================================
-- LIVE EQUIVALENCE PROBE (2026-08-21) — NOT VACUOUS
-- ============================================================================
-- Session-mode pooler (port 5432; transaction mode leaks `SET LOCAL ROLE` and
-- silently corrupts identity-scoped RLS testing), one rolled-back transaction.
-- `files.entities` and `files.overrides` are empty live, so real rows owned by
-- two real users were inserted inside the transaction to make their proof mean
-- something. Both predicates evaluated PER ROW for every identity:
--
--   table                    rows   identity      old_admits  new  disagree
--   files.analysis           1,236  user0             1,040  1,040     0
--   files.analysis                  real owner A         11     11     0
--   files.analysis                  real owner B        118    118     0
--   files.entities               2  4 identities        1 ea   1 ea     0
--   files.overrides              2  4 identities        1 ea   1 ea     0
--   files.page_annotations      11  user0                10     10     0
--   files.page_annotations          real owner A         10     10     0
--   files.page_annotations          real owner B          1      1     0
--   anon (no jwt), every table ..... 0 admitted on BOTH sides, 0 disagreements
--   ---------------------------------------------------------------------
--   TOTAL, strict `IS DISTINCT FROM`, all tables x identities x rows:      0
--
-- The proof is not vacuous in either direction — identities are ADMITTED 1,040
-- / 118 / 11 / 10 rows through the old helper and anon plus non-owners are
-- REFUSED, and the rewrite agrees on every single row.
--
-- PERFORMANCE IS NOT THE URGENT PART HERE and this file does not pretend
-- otherwise: the largest of these tables is 1,236 rows, far from the scans that
-- made D146 a live 57014 on `seo.search_performance_daily` and
-- `platform.activity_log`. This is the banned SHAPE being removed from the last
-- places it reduces cleanly, while the tables are small and the change is free.
--
-- Idempotent: DROP POLICY IF EXISTS / CREATE POLICY.

BEGIN;

DROP POLICY IF EXISTS file_analysis_select ON files.analysis;
CREATE POLICY file_analysis_select ON files.analysis
  FOR SELECT TO PUBLIC
  USING ((SELECT is_platform_admin())
         OR ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS file_entities_select ON files.entities;
CREATE POLICY file_entities_select ON files.entities
  FOR SELECT TO PUBLIC
  USING ((SELECT is_platform_admin())
         OR ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS file_overrides_select ON files.overrides;
CREATE POLICY file_overrides_select ON files.overrides
  FOR SELECT TO PUBLIC
  USING ((SELECT is_platform_admin())
         OR ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS file_page_annotations_select ON files.page_annotations;
CREATE POLICY file_page_annotations_select ON files.page_annotations
  FOR SELECT TO PUBLIC
  USING ((SELECT is_platform_admin())
         OR ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())));

DO $$
DECLARE v_left int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='files'
                AND tablename IN ('analysis','entities','overrides','page_annotations')
                AND qual ILIKE '%is_resource_owner%') THEN
    RAISE EXCEPTION 'a per-row is_resource_owner() call survives on a files.* SELECT policy';
  END IF;

  -- Only the two POLYMORPHIC iam.permissions policies may remain anywhere.
  SELECT count(*) INTO v_left FROM pg_policies WHERE qual ILIKE '%is_resource_owner%';
  IF v_left <> 2 THEN
    RAISE EXCEPTION
      'expected exactly 2 remaining per-row is_resource_owner policies (the polymorphic iam.permissions pair), found %',
      v_left;
  END IF;
END $$;

COMMIT;
