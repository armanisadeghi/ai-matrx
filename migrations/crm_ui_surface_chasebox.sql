-- crm_ui_surface_chasebox.sql
-- Seed + sync for the matrx-user/crm-chasebox surface (outreach-system WP1).
--
-- The Chasebox page has been mounting `<AssistStrip surfaceName=
-- "matrx-user/crm-chasebox"/>` against a surface row that never existed, so the
-- strip could never render an assist and no agent role could be declared on it
-- (IC-7: a surface with no manifest carries neither). This registers it.
--
-- Mirrors features/surfaces/manifests/crm-chasebox.manifest.ts (the source of
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
  'matrx-user/crm-chasebox',
  'matrx-user',
  'Outreach triage: replies to answer and held drafts to approve, reword or reject at volume',
  2086,
  true,
  '/crm/chasebox',
  'python-stream',
  'matrx-user'
)
on conflict (name) do nothing;


-- Upsert all manifest values
INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, auto_context, group_key) VALUES
('matrx-user/crm-chasebox', 'active_queue', 'Open queue', 'Which of the five queues is open: fresh_replies, pending_drafts, stalled_sequences, blocked_members, escalation_candidates. Always populated.', 'string', true, 24, 100, true, 'queue'),
('matrx-user/crm-chasebox', 'queue_counts', 'Queue counts', 'Live count per queue for the current scope, as name/number pairs. A queue with none is a real 0, never missing.', 'object', true, 200, 110, true, 'queue'),
('matrx-user/crm-chasebox', 'visible_items', 'Visible items', 'The rows on screen in the open queue: contact, campaign, step, the problem it names and the fix it offers. Empty array when the queue is clear.', 'array', true, 4000, 120, false, 'queue'),
('matrx-user/crm-chasebox', 'total_items', 'Items in this queue', 'Server-side total for the open queue — what the visible page is a slice OF. Always populated.', 'number', true, 5, 130, true, 'queue'),
('matrx-user/crm-chasebox', 'draft_subject', 'Draft subject', 'Subject line of the draft currently open for review. Empty when no draft is open.', 'string', false, 120, 200, true, 'draft'),
('matrx-user/crm-chasebox', 'draft_body', 'Draft body', 'The exact rendered message awaiting approval, footer included. Empty when no draft is open.', 'string', false, 2500, 210, false, 'draft'),
('matrx-user/crm-chasebox', 'draft_personalization', 'Personalization evidence', 'The AI-written lines in the open draft, each with the fact it stands on and the source page that fact came from. Empty when the draft has none.', 'array', false, 1200, 220, true, 'draft'),
('matrx-user/crm-chasebox', 'draft_approved', 'Draft already approved', 'True when a human has already approved these exact bytes and only sending remains.', 'boolean', false, 5, 230, true, 'draft')
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, auto_context = EXCLUDED.auto_context, group_key = EXCLUDED.group_key, updated_at = now();

-- Upsert all manifest agent roles
INSERT INTO ui.ui_surface_agent_role (surface_name, name, label, description, kind, default_agent_id, max_agents, allow_custom, auto_run, sort_order) VALUES
('matrx-user/crm-chasebox', 'draft_reviewer', 'Draft reviewer', 'Reads a held draft beside its personalization evidence and says whether the claim is actually supported by the quoted fact and source page, then suggests a better line. Never approves, sends, or edits — it hands wording to the human.', 'single', NULL, 1, true, 'user-choice', 100)
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, kind = EXCLUDED.kind, default_agent_id = EXCLUDED.default_agent_id, max_agents = EXCLUDED.max_agents, allow_custom = EXCLUDED.allow_custom, auto_run = EXCLUDED.auto_run, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Mirror url_pattern / intro / parent_surface_name (declared fields only)
UPDATE ui.ui_surface SET label = 'Chasebox', value_groups = '[{"key":"queue","label":"Queue","sortOrder":100,"description":"Which queue is open and what it currently holds."},{"key":"draft","label":"Draft under review","sortOrder":200,"description":"The exact message a human is being asked to approve, with the evidence behind its AI-written lines."}]'::jsonb, readiness = 'partial', readiness_note = 'Read vocabulary verified against crm_chasebox_items + the draft review dialog; emitter and assist strip both mounted on ChaseboxPage. Pending: WP5 to fill draft_reviewer''s default agent (IC-7).', url_pattern = '/crm/chasebox', intro = '<surface_intro>
You are in the Chasebox — the one place that answers "what needs me now" for
outreach. Five queues over the same records the campaigns use: replies nobody
answered, drafts the trust ladder held for a human, sequences that stopped,
members a send would refuse, and people the whole sequence never reached.

WHAT YOU MAY DO HERE: explain a queue item, compare a draft against the evidence
shown beside it, and suggest better wording for the AI-written lines. Say plainly
when a personalization line is not supported by the fact quoted under it — that
is the single most useful thing you can do on this surface.

WHAT YOU MAY NOT DO: approve, send, reject, or edit anything. Every one of those
is a human keystroke through the one governed send path. Never suggest working
around a block a queue reports: suppression, do-not-contact and sending
eligibility are decided by one authority server-side.
</surface_intro>', updated_at = now() WHERE name = 'matrx-user/crm-chasebox';
