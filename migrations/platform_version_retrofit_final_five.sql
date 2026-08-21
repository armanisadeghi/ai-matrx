-- platform_version_retrofit_final_five.sql
--
-- Closes the versioned-without-capture backlog to ZERO by doing the thing the
-- doctrine says to do FIRST: the base-contract `version` column, then the
-- trigger (db-rules §7 prerequisite 2 / changeover doctrine §8d ordering).
--
-- Tables (all five confirmed REVISABLE from their consumers, not from traffic):
--   files.entities          file_entities
--   files.overrides         file_overrides          human-edits-win store:
--     aidream services/file_pages/service.py:168 upserts user-corrected page
--     text; file_analysis.py applies 'page_text' overrides on read.
--   files.page_annotations  file_page_annotations   carries last_edited_by and
--     is_user_locked -- columns that exist only because a human revises the row.
--   seo.gsc_dig_rule        seo_gsc_dig_rule        user-authored rules
--   seo.keyword_class_rule  seo_keyword_class_rule  user-authored rules
--
-- n_tup_upd is 0 on all five across three months of stats. That is a YOUNG
-- feature, not an immutable one -- reading traffic as the answer would flip five
-- revisable tables to is_versioned=false and throw away real edit history.
--
-- Preconditions verified live before writing (§7):
--   1. uuid `id` on all five (platform._version_capture hard-casts ::uuid).
--   2. `updated_at` on all five.
--   3. history.row_versions_2026_08 partition exists (through 2028_01).
--
-- WHY THE TOUCH SWAP IS SAFE AND IS A MOVE TOWARD CANONICAL, NOT AWAY.
-- files.* ran bespoke touch functions whose ENTIRE body is
--     NEW.updated_at := now(); RETURN NEW;
-- a strict SUBSET of platform._touch_row, which does the same updated_at write
-- and additionally bumps `version` on UPDATE. Both bespoke triggers were
-- BEFORE UPDATE, so the canonical replacement is attached BEFORE UPDATE too --
-- identical timing, identical updated_at behavior, plus the version bump the
-- canonical contract requires. The bespoke FUNCTIONS are deliberately NOT
-- dropped: public.tg_file_pages_touch is still used by files.pages, which is
-- is_versioned=false and out of scope here. Only the triggers on these three
-- tables are replaced.
--
-- DELIBERATELY OUT OF SCOPE -- these tables have other open base-contract FAILs
-- and this migration does NOT touch them, because each is entangled with a
-- separate open decision and bundling them would be scope creep:
--   - seo.gsc_dig_rule / seo.keyword_class_rule: base_org_not_null. Entangled
--     with Arman's PENDING ruling on the seo NULL-org lane vs §6e (see db-rules
--     change log, 2026-08-21). Not pre-empted here.
--   - files.entities / overrides / page_annotations: missing organization_id
--     (+ updated_by, and created_by on files.entities). That is a real
--     canonicalization pass with backfill and RLS consequences, not a column
--     bolted onto a versioning migration.
-- Neither blocks versioning: capture writes organization_id from the row when
-- present and NULL when not, and the timeline is keyed on (entity_type, row_id).
--
-- NO BACKFILL. Capture is future-only by design; no attempt is made to
-- reconstruct history for rows that already exist.

BEGIN;

-- A deliberate, bounded lock wait (§10). The database's ddl_lock_timeout_guard
-- supplies 8s only when lock_timeout=0; these five tables are tiny but live, and
-- an ordinary concurrent reader is enough to lose an 8s race -- the first apply
-- attempt did exactly that and rolled back cleanly. 15s is still a BOUND, not a
-- disabled guard: if it cannot be taken quickly the migration fails and is
-- retried, it never waits unbounded on a hot table.
SET LOCAL lock_timeout = '15s';

-- ---------------------------------------------------------------------------
-- PART A -- the base-contract column (metadata-only in PG11+, all five tiny)
-- ---------------------------------------------------------------------------
ALTER TABLE files.entities          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE files.overrides         ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE files.page_annotations  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE seo.gsc_dig_rule        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE seo.keyword_class_rule  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- PART B -- canonical _touch_row on the files three (seo two already have it)
--
-- Guards are qualified by tgrelid, never by name alone (§10: a name-only guard
-- matches a same-named trigger on ANY table and silently skips).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS file_entities_touch         ON files.entities;
DROP TRIGGER IF EXISTS file_overrides_touch        ON files.overrides;
DROP TRIGGER IF EXISTS file_page_annotations_touch ON files.page_annotations;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY['files.entities','files.overrides','files.page_annotations']) AS rel
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgrelid = r.rel::regclass AND NOT tgisinternal AND tgname = '_touch_row'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _touch_row BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION platform._touch_row()',
        r.rel);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART C -- attach canonical capture (detected by tgfoid, never by name: D182)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('files.entities',         'file_entities'),
      ('files.overrides',        'file_overrides'),
      ('files.page_annotations', 'file_page_annotations'),
      ('seo.gsc_dig_rule',       'seo_gsc_dig_rule'),
      ('seo.keyword_class_rule', 'seo_keyword_class_rule')
    ) AS v(rel, token)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
       WHERE tgrelid = r.rel::regclass AND NOT tgisinternal
         AND tgfoid = 'platform._version_capture'::regproc
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _version_capture AFTER INSERT OR UPDATE OR DELETE ON %s '
        'FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)',
        r.rel, r.token);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART D -- verify in-transaction; roll back the whole thing on any deviation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  -- version column present and NOT NULL on all five
  SELECT count(*) INTO n
  FROM pg_attribute a
  WHERE a.attrelid IN ('files.entities'::regclass,'files.overrides'::regclass,
                       'files.page_annotations'::regclass,'seo.gsc_dig_rule'::regclass,
                       'seo.keyword_class_rule'::regclass)
    AND a.attname='version' AND a.attnotnull AND a.attnum > 0 AND NOT a.attisdropped;
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 version columns NOT NULL, found %', n; END IF;

  -- canonical _touch_row on all five
  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal AND tgfoid='platform._touch_row'::regproc
     AND tgrelid IN ('files.entities'::regclass,'files.overrides'::regclass,
                     'files.page_annotations'::regclass,'seo.gsc_dig_rule'::regclass,
                     'seo.keyword_class_rule'::regclass);
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 _touch_row triggers, found %', n; END IF;

  -- capture on all five
  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal AND tgfoid='platform._version_capture'::regproc
     AND tgrelid IN ('files.entities'::regclass,'files.overrides'::regclass,
                     'files.page_annotations'::regclass,'seo.gsc_dig_rule'::regclass,
                     'seo.keyword_class_rule'::regclass);
  IF n <> 5 THEN RAISE EXCEPTION 'expected 5 _version_capture triggers, found %', n; END IF;

  -- files.pages must keep its bespoke touch (out of scope, must not be collateral)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='files.pages'::regclass AND NOT tgisinternal
      AND tgfoid='tg_file_pages_touch'::regproc
  ) THEN RAISE EXCEPTION 'files.pages lost its touch trigger'; END IF;

  -- The end-to-end FUNCTIONAL proof (capture fails quietly at READ time, so a
  -- trigger's existence is not evidence) is deliberately NOT run here as a
  -- synthetic insert: these are live business tables with their own NOT NULL and
  -- CHECK constraints, and a migration has no business inventing rows that
  -- satisfy them. It is run instead as a separate ROLLED-BACK transaction --
  -- db-rules §1's house smoke-test pattern -- and its result is recorded in the
  -- §7 change log. Structural verification continues below.

  -- The sanctioned multi-trigger shape still holds everywhere.
  IF EXISTS (
    SELECT 1 FROM pg_trigger tg
    WHERE NOT tg.tgisinternal AND tg.tgfoid='platform._version_capture'::regproc
    GROUP BY tg.tgrelid
    HAVING count(*) > 2
        OR (count(*) = 2 AND count(*) FILTER (WHERE tg.tgqual IS NOT NULL) <> 1)
  ) THEN RAISE EXCEPTION 'redundant _version_capture triggers on some table'; END IF;

  -- No capture trigger on a custom-store token.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    JOIN pg_trigger tg ON tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    WHERE NOT tg.tgisinternal AND tg.tgfoid='platform._version_capture'::regproc
      AND et.version_store IS DISTINCT FROM 'history'
  ) THEN RAISE EXCEPTION 'duplicate versioning: capture on a custom-store token'; END IF;

  -- THE BACKLOG MUST NOW BE ZERO.
  SELECT count(*) INTO n
  FROM platform.entity_types et
  WHERE et.is_versioned AND coalesce(et.is_active, true) AND et.version_store='history'
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
      WHERE NOT tg.tgisinternal AND tg.tgfoid='platform._version_capture'::regproc
        AND tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    );
  IF n <> 0 THEN RAISE EXCEPTION 'versioned-without-capture backlog is %, expected 0', n; END IF;

  RAISE NOTICE 'OK: 5 retrofitted + attached; structure verified; backlog = 0';
END $$;

COMMIT;
