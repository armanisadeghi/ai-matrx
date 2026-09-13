-- Explicit manual pagination is an approved exception, not a silent preference.
-- Existing mode/threshold/intent rows and their authorization ladder remain unchanged.
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, ui,
   taxonomy_node_id, propagation)
select
  'tables.pagination', 'reason', '""'::jsonb, '""'::jsonb, 'string',
  'Reason automatic loading is disabled',
  'Required when Load more replaces automatic page loading. Explain the source, accessibility, or operational boundary.',
  'agent',
  'Manual table pagination is an exception and must record its reason and approving owner.',
  current_date + 45, '{organization,user}'::text[], 'any',
  jsonb_build_object('group', 'Automatic loading exception', 'order', 4, 'control', 'textarea',
    'help', 'Required only when manual loading is selected. Explain why automatic page loading is not safe or appropriate.'),
  (select id from platform.taxonomy_node where id = (
    select taxonomy_node_id from platform.feature_knob
    where feature = 'tables.pagination' and key = 'mode'
  )),
  'next_load'
union all
select
  'tables.pagination', 'approved_by', '""'::jsonb, '""'::jsonb, 'string',
  'Approving owner',
  'Required when Load more replaces automatic page loading. Name the owner who approved the exception.',
  'agent',
  'Manual table pagination is an exception and must record its reason and approving owner.',
  current_date + 45, '{organization,user}'::text[], 'any',
  jsonb_build_object('group', 'Automatic loading exception', 'order', 5, 'control', 'text',
    'help', 'Required only when manual loading is selected. Name the owner who approved the exception.'),
  (select id from platform.taxonomy_node where id = (
    select taxonomy_node_id from platform.feature_knob
    where feature = 'tables.pagination' and key = 'mode'
  )),
  'next_load'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      overridable_by = excluded.overridable_by,
      override_direction = excluded.override_direction,
      ui = excluded.ui,
      taxonomy_node_id = excluded.taxonomy_node_id,
      propagation = excluded.propagation,
      updated_at = now();
