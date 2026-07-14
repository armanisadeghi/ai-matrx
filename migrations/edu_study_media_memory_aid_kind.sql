-- edu_study_media_memory_aid_kind.sql
--
-- Education Hub Memory Tools (VISION §11 — Mnemonics, Analogies & Associations).
-- The generated memory-aid artifact is a first-class study-media artifact: it
-- already carries trust + visibility + versioning + source lineage on
-- education.study_media (exactly like the mind_map + summary kinds). Widen the
-- media_kind CHECK to admit 'memory_aid'. Its structured content (mnemonics /
-- analogies / memory palace) rides the existing `ir_envelope` jsonb column, and
-- generation config rides `config` — no new columns, no new table.
--
-- Also seeds the billing.capability_limit rows for the metered generation
-- capability education.memory_generate (mirrors mindmap: 15/month + 5/rolling_5h,
-- free tier). enforced:false in the registry until the FYI-with-veto pass, but
-- the limits are visible in-product ahead of any cap (TRUST mandate).
--
-- Additive + idempotent: existing rows/kinds are unaffected.

alter table education.study_media
  drop constraint if exists study_media_media_kind_check;

alter table education.study_media
  add constraint study_media_media_kind_check
  check (media_kind = any (array['audio'::text, 'mind_map'::text, 'summary'::text, 'memory_aid'::text]));

-- Parent capability row (billing.capability) must exist before its limit rows
-- (capability_limit.capability → capability.capability FK). enforced:false keeps
-- the permissive verdict until the numbers get their FYI-with-veto pass.
insert into billing.capability (capability, enforced, period, min_tier)
values ('education.memory_generate', false, 'month', 'free')
on conflict (capability) do nothing;

insert into billing.capability_limit (capability, tier, limit_value, period)
values
  ('education.memory_generate', 'free', 15, 'month'),
  ('education.memory_generate', 'free', 5, 'rolling_5h')
on conflict (capability, tier, period) do update
  set limit_value = excluded.limit_value;
