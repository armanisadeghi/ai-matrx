-- additive: yes
--   It ADDS two platform.feature_knob rows, custom.data_home_shell and custom.data_home_default_view,
--   and nothing else.
-- lane: DATA-HOME-3A
--
-- THE REBUILT DATA HOME IS BEHIND A KNOB (Arman, 2026-10-01: "no redirects until validated; copy
-- mode, old + new side by side, one flip later"). custom.data_home_shell decides which data home
-- /data-v2 shows: false (the platform default tonight) = the old hub, unchanged; true = the data
-- home on the canonical list shell (EntityListPage + MatrxDataTable). A person may turn it on for
-- themselves to compare; the platform flip is one press. custom.data_home_default_view is the view
-- a person who never picked one opens on (DATA-HOME-3-SPEC §2.1): table (default) or cards.
-- Read by matrx-frontend features/unified-data/home/dataHomeKnobs.ts through useEffectiveKnob.
--
-- Inverse: migrations/inverse/datahome3_lane_a_the_data_home_shell_is_a_knob_down.sql. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'data_home_shell',
   'false'::jsonb, 'false'::jsonb, 'boolean', null,
   'The new data home',
   'Whether the data home (the list of every table, form and page you can open) shows the new '
   || 'searchable table view. Off shows the current page.',
   'agent',
   'Lane DATA-HOME-3A, 2026-10-01: Arman ruled copy mode — the old and new data homes side by side '
   || 'until he validates the new one, then one flip.',
   array['user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature')),
  ('custom', 'data_home_default_view',
   '"table"'::jsonb, '"table"'::jsonb, 'enum',
   '["table", "cards"]'::jsonb,
   'How the data home shows its list first',
   'Table (rows and columns) or cards, for a person who has not picked one. The view toggle is '
   || 'always one click away; this only picks the first one.',
   'agent',
   'DATA-HOME-3-SPEC §2.1 (2026-10-01): table is the champion default (Airtable, Notion, Supabase '
   || 'Studio); cards stay one click away.',
   array['organization','user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_shell' and default_value = 'false'::jsonb
  ) or not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_default_view' and default_value = '"table"'::jsonb
  ) then
    raise exception 'datahome3 lane a: the two data home knobs did not land with their defaults';
  end if;
end $$;
