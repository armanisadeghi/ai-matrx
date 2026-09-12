-- User-initiated table pagination policy. Additive registry data only.
-- Defaults are provisional; organizations and users may select manual loading.
insert into platform.feature_knob
 (feature, key, value, default_value, value_type, unit, min_value, max_value,
  allowed_values, label, description, set_by, basis, review_due,
  overridable_by, override_direction)
values
 ('tables.pagination', 'mode', '"scroll"', '"scroll"', 'enum', null, null, null,
  '["scroll", "manual"]', 'Load the next table page',
  'Scroll loads one additional page after deliberate downward scrolling near the bottom. Manual requires Load more. Applies only to tables connected to a paginated source.',
  'agent', 'User requested automatic fetching only after physical scrolling. Manual remains available for preference, accessibility, and unscrollable lists.',
  current_date + 45, '{organization,user}', 'any'),
 ('tables.pagination', 'threshold_px', '96', '96', 'integer', 'pixels', 0, 400,
  null, 'Distance from the bottom to load more rows',
  'A new page may load when deliberate scrolling reaches this distance from the bottom. Existing rows remain visible while the page loads.',
  'agent', '96 pixels approximates two compact table rows, providing a small loading runway without prefetching distant pages.',
  current_date + 45, '{organization,user}', 'any'),
 ('tables.pagination', 'intent_timeout_ms', '1200', '1200', 'integer', 'milliseconds', 100, 3000,
  null, 'Scroll gesture recognition window',
  'How long a wheel, touch, keyboard, or scrollbar gesture may authorize the following downward scroll. Each successful request consumes that gesture.',
  'agent', '1200 milliseconds allows touch momentum while bounding how long unrelated programmatic scrolling could follow the input.',
  current_date + 45, '{organization,user}', 'any')
on conflict (feature, key) do nothing;
