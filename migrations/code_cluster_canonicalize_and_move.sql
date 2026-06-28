-- ================================================================
-- code_* cluster: canonicalize + move public → code schema
-- 2026-06-27
-- ================================================================

-- 1. Ensure code schema exists (idempotent)
CREATE SCHEMA IF NOT EXISTS code;

-- 2. code_files — entity
ALTER TABLE public.code_files
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

UPDATE public.code_files SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.code_files SET deleted_at = COALESCE(updated_at, now()) WHERE is_deleted = true AND deleted_at IS NULL;
UPDATE public.code_files SET visibility = 'public' WHERE is_public = true AND visibility = 'private';

DROP TRIGGER IF EXISTS code_files_updated_at ON public.code_files;
DROP TRIGGER IF EXISTS code_file_version_trigger ON public.code_files;
DROP TRIGGER IF EXISTS trg_code_files_create_v1_snapshot ON public.code_files;
DROP TRIGGER IF EXISTS trg_code_files_set_initial_version ON public.code_files;
DROP TRIGGER IF EXISTS _touch_row ON public.code_files;
DROP TRIGGER IF EXISTS _stamp_actor ON public.code_files;

CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.code_files
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.code_files
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- 3. code_file_folders — entity
ALTER TABLE public.code_file_folders
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

UPDATE public.code_file_folders SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.code_file_folders SET deleted_at = COALESCE(updated_at, now()) WHERE is_active = false AND deleted_at IS NULL;
UPDATE public.code_file_folders SET visibility = 'public' WHERE is_public = true AND visibility = 'private';

DROP TRIGGER IF EXISTS code_file_folders_updated_at ON public.code_file_folders;
DROP TRIGGER IF EXISTS _touch_row ON public.code_file_folders;
DROP TRIGGER IF EXISTS _stamp_actor ON public.code_file_folders;

CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.code_file_folders
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.code_file_folders
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- 4. code_repositories — entity
ALTER TABLE public.code_repositories
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

UPDATE public.code_repositories SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.code_repositories SET visibility = 'public' WHERE is_public = true AND visibility = 'private';

DROP TRIGGER IF EXISTS code_repositories_updated_at ON public.code_repositories;
DROP TRIGGER IF EXISTS _touch_row ON public.code_repositories;
DROP TRIGGER IF EXISTS _stamp_actor ON public.code_repositories;

CREATE TRIGGER _touch_row
  BEFORE INSERT OR UPDATE ON public.code_repositories
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.code_repositories
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- 5. code_file_versions — component (child of code_files)
ALTER TABLE public.code_file_versions
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

UPDATE public.code_file_versions SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.code_file_versions SET created_at = changed_at WHERE created_at = now() AND changed_at IS NOT NULL;

DROP TRIGGER IF EXISTS _stamp_actor ON public.code_file_versions;
CREATE TRIGGER _stamp_actor
  BEFORE INSERT OR UPDATE ON public.code_file_versions
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();

-- 6. Register in platform.entity_types
INSERT INTO platform.entity_types
  (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned, has_soft_delete)
VALUES
  ('code_repository',    'code', 'code_repositories',  'Code Repository',  'private', false, true, true, true),
  ('code_folder',        'code', 'code_file_folders',   'Code Folder',      'private', false, true, true, true),
  ('code_file',          'code', 'code_files',          'Code File',        'private', false, true, true, true),
  ('code_file_version',  'code', 'code_file_versions',  'Code File Version','private', true,  true, false, false)
ON CONFLICT (token) DO UPDATE SET
  schema_name  = EXCLUDED.schema_name,
  table_name   = EXCLUDED.table_name,
  label        = EXCLUDED.label,
  is_component = EXCLUDED.is_component,
  is_active    = true;

-- 7. Register composition relationship
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'code_file_version', 'code_file', 'code_file_id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'code_file_version' AND kind = 'composition'
);

-- 8. Move tables to code schema
ALTER TABLE public.code_repositories   SET SCHEMA code;
ALTER TABLE public.code_file_folders   SET SCHEMA code;
ALTER TABLE public.code_files          SET SCHEMA code;
ALTER TABLE public.code_file_versions  SET SCHEMA code;

-- 9. Apply canonical RLS
SELECT iam.apply_rls('code', 'code_repositories',  'code_repository',   'entity');
SELECT iam.apply_rls('code', 'code_file_folders',  'code_folder',       'entity');
SELECT iam.apply_rls('code', 'code_files',         'code_file',         'entity');
SELECT iam.apply_rls('code', 'code_file_versions', 'code_file_version', 'component');

-- 10. Register shareable resources
INSERT INTO public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
   display_label, url_path_template, rls_uses_has_permission, is_active)
VALUES
  ('code_repository', 'code', 'code_repositories', 'id', 'created_by', 'visibility',
   'Code Repository', '/code/repos/{id}',   true, true),
  ('code_folder',     'code', 'code_file_folders',  'id', 'created_by', 'visibility',
   'Code Folder',     '/code/folders/{id}', true, true),
  ('code_file',       'code', 'code_files',         'id', 'created_by', 'visibility',
   'Code File',       '/code/files/{id}',   true, true)
ON CONFLICT (resource_type) DO UPDATE SET
  schema_name = EXCLUDED.schema_name,
  table_name  = EXCLUDED.table_name,
  is_active   = true;

-- 11. Register deprecated relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
  ('public.code_repositories',  'code.code_repositories',  'Moved to code schema 2026-06-27', now()),
  ('public.code_file_folders',  'code.code_file_folders',  'Moved to code schema 2026-06-27', now()),
  ('public.code_files',         'code.code_files',         'Moved to code schema 2026-06-27', now()),
  ('public.code_file_versions', 'code.code_file_versions', 'Moved to code schema 2026-06-27', now())
ON CONFLICT (old_ref) DO UPDATE SET
  new_ref       = EXCLUDED.new_ref,
  deprecated_at = EXCLUDED.deprecated_at;
