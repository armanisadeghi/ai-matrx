-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- READINESS-CAP — the bag census's exact-count ceiling, as a knob row.
--
-- aidream packages/matrx-records/matrx_records/movers/bags.py ran an exact `count(*)` over
-- every jsonb bag column its census found, including `seo.search_performance_daily.custom_fields`
-- on a 17.7-million-row, 14 GB table — a full scan that timed out `test_the_bag_census_skips_partitions`
-- and its `[bags]` case in packages/matrx-records/tests/test_movers_against_the_main_database.py.
-- The census now uses `pg_class.reltuples`'s estimate, labelled "≈ estimated", for any table over
-- this row ceiling, and only counts exactly at or under it. The platform default is 1,000,000.
--
-- This file only SEEDS the row; the reader (`BagMover._exact_count_max_rows` in bags.py) falls
-- back to 1,000,000 when it is ever missing, so applying this file is never load-bearing for
-- correctness, only for letting the number be raised without a code change.
--
-- THE INVERSE: `migrations/inverse/readinesscap_the_bag_census_row_ceiling_is_a_knob_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('census', 'exact_count_max_rows', '1000000'::jsonb, '1000000'::jsonb, 'integer', 1000, 100000000,
   'Bag census exact-count ceiling',
   'How many rows a table may hold before the switch-over bag census stops running an exact '
   '`count(*)` over its jsonb bag columns and reports pg_class.reltuples''s estimate instead, '
   'labelled "≈ estimated". The platform default is 1,000,000 — an exact scan above that is a '
   'data-engineering-scale query the census has no business paying for on every plan.',
   'agent', 'READINESS-CAP, 2026-09-26: found by test_the_bag_census_skips_partitions timing '
   'out on seo.search_performance_daily (17.7 million rows) — a behavioural ceiling like this '
   'one is a knob with a default, not a literal buried in the mover.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
