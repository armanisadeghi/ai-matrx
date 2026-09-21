-- target: branch
-- chair-step: it DROPS four trigger functions and 347 BEFORE-INSERT attachments FROM THE
--   REHEARSAL BRANCH ONLY. Non-additive by construction: the point is that the rehearsal
--   copy stops filling a column the main database leaves empty. It touches no row of data
--   and it can never reach the main database — the file is headed `-- target: branch`, which
--   both runners refuse to apply anywhere else, and the objects it drops do not exist there.
--
-- DATA-CREATE-FIX — THE REHEARSAL COPY STOPS FILLING A COLUMN NOTHING FILLS.
--
-- WHY. On 2026-09-20 creating a Data Table failed on the main database for everyone with
-- `null value in column "organization_id" of relation "udt_datasets"`, and a lane
-- rehearsing that same create path against this branch would have watched it SUCCEED —
-- because the branch still carries `public._stamp_org_default`, which quietly filled the
-- column. aidream's `0929_no_trigger_stamps_a_personal_organization.sql` dropped that
-- function and its 328 attachments from the main database on 2026-09-19 (Arman's ruling:
-- "a row written without an organization is a CALLER bug that must fail loudly"). The
-- branch is a schema-only transplant taken before that and kept the old behaviour.
--
-- A rehearsal copy that fills a column production leaves empty does not rehearse anything:
-- it manufactures a green, which is the exact failure `check:branch-schema-drift` was
-- written for, only in the direction that check did not look. The fourth clause added to
-- that gate in this lane fails on precisely this shape — a BEFORE-INSERT trigger the
-- BRANCH carries, on a table BOTH databases hold, in a schema neither the campaign nor
-- Supabase owns — and it is RED on today's branch with 347 findings. This file is what
-- turns it green, and it turns it green by making the copy honest rather than by
-- narrowing the question.
--
-- WHAT GOES, measured live on this branch 2026-09-20 (not read from a baseline):
--   public._stamp_org_default         323 attachments  — absent from the main database
--   platform.stamp_run_org             10 attachments  — absent from the main database
--   ops._stamp_capture_org              2 attachments  — absent from the main database
--   users._stamp_secret_audit_org       1 attachment   — absent from the main database
--   + 11 attachments of functions that DO exist on both, where only the ATTACHMENT is
--     branch-only: eight `_deprecated_write_guard`, two `_stamp_actor_tier`, one
--     `trg_default_org`. Named one by one below, because a sweep that computes its own
--     target list from a live query is a sweep nobody can read before it runs.
--
-- WHAT DOES NOT GO: `platform.inherit_org_from_parent` and every other parent-inheritance
-- trigger. A child row copying its parent's organization is structural identity, not a
-- guess; 0929 left them standing on the main database and so does this.
--
-- NO ROW IS TOUCHED. Every table carrying a dropped attachment already has
-- `organization_id` NOT NULL — the same precondition 0929 asserted — so the refusal this
-- exposes was already installed and no value stored on this branch changes.
--
-- THE INVERSE is `…_stops_filling_a_column_nothing_fills.inverse.sql`, which puts the four
-- functions and their attachments back on the branch and returns it to lying.

-- ── 1. Pre-state, asserted ──────────────────────────────────────────────────
DO $$
DECLARE v_attachments int;
BEGIN
  SELECT count(*) INTO v_attachments
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgname IN ('_stamp_org_default', 'stamp_run_org', '_120_stamp_capture_org',
                      '_0_stamp_secret_audit_org', '_deprecated_write_guard',
                      '_stamp_actor_tier', 'trg_default_org');
  IF v_attachments = 0 THEN
    RAISE EXCEPTION 'ABORT: nothing to level — this branch carries none of the named attachments.';
  END IF;
  RAISE NOTICE 'DATA-CREATE-FIX: % attachment(s) of the named trigger set are live on this branch before levelling.', v_attachments;
END $$;

-- ── 2. The four functions the main database does not have, and everything hanging on them ──
DROP FUNCTION IF EXISTS public._stamp_org_default() CASCADE;
DROP FUNCTION IF EXISTS platform.stamp_run_org() CASCADE;
DROP FUNCTION IF EXISTS ops._stamp_capture_org() CASCADE;
DROP FUNCTION IF EXISTS users._stamp_secret_audit_org() CASCADE;

-- ── 3. The eleven attachments whose FUNCTION lives on both, one by one ──────
DROP TRIGGER IF EXISTS _deprecated_write_guard ON agent.template;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON content_ir.kind_instance;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON research.rs_template;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON seo.starter_pack;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON seo.starter_pack_item;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON web.offering_template;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON workbench.schema_templates;
DROP TRIGGER IF EXISTS _deprecated_write_guard ON workflow.template;
DROP TRIGGER IF EXISTS _stamp_actor_tier ON iam.content_lane;
DROP TRIGGER IF EXISTS _stamp_actor_tier ON seo.starter_pack;
DROP TRIGGER IF EXISTS trg_default_org ON communication.dm_conversations;

-- ── 4. Falsification ────────────────────────────────────────────────────────
DO $$
DECLARE v_left int; v_fns int; v_inherit int;
BEGIN
  SELECT count(*) INTO v_left
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgname IN ('_stamp_org_default', 'stamp_run_org', '_120_stamp_capture_org',
                      '_0_stamp_secret_audit_org', 'trg_default_org');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT: % org-stamping attachment(s) survived on this branch.', v_left;
  END IF;

  SELECT count(*) INTO v_fns
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE (n.nspname = 'public'   AND p.proname = '_stamp_org_default')
      OR (n.nspname = 'platform' AND p.proname = 'stamp_run_org')
      OR (n.nspname = 'ops'      AND p.proname = '_stamp_capture_org')
      OR (n.nspname = 'users'    AND p.proname = '_stamp_secret_audit_org');
  IF v_fns <> 0 THEN
    RAISE EXCEPTION 'ABORT: % stamper function(s) survived on this branch.', v_fns;
  END IF;

  -- Parent inheritance is untouched: it is identity, not a guess, and the /data route
  -- depends on it for a dataset's fields and rows.
  SELECT count(*) INTO v_inherit FROM pg_trigger WHERE tgname = '_0_inherit_org' AND NOT tgisinternal;
  IF v_inherit = 0 THEN
    RAISE EXCEPTION 'ABORT: parent inheritance was taken away with the stampers.';
  END IF;

  RAISE NOTICE 'DATA-CREATE-FIX: the rehearsal copy no longer fills an organization the main database leaves empty; % parent-inheritance attachment(s) stand.', v_inherit;
END $$;
