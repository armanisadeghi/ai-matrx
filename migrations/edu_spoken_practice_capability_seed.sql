-- edu_spoken_practice_capability_seed.sql
--
-- Seed billing.capability + capability_limit for the education.spoken_practice
-- capability (oral exam / interview / debate practice — features/education/spoken-practice)
-- so its PRE-ACTION entitlement meter renders (a null limit renders nothing — the P8 lesson).
-- Mirrors education.memory_generate; permissive (enforced=false) until Arman approves numbers +
-- the aidream-side spend re-check lands. Spoken-practice sessions are heavier (long AI-examiner
-- turns + per-answer grading), so the free tier is a notch below memory (10/mo, 3/5h vs 15/5).
-- Idempotent.

insert into billing.capability (capability, enforced, period, min_tier)
values ('education.spoken_practice', false, 'month', 'free')
on conflict (capability) do nothing;

insert into billing.capability_limit (capability, tier, limit_value, period)
values
  ('education.spoken_practice', 'free', 10, 'month'),
  ('education.spoken_practice', 'free', 3, 'rolling_5h')
on conflict (capability, tier, period) do nothing;
