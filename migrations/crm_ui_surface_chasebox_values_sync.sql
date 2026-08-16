-- crm_ui_surface_chasebox_values_sync.sql
-- Re-sync matrx-user/crm-chasebox's VALUE rows to the manifest.
--
-- Two manifest changes landed after the surface was registered:
--   * `draft_reply` (WP1 round 4) — the reply evidence the review dialog shows.
--   * `visible_items` moves alwaysAvailable true -> false (WP5 round 4). The
--     emitter writes it on every build, but the platform judges presence with
--     `hasValue()` in SurfaceContextWindow.tsx, where an EMPTY ARRAY counts as
--     absent — so a CLEAR queue (the good state) reported "1 required missing"
--     and a working surface read as broken. Same call, same reasoning, as
--     admin-users.manifest.ts. Scalars are unaffected: `total_items` stays
--     alwaysAvailable because hasValue passes 0.
--
-- Mirrors features/surfaces/manifests/crm-chasebox.manifest.ts (the source of
-- truth); regenerated with scripts/emit-surface-sync-sql.ts. Idempotent.

INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order, auto_context, group_key) VALUES
('matrx-user/crm-chasebox', 'active_queue', 'Open queue', 'Which of the five queues is open: fresh_replies, pending_drafts, stalled_sequences, blocked_members, escalation_candidates. Always populated.', 'string', true, 24, 100, true, 'queue'),
('matrx-user/crm-chasebox', 'queue_counts', 'Queue counts', 'Live count per queue for the current scope, as name/number pairs. A queue with none is a real 0, never missing.', 'object', true, 200, 110, true, 'queue'),
('matrx-user/crm-chasebox', 'visible_items', 'Visible items', 'The rows on screen in the open queue: contact, campaign, step, the problem it names and the fix it offers. Empty array when the queue is clear.', 'array', false, 4000, 120, false, 'queue'),
('matrx-user/crm-chasebox', 'total_items', 'Items in this queue', 'Server-side total for the open queue — what the visible page is a slice OF. Always populated.', 'number', true, 5, 130, true, 'queue'),
('matrx-user/crm-chasebox', 'draft_subject', 'Draft subject', 'Subject line of the draft currently open for review. Empty when no draft is open.', 'string', false, 120, 200, true, 'draft'),
('matrx-user/crm-chasebox', 'draft_body', 'Draft body', 'The exact rendered message awaiting approval, footer included. Empty when no draft is open.', 'string', false, 2500, 210, false, 'draft'),
('matrx-user/crm-chasebox', 'draft_personalization', 'Personalization evidence', 'The AI-written lines in the open draft, each with the fact it stands on and the source page that fact came from. Empty when the draft has none.', 'array', false, 1200, 220, true, 'draft'),
('matrx-user/crm-chasebox', 'draft_reply', 'Reply evidence', 'Present only when the open draft is a REPLY: what it sets out to do, the traced claims it stands on (each tagged with where it came from — what they wrote, the campaign, or their record), how the inbound message it answers was classified, and how many messages the conversation holds. Empty when the draft is a first touch.', 'object', false, 900, 225, true, 'draft'),
('matrx-user/crm-chasebox', 'draft_approved', 'Draft already approved', 'True when a human has already approved these exact bytes and only sending remains.', 'boolean', false, 5, 230, true, 'draft')
ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, auto_context = EXCLUDED.auto_context, group_key = EXCLUDED.group_key, updated_at = now();
