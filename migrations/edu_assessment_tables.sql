-- education.assessment — the canonical Assessment Engine content model (P1).
-- One content model for BOTH quizzes and full timed practice tests (assessment_kind),
-- following the platform base-entity shape (mirrors education.fc_set / study_media exactly).
--   assessment       — the quiz/practice-test config + generated instance (root entity, shareable)
--   assessment_item   — one question (5 types: MC, T/F, fill-in-blank, short-answer, written) — component
--   assessment_result — one scored taking, owned by the TAKER (root entity; carries learning-gain phase)
-- Studying (per-question grading) writes the SHARED study spine keyed item_type='assessment_item';
-- NO new attempts/mastery tables. Idempotent. Applied live to txzxabzwovsujtloxrus via Supabase MCP.

-- ── CONTENT ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS education.assessment (
  -- base entity skeleton
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  -- identity
  assessment_kind text NOT NULL CHECK (assessment_kind IN ('quiz','practice_test')),
  title           text NOT NULL,
  description     text,
  -- draft|generating|ready|error — the artifact lifecycle
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','generating','ready','error')),

  -- provenance: the ONE source this assessment was generated from (single-valued → a column,
  -- not an association; deck/note/topic/source). source_id null for a free-text topic.
  source_kind  text CHECK (source_kind IN ('deck','note','topic','source')),
  source_id    uuid,
  source_title text,
  topic        text,

  -- exam-hub metadata (first-class so P6's free exam hub can serve mocks)
  exam_type text,   -- e.g. 'AP Biology','SAT','MCAT' — null for a generic assessment
  -- default generation depth: rote recall → applied → exam/clinical depth
  depth text CHECK (depth IN ('recall','applied','exam')),

  -- practice tests: full-length + timed (null = untimed)
  time_limit_seconds int,

  -- generation config (question_mix, difficulty, count, depth, exam_type, …) + set-level TrustEnvelope
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust  jsonb
);

CREATE TABLE IF NOT EXISTS education.assessment_item (
  -- base component skeleton (organization_id inherited from parent assessment via trigger)
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  assessment_id uuid NOT NULL REFERENCES education.assessment(id) ON DELETE CASCADE,
  position      int  NOT NULL DEFAULT 0,

  -- the 5 first-class question types
  question_type text NOT NULL CHECK (question_type IN
    ('multiple_choice','true_false','fill_blank','short_answer','written_response')),
  prompt        text NOT NULL,
  -- MC/TF answer choices (array of strings); null for free-response types
  options       jsonb,
  -- canonical correct answer text (MC/TF/fill_blank) — for MC MUST equal one of options verbatim
  correct_answer text,
  -- extra accepted answers for fill_blank/short_answer (array of strings) — meaning-graded beyond these
  acceptable_answers jsonb,
  explanation   text,
  -- grading rubric for written_response (drives grade-on-meaning)
  rubric        text,
  -- depth-on-demand tier of THIS item
  depth text CHECK (depth IN ('recall','applied','exam')),
  points numeric NOT NULL DEFAULT 1,
  topic  text,
  -- per-item TrustEnvelope (citations to the source passage this question came from)
  trust jsonb
);
CREATE INDEX IF NOT EXISTS idx_assessment_item_parent
  ON education.assessment_item(assessment_id, position) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS education.assessment_result (
  -- base entity skeleton — owned by the TAKER (org from taker, not the assessment owner)
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  version         int  NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility      platform.visibility NOT NULL DEFAULT 'private',

  assessment_id uuid NOT NULL REFERENCES education.assessment(id) ON DELETE CASCADE,
  -- link to the shared study-spine session that recorded the per-item attempts
  session_id    uuid REFERENCES education.study_session(id),

  -- LEARNING-GAIN contract: a baseline taking BEFORE study + a post taking AFTER,
  -- linked by gain_group_id, produce a persisted, queryable pre/post delta. P5 reads
  -- rows where phase IN ('baseline','post'), keyed (created_by, topic|source_id, phase, score_value, created_at).
  phase text NOT NULL DEFAULT 'standalone' CHECK (phase IN ('standalone','baseline','post')),
  gain_group_id uuid,

  -- denormalized targeting for learning-gain queries (copied from the assessment at take time)
  topic       text,
  source_kind text,
  source_id   uuid,

  status text NOT NULL DEFAULT 'in_progress'
         CHECK (status IN ('in_progress','completed','abandoned')),
  score_value    numeric,   -- overall 0..1
  correct_count  int NOT NULL DEFAULT 0,
  partial_count  int NOT NULL DEFAULT 0,
  total_count    int NOT NULL DEFAULT 0,
  points_earned   numeric,
  points_possible numeric,
  duration_seconds int,
  started_at   timestamptz,
  completed_at timestamptz,
  -- per-item breakdown snapshot for the results page ([{itemId, response, result, verdict}])
  detail jsonb
);
CREATE INDEX IF NOT EXISTS idx_assessment_result_owner_assessment
  ON education.assessment_result(created_by, assessment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assessment_result_gain
  ON education.assessment_result(created_by, topic, phase) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assessment_result_assessment
  ON education.assessment_result(assessment_id) WHERE deleted_at IS NULL;

-- ── BASE FKs (canonical bar; mirrors fc_set) ─────────────────────────────────
DO $$ BEGIN
  ALTER TABLE education.assessment
    ADD CONSTRAINT assessment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment
    ADD CONSTRAINT assessment_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment
    ADD CONSTRAINT assessment_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE education.assessment_item
    ADD CONSTRAINT assessment_item_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment_item
    ADD CONSTRAINT assessment_item_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment_item
    ADD CONSTRAINT assessment_item_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE education.assessment_result
    ADD CONSTRAINT assessment_result_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment_result
    ADD CONSTRAINT assessment_result_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.assessment_result
    ADD CONSTRAINT assessment_result_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_assessment_owner_kind
  ON education.assessment(created_by, assessment_kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assessment_source
  ON education.assessment(source_kind, source_id) WHERE deleted_at IS NULL;

-- ── CANONICAL TRIGGERS ───────────────────────────────────────────────────────
-- Root entities: _stamp_actor, _touch_row, _stamp_org_default, _version_capture.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessment','assessment_result'] LOOP
    EXECUTE format('drop trigger if exists _stamp_actor on education.%I', t);
    EXECUTE format('create trigger _stamp_actor before insert or update on education.%I for each row execute function platform._stamp_actor()', t);
    EXECUTE format('drop trigger if exists _touch_row on education.%I', t);
    EXECUTE format('create trigger _touch_row before insert or update on education.%I for each row execute function platform._touch_row()', t);
    EXECUTE format('drop trigger if exists _stamp_org_default on education.%I', t);
    EXECUTE format('create trigger _stamp_org_default before insert on education.%I for each row execute function public._stamp_org_default()', t);
    EXECUTE format('drop trigger if exists _version_capture on education.%I', t);
    EXECUTE format('create trigger _version_capture after insert or update or delete on education.%I for each row execute function platform._version_capture(%L)', t, t);
  END LOOP;
END $$;

-- Component assessment_item: inherit org from parent assessment (via assessment_id).
DROP TRIGGER IF EXISTS _stamp_actor ON education.assessment_item;
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON education.assessment_item
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
DROP TRIGGER IF EXISTS _touch_row ON education.assessment_item;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON education.assessment_item
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
DROP TRIGGER IF EXISTS _inherit_org ON education.assessment_item;
CREATE TRIGGER _inherit_org BEFORE INSERT ON education.assessment_item
  FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent('education','assessment','assessment_id');
DROP TRIGGER IF EXISTS _version_capture ON education.assessment_item;
CREATE TRIGGER _version_capture AFTER INSERT OR UPDATE OR DELETE ON education.assessment_item
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('assessment_item');

-- ── GRANTS (RLS gates rows; without grants nothing reads — db-rules §6d) ──────
GRANT SELECT, INSERT, UPDATE, DELETE ON education.assessment, education.assessment_item,
  education.assessment_result TO authenticated;
GRANT ALL ON education.assessment, education.assessment_item, education.assessment_result TO service_role;

-- ── REGISTRATION ─────────────────────────────────────────────────────────────
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
SELECT v.token, 'education', v.tbl, v.label, 'private', v.is_comp, true, true
FROM (VALUES
  ('assessment','assessment','Assessment', false),
  ('assessment_item','assessment_item','Assessment Item', true),
  ('assessment_result','assessment_result','Assessment Result', false)
) v(token,tbl,label,is_comp)
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = v.token);

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'assessment_item','assessment','assessment_id','composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships r WHERE r.child_type='assessment_item' AND r.kind='composition');

-- Shareable: the assessment itself (quizzes route is the canonical detail; the
-- practice-tests route reads the same row and the taker is routed by assessment_kind).
INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
SELECT 'assessment','education','assessment','id','created_by','visibility','Assessment','/education/quizzes/{id}',true
WHERE NOT EXISTS (SELECT 1 FROM platform.shareable_resource_registry s WHERE s.resource_type='assessment');

-- ── CANONICAL RLS (owner short-circuit + has_access + pub_read on visibility) ──
SELECT iam.apply_rls('education','assessment','assessment','entity');
SELECT iam.apply_rls('education','assessment_item','assessment_item','component');
SELECT iam.apply_rls('education','assessment_result','assessment_result','entity');
