-- Register the class-hub association pairs in platform.association_types.
--
-- The pair registry guard (platform.association_types, 2026-07) landed AFTER the
-- class hub shipped on 2026-07-14. The hub writes three pairs the registry never
-- learned about — fc_set → scope, assessment → scope, study_media → scope —
-- for both the plain content tag (role NULL, "Add content" / ClassPicker) and
-- the assignment edge (role='assignment', edu_class_assign). Found live on
-- 2026-08-22: the FIRST real assignment ever attempted failed with
-- "Unknown association type: fc_set -> scope". note/file → scope were already
-- registered; these three mirror them exactly (container_side='target',
-- conveys_max='viewer' — a class is the container, membership conveys read).
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes)
VALUES
  ('fc_set',      'scope', NULL, 'target', 'viewer', true, 'Education class hub: deck tagged/assigned to a class scope (role NULL = content tag, role=assignment = edu_class_assign). Registered 2026-08-22.'),
  ('assessment',  'scope', NULL, 'target', 'viewer', true, 'Education class hub: quiz/practice-test tagged/assigned to a class scope. Registered 2026-08-22.'),
  ('study_media', 'scope', NULL, 'target', 'viewer', true, 'Education class hub: study media tagged to a class scope. Registered 2026-08-22.')
ON CONFLICT DO NOTHING;
