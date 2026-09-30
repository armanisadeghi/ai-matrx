-- chair-step: lane DRILL-ADOPT (program DRILL-FINISH; VERIFY-DRILL-WAVE2 W2-5 b) — THE AUTO-GRAIN LINES ARE SETTINGS. It SEEDS three feature knobs, drill.auto_grain.hour_max_days (2), day_max_days (90) and week_max_days (366): the window lengths up to which a drill screen reads a time group by hour, by day and by week (longer: by month). They were constants in the explorer (grain.ts) and in the design system (drillAutoGrain). No table, function, grant or row of anybody's data is touched; only three rows are added to platform.feature_knob.
-- lane: DRILL-ADOPT
-- lock: platform
--
-- The explorer (matrx-frontend components/official/drill-explorer/useDrillKnobs.ts + grain.ts) reads
-- them; while they are not on a database it says so on screen and uses the package's own lines (the
-- same values). Defaults are the package's (@ai-matrx/design-system drillAutoGrain: 2 / 90 / 366 days),
-- so applying this file changes no screen until an organization moves a line.
-- Proof: scripts/campaign-tests/drilladopt_green.sql (clone). Inverse:
-- migrations/inverse/drilladopt_the_auto_grain_lines_are_settings_down.sql.


insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('drill.auto_grain', 'hour_max_days', '2'::jsonb, '2'::jsonb, 'number', 'days', 0, 31,
   'Drill time reads by hour up to this many days',
   'A drill screen whose time group has no grain chosen reads it by hour while the window is this many days long or shorter (a day or two of AI spend reads best hour by hour).',
   'agent', 'VERIFY-DRILL-WAVE2 W2-5: the design system''s drillAutoGrain line (two days), made a setting so an organization can move it.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill.auto_grain', 'day_max_days', '90'::jsonb, '90'::jsonb, 'number', 'days', 1, 400,
   'Drill time reads by day up to this many days',
   'Past the hour line, a drill screen reads time by day while the window is this many days long or shorter (a quarter reads best day by day).',
   'agent', 'VERIFY-DRILL-WAVE2 W2-5: the Spend Explorer''s and drillAutoGrain''s 90 days.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill.auto_grain', 'week_max_days', '366'::jsonb, '366'::jsonb, 'number', 'days', 7, 3660,
   'Drill time reads by week up to this many days',
   'Past the day line, a drill screen reads time by week while the window is this many days long or shorter; a longer window reads by month.',
   'agent', 'VERIFY-DRILL-WAVE2 W2-5: drillAutoGrain''s one year (a leap year included).',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
