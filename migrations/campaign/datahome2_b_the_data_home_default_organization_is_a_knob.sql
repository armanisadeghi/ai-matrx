-- additive: yes
--   It ADDS one platform.feature_knob row, custom.data_home_default_organization, and nothing else.
-- lane: DATA-HOME-2
--
-- WHICH ORGANIZATION THE DATA HOME OPENS ON, FOR A PERSON WHO HAS NEVER PICKED ONE, IS A KNOB
-- (Arman, 2026-09-28 ~14:00 PT). The bar ends in an organization dropdown that starts on "All Orgs";
-- a person's own pick is saved to their account (matrx-frontend userPreferences.lists
-- .dataHomeOrganizationId, synced per person, never per organization) and wins over this. The
-- platform default is "all". It is a PLATFORM value only (overridable_by empty) on purpose: an
-- organization or user rung is keyed by the ACTIVE organization, and the ruling is that switching
-- the active organization never silently changes this filter. Read by matrx-frontend
-- features/unified-data/hub/dataHomeScope.ts (resolveDataHomeOrganization).
--
-- Inverse: migrations/inverse/datahome2_b_the_data_home_default_organization_is_a_knob_down.sql. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('custom', 'data_home_default_organization',
   '"all"'::jsonb, '"all"'::jsonb, 'string',
   'Which organization the data home shows first',
   'The data home lists tables from every organization you belong to, and its organization dropdown '
   || 'narrows the list to one. This is where it opens for a person who has never picked one: "all" '
   || 'shows every organization. Once a person picks an organization, the home remembers their pick '
   || 'on their account and opens there next time.',
   'agent',
   'Lane DATA-HOME-2, 2026-09-28: Arman ruled the organization dropdown starts on All Orgs, is '
   || 'honoured in every lane, and a person''s pick is remembered for their next visit.',
   array[]::text[],
   'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature'))
on conflict (feature, key) do nothing;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'custom' and key = 'data_home_default_organization'
       and default_value = '"all"'::jsonb
  ) then
    raise exception 'datahome2b: custom.data_home_default_organization did not land defaulting to all';
  end if;
end $$;
