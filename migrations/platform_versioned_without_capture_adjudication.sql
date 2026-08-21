-- platform_versioned_without_capture_adjudication.sql
--
-- Resolves the "versioned-without-capture" backlog from the 2026-08-21 DB
-- drift-audit adjudication: 47 active tokens carried is_versioned=true with
-- version_store='history' and NO trigger running platform._version_capture on
-- their table, so history capture was silently off for all of them.
--
-- Detection was by pg_trigger.tgfoid -> pg_proc, NEVER by trigger name
-- (matrx-frontend/FOUND_DEFECTS.md D182: five tables already run canonical
-- functions under bespoke names; name-matching creates duplicates). Live count
-- of _version_capture trigger names today: _version_capture (72), _history (37),
-- trg_version_capture (13), _900_version_capture (8), plus two one-offs.
--
-- Decision rule applied (database-changeover-doctrine.md §8d preflight):
--   "is_versioned=true with no _history trigger is a DECISION, not a repair.
--    Ask: does a user revise this row's content? If no, the flag is wrong."
-- Worked precedent on `chat`: only `artifact` earned the trigger.
--
-- Evidence used per token: registry label/notes/content_role, full column list,
-- the existing trigger set (by tgfoid), pg_stat_user_tables n_tup_upd, and --
-- decisively -- a live probe of actual revision activity
-- (count(*) where updated_at > created_at + 2s, and max(version)).
--
-- NO BACKFILL. Attaching a trigger captures FUTURE changes only; no attempt is
-- made to reconstruct history. No schema changes: triggers and registry flags only.
--
-- Split: 20 attach / 18 flag-to-false / 9 deferred to Arman (see PART C).
--
-- Defect found while applying: token `agent_card` points at agent.card, which is
-- a security VIEW over agent.definition -- not a table. A view cannot carry a row
-- trigger, and agent definitions are already versioned by the certified custom
-- store agent.definition_version, so is_versioned=true there was duplicate
-- versioning pointed at a non-table. This is also why audit.canonical_findings
-- reported 46 trg_version_capture FAILs while the live registry query finds 47:
-- the audit check only scans relkind='r'. See FOUND_DEFECTS.md D233.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- PART 0 -- preflight guards
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- history.row_versions must have a partition for the current month or the
  -- first captured INSERT fails "no partition of relation found for row".
  IF NOT EXISTS (
    SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'history.row_versions'::regclass
      AND c.relname = 'row_versions_' || to_char(now(), 'YYYY_MM')
  ) THEN
    RAISE EXCEPTION 'ABORT: no history.row_versions partition for %', to_char(now(),'YYYY_MM');
  END IF;

  -- The custom-store contract (db-rules §7): attaching _version_capture next to
  -- a certified custom store is a hard "duplicate versioning" FAIL. Nothing in
  -- PART A may be a custom-store token.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types
    WHERE version_store IS DISTINCT FROM 'history'
      AND token IN ('dataset','dict_setting','heatmap_save',
                    'seo_change_item','seo_change_metric','seo_change_set',
                    'seo_change_theory','seo_source_request','seo_story_angle',
                    'structured_list','studio_documents','udt_dataset_fields',
                    'udt_document','udt_structured_list_items',
                    'ui_surface_agent_pref','ui_surface_config','user_profile','workbook')
  ) THEN
    RAISE EXCEPTION 'ABORT: a PART A token declares a custom version store';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART A -- ATTACH capture (18 tokens)
--
-- Every token here is content a user or agent genuinely revises, has a uuid
-- `id` (platform._version_capture hard-casts (row_data->>'id')::uuid), and has
-- a `version` column so version_list / version_snapshot / version_diff address
-- a real timeline rather than a pile of version-1 rows.
--
-- Trigger name `_version_capture` matches what the canonical generator
-- platform.create_entity_table() emits. Fired AFTER INSERT OR DELETE OR UPDATE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- token,                      schema,        table,                     evidence
      ('dataset',                   'workbench',   'udt_datasets'),         -- 140 rows, 140 revised, maxver 9
      ('dict_setting',              'dictionary',  'dict_settings'),        -- user-scoped tool settings
      ('heatmap_save',              'workbench',   'heatmap_saves'),        -- registry note: "User-saved geographic heatmap config"
      ('seo_change_item',           'seo',         'change_item'),          -- authored expected_before/after + notes
      ('seo_change_metric',         'seo',         'change_metric'),        -- user-set targets
      ('seo_change_set',            'seo',         'change_set'),           -- content_role='source'; authored intervention record
      ('seo_change_theory',         'seo',         'change_theory'),        -- authored hypothesis/mechanism
      ('seo_source_request',        'seo',         'source_request'),       -- draft_response is revised before submit
      ('seo_story_angle',           'seo',         'story_angle'),          -- authored angle, curated priority/action
      ('structured_list',           'workbench',   'udt_structured_lists'), -- note: "list of editable option objects"
      ('studio_documents',          'transcripts', 'studio_documents'),     -- title/content, 67 revised
      ('udt_dataset_fields',        'workbench',   'udt_dataset_fields'),   -- 424 revised, maxver 8
      ('udt_document',              'workbench',   'udt_documents'),        -- maxver 32
      ('udt_structured_list_items', 'workbench',   'udt_structured_list_items'),
      ('ui_surface_agent_pref',     'ui',          'ui_surface_agent_pref'),
      ('ui_surface_config',         'ui',          'ui_surface_config'),
      ('user_profile',              'users',       'profiles'),             -- 78 revised, maxver 16
      ('workbook',                  'workbench',   'udt_workbooks')         -- maxver 30
    ) AS t(token, sch, tbl)
  LOOP
    -- Drop any EXISTING capture trigger on this table found by tgfoid, whatever
    -- it is named, so we can never end up with two capture triggers (D182).
    PERFORM 1;
    EXECUTE (
      SELECT coalesce(string_agg(format('DROP TRIGGER %I ON %I.%I;', tg.tgname, r.sch, r.tbl), ' '), 'SELECT 1;')
      FROM pg_trigger tg
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal
        AND p.proname = '_version_capture'
        AND tg.tgrelid = format('%I.%I', r.sch, r.tbl)::regclass
    );

    EXECUTE format(
      'CREATE TRIGGER _version_capture AFTER INSERT OR DELETE OR UPDATE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)',
      r.sch, r.tbl, r.token
    );
  END LOOP;
END $$;

-- seo.source_request and seo.story_angle carry a `version` column but had NO
-- platform._touch_row trigger, so version never incremented and every captured
-- snapshot would land as version 1 -- an unusable timeline. _touch_row is the
-- canonical trigger and is jsonb-guarded (it only writes updated_at / version
-- when those keys exist), so this is safe. Both tables have updated_at+version
-- and max(version)=1 today, i.e. nothing else manages the column.
--
-- Deliberately NOT applied to agent.card: its version already reaches 27 with
-- no _touch_row, i.e. application code owns that column, and _touch_row would
-- overwrite the app's value with OLD.version+1.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('seo','source_request'),('seo','story_angle')) AS t(sch,tbl)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal AND p.proname = '_touch_row'
        AND tg.tgrelid = format('%I.%I', r.sch, r.tbl)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON %I.%I '
        'FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', r.sch, r.tbl);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART A2 -- ATTACH capture in SPLIT form to the two scheduler tables
--
-- scheduler.sch_task (max(version) = 146,843 over 64 rows) and
-- scheduler.sch_trigger (97,894 over 62 rows) are the hard case: users genuinely
-- revise the definition (see matrx-scheduler/api/user_queries.py, "Apply a
-- partial update to sch_task" -- title/description/enabled/tags/queue/surfaces),
-- but the overwhelming majority of UPDATEs are scheduler runtime churn. The
-- plain canonical trigger would turn history.row_versions into a firehose.
--
-- This does NOT need an Arman ruling, because the platform already has a
-- ratified precedent for exactly this shape -- workflow.trigger carries:
--     _version_capture         AFTER INSERT OR DELETE                (unconditional)
--     _version_capture_update  AFTER UPDATE WHEN (row minus runtime cols changed)
-- ignoring next_run_at / last_fired_at / last_run_id / fire_count / updated_at /
-- version. We apply that same shape here with each table's own runtime columns,
-- so a scheduling tick records nothing and a real edit records a version.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r        record;
  ignore   text;
  strip_o  text;
  strip_n  text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('sch_task',    'scheduler', 'sch_task',    ARRAY['next_due_at','last_run_at','updated_at','version']),
      ('sch_trigger', 'scheduler', 'sch_trigger', ARRAY['next_due_at','last_fired_at','updated_at','version'])
    ) AS t(token, sch, tbl, runtime_cols)
  LOOP
    EXECUTE (
      SELECT coalesce(string_agg(format('DROP TRIGGER %I ON %I.%I;', tg.tgname, r.sch, r.tbl), ' '), 'SELECT 1;')
      FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
        AND tg.tgrelid = format('%I.%I', r.sch, r.tbl)::regclass
    );

    SELECT string_agg(format('- %L', c), ' ') INTO ignore
      FROM unnest(r.runtime_cols) AS c;
    strip_o := 'to_jsonb(OLD.*) ' || ignore;
    strip_n := 'to_jsonb(NEW.*) ' || ignore;

    EXECUTE format(
      'CREATE TRIGGER _version_capture AFTER INSERT OR DELETE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)',
      r.sch, r.tbl, r.token);

    EXECUTE format(
      'CREATE TRIGGER _version_capture_update AFTER UPDATE ON %I.%I '
      'FOR EACH ROW WHEN ((%s) IS DISTINCT FROM (%s)) '
      'EXECUTE FUNCTION platform._version_capture(%L)',
      r.sch, r.tbl, strip_o, strip_n, r.token);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART B -- SET is_versioned=false (18 tokens)
--
-- Append-only records, machine-generated output, or runtime state machines.
-- Nobody revises the CONTENT of these rows: what changes is a status/lifecycle
-- field driven by a pipeline or a triage decision. Per db-rules §7 the flag is
-- set false EXPLICITLY (never silently defaulted) and the reason is recorded on
-- the registry row, following the convention already used by flashcard_review
-- ("history capture deferred (high churn)").
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('context_item_suggestion',    'machine-generated suggestion; updates are status/decided_by triage, not content revision'),
      ('file_analysis',              'per-file pipeline analysis record; also has no id column, so capture could not address a row'),
      ('file_pages',                 'pipeline-derived page records; user interaction is an exclude toggle, not content revision'),
      ('flashcard_review',           'a single card-review event; append-only, high churn (already flagged deferred in notes)'),
      ('growth_loop_run',            'run state machine; max(version)=1703 over 6 rows is stage progression, not revision'),
      ('invitation_code',            'issuance/redemption record; append-only'),
      ('invitation_request',         'application record; changes are admin triage status, not author revision'),
      ('kg_alert',                   'machine-generated alert; updates are status/viewed_at triage'),
      ('kg_value_match',             'machine-generated match record; append-only'),
      ('ner_shadow',                 'shadow-comparison telemetry; append-only'),
      ('redaction_mapping',          'crypto mapping emitted by a redaction run; append + revoke only'),
      ('scope_association_suggestion','machine-generated suggestion; updates are status/decided_by triage'),
      ('scope_item_value_suggestion','machine-generated suggestion; updates are status/decided_by triage'),
      ('scope_suggestion',           'machine-generated suggestion; updates are status/decided_by triage'),
      ('studio_recording_chunks',    'append-only capture chunks; table has no updated_at at all'),
      ('studio_recording_segments',  'append-only capture segments; changes are archived_at/detached_at lifecycle flags'),
      ('studio_run',                 'execution record; changes are status/ended_at/error'),
      ('work_item',                  'runtime queue item; updates are claim/lease/attempt state')
    ) AS t(token, reason)
  LOOP
    UPDATE platform.entity_types
       SET is_versioned = false,
           notes = NULLIF(trim(both E'\n' FROM
                     coalesce(notes,'') || E'\n' ||
                     'versioning: is_versioned set false 2026-08-21 (drift-audit adjudication) -- ' || r.reason), '')
     WHERE token = r.token
       AND is_versioned IS DISTINCT FROM false;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PART C -- DEFERRED to Arman (9 tokens, deliberately untouched)
--
-- These are NOT guesses left to rot; each is a real decision with a real cost,
-- recorded here and carried in the report. No change is made to them, so they
-- remain a visible trg_version_capture FAIL until Arman rules.
--
--  1. udt_dataset_rows workbench.udt_dataset_rows
--       Already has a LIVE bespoke version store: trigger udt_dataset_rows_version_delete
--       -> public.udt_log_row_version writes workbench.udt_dataset_row_versions.
--       Its registry row nonetheless says version_store='history', which is false.
--       Attaching _version_capture here is a hard "duplicate versioning" FAIL (§7).
--       The store cannot be certified as-is: it is UNREGISTERED in
--       platform.entity_types and has NO UNIQUE(parent_fk, version) -- and adding
--       that constraint is a schema change, out of scope here. Recommendation:
--       retire the bespoke store onto history.row_versions (apply the §7
--       two-animals FK litmus first), then attach the canonical trigger.
--
--  2. wbx_guidance     extend.wbx_guidance
--       BLOCKER, and a live defect risk: `id` is TEXT (domain-scoped), and
--       platform._version_capture hard-casts (row_data->>'id')::uuid. Attaching
--       the trigger would raise 22P02 on EVERY insert and update, breaking the
--       Chrome extension's only write path. Recommendation: set is_versioned=false
--       (a domain-keyed rules table is not row-versionable in the canonical store).
--
--  3. studio_session_settings transcripts.studio_session_settings
--       No `id` column (PK is session_id), so every captured row lands with
--       row_id NULL and is unreachable by version_list(token, id). Content IS
--       revised (32 of 76 rows). Recommendation: this is per-session settings --
--       version it as part of the session, or accept it is not independently
--       addressable and set is_versioned=false.
--
--  4. file_entities         files.entities
--  5. file_overrides        files.overrides
--  6. file_page_annotations files.page_annotations
--  7. seo_gsc_dig_rule      seo.gsc_dig_rule
--  8. seo_keyword_class_rule seo.keyword_class_rule
--       All five are genuinely revisable content (files.page_annotations even
--       carries last_edited_by and is_user_locked; the two seo tables are
--       user-authored rules), but NONE has a `version` column -- they are part of
--       the 62 open `base_version` FAILs. platform._touch_row is jsonb-guarded and
--       silently skips the bump, so capture would record every snapshot as
--       version 1 and version_snapshot/version_diff would be ambiguous.
--       Recommendation: base-contract `version` retrofit FIRST, then attach --
--       exactly the order doctrine §8d prescribes (columns before triggers).
--       Held back here only because column DDL is out of this migration's scope.
--
--  9. agent_card      agent.card -- NEW DEFECT, see FOUND_DEFECTS.md D233.
--       agent.card is a security VIEW over agent.definition, not a table, so it
--       can never carry a capture trigger; and agent definitions are ALREADY
--       versioned by the certified custom store agent.definition_version, so
--       is_versioned=true + version_store='history' here is duplicate versioning
--       aimed at a non-table. The obvious repair -- flip is_versioned=false -- is
--       blocked: platform.entity_types carries a CHECK that refuses ANY update to
--       an active row whose relation is relkind='v' ("register the underlying
--       table instead, or leave the view out of the registry"), so the row can
--       only be touched while also setting is_active=false. Deregistering is NOT
--       safe for an agent to decide: `agent_card` is a LIVE sharing surface --
--       2 rows in iam.permissions, 1 row in platform.shareable_resource_registry,
--       and the view's own WHERE clause calls has_permission('agent_card', id,
--       'viewer'). Recommendation: keep the token registered for sharing, and
--       have Arman rule on whether the entity_types guard should permit a
--       view-backed token that exists purely as a permission surface.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- PART D -- verify in-transaction; roll back the whole thing on any deviation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_attached int;
  n_false    int;
  n_left     int;
BEGIN
  SELECT count(*) INTO n_attached
  FROM platform.entity_types et
  WHERE EXISTS (
    SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
      AND tg.tgrelid = format('%I.%I', et.schema_name, et.table_name)::regclass)
    AND et.token IN ('dataset','dict_setting','heatmap_save','seo_change_item',
                     'seo_change_metric','seo_change_set','seo_change_theory','seo_source_request',
                     'seo_story_angle','structured_list','studio_documents','udt_dataset_fields',
                     'udt_document','udt_structured_list_items','ui_surface_agent_pref',
                     'ui_surface_config','user_profile','workbook','sch_task','sch_trigger');
  IF n_attached <> 20 THEN
    RAISE EXCEPTION 'PART A: expected 20 tokens with capture, found %', n_attached;
  END IF;

  SELECT count(*) INTO n_false FROM platform.entity_types
  WHERE is_versioned = false
    AND token IN ('context_item_suggestion','file_analysis','file_pages','flashcard_review',
                  'growth_loop_run','invitation_code','invitation_request','kg_alert',
                  'kg_value_match','ner_shadow','redaction_mapping','scope_association_suggestion',
                  'scope_item_value_suggestion','scope_suggestion','studio_recording_chunks',
                  'studio_recording_segments','studio_run','work_item');
  IF n_false <> 18 THEN
    RAISE EXCEPTION 'PART B: expected 18 tokens set false, found %', n_false;
  END IF;

  -- No table may carry redundant capture triggers. The ONLY sanctioned multi-
  -- trigger shape is the workflow.trigger split: exactly two, of which exactly
  -- one is conditional (has a WHEN clause). Anything else is a duplicate.
  IF EXISTS (
    SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
    GROUP BY tg.tgrelid
    HAVING count(*) > 2
        OR (count(*) = 2 AND count(*) FILTER (WHERE tg.tgqual IS NOT NULL) <> 1)
  ) THEN
    RAISE EXCEPTION 'redundant _version_capture triggers on some table';
  END IF;

  -- The custom-store contract must still hold.
  IF EXISTS (
    SELECT 1 FROM platform.entity_types et
    JOIN pg_trigger tg ON tg.tgrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
      AND et.version_store IS DISTINCT FROM 'history'
  ) THEN
    RAISE EXCEPTION 'duplicate versioning: _version_capture attached to a custom-store token';
  END IF;

  -- Remaining backlog must be exactly the 10 deliberately deferred tokens.
  SELECT count(*) INTO n_left
  FROM platform.entity_types et
  WHERE et.is_versioned AND coalesce(et.is_active, true) AND et.version_store = 'history'
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal AND p.proname = '_version_capture'
        AND tg.tgrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
    );
  IF n_left <> 9 THEN
    RAISE EXCEPTION 'expected 9 deferred tokens remaining, found %', n_left;
  END IF;

  RAISE NOTICE 'OK: 20 attached, 18 flagged false, 9 deferred to Arman';
END $$;

COMMIT;
