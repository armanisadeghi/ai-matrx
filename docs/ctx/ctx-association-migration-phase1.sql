-- ============================================================================
-- CTX ASSOCIATION OVERHAUL — PHASE 1 (additive, non-destructive)
-- Project: txzxabzwovsujtloxrus (automation-matrx)
-- Companion docs: ctx-association-architecture.md (decisions),
--                 ctx-association-removed-fk-ledger.md (what's frozen/to-drop),
--                 ctx-association-post-migration-plan.md (what to do after).
--
-- SAFETY MODEL
--   * Runs as ONE transaction. If anything fails, nothing changes.
--   * NON-DESTRUCTIVE: old tables are RENAMED to *_deprecated (data retained),
--     then re-exposed under their original names as fully-writable VIEWS over
--     ctx_associations (INSTEAD OF triggers). Every existing RPC keeps working.
--   * NO litter FK columns are dropped here. That is Phase 2, gated on the
--     codebase audit + app cutover. See the ledger.
--   * Original row ids are preserved on backfill, so any stored association id
--     remains valid through the compat views.
--
-- WHAT THIS DOES NOT DO
--   * Does not touch ctx_context_item_values structure — the typed-reference
--     columns (value_reference_id / value_reference_type) and the 'reference'
--     value_type already exist. The reference/scope-as-value features are
--     logic on top of existing storage (separate work item).
--   * Does not alter the spine FKs (ctx_tasks.project_id, parent_* etc.).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. UNIFIED ASSOCIATION TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ctx_associations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type  text NOT NULL,                       -- entity kind: 'note','agent','file','conversation','project','task',...
  source_id    uuid NOT NULL,
  target_type  text NOT NULL,                        -- {scope, scope_type, project, task, context_item}
  target_id    uuid NOT NULL,
  label        text,                                 -- carried from task_associations
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- carried from task_associations
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ctx_associations_target_type_chk
    CHECK (target_type IN ('scope','scope_type','project','task','context_item'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ctx_associations_unique
  ON ctx_associations (source_type, source_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_ctx_assoc_source ON ctx_associations (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ctx_assoc_target ON ctx_associations (target_type, target_id);

COMMENT ON TABLE ctx_associations IS
  'Unified polymorphic association graph (loose membership). Source = any entity; target in {scope,scope_type,project,task,context_item}. Org is NEVER a target (it is the single owner FK). Typed/named relationships live in ctx_context_item_values, not here.';

-- ----------------------------------------------------------------------------
-- 2. POLYMORPHIC ACCESS HELPER (drives RLS on the unified table)
--    SECURITY DEFINER so membership lookups bypass inner RLS. STABLE.
--    NOTE (audit item): consider folding has_permission(...) in during review
--    to match the newest per-entity grant model. Mirrors existing policies for now.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ctx_can_access_target(p_target_type text, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT CASE p_target_type
    WHEN 'scope' THEN EXISTS (
      SELECT 1 FROM ctx_scopes s
      JOIN organization_members om ON om.organization_id = s.organization_id
      WHERE s.id = p_target_id AND om.user_id = auth.uid())
    WHEN 'scope_type' THEN EXISTS (
      SELECT 1 FROM ctx_scope_types st
      JOIN organization_members om ON om.organization_id = st.organization_id
      WHERE st.id = p_target_id AND om.user_id = auth.uid())
    WHEN 'context_item' THEN EXISTS (
      SELECT 1 FROM ctx_context_items ci
      JOIN ctx_scope_types st ON st.id = ci.scope_type_id
      JOIN organization_members om ON om.organization_id = st.organization_id
      WHERE ci.id = p_target_id AND om.user_id = auth.uid())
    WHEN 'project' THEN EXISTS (
      SELECT 1 FROM ctx_projects p
      WHERE p.id = p_target_id AND (
        p.organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid())
        OR p.id IN (SELECT pm.project_id FROM ctx_project_members pm WHERE pm.user_id = auth.uid())))
    WHEN 'task' THEN EXISTS (
      SELECT 1 FROM ctx_tasks t
      WHERE t.id = p_target_id AND (
        t.user_id = auth.uid() OR t.assignee_id = auth.uid()
        OR (t.organization_id IS NOT NULL AND t.organization_id IN (
              SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()))
        OR t.project_id IN (SELECT pm.project_id FROM ctx_project_members pm WHERE pm.user_id = auth.uid())))
    ELSE false
  END;
$fn$;

-- ----------------------------------------------------------------------------
-- 3. RLS ON ctx_associations
-- ----------------------------------------------------------------------------
ALTER TABLE ctx_associations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ctx_assoc_select ON ctx_associations;
DROP POLICY IF EXISTS ctx_assoc_insert ON ctx_associations;
DROP POLICY IF EXISTS ctx_assoc_update ON ctx_associations;
DROP POLICY IF EXISTS ctx_assoc_delete ON ctx_associations;

CREATE POLICY ctx_assoc_select ON ctx_associations FOR SELECT
  USING (ctx_can_access_target(target_type, target_id));
CREATE POLICY ctx_assoc_insert ON ctx_associations FOR INSERT
  WITH CHECK (ctx_can_access_target(target_type, target_id));
CREATE POLICY ctx_assoc_update ON ctx_associations FOR UPDATE
  USING (ctx_can_access_target(target_type, target_id))
  WITH CHECK (ctx_can_access_target(target_type, target_id));
CREATE POLICY ctx_assoc_delete ON ctx_associations FOR DELETE
  USING (created_by = auth.uid() OR ctx_can_access_target(target_type, target_id));

-- ----------------------------------------------------------------------------
-- 4. RENAME OLD TABLES (retain data + their indexes/policies) AS DEPRECATED
-- ----------------------------------------------------------------------------
ALTER TABLE ctx_scope_assignments  RENAME TO ctx_scope_assignments_deprecated;
ALTER TABLE ctx_task_associations  RENAME TO ctx_task_associations_deprecated;

-- ----------------------------------------------------------------------------
-- 5. BACKFILL (ids preserved from the deprecated tables so references survive)
-- ----------------------------------------------------------------------------
INSERT INTO ctx_associations (id, source_type, source_id, target_type, target_id, label, metadata, created_by, created_at)
SELECT id, entity_type, entity_id, 'scope', scope_id, NULL, '{}'::jsonb, created_by, created_at
FROM ctx_scope_assignments_deprecated
ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING;

INSERT INTO ctx_associations (id, source_type, source_id, target_type, target_id, label, metadata, created_by, created_at)
SELECT id, entity_type, entity_id, 'task', task_id, label, metadata, created_by, created_at
FROM ctx_task_associations_deprecated
ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING;

-- Litter FK backfill: only CONFIRMED-litter tables; judgment cases (code_*,
-- wc_claim, skl_skill_projects, ai_runs, ai_tasks) are intentionally EXCLUDED
-- pending the audit. Assumes each table has an `id` uuid PK.
-- source_type tokens are provisional — audit must confirm canonical tokens
-- (note: existing data already uses inconsistent 'message' vs 'cx_message').
DO $bf$
DECLARE m record;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('agx_agent','agent', true,  true ),
      ('agx_agent_templates','agent_template', true, true ),
      ('agx_shortcut','shortcut', true, true ),
      ('app_instances','app_instance', true, true ),
      ('broker_values','broker_value', true, true ),
      ('canvas_items','canvas_item', true, false),
      ('content_template','content_template', true, false),
      ('ctx_context_variables','context_variable', true, true ),
      ('cx_agent_plan','agent_plan', true, false),
      ('cx_conversation','conversation', true, true ),
      ('flashcard_data','flashcard', true, false),
      ('flashcard_sets','flashcard_set', true, false),
      ('notes','note', true, true ),
      ('page_extraction_jobs','page_extraction_job', true, false),
      ('prompt_actions','prompt_action', true, false),
      ('prompt_apps','prompt_app', true, false),
      ('prompts','prompt', true, true ),
      ('quiz_sessions','quiz_session', true, false),
      ('rs_topic','rs_topic', true, false),
      ('sandbox_instances','sandbox_instance', true, true ),
      ('transcripts','transcript', true, true ),
      ('udt_datasets','udt_dataset', true, true ),
      ('user_files','file', true, true ),
      ('workflow','workflow', true, true )
    ) AS t(tbl, src, has_proj, has_task)
  LOOP
    IF m.has_proj THEN
      EXECUTE format(
        'INSERT INTO ctx_associations (source_type, source_id, target_type, target_id)
         SELECT %L, id, ''project'', project_id FROM %I WHERE project_id IS NOT NULL
         ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING',
        m.src, m.tbl);
    END IF;
    IF m.has_task THEN
      EXECUTE format(
        'INSERT INTO ctx_associations (source_type, source_id, target_type, target_id)
         SELECT %L, id, ''task'', task_id FROM %I WHERE task_id IS NOT NULL
         ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING',
        m.src, m.tbl);
    END IF;
  END LOOP;
END $bf$;

-- ----------------------------------------------------------------------------
-- 6. COMPAT VIEWS (original names) + INSTEAD OF TRIGGERS (reads AND writes work)
--    security_invoker=true => RLS on ctx_associations is enforced through views.
-- ----------------------------------------------------------------------------
CREATE VIEW ctx_scope_assignments
  WITH (security_invoker = true) AS
  SELECT id, target_id AS scope_id, source_type AS entity_type, source_id AS entity_id, created_by, created_at
  FROM ctx_associations WHERE target_type = 'scope';

CREATE VIEW ctx_task_associations
  WITH (security_invoker = true) AS
  SELECT id, target_id AS task_id, source_type AS entity_type, source_id AS entity_id, label, metadata, created_by, created_at
  FROM ctx_associations WHERE target_type = 'task';

-- scope_assignments write redirect
CREATE OR REPLACE FUNCTION ctx_compat_scope_assignments_iud() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $t$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ctx_associations (id, source_type, source_id, target_type, target_id, created_by, created_at)
    VALUES (COALESCE(NEW.id, gen_random_uuid()), NEW.entity_type, NEW.entity_id, 'scope', NEW.scope_id,
            COALESCE(NEW.created_by, auth.uid()), COALESCE(NEW.created_at, now()))
    RETURNING id INTO NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM ctx_associations WHERE id = OLD.id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE ctx_associations
       SET source_type = NEW.entity_type, source_id = NEW.entity_id,
           target_id = NEW.scope_id, created_by = NEW.created_by
     WHERE id = OLD.id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $t$;

CREATE TRIGGER ctx_compat_scope_assignments_trg
  INSTEAD OF INSERT OR UPDATE OR DELETE ON ctx_scope_assignments
  FOR EACH ROW EXECUTE FUNCTION ctx_compat_scope_assignments_iud();

-- task_associations write redirect
CREATE OR REPLACE FUNCTION ctx_compat_task_associations_iud() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER AS $t$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO ctx_associations (id, source_type, source_id, target_type, target_id, label, metadata, created_by, created_at)
    VALUES (COALESCE(NEW.id, gen_random_uuid()), NEW.entity_type, NEW.entity_id, 'task', NEW.task_id,
            NEW.label, COALESCE(NEW.metadata, '{}'::jsonb), COALESCE(NEW.created_by, auth.uid()), COALESCE(NEW.created_at, now()))
    RETURNING id INTO NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM ctx_associations WHERE id = OLD.id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE ctx_associations
       SET source_type = NEW.entity_type, source_id = NEW.entity_id, target_id = NEW.task_id,
           label = NEW.label, metadata = COALESCE(NEW.metadata, '{}'::jsonb), created_by = NEW.created_by
     WHERE id = OLD.id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $t$;

CREATE TRIGGER ctx_compat_task_associations_trg
  INSTEAD OF INSERT OR UPDATE OR DELETE ON ctx_task_associations
  FOR EACH ROW EXECUTE FUNCTION ctx_compat_task_associations_iud();

-- ----------------------------------------------------------------------------
-- 7. SANITY NOTICES (counts logged; not a substitute for the runbook checks)
-- ----------------------------------------------------------------------------
DO $chk$
DECLARE n_assoc int; n_dep_scope int; n_dep_task int;
BEGIN
  SELECT count(*) INTO n_assoc     FROM ctx_associations;
  SELECT count(*) INTO n_dep_scope FROM ctx_scope_assignments_deprecated;
  SELECT count(*) INTO n_dep_task  FROM ctx_task_associations_deprecated;
  RAISE NOTICE 'ctx_associations rows: %, deprecated scope: %, deprecated task: %', n_assoc, n_dep_scope, n_dep_task;
  IF n_assoc < (n_dep_scope + n_dep_task) THEN
    RAISE EXCEPTION 'Backfill check failed: associations (%) < deprecated sources (%)', n_assoc, n_dep_scope + n_dep_task;
  END IF;
END $chk$;

COMMIT;

-- ============================================================================
-- ROLLBACK (if needed BEFORE app cutover):
--   BEGIN;
--   DROP VIEW IF EXISTS ctx_scope_assignments;  DROP VIEW IF EXISTS ctx_task_associations;
--   ALTER TABLE ctx_scope_assignments_deprecated RENAME TO ctx_scope_assignments;
--   ALTER TABLE ctx_task_associations_deprecated RENAME TO ctx_task_associations;
--   DROP TABLE IF EXISTS ctx_associations CASCADE;
--   DROP FUNCTION IF EXISTS ctx_can_access_target(text, uuid);
--   COMMIT;
-- ============================================================================
