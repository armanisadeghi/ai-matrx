-- Add the configurable listening-summary role to rendered assistant messages,
-- then select the owner's existing private Text to Speech Converter for that
-- role. The manifest is the code-side authority for the role definition; this
-- data migration makes the requested personal selection immediately usable.

insert into ui.ui_surface_agent_role (
  surface_name,
  name,
  label,
  description,
  kind,
  default_agent_id,
  max_agents,
  allow_custom,
  auto_run,
  sort_order
) values (
  'matrx-user/assistant-message',
  'spoken_summary',
  'Listening summary',
  'Converts selected response text or a whole message into concise, natural prose designed for listening.',
  'single',
  null,
  1,
  true,
  'always',
  100
)
on conflict (surface_name, name) do update set
  label = excluded.label,
  description = excluded.description,
  kind = excluded.kind,
  default_agent_id = excluded.default_agent_id,
  max_agents = excluded.max_agents,
  allow_custom = excluded.allow_custom,
  auto_run = excluded.auto_run,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into ui.ui_surface_agent_pref (
  surface_name,
  role_name,
  agent_id,
  kind,
  position,
  settings,
  user_id,
  organization_id,
  created_by,
  updated_by,
  metadata,
  visibility
) values (
  'matrx-user/assistant-message',
  'spoken_summary',
  'ef66f940-3926-42a6-ab27-74882306b6ef'::uuid,
  'selection',
  0,
  '{}'::jsonb,
  '4cf62e4e-2679-484f-b652-034e697418df'::uuid,
  '3e790542-fdaf-40b2-8bf3-658bf94fe67f'::uuid,
  '4cf62e4e-2679-484f-b652-034e697418df'::uuid,
  '4cf62e4e-2679-484f-b652-034e697418df'::uuid,
  jsonb_build_object('source', 'assistant_message_listening_actions'),
  'internal'::platform.visibility
)
on conflict (surface_name, role_name, position, user_id)
  where kind = 'selection' and user_id is not null
do update set
  agent_id = excluded.agent_id,
  organization_id = excluded.organization_id,
  updated_by = excluded.updated_by,
  metadata = excluded.metadata,
  deleted_at = null,
  updated_at = now();
