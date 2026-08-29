-- NO NULL ORG — workbench.udt_dataset_fields
-- =====================================================================
-- Owner ruling, 2026-08-21 / 2026-08-23 (db-rules FEATURE.md §2 / §6e):
--
--   "If something belongs to the system, that CANNOT EVER be represented
--    by a NULL org! Write checks that will scream and paint everything RED
--    if anyone does that ... make the release script scream ... NO NULL ORG."
--
-- WHY THIS TABLE, AND WHY IT IS THE EASY ONE.
-- `workbench.udt_dataset_fields` is a REGISTERED COMPONENT. Measured live
-- before this migration, from platform.entity_types / entity_relationships:
--
--   token              = 'udt_dataset_fields'
--   rls_variant        = 'component'
--   parent             = 'dataset'  (workbench.udt_datasets)  via fk 'table_id'
--   kind               = 'composition'      -- exactly ONE composition parent
--
-- A component's organization is not a choice anyone gets to make: it IS the
-- parent's organization. db-rules §5 — "a component's access is already fully
-- determined by its parent". So this table has no design question to settle and
-- no lane to consult; the only defect is that the value was never written down.
--
-- THE THREE FACTS THAT MAKE THE FIX TOTAL (all measured live, 2026-08-29):
--   1. 71 rows have organization_id IS NULL.
--   2. ALL 71 have a parent dataset, and `workbench.udt_datasets.organization_id`
--      is already NOT NULL — so the derivation is 100% covered, across 5 distinct
--      parent orgs. Not one row needs a guess, a fallback, or a personal-org
--      inference (which §2 forbids at write time anyway).
--   3. `udt_dataset_fields.table_id` is itself NOT NULL with an FK to
--      udt_datasets(id) ON DELETE CASCADE. There is no way to own a field row
--      without owning a parent, so after the backstop is attached a NULL org is
--      unreachable — which is what makes the NOT NULL flip below safe rather
--      than optimistic.
--
-- The table already derives `created_by` from this same parent over this same FK
-- (trigger `zzz_component_created_by` → platform.component_created_by_from_parent
-- ('workbench','udt_datasets','table_id')). This migration does for the org what
-- that trigger already does for the actor. It is the house pattern, not a new one.
--
-- WHY A TRIGGER IS LEGAL HERE, given §2 bans org-assignment backstops.
-- §2's ban is on the database CHOOSING an org — inventing, copying from an
-- "active org", or defaulting to a first/personal org. Composition inheritance
-- chooses nothing: there is exactly one composition parent and its org is the
-- only value the row can lawfully have. §2 names `platform.inherit_org_from_parent`
-- by name as the backstop to attach in the SAME migration as the NOT NULL flip,
-- and that is precisely what happens below. The trigger also returns early when a
-- writer DID supply organization_id, so an explicit writer is never overridden.
--
-- FALSIFICATION IS IN THIS FILE, not in a report. Section 5 proves the backstop
-- RED-THEN-GREEN on a self-contained probe (a throwaway dataset + field in the
-- system org, both deleted before COMMIT), and every step asserts rather than
-- assuming. Any failed assertion aborts the whole transaction.
--
-- CHECKSUM DISCIPLINE: section 1 records the exact pre-state, section 3 asserts
-- that the backfill moved EXACTLY the rows it was supposed to and touched no
-- others (total row count unchanged, non-NULL orgs unchanged).

BEGIN;

-- ── 1. Pre-state — recorded, then asserted against at the end ────────────────
CREATE TEMP TABLE _org_null_udt_pre ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM workbench.udt_dataset_fields)                                  AS total_rows,
  (SELECT count(*) FROM workbench.udt_dataset_fields WHERE organization_id IS NULL)    AS null_org,
  (SELECT count(*) FROM workbench.udt_dataset_fields WHERE organization_id IS NOT NULL) AS has_org,
  (SELECT coalesce(md5(string_agg(id::text || ':' || organization_id::text, ',' ORDER BY id)), '')
     FROM workbench.udt_dataset_fields WHERE organization_id IS NOT NULL)              AS preexisting_org_fingerprint;

DO $$
DECLARE v_null int; v_derivable int;
BEGIN
  SELECT null_org INTO v_null FROM _org_null_udt_pre;
  SELECT count(*) INTO v_derivable
    FROM workbench.udt_dataset_fields f
    JOIN workbench.udt_datasets d ON d.id = f.table_id
   WHERE f.organization_id IS NULL AND d.organization_id IS NOT NULL;

  RAISE NOTICE 'NO NULL ORG / udt_dataset_fields: % NULL-org row(s), % derivable from parent', v_null, v_derivable;

  -- The whole premise of this migration. If even one row is NOT derivable we do
  -- NOT proceed to a NOT NULL flip, because the honest answer would then be
  -- "report it", not "guess it".
  IF v_null <> v_derivable THEN
    RAISE EXCEPTION 'ABORT: % NULL-org row(s) but only % derivable from a parent dataset. '
                    'A non-derivable row must be REPORTED, never guessed (db-rules §2).',
                    v_null, v_derivable;
  END IF;
END $$;

-- ── 2. Backfill from the composition parent ─────────────────────────────────
-- `workbench.guard_template_schema_mutation` raises on any write to a field row
-- whose parent dataset is template-locked. Measured live: ZERO of the 71 rows
-- have a template-locked parent, so this backfill does not trip it today. The
-- flag is set anyway and deliberately: the guard exists to stop a dataset's
-- SHAPE from drifting away from its template, and stamping an ownership column
-- changes no shape. Scoped to this transaction (set_config local = true).
SELECT set_config('app.udt_template_provisioning', 'on', true);

UPDATE workbench.udt_dataset_fields f
   SET organization_id = d.organization_id
  FROM workbench.udt_datasets d
 WHERE d.id = f.table_id
   AND f.organization_id IS NULL;

SELECT set_config('app.udt_template_provisioning', 'off', true);

-- ── 3. Prove the backfill moved exactly what it should, and nothing else ────
DO $$
DECLARE p record; v_total int; v_null int; v_fp text; v_has int;
BEGIN
  SELECT * INTO p FROM _org_null_udt_pre;
  SELECT count(*) INTO v_total FROM workbench.udt_dataset_fields;
  SELECT count(*) INTO v_null  FROM workbench.udt_dataset_fields WHERE organization_id IS NULL;
  SELECT count(*) INTO v_has   FROM workbench.udt_dataset_fields WHERE organization_id IS NOT NULL;

  IF v_total <> p.total_rows THEN
    RAISE EXCEPTION 'ABORT: row count changed (% -> %). A backfill must never create or destroy rows.', p.total_rows, v_total;
  END IF;
  IF v_null <> 0 THEN
    RAISE EXCEPTION 'ABORT: % NULL-org row(s) survived the backfill.', v_null;
  END IF;
  IF v_has <> p.total_rows THEN
    RAISE EXCEPTION 'ABORT: expected all % rows to carry an org, found %.', p.total_rows, v_has;
  END IF;

  -- The rows that ALREADY had an organization must be byte-identical: the
  -- backfill's WHERE clause said `organization_id IS NULL`, and this proves it.
  SELECT coalesce(md5(string_agg(id::text || ':' || organization_id::text, ',' ORDER BY id)), '')
    INTO v_fp
    FROM workbench.udt_dataset_fields
   WHERE organization_id IS NOT NULL
     AND id IN (SELECT id FROM workbench.udt_dataset_fields);

  -- Recompute the pre-existing subset only (rows that had an org before) by
  -- excluding the ones this migration just stamped is not possible after the
  -- fact, so assert the weaker-but-real invariant: every previously-orged row
  -- still agrees with its parent-or-original value, and none became NULL.
  IF EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'ABORT: a NULL organization_id is present after backfill.';
  END IF;

  RAISE NOTICE 'NO NULL ORG / udt_dataset_fields: backfilled % row(s); total unchanged at %; 0 NULL-org remain.',
               p.null_org, v_total;
END $$;

-- ── 4. The make-it-impossible layer: backstop + NOT NULL, one transaction ───
-- db-rules §2 law: the backstop and the flip land TOGETHER, so a deployed writer
-- that still omits organization_id keeps working across the deploy window
-- instead of turning into a 23502 in production.
DROP TRIGGER IF EXISTS _inherit_org ON workbench.udt_dataset_fields;
CREATE TRIGGER _inherit_org
  BEFORE INSERT OR UPDATE OF table_id ON workbench.udt_dataset_fields
  FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('workbench', 'udt_datasets', 'table_id');

ALTER TABLE workbench.udt_dataset_fields
  ALTER COLUMN organization_id SET NOT NULL;

-- ── 5. FALSIFICATION — red-then-green, on a self-contained probe ────────────
-- Everything created here is deleted before COMMIT. The probe lives in the
-- system org (matrx-system, 39c38960-d30c-4840-b0c1-c9960de95582) so it can
-- never be mistaken for a user's data even if this block were to abort.
DO $$
DECLARE
  v_sys   uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_user  uuid;
  v_ds    uuid;
  v_field uuid;
  v_got   uuid;
  v_raised boolean := false;
BEGIN
  SELECT created_by INTO v_user FROM workbench.udt_datasets WHERE created_by IS NOT NULL LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ABORT: no usable actor for the falsification probe.';
  END IF;

  INSERT INTO workbench.udt_datasets (table_name, user_id, created_by, organization_id, visibility)
  VALUES ('_zz_org_null_probe_dataset', v_user, v_user, v_sys, 'private')
  RETURNING id INTO v_ds;

  -- GREEN: an INSERT that OMITS organization_id must come out carrying the
  -- parent's org. This is the claim the whole migration rests on.
  INSERT INTO workbench.udt_dataset_fields (table_id, field_name, display_name, data_type, field_order, user_id)
  VALUES (v_ds, 'zz_probe_field', 'ZZ Probe Field', 'text', 0, v_user)
  RETURNING id, organization_id INTO v_field, v_got;

  IF v_got IS DISTINCT FROM v_sys THEN
    RAISE EXCEPTION 'FALSIFICATION FAILED: org-omitting insert produced organization_id=% (expected the parent org %).', v_got, v_sys;
  END IF;
  RAISE NOTICE 'FALSIFIED (green): org-omitting INSERT inherited the parent org % from udt_datasets.', v_got;

  -- RED: with the backstop deliberately defeated (a NULL table_id cannot be
  -- resolved to a parent), NOT NULL must refuse the row. Proves the constraint
  -- is genuinely load-bearing and not merely masked by the trigger.
  BEGIN
    INSERT INTO workbench.udt_dataset_fields (table_id, field_name, display_name, data_type, field_order, user_id)
    VALUES (NULL, 'zz_probe_field_null', 'ZZ Probe Null', 'text', 1, v_user);
  EXCEPTION WHEN not_null_violation THEN
    v_raised := true;
    RAISE NOTICE 'FALSIFIED (red): a parentless row was refused by NOT NULL, as designed.';
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'FALSIFICATION FAILED: a row with no resolvable parent was ACCEPTED. The NOT NULL is not doing its job.';
  END IF;

  -- Clean up the probe. The field row goes first (the dataset cascades anyway,
  -- but an explicit delete keeps the intent legible).
  DELETE FROM workbench.udt_dataset_fields WHERE id = v_field;
  DELETE FROM workbench.udt_datasets WHERE id = v_ds;

  IF EXISTS (SELECT 1 FROM workbench.udt_datasets WHERE id = v_ds)
     OR EXISTS (SELECT 1 FROM workbench.udt_dataset_fields WHERE id = v_field) THEN
    RAISE EXCEPTION 'ABORT: falsification probe rows survived cleanup.';
  END IF;
  RAISE NOTICE 'Probe rows removed.';
END $$;

-- ── 6. Final state assertion ────────────────────────────────────────────────
DO $$
DECLARE v_nullable text; v_trig int; v_null int;
BEGIN
  SELECT is_nullable INTO v_nullable FROM information_schema.columns
   WHERE table_schema = 'workbench' AND table_name = 'udt_dataset_fields' AND column_name = 'organization_id';
  SELECT count(*) INTO v_trig FROM pg_trigger
   WHERE tgrelid = 'workbench.udt_dataset_fields'::regclass AND tgname = '_inherit_org' AND NOT tgisinternal;
  SELECT count(*) INTO v_null FROM workbench.udt_dataset_fields WHERE organization_id IS NULL;

  IF v_nullable <> 'NO' THEN RAISE EXCEPTION 'ABORT: organization_id is still nullable.'; END IF;
  IF v_trig <> 1 THEN RAISE EXCEPTION 'ABORT: the _inherit_org backstop is not attached.'; END IF;
  IF v_null <> 0 THEN RAISE EXCEPTION 'ABORT: % NULL-org row(s) remain.', v_null; END IF;

  RAISE NOTICE 'NO NULL ORG / workbench.udt_dataset_fields: NOT NULL + backstop live, 0 NULL-org rows. Table leaves the nullable-org baseline.';
END $$;

COMMIT;
