-- fk_skill_project_id_to_workspace_projects
-- skill.*.project_id references the project ENTITY (workspace.projects), NOT the
-- skill<->project junction (skill.project, composite PK skill_id,project_id) that
-- iam.fk_coverage_gaps inferred. All four columns are empty; uuid types align.
-- Nullable cols -> SET NULL; the junction's NOT NULL project_id -> CASCADE.
-- Idempotent: guarded by pg_constraint existence checks.
DO $f$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='category_project_id_fkey' AND connamespace='skill'::regnamespace) THEN
    ALTER TABLE skill.category ADD CONSTRAINT category_project_id_fkey FOREIGN KEY (project_id) REFERENCES workspace.projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='definition_project_id_fkey' AND connamespace='skill'::regnamespace) THEN
    ALTER TABLE skill.definition ADD CONSTRAINT definition_project_id_fkey FOREIGN KEY (project_id) REFERENCES workspace.projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='render_definition_project_id_fkey' AND connamespace='skill'::regnamespace) THEN
    ALTER TABLE skill.render_definition ADD CONSTRAINT render_definition_project_id_fkey FOREIGN KEY (project_id) REFERENCES workspace.projects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_project_id_fkey' AND connamespace='skill'::regnamespace) THEN
    ALTER TABLE skill.project ADD CONSTRAINT project_project_id_fkey FOREIGN KEY (project_id) REFERENCES workspace.projects(id) ON DELETE CASCADE;
  END IF;
END $f$;
