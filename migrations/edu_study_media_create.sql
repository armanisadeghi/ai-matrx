-- education.study_media — the canonical Generated Study Media artifact registry (P3).
-- ONE table for both Audio Study and Mind Maps. Heavy audio data lives in pc_* (pointed
-- to by run_id/episode_id/audio_file_id); mind-map structure is the content-IR envelope
-- (ir_envelope). Follows the platform base entity shape (mirrors education.fc_set exactly).
-- Applied + verified live 2026-07-07 (iam.verify_canonical_ok = true, zero WARN/FAIL).

CREATE TABLE IF NOT EXISTS education.study_media (
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

  -- artifact identity
  media_kind   text NOT NULL CHECK (media_kind IN ('audio','mind_map')),
  title        text NOT NULL,
  description  text,
  -- draft|generating|ready|error — the artifact lifecycle (audio mirrors its run status here)
  status       text NOT NULL DEFAULT 'draft',

  -- provenance: the ONE source this artifact was generated from (single-valued → a column,
  -- not an association; deck/note/topic). source_id null for a free-text topic.
  source_kind  text CHECK (source_kind IN ('deck','note','topic')),
  source_id    uuid,
  source_title text,

  -- generation config (format, host_count, adaptive-weak-area, language, …) + TrustEnvelope
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust  jsonb,

  -- audio (media_kind='audio') — pointers into the reused podcast pipeline
  run_id         uuid,   -- podcast.pc_studio_runs.id (recovery lifecycle)
  episode_id     uuid,   -- podcast.pc_episodes.id
  audio_file_id  uuid,   -- durable audio file_id (media-durability doctrine)
  audio_format   text CHECK (audio_format IN ('overview','debate','panel','review')),
  duration_seconds int,

  -- mind map (media_kind='mind_map')
  ir_envelope jsonb,      -- the CanonicalBlockIR envelope (diagram_spec / mermaid_diagram)
  diagram_kind text
);

-- base FKs (canonical bar; mirrors fc_set)
DO $$ BEGIN
  ALTER TABLE education.study_media
    ADD CONSTRAINT study_media_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES iam.organizations(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.study_media
    ADD CONSTRAINT study_media_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE education.study_media
    ADD CONSTRAINT study_media_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- helpful indexes
CREATE INDEX IF NOT EXISTS study_media_owner_kind_idx
  ON education.study_media (created_by, media_kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS study_media_source_idx
  ON education.study_media (source_kind, source_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS study_media_run_idx
  ON education.study_media (run_id) WHERE run_id IS NOT NULL;

-- canonical triggers (identical to fc_set)
DROP TRIGGER IF EXISTS _touch_row ON education.study_media;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON education.study_media
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
DROP TRIGGER IF EXISTS _stamp_actor ON education.study_media;
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON education.study_media
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
DROP TRIGGER IF EXISTS _stamp_org_default ON education.study_media;
CREATE TRIGGER _stamp_org_default BEFORE INSERT ON education.study_media
  FOR EACH ROW EXECUTE FUNCTION _stamp_org_default();
DROP TRIGGER IF EXISTS _version_capture ON education.study_media;
CREATE TRIGGER _version_capture AFTER INSERT OR UPDATE OR DELETE ON education.study_media
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('study_media');

-- register the entity
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_versioned, is_active)
SELECT 'study_media','education','study_media','Study Media','private',false,true,true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='study_media');

-- canonical RLS (owner short-circuit + has_access + pub_read on visibility)
SELECT iam.apply_rls('education','study_media','study_media','entity');

-- shareable resource registration (one canonical kind-dispatching viewer path)
INSERT INTO platform.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission)
SELECT 'study_media','education','study_media','id','created_by',NULL,'Study Media','/education/media/{id}',true
WHERE NOT EXISTS (SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type='study_media');
