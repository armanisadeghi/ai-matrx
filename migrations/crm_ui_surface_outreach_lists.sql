-- crm_ui_surface_outreach_lists.sql
-- Seed + sync for the matrx-user/crm-outreach-lists surface (outreach-system
-- WP5, decision D14): ui_surface row, manifest values, and agent roles.
-- Mirrors features/surfaces/manifests/crm-outreach-lists.manifest.ts (the
-- source of truth); regenerate with scripts/emit-surface-sync-sql.ts.
-- Idempotent and non-destructive.

insert into ui.ui_surface (
  name,
  client_name,
  description,
  sort_order,
  is_active,
  url_pattern,
  execution_mode,
  executor_name
) values (
  'matrx-user/crm-outreach-lists',
  'matrx-user',
  'Outreach campaign console: every outreach list (email, calling, mixed) with lifecycle and member counts',
  2084,
  true,
  '/crm/outreach-lists',
  'python-stream',
  'matrx-user'
)
on conflict (name) do nothing;

INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, auto_context, group_key) VALUES
('matrx-user/crm-outreach-lists', 'visible_lists', 'Visible outreach lists', 'Summary of every outreach list loaded in the table: id, name, description, kind (list/email/call/mixed), status, member count, started and updated times. Empty array when the user has no outreach lists.', 'array', true, 4000, 100, false, 'lists'),
('matrx-user/crm-outreach-lists', 'visible_list_ids', 'Visible list IDs', 'UUIDs of the outreach lists in the table, in display order. Empty array when none exist.', 'array', true, 800, 110, true, 'lists'),
('matrx-user/crm-outreach-lists', 'list_count', 'List count', 'Number of outreach lists loaded. Always populated.', 'number', true, 3, 120, true, 'lists'),
('matrx-user/crm-outreach-lists', 'available_organizations', 'Available organizations', 'Organizations whose outreach lists this console can show, as id and name pairs. Empty until memberships resolve or when the user belongs to none.', 'array', false, 400, 200, true, 'workspace'),
('matrx-user/crm-outreach-lists', 'is_loading', 'List is loading', 'True while the outreach lists are still loading. Always populated.', 'boolean', true, 5, 210, true, 'workspace'),
('matrx-user/crm-outreach-lists', 'load_error', 'Load error', 'Current load error message. Empty when the lists loaded successfully.', 'string', false, 180, 220, true, 'workspace')
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, auto_context = EXCLUDED.auto_context, group_key = EXCLUDED.group_key, updated_at = now();

INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES
('matrx-user/crm-outreach-lists', 'outreach_strategist', 'Outreach strategist', 'Turns stored evidence and recommended actions into a prioritized outreach plan; drafts wording on request. Never sends and has no contact lookup.', 'single', '6a8c6a97-a473-440f-87b1-ab09e02adfa2', 1, true, 'user-choice', 100),
('matrx-user/crm-outreach-lists', 'personalization_writer', 'Personalization writer', 'Writes evidence-backed personalization lines for list members from facts extracted from each target''s own pages. Every line carries the fact and source page it came from.', 'single', '67df8ca0-c451-4b8e-928c-a08e93c0c8d7', 1, true, 'user-choice', 110),
('matrx-user/crm-outreach-lists', 'pitch_assistant', 'Pitch assistant', 'Helps with templates, subject lines, and follow-up angles by campaign type. Planned — no default agent yet (WP5 roster).', 'single', NULL, 1, true, 'user-choice', 120)
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, kind = EXCLUDED.kind, default_agent_id = EXCLUDED.default_agent_id, max_agents = EXCLUDED.max_agents, allow_custom = EXCLUDED.allow_custom, auto_run = EXCLUDED.auto_run, sort_order = EXCLUDED.sort_order, updated_at = now();

UPDATE ui.ui_surface SET label = 'Outreach Lists', value_groups = '[{"key":"lists","label":"Outreach lists","sortOrder":100,"description":"The outreach lists currently loaded in the console table."},{"key":"workspace","label":"Workspace","sortOrder":200,"description":"Organizations and loading state available to this console."}]'::jsonb, readiness = 'partial', readiness_note = 'Read vocabulary verified against OutreachListsPage; emitter + assist strip wired; roles declared. Pending: pitch_assistant default agent (not yet authored) and the non-matching-name binding verification pass.', url_pattern = '/crm/outreach-lists', intro = '<surface_intro>
You are in the outreach lists console — the campaign home for cold outreach.
Each list is a named audience (email, calling, or mixed) whose members are CRM
parties worked through sequences, the call queue, and single sends. The lists
values describe exactly what the table shows; workspace values say which
organizations are in play and whether the list is still loading.

WHAT YOU MAY DO HERE: explain, plan, prioritize, and draft. Anything you draft
becomes a planned message a human reviews in the Chasebox — you have no send
path, and you never imply one. Never state a fact about a recipient you cannot
trace to a stored record, and never fill a merge variable with a guess: an
unresolved variable correctly refuses to send.

WHAT YOU MAY NOT DO: activate, pause, delete, or enroll into lists — the user
presses those buttons. Suppression, do-not-contact, and sending eligibility are
decided by one authority server-side; never reason around a block, and never
suggest a workaround for one.
</surface_intro>', updated_at = now() WHERE name = 'matrx-user/crm-outreach-lists';
