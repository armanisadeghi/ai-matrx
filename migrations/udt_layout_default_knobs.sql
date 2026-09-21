-- ============================================================================
-- udt_layout_default_knobs — table layout defaults are an organization's call
-- ============================================================================
-- Until now the /data grid hardcoded three pieces of taste: "share the width up
-- to EIGHT columns, then natural widths + sideways scroll", "normal" row
-- height, and "automatic" layout. Per the settings law (opinions become knobs)
-- they are registered here with the old literals as defaults, so nothing
-- changes until an organization decides otherwise. A person's per-view Layout
-- choice (URL / saved view) still overrides all three.
-- Additive: INSERT ... ON CONFLICT only.
-- ============================================================================

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, allowed_values, bound_value,
   overridable_by, override_direction, propagation, taxonomy_node_id,
   label, description, set_by, basis, review_due)
VALUES
  ('extensibility', 'user_tables.default_layout',
   '"auto"', '"auto"', 'enum', NULL,
   NULL, NULL, '["auto","fit","scroll"]'::jsonb, NULL,
   ARRAY['organization']::text[], 'any', 'next_load',
   'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93',
   'How data tables use the screen width by default',
   'Automatic shares the width evenly while a table has few columns and switches to natural column widths with a sideways scroll once it has many. "fit" always shares the width; "scroll" always uses natural widths. Each person can still choose differently for their own view from the Layout menu, and save that with a view.',
   'agent',
   'Arman 2026-09-20: "we do some things by default but allow the user to override it." Replaces the hardcoded behaviour in UserTableViewer.',
   date '2026-12-20'),
  ('extensibility', 'user_tables.fit_max_columns',
   '8', '8', 'integer', 'columns',
   2, 30, NULL, NULL,
   ARRAY['organization']::text[], 'any', 'next_load',
   'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93',
   'How many columns still share the width under Automatic layout',
   'Under Automatic layout a data table shares the screen width evenly up to this many visible columns; past it, every column keeps its natural width and the table scrolls sideways. Eight 150-pixel columns fill a 1280-pixel screen, which is where the default comes from. Raise it for wide monitors, lower it for laptops.',
   'agent',
   'The FIXED_LAYOUT_MAX_COLUMNS = 8 literal in UserTableViewer (2026-09-14), made configurable 2026-09-21.',
   date '2026-12-20'),
  ('extensibility', 'user_tables.default_row_height',
   '"normal"', '"normal"', 'enum', NULL,
   NULL, NULL, '["compact","normal","tall"]'::jsonb, NULL,
   ARRAY['organization']::text[], 'any', 'next_load',
   'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93',
   'Default row height in data tables',
   'Compact fits the most rows on screen, tall gives each row room to breathe. Each person can still choose differently for their own view from the Layout menu.',
   'agent',
   'Arman 2026-09-20: layout defaults with a per-user override.',
   date '2026-12-20')
ON CONFLICT (feature, key) DO NOTHING;
