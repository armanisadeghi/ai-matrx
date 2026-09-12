-- spend_explorer_knobs — the five thresholds behind the "dig here" signals on
-- the platform spend dashboard (/administration/billing/spend).
--
-- WHY (Arman, 2026-09-12): "it's also not giving me the 'dig here' that is the
-- thing that shows us where to look for the bigger issues." Every signal needs
-- a line to be over, and where that line sits is an opinion — law 6 (opinions
-- become knobs) and `common-docs/policies/limits-are-knobs-agents-set-them.md`.
-- The client resolves these with organization overrides and passes them to
-- `public.admin_spend_breakdown`, which RAISES when one is missing. Nothing
-- guesses.
--
-- Starting values, and why (all measured on the ledger, 2026-09-10 → 09-12):
--   context_heavy_tokens = 200000
--       Average context per API call (input + cached tokens ÷ calls). Opus
--       calls in the two expensive days averaged ~133k tokens of context;
--       the conversations that cost $20–$96 each ran 250k–570k. 200k is where
--       "long session" becomes "every call re-reads a novel".
--   iteration_heavy = 10
--       Model calls inside ONE request. Ordinary agentic turns run 2–8; the
--       $3+ requests ran 10–16. Ten is where a request stops being a turn and
--       starts being a loop worth reading.
--   spike_multiplier = 3
--       An hour costing more than 3× the median non-zero hour of the window.
--       The 09-11 17:00 hour ran $27.50 against a median near $5; a runaway
--       job or a loop shows up here before anywhere else.
--   hog_share_pct = 5
--       One conversation taking ≥5% of the whole window on its own. In the
--       48h window one conversation took 38%; the line is low on purpose so
--       the list is a handful, never empty and never everything.
--   repeat_burst = 5
--       The same person + agent + feature firing ≥5 requests inside one
--       ten-minute bucket. A person typing does not do that; a loop or a
--       retry storm does.
--
-- All overridable by organization. Idempotent (ON CONFLICT DO UPDATE on the
-- metadata, never on `value`). Reversible: DELETE the five rows; the explorer
-- then refuses to compute signals and says why rather than guessing.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.spend_explorer', 'context_heavy_tokens',
  '200000'::jsonb, '200000'::jsonb, 'integer', 'tokens per call',
  1000, 10000000,
  'Spend explorer — context-heavy line',
  'A conversation whose average context per model call (input plus cached tokens divided by calls) is above this many tokens is listed under "dig here" as context-heavy. Every call re-sends the whole history, so cost grows with the square of the conversation length.',
  'agent',
  'Measured 2026-09-12: Opus calls on the two $100+ days averaged ~133k tokens of context; the $20–$96 conversations ran 250k–570k. 200k separates a long session from one that re-reads a novel on every call.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'platform.spend_explorer', 'iteration_heavy',
  '10'::jsonb, '10'::jsonb, 'integer', 'model calls per request',
  2, 1000,
  'Spend explorer — iteration-heavy line',
  'A single request that called the model at least this many times (tool loops) is listed under "dig here" as iteration-heavy.',
  'agent',
  'Measured 2026-09-12: ordinary agentic turns ran 2–8 model calls; the requests costing $3 or more ran 10–16. Ten is where a turn becomes a loop worth reading.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'platform.spend_explorer', 'spike_multiplier',
  '3'::jsonb, '3'::jsonb, 'number', '× median hour',
  1.5, 100,
  'Spend explorer — spike multiplier',
  'An hour that cost more than this many times the median non-zero hour of the selected window is listed under "dig here" as a spike.',
  'agent',
  'Measured 2026-09-12: the 09-11 17:00 hour ran $27.50 against a median near $5 in the 48h window. Three keeps ordinary busy hours out of the list and catches a loop or a runaway job.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'platform.spend_explorer', 'hog_share_pct',
  '5'::jsonb, '5'::jsonb, 'number', '% of window',
  0.5, 100,
  'Spend explorer — conversation hog share',
  'A single conversation that alone accounts for at least this percentage of the selected window''s spend is listed under "dig here" as a hog.',
  'agent',
  'Measured 2026-09-12: one conversation took 38% of a 48h window. Five percent keeps the list to a handful — never empty, never everything.',
  (current_date + 45),
  ARRAY['organization'], 'any'
),
(
  'platform.spend_explorer', 'repeat_burst',
  '5'::jsonb, '5'::jsonb, 'integer', 'requests per 10 minutes',
  2, 1000,
  'Spend explorer — repeat burst line',
  'The same person, agent and feature firing at least this many requests inside one ten-minute bucket is listed under "dig here" as a repeat burst — the loop and retry-storm signature.',
  'agent',
  'A person typing does not send five requests to the same agent in ten minutes; a loop or a retry storm does. Five is low enough to catch the first minutes of a runaway.',
  (current_date + 45),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  min_value          = EXCLUDED.min_value,
  max_value          = EXCLUDED.max_value,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  updated_at         = now();
