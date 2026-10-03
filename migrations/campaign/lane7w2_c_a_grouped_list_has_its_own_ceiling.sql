-- chair-step: this file adds ONE platform knob row (lists/group_rows_ceiling) — an INSERT, no DDL,
-- no lock beyond the row, no grant. Its inverse deletes that row.
--
-- LANE 7 · W2 ROUND 3 — A GROUPED LIST HAS ITS OWN CEILING.
--
-- While a standard list (CRM people, deals) is grouped by a custom field, it reads its WHOLE result
-- as one page, so the groups and their counts are the whole result's. That read used the export
-- ceiling (custom/export_rows_ceiling, 100,000) — an export streams to a file; a grouped table
-- renders every row (the table is not virtualized). Measured on the clone 2026-10-03 (verifier W2-3):
-- 465 rows grouped took 1.2–2.2 s to headers; a 1,000-row read alone took 1.6 s. So the grouped view
-- gets its own ceiling, 500 rows, about the size that renders under ~2 s; past it the list says
-- "Grouped over the first N of M records" on screen. Organization-overridable like the export knob.
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction)
VALUES
  ('lists', 'group_rows_ceiling', '500'::jsonb, '500'::jsonb, 'integer', 'rows', 1, 100000,
   'Most rows a grouped list reads',
   'A list grouped by a column reads its whole result as one page so its groups and counts are the whole result''s; this is the most rows it reads before it says it grouped only the first ones.',
   'agent',
   'Lane 7 W2 round 3, 2026-10-03: 465 grouped rows rendered in 1.2-2.2 s on the clone (unvirtualized table); 500 keeps a grouped view near 2 s.',
   '2026-11-03', ARRAY['organization'], 'any');
