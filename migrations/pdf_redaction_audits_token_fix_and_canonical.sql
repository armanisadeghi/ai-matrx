-- 🚨 A MANDATORY COMPLIANCE TABLE THAT NOBODY COULD READ — and the canonical
-- heal that goes with fixing it.
--
-- ============================================================================
-- THE BUG: THE ONE TOKEN INVARIANT, VIOLATED BY A PLURAL
-- ============================================================================
-- `pdf_redaction_audits_select` read:
--
--     USING (is_resource_owner('pdf_redaction_audits'::text, id))
--
-- The registered token is `pdf_redaction_audit` — SINGULAR. `pdf_redaction_audits`
-- is the TABLE NAME, and db-rules §6c is explicit that registry `table_name` is
-- routing only, NEVER the grant token. Proven live 2026-08-21:
--
--   resolve_shareable_resource('pdf_redaction_audits')
--     -> RAISES: "Unknown shareable resource token: pdf_redaction_audits.
--                 Pass platform.entity_types.token; bare table names are not
--                 accepted."
--   resolve_shareable_resource('pdf_redaction_audit')
--     -> ('pdf_redaction_audit','pdf','pdf_redaction_audits','id','user_id',…)
--
-- `is_resource_owner` wraps that resolve in `EXCEPTION WHEN OTHERS THEN RETURN
-- false`. So the policy did not error — it returned FALSE for every row, every
-- user, forever. **The table was unreadable by every authenticated user,
-- including the person whose own redaction it records.**
--
-- MEASURED END TO END, in a rolled-back transaction, before writing this file:
--     inserted one audit row owned by a real user (user_id AND created_by set)
--     BEFORE — that owner reads their own audit row ....... 0 rows
--     AFTER  — that owner reads their own audit row ....... 1 row
--
-- This is the THIRD instance of exactly this plural/singular class; db-rules
-- §6c already records `fork_shared_quiz` checking `'quiz_sessions'` and
-- `agent.message_template` checking `'content_template'`. All three fail
-- SILENT-CLOSED — no error anywhere, every grant ignored. It is also why a
-- bespoke policy is a defect (§6d): `iam.apply_rls` only ever emits the
-- REGISTERED token, so a generated policy cannot have this bug. The fix is
-- therefore not "correct the string" — it is to stop hand-writing the policy.
--
-- Why nobody noticed: the table is EMPTY (0 rows). But it is not decorative —
-- `_insert_redaction_audit` (aidream `api/routers/pdf_processing.py`) calls it
-- "the mandatory compliance row" and RAISES on failure, because "a redaction
-- without its audit row is a compliance gap, not a soft warning (the redaction
-- itself is reproducible; the trail is not)." The trail was being written to a
-- table its own users could not query.
--
-- ============================================================================
-- 🚨 WHY THE TOKEN FIX ALONE WOULD HAVE LEFT IT BROKEN IN A NEW WAY
-- ============================================================================
-- The canonical `entity` SELECT policy leads with `created_by = auth.uid()`.
-- But the writer sets **`user_id`, never `created_by`**, and this is a
-- SERVICE-ROLE (Python) insert — so `platform._stamp_actor` cannot fill
-- `created_by` either, exactly as db-rules §2 warns ("Service-role (Python)
-- inserts must set `created_by` explicitly — `_stamp_actor` can't fill it
-- without `auth.uid()`/`app.user_id`").
--
-- Running `apply_rls` and stopping there would have produced rows with a NULL
-- `created_by`, an owner arm that never matches, and a table STILL unreadable —
-- the same defect wearing a canonical costume. So the writer moves in the same
-- commit (§8a): `_insert_redaction_audit` now passes `created_by=user_id`, and
-- the redundant `user_id` column is retired.
--
-- `user_id` is on the kill list (§2: `created_by` is the canonical owner) and
-- held the `legacy_owner_col` WARN that blocked certification. On an ENTITY the
-- creator IS the owner, so `user_id` and `created_by` were the same person by
-- construction — this is a de-duplication, not a semantic change. Backfilled
-- (`created_by := user_id` where null) before the drop; the table has 0 rows so
-- the backfill is a formality that is written anyway so the file is correct if
-- ever replayed against data.
--
-- ============================================================================
-- THE REST OF THE HEAL — and the visibility justification (§6a-1)
-- ============================================================================
-- The same hand-rolled CREATE TABLE left seven other gaps: `updated_at`,
-- `version`, `deleted_at`, `visibility`, and the three base FKs. All added
-- additively; the trigger trio is completed with `_touch_row` (`_stamp_actor`
-- and `_stamp_org_default` were already attached).
--
-- **`visibility` defaults `internal`, and that is a deliberate choice, not a
-- reflex.** It is NOT `personal`: this is not a user's private artifact, it is
-- the ORGANISATION's compliance record of who redacted what and why — an org
-- admin auditing a data-handling incident must be able to read it, and
-- `personal` would be the over-tightening db-rules §6 calls a defect in its own
-- right. It is NOT `public` either: `public` would expose every redaction event
-- to `anon` through the `pub_read` policy that appears the moment a visibility
-- column exists. `internal` — "the organization's work product" — is exactly
-- what an audit trail is. Registry `default_visibility` set to match, and
-- `has_soft_delete` set true now that `deleted_at` exists.
--
-- The shareable registry's `owner_column` moves `user_id` -> `created_by` in
-- the same statement, so the registration keeps pointing at a column that
-- exists.
--
-- ============================================================================
-- DRY RUN (session-mode pooler, rolled back) — certify TRUE, zero findings,
-- and an end-to-end proof: a row written the way the CORRECTED writer writes it
-- (created_by set, no user_id) is READ BACK by that owner under real RLS.
-- ============================================================================
--
-- Idempotent: IF EXISTS / IF NOT EXISTS guards throughout.

BEGIN;

-- 1. Preserve the owner, then retire the duplicate kill-list column.
UPDATE pdf.pdf_redaction_audits SET created_by = user_id WHERE created_by IS NULL;

-- Both bespoke policies go: one is the bug, the other depends on user_id.
DROP POLICY IF EXISTS pdf_redaction_audits_select ON pdf.pdf_redaction_audits;
DROP POLICY IF EXISTS pdf_redaction_audits_insert ON pdf.pdf_redaction_audits;

ALTER TABLE pdf.pdf_redaction_audits DROP COLUMN IF EXISTS user_id;

-- 2. Complete the base entity shape.
ALTER TABLE pdf.pdf_redaction_audits ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE pdf.pdf_redaction_audits ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE pdf.pdf_redaction_audits ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE pdf.pdf_redaction_audits ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'internal';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pdf.pdf_redaction_audits'::regclass
                  AND conname='pdf_redaction_audits_organization_id_fkey') THEN
    ALTER TABLE pdf.pdf_redaction_audits ADD CONSTRAINT pdf_redaction_audits_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pdf.pdf_redaction_audits'::regclass
                  AND conname='pdf_redaction_audits_created_by_fkey') THEN
    ALTER TABLE pdf.pdf_redaction_audits ADD CONSTRAINT pdf_redaction_audits_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pdf.pdf_redaction_audits'::regclass
                  AND conname='pdf_redaction_audits_updated_by_fkey') THEN
    ALTER TABLE pdf.pdf_redaction_audits ADD CONSTRAINT pdf_redaction_audits_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS _touch_row ON pdf.pdf_redaction_audits;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON pdf.pdf_redaction_audits
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- 3. Registry tells the truth about the shape.
UPDATE platform.entity_types
   SET has_soft_delete = true, default_visibility = 'internal'
 WHERE token = 'pdf_redaction_audit';

UPDATE platform.shareable_resource_registry
   SET owner_column = 'created_by'
 WHERE resource_type = 'pdf_redaction_audit';

-- 4. Generated policies — which cannot carry the wrong token.
SELECT iam.apply_rls('pdf','pdf_redaction_audits','pdf_redaction_audit','entity');

-- 5. Certify, or nothing lands.
DO $$
DECLARE v_findings text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='pdf' AND tablename='pdf_redaction_audits'
                AND (qual ILIKE '%pdf_redaction_audits''%' OR with_check ILIKE '%pdf_redaction_audits''%')) THEN
    RAISE EXCEPTION 'a policy still passes the TABLE NAME where the token belongs (§6c ONE TOKEN)';
  END IF;

  SELECT string_agg(status || ' ' || detail, '; ') INTO v_findings
    FROM iam.canonical_certify('pdf','pdf_redaction_audits','pdf_redaction_audit');
  IF v_findings IS NOT NULL THEN
    RAISE EXCEPTION 'pdf.pdf_redaction_audits does not certify: %', v_findings;
  END IF;
END $$;

COMMIT;
