-- platform_versioned_without_capture_final_nine.sql
--
-- Closes out the "versioned-without-capture" backlog opened by the 2026-08-21
-- sweep (platform_versioned_without_capture_adjudication.sql), which took the
-- count 47 -> 9 and deferred the final 9 to Arman with a documented blocker
-- each. This migration resolves the 3 of those 9 that are decidable WITHIN the
-- "triggers and registry flags only" scope, and records why the other 6 are not.
--
-- Detection is by pg_trigger.tgfoid -> platform._version_capture, NEVER by
-- trigger name (FOUND_DEFECTS.md D182).
--
-- Decision rule (db-rules FEATURE.md §7 + changeover doctrine §8d):
--   is_versioned=true with no capture trigger is a DECISION.
--     revisable content            -> attach platform._version_capture(token)
--     append-only / not capturable -> is_versioned=false on the registry row
--     certified CUSTOM store (§7)  -> version_store='custom' + version_store_ref,
--                                     and NEVER also _version_capture.
--
-- NO triggers are attached here: all three flips are cases where canonical
-- capture is mechanically IMPOSSIBLE or would be duplicate versioning. The
-- current-month partition (history.row_versions_2026_08) was nonetheless
-- verified present before running, per §7.
--
-- NO BACKFILL. No schema changes: registry flags only.

BEGIN;

-- ---------------------------------------------------------------------------
-- PART A -- is_versioned = false (3 tokens)
--
-- Each of these has is_versioned=true today, which is a FALSE CLAIM: the
-- canonical store cannot serve the table, or another live system already does.
-- ---------------------------------------------------------------------------

-- 1. wbx_guidance -- extend.wbx_guidance
--    `id` is TEXT (domain-scoped keys), and platform._version_capture hard-casts
--    (row_data->>'id')::uuid. Attaching would raise 22P02 on EVERY insert and
--    update, breaking the Chrome extension's only write path. Verified live:
--    id_type = text. §7 prerequisite 1 fails; it cannot be attached, ever, at
--    this key type. Not a canonical row-versionable entity.
--
-- 2. studio_session_settings -- transcripts.studio_session_settings
--    NO `id` column at all (PK is session_id). _version_capture would write
--    every snapshot with row_id NULL, unreachable by version_list(token, id) --
--    a timeline that looks present and answers nothing. §7 prerequisite 1 fails.
--    Content IS occasionally revised (live: 74 rows at version 1, one at 2, one
--    at 3), but it is per-session settings and is not independently addressable.
--    If this history is wanted later, it belongs to the SESSION entity, not to
--    this table -- a design change, not a flag flip.
--
-- 3. udt_dataset_rows -- workbench.udt_dataset_rows
--    Has a LIVE bespoke version store: three triggers (insert/update/delete)
--    run public.udt_log_row_version into workbench.udt_dataset_row_versions
--    (1049 rows live: 560 insert / 231 update / 258 delete), trimmed weekly by
--    the pg_cron job udt_dataset_row_versions_trim_weekly.
--    Evaluated against the §7 CUSTOM VERSION STORE CONTRACT -- it fails 2 of 4:
--      [ok]   the store is a real table (relkind='r')
--      [ok]   an automatic capture trigger on the entity's own table writes it
--      [FAIL] it is NOT a registered entity in platform.entity_types, so it has
--             no composition edge to this token
--      [FAIL] it carries NO UNIQUE(parent_fk, <version column>) -- it has no
--             version column at all; the PK is a surrogate bigint and the only
--             other indexes are (row_id, changed_at) / (table_id, changed_at)
--    It therefore CANNOT be certified as version_store='custom'. §7 is explicit
--    that the gate's requirements ARE the bar and widening them is an Arman
--    decision. Attaching _version_capture instead is a hard "duplicate
--    versioning" FAIL on a 4,119-row table already carrying 7 triggers.
--    So: the explicit is_versioned decision the brief calls for -- false. This
--    leaves exactly ONE version system running on the entity (the bespoke one),
--    which is the point of §7; nothing is left half-on.
--    Follow-up (Arman, not urgent): promote the bespoke store to a certified
--    custom store, or retire it onto history.row_versions per the §7 two-animals
--    FK litmus. Either is real work; neither is a flag flip.

UPDATE platform.entity_types
   SET is_versioned = false
 WHERE token IN ('wbx_guidance', 'studio_session_settings', 'udt_dataset_rows')
   AND is_versioned IS DISTINCT FROM false;

-- ---------------------------------------------------------------------------
-- PART B -- STILL DEFERRED to Arman (6 tokens, deliberately untouched)
--
-- These stay a visible trg_version_capture FAIL. That is the correct state:
-- each needs a decision or a piece of work that is out of this migration's
-- scope, and inventing an answer would be worse than the FAIL.
--
--  1. agent_card -- agent.card
--       agent.card is a security VIEW over agent.definition, so it can never
--       carry a capture trigger, AND agent definitions are already versioned by
--       the certified custom store agent.definition_version. is_versioned=true
--       + version_store='history' here is duplicate versioning aimed at a
--       non-table. The obvious repair is is_versioned=false -- and it is
--       MECHANICALLY BLOCKED. Probed live, in a rolled-back transaction:
--         UPDATE ... SET is_versioned=false
--           -> ERROR check_violation, from BEFORE INSERT OR UPDATE trigger
--              platform._enforce_entity_is_table: 'agent_card (agent.card) is
--              relkind "v" -- only base/partitioned tables may be registered as
--              active entities.'
--         UPDATE ... SET is_versioned=false, is_active=false  -> succeeds.
--       The guard returns early only when NOT NEW.is_active, so the row cannot
--       be corrected without ALSO deregistering it. Deregistering is not an
--       agent's call: agent_card is a LIVE sharing surface -- 2 rows in
--       iam.permissions, 1 row in platform.shareable_resource_registry, and the
--       view's own WHERE clause calls has_permission('agent_card', id, 'viewer').
--       DECISION NEEDED: should platform.entity_types permit a view-backed token
--       that exists purely as a permission surface (e.g. exempt the guard when
--       only is_versioned/is_active-neutral columns change), or should the
--       sharing surface move to the underlying agent.definition token first?
--       (Its has_soft_delete misregistration is separately recorded in db-rules
--       as deliberately unfixed and is NOT touched here.)
--
--  2. file_entities          files.entities
--  3. file_overrides         files.overrides
--  4. file_page_annotations  files.page_annotations
--  5. seo_gsc_dig_rule       seo.gsc_dig_rule
--  6. seo_keyword_class_rule seo.keyword_class_rule
--       These five ARE revisable content -- confirmed, and the confirmation had
--       to come from consumers, not from traffic:
--         - files.overrides is the "human edits win" store; aidream
--           services/file_pages/service.py:168 upserts a user-corrected page
--           text over auto-extracted text, and file_analysis.py applies
--           overrides of kind 'page_text' on read.
--         - files.page_annotations carries last_edited_by and is_user_locked --
--           columns that exist only because a human revises the row.
--         - both seo rule tables are user-authored classification rules.
--       Traffic is NOT yet evidence of revision (pg_stat since 2026-05-22:
--       n_tup_upd = 0 on all five; files.entities and files.overrides hold 0
--       rows). These are young or lightly used features, not immutable ones --
--       so is_versioned=false would be the WRONG call.
--       They are blocked on §7 PREREQUISITE 2: none has a `version` column
--       (all five are live base_version FAILs, verified via
--       iam.verify_canonical). platform._touch_row is jsonb-guarded and
--       silently skips the bump when the column is absent, so capture would
--       record every snapshot as version 1 and version_snapshot/version_diff
--       would be ambiguous -- a timeline that looks present and answers
--       nothing. The files.* three additionally have no _touch_row at all
--       (they run bespoke tg_file_pages_touch / tg_file_page_annotations_touch).
--       §8d ordering is explicit: base-contract column FIRST, then the trigger.
--       RECOMMENDED NEXT STEP: a base-contract retrofit for these five, then
--       attach. Held back here because column DDL is out of the "triggers and
--       registry flags only" scope of this migration -- and because all five
--       also fail base_organization_id / base_updated_by / base_created_by,
--       so the retrofit is a proper canonicalization pass, not a one-column
--       patch bolted onto a flag sweep.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- PART C -- verify in-transaction; roll back the whole thing on any deviation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_false int;
  n_left  int;
BEGIN
  SELECT count(*) INTO n_false
  FROM platform.entity_types
  WHERE is_versioned = false
    AND token IN ('wbx_guidance', 'studio_session_settings', 'udt_dataset_rows');
  IF n_false <> 3 THEN
    RAISE EXCEPTION 'PART A: expected 3 tokens set false, found %', n_false;
  END IF;

  -- No capture trigger may have been attached to any of the three.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    JOIN pg_trigger tg
      ON tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    WHERE NOT tg.tgisinternal
      AND tg.tgfoid = 'platform._version_capture'::regproc
      AND et.token IN ('wbx_guidance', 'studio_session_settings', 'udt_dataset_rows')
  ) THEN
    RAISE EXCEPTION 'a capture trigger was attached to a token flagged is_versioned=false';
  END IF;

  -- The sanctioned multi-trigger shape still holds everywhere (exactly two
  -- capture triggers max, exactly one of them conditional). Gate on tgqual, not
  -- on a bare count, or the workflow.trigger split reads as a duplicate.
  IF EXISTS (
    SELECT 1 FROM pg_trigger tg
    WHERE NOT tg.tgisinternal
      AND tg.tgfoid = 'platform._version_capture'::regproc
    GROUP BY tg.tgrelid
    HAVING count(*) > 2
        OR (count(*) = 2 AND count(*) FILTER (WHERE tg.tgqual IS NOT NULL) <> 1)
  ) THEN
    RAISE EXCEPTION 'redundant _version_capture triggers on some table';
  END IF;

  -- The custom-store contract must still hold: no capture trigger on a
  -- non-'history' token.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    JOIN pg_trigger tg
      ON tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    WHERE NOT tg.tgisinternal
      AND tg.tgfoid = 'platform._version_capture'::regproc
      AND et.version_store IS DISTINCT FROM 'history'
  ) THEN
    RAISE EXCEPTION 'duplicate versioning: _version_capture attached to a custom-store token';
  END IF;

  -- Remaining backlog must be exactly the 6 deliberately deferred tokens.
  SELECT count(*) INTO n_left
  FROM platform.entity_types et
  WHERE et.is_versioned
    AND coalesce(et.is_active, true)
    AND et.version_store = 'history'
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE NOT tg.tgisinternal
        AND tg.tgfoid = 'platform._version_capture'::regproc
        AND tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    );
  IF n_left <> 6 THEN
    RAISE EXCEPTION 'expected 6 deferred tokens remaining, found %', n_left;
  END IF;

  RAISE NOTICE 'OK: 3 flagged false, 6 escalated to Arman';
END $$;

COMMIT;
