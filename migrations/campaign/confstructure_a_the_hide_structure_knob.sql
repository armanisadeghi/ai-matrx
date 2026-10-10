-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- lane: CONF-STRUCTURE
--
-- access/confidential_hides_structure: a person who may KNOW a Confidential (or Private) table but cannot
-- read any of its rows is told its name, kind, owner and organization only - no field list, keys or
-- column definitions. Default true; an organization may turn it off for itself. Chair ruling 2026-10-09.
-- Inverse: migrations/inverse/confstructure_a_the_hide_structure_knob_down.sql

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('access', 'confidential_hides_structure',
   'true'::jsonb, 'true'::jsonb, 'boolean', null,
   'Hide columns of Confidential tables',
   'A person who may know a Confidential table but cannot read any of its rows sees its name only, not its columns.',
   'agent',
   'Lane CONF-STRUCTURE, 2026-10-09: chair ruling. On an HR or medical table a column name is itself sensitive; the ladder lets a person know a table, not its columns. Defaults lean safe here because the person sees nothing less than the table itself.',
   array['organization']::text[],
   'any', 'next_load',
   (select id from platform.taxonomy_node where slug = 'access' and level = 'feature'))
on conflict (feature, key) do nothing;
