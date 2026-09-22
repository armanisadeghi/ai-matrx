-- agents_model_prefs_decision_default_model_knob — WRITE DOWN the knob the
-- decision surface already reads.
--
-- WHY. `agents.model_prefs.decision_default_model` is read by
-- `features/ai-models/preferredDecisionModel.ts` (`resolveSessionKnob`) and
-- shown on the Settings first screen beside its two sibling knobs
-- (`chat_default_model`, `agent_authoring_default_model`, both seeded by
-- aidream's 0633). The row was created directly through the Supabase MCP on
-- 2026-09-20 and therefore existed LIVE while being declared NOWHERE — so
-- `lib/scoped-config/__tests__/every-knob-read-addresses-a-real-row.test.ts`,
-- which resolves every client read against the pairs the two repos' seeds
-- declare, named this call site as addressing a row that does not exist. The
-- census was right about the file evidence: a row nobody wrote down cannot be
-- rebuilt on a fresh database, and the sibling knobs can.
--
-- This declares the row exactly as it lives (read back from
-- `platform.feature_knob` before writing), so a rebuilt database answers the
-- same knob_resolve('agents.model_prefs','decision_default_model') the live one
-- does instead of raising P0001 "is not seeded".
--
-- ON CONFLICT DO NOTHING on purpose: the live row carries a VALUE an
-- organization or a person may already have moved off the initial model, and a
-- declaration file is never allowed to reach in and reset it.
--
-- Reversible: DELETE the row; the decision surface then falls back to the
-- catalog's first decision model and says so.
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type,
  label, description, set_by, basis, review_due,
  taxonomy_node_id, overridable_by, override_direction, ui, propagation,
  public_read
) VALUES (
  'agents.model_prefs', 'decision_default_model',
  '"9397a801-5b41-4d23-b615-e90897278fe9"'::jsonb,
  '"9397a801-5b41-4d23-b615-e90897278fe9"'::jsonb,
  'string',
  'Default decision model',
  'The decision model (typed Choice / Score / Yes-No answers) that loads when you have not picked one. Null = the catalog''s primary decision model.',
  'agent',
  'Arman 2026-09-20: the decision surface loads a default model from the system knobs, never hard-coded; only one decision model exists today (Jev 1.13) so it is the initial value.',
  '2026-12-20'::date,
  '0167cccf-9e3b-439c-bb2d-b1c39bf4fc29'::uuid,
  ARRAY['organization', 'user'], 'any',
  '{"help": "Pick the decision model you want by default. Your organization can set one for everyone; yours wins for you.", "group": "AI", "order": 4, "control": "model"}'::jsonb,
  'next_load',
  false
)
ON CONFLICT (feature, key) DO NOTHING;
