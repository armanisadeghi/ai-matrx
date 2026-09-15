-- FastFire's three fixed mandate jobs were already live launch paths; this
-- mirrors their manifest disclosure into the canonical surface-role registry.
WITH role_values (
  name,
  label,
  description,
  mandate_key,
  auto_run,
  sort_order
) AS (
  VALUES
    (
      'spoken_grader',
      'Spoken answer grader',
      'Grades each recorded FastFire answer against its flashcard prompt and returns the learner''s spoken-answer result.',
      'flashcards.grade_spoken',
      'always',
      100
    ),
    (
      'spoken_front_tts',
      'Spoken question voice',
      'Creates the optional spoken FastFire question audio that is prepared and cached for the selected deck.',
      'flashcards.spoken_front_tts',
      'never',
      110
    ),
    (
      'helper_tts',
      'Instant-help voice',
      'Creates the prepared, cached spoken explanations FastFire plays when a learner asks for instant help.',
      'flashcards.helper_tts',
      'never',
      120
    )
)
INSERT INTO ui.ui_surface_agent_role (
  surface_name,
  organization_id,
  visibility,
  name,
  label,
  description,
  kind,
  default_agent_id,
  mandate_key,
  max_agents,
  allow_custom,
  auto_run,
  sort_order,
  synced_by,
  synced_from
)
SELECT
  'matrx-user/education-fastfire',
  system_org.organization_id,
  'public'::platform.visibility,
  role.name,
  role.label,
  role.description,
  'single',
  NULL,
  role.mandate_key,
  1,
  true,
  role.auto_run,
  role.sort_order,
  NULL,
  'manifest-sync:sql:977628e'
FROM role_values AS role
CROSS JOIN iam.system_orgs AS system_org
WHERE system_org.key = 'system'
ON CONFLICT (surface_name, name) DO UPDATE
SET
  organization_id = EXCLUDED.organization_id,
  visibility = EXCLUDED.visibility,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  default_agent_id = EXCLUDED.default_agent_id,
  mandate_key = EXCLUDED.mandate_key,
  max_agents = EXCLUDED.max_agents,
  allow_custom = EXCLUDED.allow_custom,
  auto_run = EXCLUDED.auto_run,
  sort_order = EXCLUDED.sort_order,
  synced_by = EXCLUDED.synced_by,
  synced_from = EXCLUDED.synced_from,
  updated_at = now();
