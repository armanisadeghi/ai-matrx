-- spend_fixed_costs_knob — the one number the spend dashboard cannot measure.
--
-- WHY (Arman, 2026-09-12): the dashboard names hosting (AWS ECS/Fargate,
-- sandbox EC2, Supabase, Vercel) and plan-billed services (Resend) as
-- "unmeasured" — money that is billed by invoice, never by row, so no ledger
-- can ever hold it. Listing it as a gap forever is not honesty, it is a
-- shrug. The honest answer is one org-adjustable number: what those invoices
-- come to per month, entered by the person who pays them, shown on the page
-- as a per-day figure BESIDE the measured spend and never added into it.
--
-- Starting value 0 on purpose: nobody on the platform knows the invoices but
-- Arman, and a guessed number would read as measured. Zero renders as
-- "not entered yet" with the remedy, never as "$0.00 of fixed costs".
-- Overridable by organization (another org's hosting is not ours).
-- Idempotent (ON CONFLICT DO UPDATE on metadata, never on value). Reversible:
-- DELETE the row; the dashboard then says the knob is missing.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES (
  'platform.spend', 'fixed_monthly_usd',
  '0'::jsonb, '0'::jsonb, 'number', 'USD per month',
  0, 10000000,
  'Spend dashboard — fixed monthly costs',
  'What the invoice-billed services come to per month: hosting (AWS, Supabase, Vercel, sandbox machines) and plan-billed services such as email. Shown on the spend dashboard as a per-day figure beside the measured AI spend; never added into it. 0 means "not entered yet" and the page says so.',
  'agent',
  'Arman 2026-09-12: a cost the page cannot measure must still be on the page, honestly. Starts at 0 because only the person who pays the invoices knows the number; a guess would read as measured.',
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
