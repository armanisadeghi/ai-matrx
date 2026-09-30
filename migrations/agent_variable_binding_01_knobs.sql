-- Custom-data variable bindings ("Fill automatically → From my data"): the two
-- numbers the editor used to hard-code become feature knobs. Additive registry
-- data only. Organizations and people may override both.
insert into platform.feature_knob
 (feature, key, value, default_value, value_type, unit, min_value, max_value,
  allowed_values, label, description, set_by, basis, review_due,
  overridable_by, override_direction)
values
 ('agents.variable_binding', 'default_row_limit', '40', '40', 'integer', 'rows', 1, 500,
  null, 'Default rows per bound table',
  'How many rows a variable bound to a whole table sends the agent until the author changes it.',
  'agent', '40 rows of one-line summaries fits comfortably in a prompt while covering typical reference tables (model picks, price lists, rosters).',
  current_date + 45, '{organization,user}', 'any'),
 ('agents.variable_binding', 'record_picker_page', '200', '200', 'integer', 'records', 20, 1000,
  null, 'Records listed per page when picking one',
  'How many records the record picker reads at a time; Load more reads the next page.',
  'agent', '200 names keep the picker list instant to read and search while most tables fit in one page.',
  current_date + 45, '{organization,user}', 'any')
on conflict (feature, key) do nothing;
