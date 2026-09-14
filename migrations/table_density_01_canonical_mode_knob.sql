-- Canonical table-density policy. This is deliberately a scoped feature knob,
-- never a userPreferences JSONB field: organizations set the default and a
-- person may choose a denser or roomier table presentation for themselves.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select
  'tables.density', 'mode', '"normal"'::jsonb, '"normal"'::jsonb, 'enum',
  '["condensed", "normal", "spacious"]'::jsonb, 'Table density',
  'Controls the spacing of shared data tables. Normal is the standard presentation; condensed fits more rows and spacious provides larger controls and rows.',
  'agent',
  'Normal matches the 36px reference controls while retaining the approved 8px table region spacing. Condensed reduces visual control and row sizes; spacious increases them.',
  current_date + 45, '{organization,user}'::text[], 'any',
  jsonb_build_object(
    'group', 'Table presentation',
    'order', 1,
    'control', 'segmented',
    'help', 'Choose how compact shared data tables appear. Your organization may set a default; your choice applies only to you in this organization.'
  ),
  (select taxonomy_node_id from platform.feature_knob
   where feature = 'tables.pagination' and key = 'mode'),
  'instant'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      allowed_values = excluded.allowed_values,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      overridable_by = excluded.overridable_by,
      override_direction = excluded.override_direction,
      ui = excluded.ui,
      taxonomy_node_id = excluded.taxonomy_node_id,
      propagation = excluded.propagation,
      updated_at = now();
