-- pdf.redaction_mapping becomes a REAL component — Arman's ruling, 2026-08-21.
--
-- THE CONTRADICTION THIS RESOLVES. The table was registered
-- `rls_variant='component'` of `file` (composition row: `redaction_mapping ->
-- file` via `file_id`) while its actual policies were hand-written and
-- owner-only (`owner_id = auth.uid()`). Registration said "whoever can see the
-- file can see this"; the policies said "only the creator". It failed
-- `iam.canonical_certify` on five checks and had done since it was built.
--
-- ARMAN'S RULING (2026-08-21, verbatim): *"Your recommendation is dead on, and
-- it's definitely a component. So the fact that anyone put it any other way is
-- just inaccurate."* The registration was right and the policies were the lie.
--
-- WHY OPENING THIS TABLE DOES NOT LEAK REDACTED TEXT — the fact that made the
-- ruling easy, read out of the code rather than assumed
-- (`matrx_files/specific_handlers/pdf/redact/mapping_store.py`):
--
--   "The reversible-redaction subsystem generates a FRESH AES-256-GCM key per
--    mask operation. The key is RETURNED ONCE to the caller and never
--    persisted. The store sees only the per-row ciphertext + nonce — even a
--    full DB compromise yields zero originals without the caller's key."
--
-- So `ciphertext`/`nonce` are inert to any reader without the key, and the key
-- lane is a SEPARATE table — `pdf.pdf_redaction_key_escrow` — which keeps its
-- own owner-only policies (`owner_id = auth.uid()`) and is NOT touched here.
-- THAT is the real confidentiality boundary, and it is unchanged. What a
-- file-sharee can now see is the redaction's SHAPE: substitute tokens,
-- locations, and which pattern matched — "an SSN was here", never the SSN.
-- That is the document they were already given, described.
--
-- Table is EMPTY (0 rows) and there is exactly ONE active `file` grant on the
-- whole platform, so this changes nothing for anyone today. It is the cheapest
-- moment this decision will ever have.
--
-- ============================================================================
-- 1. owner_id -> redacted_by  (RENAMED, deliberately not dropped)
-- ============================================================================
-- §6d-1: a component has NO owner column; `owner_id` is on the kill list and
-- kept the `legacy_owner_col` WARN alive, which alone blocked certification.
-- §6d-1 gives two remedies and names when each applies: *"where a component's
-- actor column carries no domain meaning, DROP it; where 'who acted' is
-- genuinely meaningful, RENAME it to an explicit author column that never
-- appears in a policy."*
--
-- It is genuinely meaningful here, so it is renamed, not dropped. Verified by
-- reading every consumer: the column is WRITTEN (`mapping_store_impl.py:79`)
-- and READ BACK into `MappingRecord` (`:123`) and NOTHING EVER FILTERS ON IT —
-- `fetch_session_records` queries by `session_id`, `persist_records` dedupes on
-- `(file_id, session_id, span_id)`. It is a pure "who ran this redaction"
-- stamp, which is exactly the shape §6d-1 says to rename. After this migration
-- it appears in NO policy: the new `std_*` policies key on `file_id` only.
--
-- The escrow table's own `owner_id` is a DIFFERENT column on a different table
-- with a different job (whose key unwraps this session) and is left alone.
--
-- ============================================================================
-- 2. organization_id — added NOT NULL WITH its backstop, in ONE migration
-- ============================================================================
-- db-rules §2 is explicit that setting `organization_id NOT NULL` and attaching
-- the inheritance trigger are ONE migration, never two: without the backstop,
-- snapshot triggers and service-role writers insert org-less rows and the NOT
-- NULL alone converts them into live 23502 failures. Both happen below, and the
-- NOT NULL is set only AFTER the trigger exists.
--
-- The trigger is the canonical `platform.inherit_org_from_parent('files',
-- 'files','file_id')` — the same form 4+ live component tables use — so a
-- mapping takes the org of the file it redacts. `files.files` has 41,917 rows
-- and ZERO null orgs, so the parent can always answer. No backfill is needed
-- (0 rows), and `file_id` is already NOT NULL with an ON DELETE CASCADE FK.
--
-- PROVEN IN THE DRY RUN, not assumed: an INSERT that set NO organization_id
-- came back stamped with the parent file's exact org.
--
-- ============================================================================
-- 3. The shareable registration is DEACTIVATED
-- ============================================================================
-- A component is not independently shareable — its access IS its parent's — so
-- a `platform.shareable_resource_registry` row for it is a category error, and
-- after the rename its `owner_column='owner_id'` would point at a column that
-- no longer exists. Its only RLS consumer was removed earlier today
-- (`pdf_redaction_mapping_select_owner_arm_d146_followup.sql`), so nothing is
-- left calling `is_resource_owner('redaction_mapping', …)`. Deactivated rather
-- than deleted, per the never-DROP rule. The matching frontend entry in
-- `utils/permissions/registry.ts` is removed in the same commit.
--
-- ============================================================================
-- 🚨 4. A DELETE POLICY NOW EXISTS — I AM REVERSING MY OWN GUARD FROM TODAY
-- ============================================================================
-- Stated plainly because it contradicts a migration applied hours earlier.
-- `pdf_redaction_mapping_select_owner_arm_d146_followup.sql` preserved this
-- table's deliberate absence of a DELETE policy and added an assertion that
-- FAILED if one ever appeared. That reasoning was correct UNDER THE OWNER-ONLY
-- MODEL, which is the model Arman has now overruled.
--
-- Under the component variant the generator owns the whole policy set, and
-- db-rules §6b puts DELETE at `editor` on the PARENT for a component. Hand-
-- preserving an absence inside a generated set is precisely the bespoke-policy
-- defect §6d exists to stop. So `std_delete` is accepted, and the old
-- assertion does not survive.
--
-- Retirement of a single mapping still has its non-destructive path
-- (`revoked_at` / `expires_at`, honoured by `fetch_session_records`), the table
-- now carries `deleted_at`, and deleting the parent file already cascaded these
-- rows away long before this change. Nothing that could be lost is newly at
-- risk.
--
-- ============================================================================
-- DRY RUN FIRST (session-mode pooler, rolled back)
-- ============================================================================
-- The entire migration was executed and rolled back before this file was
-- written: `iam.canonical_certify_ok` came back TRUE with ZERO findings, the
-- five generated policies came out deferring to `file`, and the org backstop
-- was proven by a real org-less INSERT inheriting the parent file's org.
--
-- Idempotent: guarded rename + IF NOT EXISTS + DROP POLICY IF EXISTS.

BEGIN;

-- 1. Rename the kill-list owner column to an explicit, policy-free author column.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='pdf' AND table_name='redaction_mapping'
                AND column_name='owner_id') THEN
    ALTER TABLE pdf.redaction_mapping RENAME COLUMN owner_id TO redacted_by;
  END IF;
END $$;

COMMENT ON COLUMN pdf.redaction_mapping.redacted_by IS
  'Who ran this redaction. A domain author stamp ONLY — it is NEVER wired into RLS (db-rules §6d-1: a component has no owner column; its access is its parent file''s). Do not reintroduce it into a policy.';

-- 2. organization_id + its backstop, together, NOT NULL last.
ALTER TABLE pdf.redaction_mapping ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='pdf.redaction_mapping'::regclass
                    AND conname='redaction_mapping_organization_id_fkey') THEN
    ALTER TABLE pdf.redaction_mapping
      ADD CONSTRAINT redaction_mapping_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS _inherit_org ON pdf.redaction_mapping;
CREATE TRIGGER _inherit_org BEFORE INSERT ON pdf.redaction_mapping
  FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('files','files','file_id');

ALTER TABLE pdf.redaction_mapping ALTER COLUMN organization_id SET NOT NULL;

-- 3. Retire the bespoke owner-only policies and the shareable registration.
DROP POLICY IF EXISTS redaction_mapping_select ON pdf.redaction_mapping;
DROP POLICY IF EXISTS redaction_mapping_insert ON pdf.redaction_mapping;
DROP POLICY IF EXISTS redaction_mapping_update ON pdf.redaction_mapping;

UPDATE platform.shareable_resource_registry
   SET is_active = false
 WHERE resource_type = 'redaction_mapping';

-- 4. Generate the canonical component policy set + variant grants.
SELECT iam.apply_rls('pdf','redaction_mapping','redaction_mapping','component');

-- 5. Certify, or nothing lands.
DO $$
DECLARE v_findings text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='pdf' AND table_name='redaction_mapping'
                AND column_name='owner_id') THEN
    RAISE EXCEPTION 'owner_id survived the rename on pdf.redaction_mapping';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='pdf' AND tablename='redaction_mapping'
                AND (qual ILIKE '%redacted_by%' OR with_check ILIKE '%redacted_by%')) THEN
    RAISE EXCEPTION 'redacted_by leaked into an RLS policy — it is an author stamp, never an access key (§6d-1)';
  END IF;

  SELECT string_agg(status || ' ' || detail, '; ') INTO v_findings
    FROM iam.canonical_certify('pdf','redaction_mapping','redaction_mapping');
  IF v_findings IS NOT NULL THEN
    RAISE EXCEPTION 'pdf.redaction_mapping does not certify: %', v_findings;
  END IF;
END $$;

COMMIT;
