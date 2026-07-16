-- Wave D1 (corrected at apply time) — restore the token-identity invariant between
-- platform.shareable_resource_registry and platform.entity_types.
--
-- Part 1: register the 14 registry resource types whose tables had NO entity_types row.
-- Part 2: 9 registry rows pointed at tables ALREADY registered under canonical tokens —
--   those registry resource_type values were RENAMED onto the canonical tokens instead
--   of registering duplicate tokens (verified zero iam.permissions / platform.share_links
--   / org_module_config rows used the old names):
--     sandbox_instances -> sandbox_instance          wf_run -> workflow_run
--     wf_trigger -> workflow_trigger                 pdf_redaction_audits -> pdf_redaction_audit
--     user_analysis_preferences -> user_analysis_preference
--     quiz_sessions -> quiz_session                  udt_datasets -> dataset
--     udt_documents -> udt_document                  udt_workbooks -> workbook
--   (TS mirror utils/permissions/registry.ts updated in the same change.)
--
-- Registration grants NOBODY access by itself and touches NO RLS. Idempotent.

DO $$
DECLARE
  r RECORD;
  v_existing text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('wf_node_data_slot',        'workflow',  'node_data_slot',           'Workflow Node Data Slot',  true),
      ('analysis_recipes',         'public',    'analysis_recipes',         'Analysis Recipe',          false),
      ('scraper_run',              'scraper',   'crawl_runs',               'Crawl Run',                false),
      ('file_entities',            'files',     'entities',                 'File Entity',              true),
      ('file_overrides',           'files',     'overrides',                'File Override',            true),
      ('file_page_annotations',    'files',     'page_annotations',         'Page Annotation',          true),
      ('scraper_schedule',         'scraper',   'crawl_schedules',          'Crawl Schedule',           false),
      ('scraper_preset',           'scraper',   'crawl_presets',            'Crawl Preset',             false),
      ('scraper_site',             'scraper',   'sites',                    'Tracked Website',          false),
      ('file_pages',               'files',     'pages',                    'File Page',                true),
      ('file_analysis',            'files',     'analysis',                 'File Analysis',            true),
      ('redaction_mapping',        'pdf',       'redaction_mapping',        'Redaction Mapping',        true),
      ('flashcard_data',           'education', 'flashcard_data',           'Flashcard',                false),
      ('agent_card',               'agent',     'card',                     'Agent Card',               true)
    ) AS t(token, schema_name, table_name, label, is_component)
  LOOP
    SELECT et.token INTO v_existing
    FROM platform.entity_types et
    WHERE et.schema_name = r.schema_name AND et.table_name = r.table_name
      AND et.token <> r.token
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE WARNING 'wave_d1: SKIP token % — table %.% already registered under token %',
        r.token, r.schema_name, r.table_name, v_existing;
      CONTINUE;
    END IF;

    INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_active, is_listed)
    VALUES (r.token, r.schema_name, r.table_name, r.label, r.is_component, true, false)
    ON CONFLICT (token) DO UPDATE
      SET is_active = true
      WHERE platform.entity_types.schema_name = EXCLUDED.schema_name
        AND platform.entity_types.table_name  = EXCLUDED.table_name;
  END LOOP;
END $$;

-- Part 2: registry token renames onto the canonical entity tokens.
DO $$
DECLARE
  m RECORD;
  v_used int;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('sandbox_instances',         'sandbox_instance'),
      ('wf_run',                    'workflow_run'),
      ('wf_trigger',                'workflow_trigger'),
      ('pdf_redaction_audits',      'pdf_redaction_audit'),
      ('user_analysis_preferences', 'user_analysis_preference'),
      ('quiz_sessions',             'quiz_session'),
      ('udt_datasets',              'dataset'),
      ('udt_documents',             'udt_document'),
      ('udt_workbooks',             'workbook')
    ) AS t(old_token, new_token)
  LOOP
    SELECT (select count(*) from iam.permissions where resource_type = m.old_token)
         + (select count(*) from platform.share_links where resource_type = m.old_token)
         + (select count(*) from platform.org_module_config where module_token = m.old_token)
    INTO v_used;
    IF v_used > 0 THEN
      RAISE EXCEPTION 'wave_d1: cannot rename % -> % — % data rows still use the old token', m.old_token, m.new_token, v_used;
    END IF;
    UPDATE platform.shareable_resource_registry
       SET resource_type = m.new_token
     WHERE resource_type = m.old_token
       AND NOT EXISTS (select 1 from platform.shareable_resource_registry r2 where r2.resource_type = m.new_token);
  END LOOP;
END $$;

-- Composition edges (child registered this migration -> already-registered parents).
DO $$
DECLARE
  e RECORD;
BEGIN
  FOR e IN
    SELECT * FROM (VALUES
      ('file_pages',            'file',     'file_id'),
      ('file_entities',         'file',     'file_id'),
      ('file_overrides',        'file',     'file_id'),
      ('file_page_annotations', 'file',     'file_id'),
      ('file_analysis',         'file',     'file_id'),
      ('redaction_mapping',     'file',     'file_id'),
      ('wf_node_data_slot',     'workflow', 'definition_id'),
      ('agent_card',            'agent',    'id')
    ) AS t(child_type, parent_type, fk_column)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = e.child_type) THEN
      RAISE WARNING 'wave_d1: edge % -> % skipped — child token not registered', e.child_type, e.parent_type;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = e.parent_type AND is_active) THEN
      RAISE WARNING 'wave_d1: edge % -> % skipped — parent token not registered/active', e.child_type, e.parent_type;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM platform.entity_relationships er
      WHERE er.child_type = e.child_type AND er.parent_type = e.parent_type AND er.fk_column = e.fk_column
    ) THEN
      INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
      VALUES (e.child_type, e.parent_type, e.fk_column, 'composition');
    END IF;
  END LOOP;
END $$;

-- Self-verify: every ACTIVE registry row must now resolve to an ACTIVE entity token.
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(srr.resource_type, ', ') INTO v_missing
  FROM platform.shareable_resource_registry srr
  WHERE srr.is_active
    AND NOT EXISTS (
      SELECT 1 FROM platform.entity_types et
      WHERE et.token = srr.resource_type AND et.is_active
    );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'wave_d1: ACTIVE registry rows still missing an entity_types token: %', v_missing;
  END IF;
END $$;
