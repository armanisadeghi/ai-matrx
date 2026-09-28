-- additive: yes
--   It ADDS one platform.feature_knob row, custom.data_home_default_order, and nothing else.
-- lane: DATA-HOME-1
--
-- HOW THE DATA HOME ORDERS WHAT IT LISTS IS A KNOB (chair ruling 2026-09-27, after the home listed
-- 444 tables flat). "updated" = most recently changed first (the platform default); "name" = A to Z.
-- Under All, when the list spans more than one organization, rows are grouped under organization
-- headers, the organization with the latest change first. Read by matrx-frontend
-- features/unified-data/hub/dataHomeScope.ts through useEffectiveKnob.
--
-- Inverse: migrations/inverse/datahome1_d_the_data_home_default_order_is_a_knob_down.sql. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'data_home_default_order',
   '"updated"'::jsonb, '"updated"'::jsonb, 'enum',
   '["updated", "name"]'::jsonb,
   'How the data home orders its lists',
   'The order the data home lists tables, forms and pages in. "Most recently updated" puts what '
   || 'changed last at the top; "Name" lists them A to Z. When the list spans several organizations '
   || 'it is grouped under each organization either way.',
   'agent',
   'Lane DATA-HOME-1, 2026-09-27: the chair ruled a 444-row flat list unacceptable; most recently '
   || 'updated first is what Notion, Airtable and Google Drive open on.',
   array['organization','user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_default_order'
       and default_value = '"updated"'::jsonb and 'user' = any (overridable_by)
  ) then
    raise exception 'datahome1d: custom.data_home_default_order did not land as a user-overridable knob defaulting to updated';
  end if;
end $$;
