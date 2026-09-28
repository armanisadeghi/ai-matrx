-- additive: yes
--   It ADDS one platform.feature_knob row, custom.data_home_default_kind, and nothing else.
-- lane: DATA-HOME-1
--
-- WHICH KIND THE DATA HOME OPENS ON IS A KNOB (Arman, 2026-09-27 21:40 PT). The data home lists
-- every table in the store — the person's own and the ones the app keeps (lists, scopes, booking
-- slots, checklists, workflows, kits …) — and a Kind filter beside All · Mine · My Orgs · Shared ·
-- Public narrows it. The platform default is "all" (every kind). The value is one of the store's
-- kind words (custom.data_home_tables().kind: table, list, scope, form, view, comment, dashboard,
-- action, checklist, booking, workflow, kit, store, demo, app) or "all"; a word no row carries
-- falls back to "all" on the page. Read by matrx-frontend features/unified-data/hub/dataHomeScope.ts.
--
-- Inverse: migrations/inverse/datahome1_c_the_data_home_default_kind_is_a_knob_down.sql. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'data_home_default_kind',
   '"all"'::jsonb, '"all"'::jsonb, 'string',
   'Which kind of table the data home shows first',
   'The data home lists every table you can open, including the ones the app keeps for itself '
   || '(the lists behind your dropdowns, scopes, booking slots, checklists, workflows). This picks '
   || 'the kind it opens on: "all" shows every kind; a kind word such as "table", "list" or "scope" '
   || 'opens on that kind. The Kind filter is always one click away; this only picks the first one.',
   'agent',
   'Lane DATA-HOME-1, 2026-09-27: Arman ruled the home shows every table in the store by default, '
   || 'including what the app made, with a Kind filter defaulting to all kinds.',
   array['organization','user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_default_kind'
       and default_value = '"all"'::jsonb and 'user' = any (overridable_by)
  ) then
    raise exception 'datahome1c: custom.data_home_default_kind did not land as a user-overridable knob defaulting to all';
  end if;
end $$;
