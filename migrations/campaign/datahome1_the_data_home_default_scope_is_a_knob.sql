-- additive: yes
--   It ADDS one platform.feature_knob row, custom.data_home_default_scope, and nothing else.
-- lane: DATA-HOME-1
--
-- WHICH FILTER THE DATA HOME OPENS ON IS A KNOB, NOT A CONSTANT (Arman, 2026-09-27 21:20 PT).
-- /data-v2 offers All · Mine · My Orgs · Shared · Public. The platform default is All —
-- everything the person can see across every organization they belong to (the owner's doctrine
-- "access is personal"). An organization may open its people on another filter, and a person on
-- their own. Read by matrx-frontend features/unified-data/hub/dataHomeScope.ts through
-- useEffectiveKnob.
--
-- Inverse: migrations/inverse/datahome1_the_data_home_default_scope_is_a_knob_down.sql. Idempotent.


insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'data_home_default_scope',
   '"all"'::jsonb, '"all"'::jsonb, 'enum',
   '["all", "mine", "orgs", "shared", "public"]'::jsonb,
   'What the data home shows first',
   'Which filter the data home (the list of every table, form and booking page) opens on. '
   || '"All" is everything you can see in every organization you belong to, each labelled with its '
   || 'organization. "Mine" is what you made. "My Orgs" is what belongs to organizations you are in. '
   || '"Shared" is what somebody shared with you. "Public" is what is open to anyone with its link. '
   || 'The filters are always one click away; this only picks the first one.',
   'agent',
   'Lane DATA-HOME-1, 2026-09-27: Arman ruled the default is everything across all of a person''s '
   || 'organizations (he met "Mine 0 of everything" because the home opened on one organization).',
   array['organization','user']::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_default_scope'
       and default_value = '"all"'::jsonb and 'user' = any (overridable_by)
  ) then
    raise exception 'datahome1: custom.data_home_default_scope did not land as a user-overridable knob defaulting to all';
  end if;
end $$;
