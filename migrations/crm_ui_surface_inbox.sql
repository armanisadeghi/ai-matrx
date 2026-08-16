-- crm_ui_surface_inbox.sql
-- Seed + sync for the matrx-user/crm-inbox surface (outreach-system WP1).
--
-- The LAST unregistered outreach surface, and the same defect the Chasebox had:
-- InboxPage has been mounting `<AssistStrip surfaceName="matrx-user/crm-inbox"/>`
-- against a surface row that never existed, so the strip could never render an
-- assist and no agent role could be declared on it (IC-7 — a surface with no
-- manifest carries neither).
--
-- Mirrors features/surfaces/manifests/crm-inbox.manifest.ts (the source of
-- truth); regenerate the value/role half with scripts/emit-surface-sync-sql.ts.
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
  'matrx-user/crm-inbox',
  'matrx-user',
  'Every reply an outreach campaign got back, with the classifier verdict and the evidence behind it',
  2085,
  true,
  '/crm/inbox',
  'python-stream',
  'matrx-user'
)
on conflict (name) do nothing;


-- Upsert all manifest values
INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, auto_context, group_key) VALUES
('matrx-user/crm-inbox', 'scope', 'Whose replies', 'Which scope is open: `mine` (replies to campaigns I own) or `orgs` (every organization I belong to). Always populated.', 'string', true, 8, 100, true, 'view'),
('matrx-user/crm-inbox', 'search', 'Search term', 'What the person typed into the search box, empty when they have not searched. Deep search additionally matches the full message body.', 'string', true, 40, 110, true, 'view'),
('matrx-user/crm-inbox', 'active_filters', 'Active filters', 'The facet filters narrowing the list right now (classification, handled state, campaign), as name/values pairs. Empty object when nothing is filtered — which is why a small list can still be the whole inbox.', 'object', true, 200, 120, true, 'view'),
('matrx-user/crm-inbox', 'total_replies', 'Replies in this view', 'Server-side total for the current scope, search and filters — what the visible rows are a slice OF. Always populated, and a real 0 when nobody has replied.', 'number', true, 5, 130, true, 'view'),
('matrx-user/crm-inbox', 'visible_replies', 'Visible replies', 'The rows on screen: who replied, from which company and campaign, the subject, the classifier''s verdict, the evidence sentence behind that verdict, whether it has been handled, and when it arrived. Empty array when the view is clear.', 'array', true, 4000, 200, false, 'replies')
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, auto_context = EXCLUDED.auto_context, group_key = EXCLUDED.group_key, updated_at = now();

-- Upsert all manifest agent roles
INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES
('matrx-user/crm-inbox', 'reply_reader', 'Reply reader', 'Reads the replies in view and says what each person is actually asking for, whether the classifier''s verdict matches their words, and which ones need a human first. Never replies, sends, or changes a record.', 'single', NULL, 1, true, 'user-choice', 100)
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, kind = EXCLUDED.kind, default_agent_id = EXCLUDED.default_agent_id, max_agents = EXCLUDED.max_agents, allow_custom = EXCLUDED.allow_custom, auto_run = EXCLUDED.auto_run, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Mirror url_pattern / intro / parent_surface_name (declared fields only)
UPDATE ui.ui_surface SET label = 'Outreach inbox', value_groups = '[{"key":"view","label":"What is on screen","sortOrder":100,"description":"Which slice of the inbox the person is looking at — scope, search, filters, and how much of it they can see."},{"key":"replies","label":"Replies","sortOrder":200,"description":"The inbound messages in view, each with the classifier''s verdict and the evidence for it."}]'::jsonb, readiness = 'partial', readiness_note = 'Read vocabulary verified against crm_inbox_list_scoped''s own return shape; values are emitted by the canonical entity-list shell (EntityListPage `surface` binding), so they cannot drift from what is rendered. `visible_replies` is autoContext:false at ~4000 chars, so it arrives DEFERRED — verify it with retrieval allowed. Pending: WP5 to fill reply_reader''s default agent (IC-7).', url_pattern = '/crm/inbox', intro = '<surface_intro>
You are in the outreach inbox — every reply that came back from a campaign, in
one list. Each row is a real message from a real person, carrying the
classifier''s verdict (interested, not interested, unsubscribe, bounced, out of
office) and the evidence sentence that verdict was based on.

WHAT YOU MAY DO HERE: explain what a reply is actually asking for, say whether
the classifier''s verdict matches what the person wrote, summarize a filtered
view, and point out the replies that most need a human today.

WHAT YOU MAY NOT DO: reply, send, mark anything handled, or suppress anyone.
Every one of those is a human action through one governed path. A bounce,
unsubscribe or do-not-contact is decided by one authority server-side — never
suggest working around one.
</surface_intro>', updated_at = now() WHERE name = 'matrx-user/crm-inbox';
