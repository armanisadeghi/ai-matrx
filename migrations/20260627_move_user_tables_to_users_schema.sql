-- Migration: move all public.user_* tables → users schema
-- Applied: 2026-06-27 via Supabase MCP (apply_migration)
-- All tables were empty at time of migration.

-- Phase 1: Move tables
ALTER TABLE public.user_achievements         SET SCHEMA users;
ALTER TABLE public.user_analysis_preferences SET SCHEMA users;
ALTER TABLE public.user_bookmarks            SET SCHEMA users;
ALTER TABLE public.user_email_preferences    SET SCHEMA users;
ALTER TABLE public.user_feedback             SET SCHEMA users;
ALTER TABLE public.user_flashcard_reviews    SET SCHEMA users;
ALTER TABLE public.user_flashcard_sets       SET SCHEMA users;
ALTER TABLE public.user_follows              SET SCHEMA users;
ALTER TABLE public.user_form_profile         SET SCHEMA users;
ALTER TABLE public.user_markdown_samples     SET SCHEMA users;
ALTER TABLE public.user_memory               SET SCHEMA users;
ALTER TABLE public.user_preferences          SET SCHEMA users;
ALTER TABLE public.user_secrets              SET SCHEMA users;
ALTER TABLE public.user_sensitive_items      SET SCHEMA users;
ALTER TABLE public.user_stats                SET SCHEMA users;
ALTER TABLE public.user_surface_state        SET SCHEMA users;

-- Phase 2: Update entity_types registry
UPDATE platform.entity_types SET schema_name = 'users'
WHERE token IN (
    'user_achievement','user_analysis_preference','user_bookmark',
    'user_email_preference','user_feedback','flashcard_review','flashcard_set',
    'user_form_profile','user_markdown_sample','user_memory',
    'user_preference','user_stat','user_surface_state'
);
UPDATE platform.entity_types SET is_versioned = false
WHERE token IN ('user_preference','user_form_profile','user_analysis_preference');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active, is_versioned)
SELECT 'user_analysis_preference','users','user_analysis_preferences','User Analysis Preference','private',false,true,false
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='user_analysis_preference');

-- Phase 3: Drop legacy duplicate triggers
DROP TRIGGER IF EXISTS set_updated_at ON users.user_achievements;
DROP TRIGGER IF EXISTS set_updated_at ON users.user_bookmarks;
DROP TRIGGER IF EXISTS set_updated_at ON users.user_flashcard_reviews;
DROP TRIGGER IF EXISTS trg_user_analysis_preferences_touch_updated_at ON users.user_analysis_preferences;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON users.user_analysis_preferences
    FOR EACH ROW EXECUTE FUNCTION platform._touch_row();
DROP TRIGGER IF EXISTS trg_user_form_profile_touch_updated_at ON users.user_form_profile;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON users.user_form_profile
    FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- Phase 4: Register deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, archived_as, reason, deprecated_at)
VALUES
    ('public.user_achievements',         'users.user_achievements',         NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_analysis_preferences', 'users.user_analysis_preferences', NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_bookmarks',            'users.user_bookmarks',            NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_email_preferences',    'users.user_email_preferences',    NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_feedback',             'users.user_feedback',             NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_flashcard_reviews',    'users.user_flashcard_reviews',    NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_flashcard_sets',       'users.user_flashcard_sets',       NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_follows',              'users.user_follows',              NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_form_profile',         'users.user_form_profile',         NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_markdown_samples',     'users.user_markdown_samples',     NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_memory',               'users.user_memory',               NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_preferences',          'users.user_preferences',          NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_secrets',              'users.user_secrets',              NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_sensitive_items',      'users.user_sensitive_items',      NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_stats',                'users.user_stats',                NULL,'moved to users schema 2026-06-27',NOW()),
    ('public.user_surface_state',        'users.user_surface_state',        NULL,'moved to users schema 2026-06-27',NOW())
ON CONFLICT (old_ref) DO UPDATE SET new_ref=EXCLUDED.new_ref,reason=EXCLUDED.reason,deprecated_at=EXCLUDED.deprecated_at;

-- Phase 5: Apply canonical RLS (entity variant) for 10 full-base-entity tables
SELECT iam.apply_rls('users','user_achievements',     'user_achievement',     'entity');
SELECT iam.apply_rls('users','user_bookmarks',         'user_bookmark',        'entity');
SELECT iam.apply_rls('users','user_email_preferences', 'user_email_preference','entity');
SELECT iam.apply_rls('users','user_feedback',          'user_feedback',        'entity');
SELECT iam.apply_rls('users','user_flashcard_reviews', 'flashcard_review',     'entity');
SELECT iam.apply_rls('users','user_flashcard_sets',    'flashcard_set',        'entity');
SELECT iam.apply_rls('users','user_markdown_samples',  'user_markdown_sample', 'entity');
SELECT iam.apply_rls('users','user_memory',            'user_memory',          'entity');
SELECT iam.apply_rls('users','user_stats',             'user_stat',            'entity');
SELECT iam.apply_rls('users','user_surface_state',     'user_surface_state',   'entity');
-- Remaining 6 tables keep user_id-based RLS (singleton or no canonical base cols):
-- user_analysis_preferences, user_form_profile, user_preferences (user_id PK, no id)
-- user_secrets, user_sensitive_items, user_follows (no org_id/created_by)
