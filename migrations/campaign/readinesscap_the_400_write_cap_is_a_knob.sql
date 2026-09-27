-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- READINESS-CAP — the 400-writes-per-organization readiness ceiling, as a knob row.
--
-- `platform.cutover_copy_differences(uuid)` judges at most 400 recent writes per organization
-- (newest first per table, since MOVER-SUITE-GREEN) before it can tell the switch "No copy
-- refuses a write its older table takes". That 400 is a behavioural choice the platform makes
-- for every organization on earth — the campaign's rule is that a behavioural choice is an
-- organization-settable knob with a sensible default, not a literal buried in a function body.
--
-- This file only SEEDS the row; `readinesscap_the_check_says_when_it_hit_the_cap.sql` is the
-- half that reads it and, when the cap is hit, makes the check say so. The reader falls back to
-- 400 when this row is ever missing, so applying either half alone leaves nothing broken.
--
-- THE INVERSE: `migrations/inverse/readinesscap_the_400_write_cap_is_a_knob_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('cutover', 'readiness_writes_cap', '400'::jsonb, '400'::jsonb, 'integer', 1, 50000,
   'Readiness writes checked per organization',
   'How many of an organization''s newest older-table writes (across all its tables, newest '
   'first per table) the Data tables switch readiness check judges against the copy before it '
   'answers whether the copy would refuse any of them. The platform default is 400. Judging '
   'every write on an organization with a very active history is a cost the readiness screen '
   'pays on every look; an organization may raise its own ceiling up to the platform maximum '
   'of 50,000. When the cap is hit, the check names exactly how many of how many writes it '
   'checked instead of staying silent about the writes it never looked at.',
   'agent', 'READINESS-CAP, 2026-09-26: the 400 writes-per-organization cap is an opinion, so '
   'it is a knob with a default rather than a number an agent chose for every organization, '
   'and the check must say when the cap left writes unjudged rather than calling itself met '
   'without saying so.',
   '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;
