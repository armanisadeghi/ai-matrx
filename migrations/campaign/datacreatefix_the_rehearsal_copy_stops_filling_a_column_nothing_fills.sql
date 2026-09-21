-- target: branch
-- chair-step: it DROPS ten BEFORE-INSERT trigger attachments in schema `workbench` FROM
--   THE REHEARSAL BRANCH ONLY. Non-additive by construction: the point is that the
--   rehearsal copy stops filling a column the main database leaves empty. It touches no
--   row of data, drops no function, and can never reach the main database — the file is
--   headed `-- target: branch`, which both runners refuse to apply anywhere else, and the
--   attachments it names do not exist there.
--
-- DATA-CREATE-FIX — THE REHEARSAL COPY STOPS FILLING A COLUMN NOTHING FILLS.
--
-- WHY. On 2026-09-20 creating a Data Table failed on the main database for everyone with
-- `null value in column "organization_id" of relation "udt_datasets"`, and a lane
-- rehearsing that same create path against this branch would have watched it SUCCEED —
-- because the branch still carries `_stamp_org_default` on `workbench.udt_datasets`,
-- which quietly filled the column. aidream's
-- `0929_no_trigger_stamps_a_personal_organization.sql` dropped `public._stamp_org_default`
-- and its 328 attachments from the main database on 2026-09-19 (Arman's ruling: "a row
-- written without an organization is a CALLER bug that must fail loudly"). The branch is a
-- schema-only transplant taken before that and kept the old behaviour.
--
-- A rehearsal copy that fills a column the main database leaves empty does not rehearse
-- anything: it manufactures a green, which is the exact failure `check:branch-schema-drift`
-- exists for, only in the direction that check did not look. The FOURTH clause this lane
-- added to that gate fails on precisely this shape — a BEFORE-INSERT trigger the BRANCH
-- carries, on a table BOTH databases hold, in a schema a live route depends on. `workbench`
-- is that schema here: it is what `/data`, Notes and Working Documents are made of.
--
-- WHAT GOES, measured live on this branch 2026-09-20 against the main database, not read
-- from a baseline — the complete `workbench` half of that clause's 347 findings:
--   _stamp_org_default    on udt_datasets · udt_dataset_fields · udt_dataset_rows ·
--                            udt_dataset_templates · udt_workbooks   (the /data route)
--   _stamp_org_default    on notes · note_folders · working_documents · heatmap_saves
--   _deprecated_write_guard on schema_templates
-- The other 337 findings live in schemas no live route of this campaign's rehearses
-- against; the gate PRINTS them as informational and the levelling lane owns them. Saying
-- so is the honest shape: a guard that fails on work you are not doing gets switched off.
--
-- WHAT DOES NOT GO: `platform.inherit_org_from_parent` and every `_0_inherit_org`
-- attachment. A child row copying its parent's organization is structural identity, not a
-- guess; 0929 left them standing on the main database and so does this. The /data route
-- depends on them for a dataset's fields and rows, and after this file they are the ONLY
-- thing filling an organization on the branch — exactly as on the main database.
-- The functions themselves are untouched: other schemas still attach them here.
--
-- NO ROW IS TOUCHED. Every table named already has `organization_id` NOT NULL — the same
-- precondition 0929 asserted — so the refusal this exposes was already installed and no
-- value stored on this branch changes.
--
-- THE INVERSE is `…_stops_filling_a_column_nothing_fills.inverse.sql`, which re-attaches
-- all ten and returns the copy to lying.

-- ── 1. Pre-state, asserted ──────────────────────────────────────────────────
DO $$
DECLARE v_attachments int;
BEGIN
  SELECT count(*) INTO v_attachments
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'workbench'
     AND t.tgname IN ('_stamp_org_default', '_deprecated_write_guard');
  IF v_attachments = 0 THEN
    RAISE EXCEPTION 'ABORT: nothing to level — this branch carries none of the named workbench attachments.';
  END IF;
  RAISE NOTICE 'DATA-CREATE-FIX: % workbench attachment(s) of the named set are live on this branch before levelling.', v_attachments;
END $$;

-- ── 2. The ten attachments, one by one ──────────────────────────────────────
-- Named individually rather than swept from a live query, because a sweep that
-- computes its own target list is a sweep nobody can read before it runs.
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.udt_datasets;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.udt_dataset_fields;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.udt_dataset_rows;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.udt_dataset_templates;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.udt_workbooks;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.notes;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.note_folders;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.working_documents;
DROP TRIGGER IF EXISTS _stamp_org_default ON workbench.heatmap_saves;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON workbench.schema_templates;

-- ── 3. Falsification ────────────────────────────────────────────────────────
DO $$
DECLARE v_left int; v_inherit int;
BEGIN
  SELECT count(*) INTO v_left
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'workbench'
     AND t.tgname IN ('_stamp_org_default', '_deprecated_write_guard');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT: % workbench stamping attachment(s) survived on this branch.', v_left;
  END IF;

  SELECT count(*) INTO v_inherit
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname = 'workbench' AND t.tgname = '_0_inherit_org';
  IF v_inherit = 0 THEN
    RAISE EXCEPTION 'ABORT: parent inheritance in workbench was taken away with the stampers.';
  END IF;

  RAISE NOTICE 'DATA-CREATE-FIX: the rehearsal copy no longer fills a workbench organization the main database leaves empty; % parent-inheritance attachment(s) stand.', v_inherit;
END $$;
