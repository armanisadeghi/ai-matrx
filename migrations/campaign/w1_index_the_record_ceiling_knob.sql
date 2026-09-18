-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- W1-INDEX — REC-N-5's RECORD CEILING, AS A KNOB ROW (check C-5). ONE HALF OF TWO.
--
-- The campaign's judgement bounds a `-- seeds-guards: yes` file to the knob register itself
-- (JUDGMENT.md, `seeds-guards-out-of-bounds`) and refuses a file that carries both that header
-- and `-- guard:`. So the ceiling arrives as two files that are meaningless apart, and each
-- says so: THIS one seeds the row, and `w1_index_the_record_ceiling_is_a_knob.sql` creates the
-- two functions that read it. Applied in that order; the readers fall back to the published
-- platform number if this row is ever missing, so neither half can leave a screen broken.
--
-- WHY A KNOB AT ALL. `w1_index_the_promotion_layer.sql` published REC-N-5's two ceilings as
-- functions returning literals. That is publication, and it is half the law: a ceiling no
-- organization can move is a number an agent chose for every customer on earth. A behavioural
-- choice is an organization-settable knob with a sensible default — so the record ceiling
-- becomes exactly what `custom/containment_depth_ceiling` already is.
--
-- THE INVERSE: `migrations/inverse/w1_index_the_record_ceiling_knob_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'table_record_ceiling', '150000'::jsonb, '150000'::jsonb, 'integer', 1, 1000000,
   'Records per Table',
   'REC-N-5: how many records one custom Table holds before the product says it is full. '
   'The platform default is 150,000 — Airtable''s Business plan publishes 125,000 per base '
   'and our own measured unindexed-sort ceiling is about 160,000 rows — and an organization '
   'may set its own, up to the platform maximum of 1,000,000. It is PUBLISHED rather than '
   'discovered in production: custom.table_capacity(organization, table) answers how full a '
   'Table is and names this knob when it is over.',
   'agent', 'Unified data campaign, 2026-09-17: REC-N-5''s ceiling is an opinion, so it is a '
   'knob with a default rather than a number an agent chose for every organization.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
