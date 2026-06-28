-- Canvas tables: canonicalize + move to canvas schema
-- Applied: 2026-06-27
-- Tables: canvas_items, canvas_item_state, canvas_comments,
--         canvas_comment_likes, canvas_likes, canvas_scores, canvas_views
-- All tables were in public schema; moved to pre-existing canvas schema.
-- canvas_items had 187 rows (preserved via SET SCHEMA — zero data loss).

-- STEP 1: Fix canvas_items — add missing canonical columns
ALTER TABLE public.canvas_items
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

ALTER TABLE public.canvas_items ALTER COLUMN version TYPE int USING version::int;

UPDATE public.canvas_items
SET visibility = CASE WHEN is_public = true THEN 'public'::platform.visibility ELSE 'private'::platform.visibility END;

-- STEP 2: Fix canvas_comments — add missing canonical columns
ALTER TABLE public.canvas_comments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

UPDATE public.canvas_comments
SET deleted_at = now()
WHERE deleted = true AND deleted_at IS NULL;

-- STEP 3: Register in entity_types
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned, has_soft_delete)
SELECT 'canvas_item', 'canvas', 'canvas_items', 'Canvas Item', 'private', false, true, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'canvas_item');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned, has_soft_delete)
SELECT 'canvas_comment', 'canvas', 'canvas_comments', 'Canvas Comment', 'private', false, true, false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'canvas_comment');

UPDATE platform.entity_types
SET schema_name = 'canvas'
WHERE table_name IN ('canvas_item_state', 'canvas_likes', 'canvas_scores', 'canvas_views', 'canvas_comment_likes')
  AND schema_name = 'public';

-- STEP 4: entity_relationship canvas_item_state → canvas_item
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'canvas_item_state', 'canvas_item', 'canvas_id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'canvas_item_state' AND kind = 'composition'
);

-- STEP 5: Register canvas_items as shareable resource
INSERT INTO public.shareable_resource_registry
  (resource_type, schema_name, table_name, id_column, owner_column, is_public_column, display_label, url_path_template, rls_uses_has_permission, is_active)
VALUES
  ('canvas_item', 'canvas', 'canvas_items', 'id', 'created_by', 'visibility', 'Canvas Item', '/canvas/{id}', true, true)
ON CONFLICT (resource_type) DO UPDATE
  SET schema_name = EXCLUDED.schema_name,
      table_name = EXCLUDED.table_name,
      owner_column = EXCLUDED.owner_column,
      is_public_column = EXCLUDED.is_public_column,
      rls_uses_has_permission = EXCLUDED.rls_uses_has_permission;

-- STEP 6: Apply canonical RLS (while still in public schema)
SELECT iam.apply_rls('public', 'canvas_items', 'canvas_item', 'entity');
SELECT iam.apply_rls('public', 'canvas_comments', 'canvas_comment', 'entity');
SELECT iam.apply_rls('public', 'canvas_item_state', 'canvas_item_state', 'component');
SELECT iam.apply_rls('public', 'canvas_likes', 'canvas_like', 'entity');
SELECT iam.apply_rls('public', 'canvas_scores', 'canvas_score', 'entity');
SELECT iam.apply_rls('public', 'canvas_views', 'canvas_view', 'entity');
SELECT iam.apply_rls('public', 'canvas_comment_likes', 'canvas_comment_like', 'entity');

-- STEP 7: Update trigger functions to use canvas. schema prefix
CREATE OR REPLACE FUNCTION public.update_comment_like_count()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE canvas.canvas_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE canvas.canvas_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    END IF;
    RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_canvas_comment_count()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.deleted = false THEN
        UPDATE public.shared_canvas_items SET comment_count = comment_count + 1 WHERE id = NEW.canvas_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.deleted = false AND NEW.deleted = true THEN
        UPDATE public.shared_canvas_items SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.canvas_id;
    END IF;
    RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_canvas_high_score()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE current_high INTEGER;
BEGIN
    SELECT high_score INTO current_high FROM public.shared_canvas_items WHERE id = NEW.canvas_id;
    IF current_high IS NULL OR NEW.score > current_high THEN
        UPDATE public.shared_canvas_items SET high_score = NEW.score, high_score_user = NEW.user_id WHERE id = NEW.canvas_id;
    END IF;
    UPDATE public.shared_canvas_items
    SET total_attempts = total_attempts + 1,
        average_score = (SELECT AVG(score) FROM canvas.canvas_scores WHERE canvas_id = NEW.canvas_id)
    WHERE id = NEW.canvas_id;
    RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_canvas_like_count()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.shared_canvas_items SET like_count = like_count + 1 WHERE id = NEW.canvas_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.shared_canvas_items SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.canvas_id;
    END IF;
    RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_canvas_view_count()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM canvas.canvas_views
        WHERE canvas_id = NEW.canvas_id AND session_id = NEW.session_id
          AND viewed_at > NOW() - INTERVAL '1 hour' AND id != NEW.id
    ) THEN
        UPDATE public.shared_canvas_items
        SET view_count = view_count + 1, last_played_at = NEW.viewed_at
        WHERE id = NEW.canvas_id;
    END IF;
    RETURN NULL;
END;
$fn$;

-- STEP 8: Move tables to canvas schema
ALTER TABLE public.canvas_items SET SCHEMA canvas;
ALTER TABLE public.canvas_item_state SET SCHEMA canvas;
ALTER TABLE public.canvas_comments SET SCHEMA canvas;
ALTER TABLE public.canvas_comment_likes SET SCHEMA canvas;
ALTER TABLE public.canvas_likes SET SCHEMA canvas;
ALTER TABLE public.canvas_scores SET SCHEMA canvas;
ALTER TABLE public.canvas_views SET SCHEMA canvas;

-- STEP 9: Register in deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
  ('public.canvas_items',         'canvas.canvas_items',         'Moved to canvas schema', now()),
  ('public.canvas_item_state',    'canvas.canvas_item_state',    'Moved to canvas schema', now()),
  ('public.canvas_comments',      'canvas.canvas_comments',      'Moved to canvas schema', now()),
  ('public.canvas_comment_likes', 'canvas.canvas_comment_likes', 'Moved to canvas schema', now()),
  ('public.canvas_likes',         'canvas.canvas_likes',         'Moved to canvas schema', now()),
  ('public.canvas_scores',        'canvas.canvas_scores',        'Moved to canvas schema', now()),
  ('public.canvas_views',         'canvas.canvas_views',         'Moved to canvas schema', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, deprecated_at = EXCLUDED.deprecated_at, reason = EXCLUDED.reason;
