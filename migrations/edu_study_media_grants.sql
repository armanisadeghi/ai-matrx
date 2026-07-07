-- Table privileges for education.study_media. iam.apply_rls ENABLEs RLS + creates
-- policies but does NOT grant table-level privileges — without these grants every
-- role gets "42501: permission denied for table study_media" (RLS ≠ grants).
-- Mirrors education.fc_set. Applied + verified live 2026-07-07.

GRANT SELECT, INSERT, UPDATE, DELETE ON education.study_media TO authenticated;
GRANT SELECT ON education.study_media TO anon;  -- pub_read policy serves the public /education/media viewer
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON education.study_media TO service_role;
