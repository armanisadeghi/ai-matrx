-- ops_agent_walks_production_cap_2026_09_26 — the cap on coding-agent browser
-- walks signed in against the LIVE database at once.
--
-- WHY (2026-09-26): the live database ran out of memory. 70% of its time that
-- day came from coding-agent browser walks: the ONE shared preview server
-- (`pnpm preview:start`, port 3001, one `<label>.localhost` host per agent
-- session) served 15–26 distinct hosts and 40–69 signed-in sessions per 30
-- minutes, every one of them admin@admin.com against production. Arman
-- approved the same day: "cap concurrent agent browser walks against
-- production, default 4, the rest on the clone".
--
-- The cap is a knob (Law 6), never a constant: the development-only gate in
-- `utils/supabase/walkCap.ts` (called from the proxy's session pass) reads both
-- rows with a 60 s cache. It exists ONLY in `next dev` against db.matrxserver.com
-- — a production build cannot evaluate it.
--
--   production_concurrent_cap = 4   Arman's number. 0 sends every walk to the
--                                   clone; 50 is effectively "no cap".
--   activity_window_minutes   = 10  A preview host counts as a live walk while
--                                   a signed-in request arrived from it within
--                                   this window. Ten minutes outlasts a slow
--                                   cold compile plus a pause to think, and
--                                   frees an abandoned walk's slot quickly.
--
-- Additive and idempotent: ON CONFLICT DO NOTHING, so re-applying never
-- overwrites a human's value. Reversible: DELETE the two rows; the gate then
-- screams in the dev-server log and fails OPEN (it never blocks on a missing
-- knob).
--
-- Ledger: public._schema_migrations (source 'matrx-frontend', written by the runner).

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction, propagation, public_read, ui
) VALUES
(
  'ops.agent_walks', 'production_concurrent_cap',
  '4'::jsonb, '4'::jsonb, 'integer', 'sessions',
  0, 50,
  'Agent browser walks allowed against the live database at once',
  'How many local preview hosts (one per coding-agent session, <label>.localhost:3001) may be signed in against the live database at the same time. The next one gets an honest refusal page that names the walks already running and tells the agent to use the clone preview (pnpm preview:start --clone) instead. Development servers only; production is never affected. 0 sends every walk to the clone.',
  'agent',
  'Arman, 2026-09-26: "cap concurrent agent browser walks against production, default 4, the rest on the clone". Measured that day: 15–26 preview hosts and 40–69 signed-in sessions per 30 minutes drove 70% of live database time until it ran out of memory.',
  (current_date + 45),
  '{}'::text[], 'any', 'next_load', false, '{}'::jsonb
),
(
  'ops.agent_walks', 'activity_window_minutes',
  '10'::jsonb, '10'::jsonb, 'integer', 'minutes',
  1, 240,
  'Agent browser walks: minutes of quiet before a walk stops counting',
  'A preview host counts toward the live-database walk cap while a signed-in request arrived from it within this many minutes. After that it is idle and its slot frees for the next agent.',
  'agent',
  'Ten minutes outlasts a slow cold route compile plus a pause to read the screen, and still frees an abandoned walk''s slot within one coffee. Chosen 2026-09-26 with the cap.',
  (current_date + 45),
  '{}'::text[], 'any', 'next_load', false, '{}'::jsonb
)
ON CONFLICT (feature, key) DO NOTHING;
