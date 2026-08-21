-- DRIFT-AUDIT RESIDUE (2026-08-21, item 2 of 3) — D146 FOLLOW-UP.
-- Take the per-row SECURITY DEFINER call out of `pdf.redaction_mapping`'s
-- SELECT scan path. This is the LAST live instance of the exact shape D146
-- banned by name.
--
-- THE DEFECT CLASS (db-rules §6d). A `SECURITY DEFINER` helper in a policy's
-- `USING` clause is called ONCE PER CANDIDATE ROW — `SET search_path` alone
-- forecloses inlining and hoisting — so every scan becomes N function calls
-- against the `authenticated` role's 8s `statement_timeout`.
--
-- `public.is_resource_owner` is the worst member of the family, and the
-- permanent COMMENT that
-- `migrations/files_pages_and_doc_pages_select_set_wise_d146_followup.sql`
-- attached to it says so in as many words:
--
--   "NEVER call this from an RLS USING clause — it is SECURITY DEFINER (so it
--    runs once per candidate row) AND each call re-resolves the registry and
--    queries information_schema before a dynamic single-row lookup. On a table
--    that already carries its own owner column, compare that column directly,
--    exactly as that table's INSERT/UPDATE/DELETE policies do (D146;
--    files.pages, 2026-08-15)."
--
-- `redaction_mapping_select` was doing precisely that, and this table already
-- carries its own owner column. This migration is the instruction in that
-- COMMENT, executed.
--
-- ============================================================================
-- WHY THE REWRITE IS EXACTLY EQUIVALENT — READ OUT OF THE LIVE OBJECTS
-- ============================================================================
-- Same reduction as `files.pages`, re-derived against THIS table's live rows:
--
--   1. `public.resolve_shareable_resource('redaction_mapping')` SUCCEEDS —
--      `platform.shareable_resource_registry` holds an `is_active` row
--      (schema_name='pdf', table_name='redaction_mapping', id_column='id',
--      owner_column='owner_id'). So `is_resource_owner`'s exception arm — which
--      would make the policy fail SILENT-CLOSED per THE ONE TOKEN invariant
--      (db-rules §6c) — is NOT taken. The token is valid.
--   2. `public.shareable_owner_column('pdf','redaction_mapping','owner_id')`
--      returns 'owner_id': the column exists, so the `created_by` fallback is
--      never reached. This table PREDATES `created_by` and has none.
--   3. The helper then runs `SELECT owner_id FROM pdf.redaction_mapping
--      WHERE id = $1`. `id` is the PRIMARY KEY, so it returns exactly the
--      scanned row's own `owner_id`, and the helper is postgres-owned
--      (BYPASSRLS) so that lookup is not itself RLS-filtered.
--   4. `owner_id` is declared NOT NULL, so `v_owner_id IS NOT NULL` is always
--      true and the helper returns FALSE — never NULL — when `auth.uid()` is
--      NULL (its `v_uid IS NULL` early return).
--
-- Therefore, in all THREE truth values,
--     is_resource_owner('redaction_mapping', id)
--   <=> (SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())
--
-- The `IS NOT NULL` guard is not decoration: without it a NULL `auth.uid()`
-- yields NULL where the helper yielded FALSE. Both reject the row, but only the
-- guard keeps the predicate identical in truth VALUE and not merely in outcome
-- (D146's reasoning, unchanged).
--
-- ROLE STAYS `PUBLIC`, exactly as before. `anon` evaluated the old helper to
-- FALSE through its `v_uid IS NULL` early return and evaluates the new predicate
-- to FALSE through the same guard. Anon is not widened by one row.
--
-- ============================================================================
-- LIVE EQUIVALENCE PROBE (2026-08-21) — NOT VACUOUS
-- ============================================================================
-- Run on the SESSION-mode pooler (port 5432; transaction mode 6543 leaks
-- `SET LOCAL ROLE` across clients and silently corrupts identity-scoped RLS
-- testing), inside ONE transaction that was ROLLED BACK, with `auth.uid()`
-- asserted inside every probe.
--
-- The table is EMPTY live (0 rows), so a probe over real rows would prove
-- nothing. Six synthetic rows were inserted — three owned by each of two real
-- users — and both predicates evaluated per ROW for five identities:
--
--   identity                          old-admitted   disagreements
--   owner A                                3               0
--   owner B                                3               0
--   unrelated user C                       0               0
--   unrelated user D                       0               0
--   anon (no jwt)                          0               0
--   ------------------------------------------------------------
--   TOTAL, 6 rows x 5 identities, strict `IS NOT`:          0
--
-- The proof is not vacuous in either direction: two identities are ADMITTED
-- rows through the old helper and two plus anon are REFUSED, and the rewrite
-- agrees on every one. Rolled back; `select count(*)` afterwards = 0.
--
-- ============================================================================
-- WHAT IS DELIBERATELY NOT TOUCHED
-- ============================================================================
-- * `redaction_mapping_insert` (WITH CHECK `owner_id = auth.uid()`) and
--   `redaction_mapping_update` (USING + WITH CHECK, same expression) are
--   SEMANTICALLY IDENTICAL after this migration as before. They are recreated
--   verbatim, not altered, so this file is a complete and idempotent statement
--   of the live policy set rather than a partial one.
-- * THERE IS DELIBERATELY NO DELETE POLICY, and this migration does not add
--   one. A redaction mapping is the only thing that can reverse a redaction;
--   `revoked_at` / `expires_at` are how it is retired. No-DELETE is the design,
--   not an omission — do not "complete the CRUD set" here.
-- * The table's OTHER conformance gaps (no `organization_id`, no `created_by` /
--   `updated_by` / `updated_at` / `version` / `deleted_at`, registered
--   `is_versioned`+`has_soft_delete` with no `deleted_at` column, so
--   `iam.canonical_certify_ok` is FALSE) are REAL and OUT OF SCOPE here. This
--   migration is narrowing-only on the D146 shape; it is not a canonicalization
--   of the table, and it must not be read as one.
--
-- Idempotent: DROP POLICY IF EXISTS / CREATE POLICY.

BEGIN;

-- THE FIX. Owner-arm form, identical to what this table's own INSERT/UPDATE
-- policies already assert, and to `files.pages`' `file_pages_select`.
DROP POLICY IF EXISTS redaction_mapping_select ON pdf.redaction_mapping;
CREATE POLICY redaction_mapping_select ON pdf.redaction_mapping
  FOR SELECT TO PUBLIC
  USING ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid()));

-- Recreated unchanged, so this file states the whole live policy set.
DROP POLICY IF EXISTS redaction_mapping_insert ON pdf.redaction_mapping;
CREATE POLICY redaction_mapping_insert ON pdf.redaction_mapping
  FOR INSERT TO PUBLIC
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS redaction_mapping_update ON pdf.redaction_mapping;
CREATE POLICY redaction_mapping_update ON pdf.redaction_mapping
  FOR UPDATE TO PUBLIC
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- No DELETE policy is created. See "WHAT IS DELIBERATELY NOT TOUCHED" above.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'pdf' AND tablename = 'redaction_mapping'
                AND qual ILIKE '%is_resource_owner%') THEN
    RAISE EXCEPTION 'a per-row is_resource_owner() call survives in a redaction_mapping USING clause';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'pdf' AND tablename = 'redaction_mapping'
                AND cmd = 'DELETE') THEN
    RAISE EXCEPTION 'a DELETE policy appeared on redaction_mapping — it is deliberately absent';
  END IF;
END $$;

COMMIT;
