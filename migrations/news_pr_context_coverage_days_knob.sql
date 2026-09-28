-- news.pr_context_coverage_days — how far back the PR Director's brand context reads real feature coverage.
--
-- aidream/services/news/pr_brand_context.py reads it per brand (organization → brand) and falls back to
-- 90 days, announced in the body's notes, when the row is missing. Brief:
-- common-docs/projects/outside-skill-packs/BRIEFS-STRATEGY-AND-ORG-CHART.md §2 Inputs ("the last 90 days").
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction)
values
  ('news', 'pr_context_coverage_days', '90'::jsonb, '90'::jsonb, 'integer', 'days', 7, 365, null,
   'PR director coverage window',
   'How many days of the brand''s real feature coverage the PR director reads before advising.',
   'agent', 'Agent-set limit (blind approval). Set by the PR Director lane (Claude) on 2026-09-27. Basis: BRIEFS-STRATEGY-AND-ORG-CHART §2 Inputs, "the last 90 days of real_feature coverage". Arman approved this class of decision in advance (2026-08-20) and has NOT reviewed this number. Review due 2026-12-01.',
   date '2026-12-01', array['organization', 'brand']::text[], 'any')
on conflict (feature, key) do nothing;
