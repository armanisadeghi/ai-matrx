-- Wave D2 — register the real user-facing entities among the 22 canonical-shaped
-- unregistered tables (organization_id + created_by, no entity_types row).
--
-- Registered here:
--   education.flashcard_sets            (plain; CAVEAT: PK is set_id, not id — the
--       has_access resolver assumes an id column; flagged for follow-up rename/alias)
--   workbench.udt_structured_list_items (component of structured_list via list_id —
--       directed by plan; NOTE list_id is NULLABLE, orphan items resolve as plain rows)
--   workbench.udt_dataset_rows          (component of udt_datasets via table_id, NOT NULL FK)
--   workbench.udt_dataset_fields        (component of udt_datasets via table_id, NOT NULL FK)
--   transcripts.studio_session_settings (component of studio_session via session_id, NOT NULL FK; PK = session_id)
--   transcripts.studio_recording_segments (component of studio_session via session_id, NOT NULL FK)
--   transcripts.studio_documents        (component of studio_session via session_id, NOT NULL FK;
--       guarded — skipped with a WARNING if its table is already registered under another token)
--   transcripts.studio_recording_chunks (apply-time introspection: generated types show NO
--       session_id column (only file_id NOT NULL) — if the live table HAS session_id it
--       registers as a component of studio_session; otherwise it registers plain and warns)
--   users.profiles                      (plain entity, token user_profile)
--
-- flashcard_data reconciliation: the shareable-registry token 'flashcard_data' points at
-- physical education.flashcard_data, and Wave D1 registered entity_types token
-- 'flashcard_data' -> education.flashcard_data. One token per table holds. The separate
-- education.fc_card / fc_set tables keep their own fc_card / fc_set tokens. The legacy
-- token 'flashcard_set' -> public.user_flashcard_sets is a DIFFERENT physical table and
-- is untouched (near-collision documented, not a conflict).
--
-- Deliberately NOT registered (internal machinery, listed for the access doc):
--   rag.kg_value_matches, rag.ner_canonicalizer_shadow, rag.context_item_suggestions,
--   rag.scope_suggestions, rag.kg_suggestion_ack, rag.kg_sweep_run, rag.kg_alerts,
--   rag.kg_sweep_queue, rag.scope_association_suggestions, rag.scope_item_value_suggestions,
--   users.invitation_requests, users.invitation_codes
--
-- Registration grants nobody access and touches NO RLS. Idempotent throughout.

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_existing text;
  v_chunks_has_session boolean;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('flashcard_sets',            'education',  'flashcard_sets',            'Flashcard Set',            false),
      ('udt_structured_list_items', 'workbench',  'udt_structured_list_items', 'Structured List Item',     true),
      ('udt_dataset_rows',          'workbench',  'udt_dataset_rows',          'Dataset Row',              true),
      ('udt_dataset_fields',        'workbench',  'udt_dataset_fields',        'Dataset Field',            true),
      ('studio_session_settings',   'transcripts','studio_session_settings',   'Studio Session Settings',  true),
      ('studio_recording_segments', 'transcripts','studio_recording_segments', 'Studio Recording Segment', true),
      ('studio_documents',          'transcripts','studio_documents',          'Studio Document',          true),
      ('user_profile',              'users',      'profiles',                  'User Profile',             false)
    ) AS t(token, schema_name, table_name, label, is_component)
  LOOP
    SELECT et.token INTO v_existing
    FROM platform.entity_types et
    WHERE et.schema_name = r.schema_name AND et.table_name = r.table_name
      AND et.token <> r.token
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE WARNING 'wave_d2: SKIP token % — table %.% already registered under token %',
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

  -- studio_recording_chunks: component only if the LIVE table has session_id
  -- (generated types say it does not — file_id NOT NULL is its only hard parent ref,
  -- and that has no declared FK; do not guess).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'transcripts' AND table_name = 'studio_recording_chunks'
      AND column_name = 'session_id'
  ) INTO v_chunks_has_session;

  SELECT et.token INTO v_existing
  FROM platform.entity_types et
  WHERE et.schema_name = 'transcripts' AND et.table_name = 'studio_recording_chunks'
    AND et.token <> 'studio_recording_chunks'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE WARNING 'wave_d2: SKIP token studio_recording_chunks — already registered under token %', v_existing;
  ELSE
    INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_active, is_listed)
    VALUES ('studio_recording_chunks', 'transcripts', 'studio_recording_chunks',
            'Studio Recording Chunk', v_chunks_has_session, true, false)
    ON CONFLICT (token) DO UPDATE
      SET is_active = true
      WHERE platform.entity_types.schema_name = EXCLUDED.schema_name
        AND platform.entity_types.table_name  = EXCLUDED.table_name;
    IF NOT v_chunks_has_session THEN
      RAISE WARNING 'wave_d2: studio_recording_chunks has NO session_id column live — registered as a PLAIN entity (no studio_session composition edge). Access-doc follow-up needed.';
    END IF;
  END IF;
END $$;

-- Composition edges, guarded on both tokens + on the fk column actually existing live.
DO $$
DECLARE
  e RECORD;
BEGIN
  FOR e IN
    SELECT * FROM (VALUES
      ('udt_structured_list_items', 'structured_list', 'list_id',    'workbench',   'udt_structured_list_items'),
      ('udt_dataset_rows',          'dataset',         'table_id',   'workbench',   'udt_dataset_rows'),
      ('udt_dataset_fields',        'dataset',         'table_id',   'workbench',   'udt_dataset_fields'),
      ('studio_session_settings',   'studio_session',  'session_id', 'transcripts', 'studio_session_settings'),
      ('studio_recording_segments', 'studio_session',  'session_id', 'transcripts', 'studio_recording_segments'),
      ('studio_documents',          'studio_session',  'session_id', 'transcripts', 'studio_documents'),
      ('studio_recording_chunks',   'studio_session',  'session_id', 'transcripts', 'studio_recording_chunks')
    ) AS t(child_type, parent_type, fk_column, child_schema, child_table)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = e.child_type AND is_active) THEN
      RAISE WARNING 'wave_d2: edge % -> % skipped — child token not registered/active', e.child_type, e.parent_type;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = e.parent_type AND is_active) THEN
      RAISE WARNING 'wave_d2: edge % -> % skipped — parent token not registered/active', e.child_type, e.parent_type;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = e.child_schema AND table_name = e.child_table AND column_name = e.fk_column
    ) THEN
      RAISE WARNING 'wave_d2: edge % -> % skipped — column %.%.% does not exist live',
        e.child_type, e.parent_type, e.child_schema, e.child_table, e.fk_column;
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

COMMIT;
