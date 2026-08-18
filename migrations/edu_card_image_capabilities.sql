-- edu_card_image_capabilities.sql
--
-- Flashcard images (common-docs/systems/flashcard-images/VISION_AND_PLAN.md):
-- the two metered image lanes, structural from day one per Arman's ruling
-- 2026-08-18 — every tier has a limit row; the NUMBERS are an admin-panel
-- decision (billing plan UI), never code. enforced:false until Arman flips it;
-- usage is recorded either way so the meters are honest on flip day.
--
--   education.card_image_source   — agent web-sources an expert image (search
--                                   + vision judgment; cents per card).
--   education.card_image_generate — verified generation (describe → generate →
--                                   adversarial judge + retries; 5-20¢/image).
--
-- Server enforcement: aidream/services/education/card_images.py checks BEFORE
-- any spend and pre-flight-trims batches to the remaining allowance. FE twin:
-- features/entitlements/registry.ts.
--
-- Additive + idempotent.

insert into billing.capability (capability, enforced, period, min_tier)
values
  ('education.card_image_source', false, 'month', 'free'),
  ('education.card_image_generate', false, 'month', 'free')
on conflict (capability) do nothing;

insert into billing.capability_limit (capability, tier, limit_value, period)
values
  ('education.card_image_source', 'free', 50, 'month'),
  ('education.card_image_source', 'free', 15, 'rolling_5h'),
  ('education.card_image_generate', 'free', 10, 'month'),
  ('education.card_image_generate', 'free', 5, 'rolling_5h')
on conflict (capability, tier, period) do update
  set limit_value = excluded.limit_value;
