-- edu_image_grade_capability_seed.sql
--
-- Seed billing.capability + capability_limit for the education.image_grade
-- capability (vision grading of a PHOTOGRAPHED handwritten/typed worked answer —
-- features/education/assessment image grading path + the standalone Grade-My-Work
-- surface) so its PRE-ACTION entitlement meter renders (a null limit renders
-- nothing — the P8 lesson). Mirrors education.live_grade (the other heavy,
-- day-period AI grading path): a daily cap + a burst window. Permissive
-- (enforced=false) until Arman approves numbers + the aidream-side spend re-check
-- lands. Vision reads are compute-heavy, so the free tier sits a notch below
-- live_grade (20/day, 8/1h vs 30/day, 10/1h). Idempotent.

insert into billing.capability (capability, enforced, period, min_tier)
values ('education.image_grade', false, 'day', 'free')
on conflict (capability) do nothing;

insert into billing.capability_limit (capability, tier, limit_value, period)
values
  ('education.image_grade', 'free', 20, 'day'),
  ('education.image_grade', 'free', 8, 'rolling_1h')
on conflict (capability, tier, period) do nothing;
