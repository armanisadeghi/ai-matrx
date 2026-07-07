-- billing_capability_seed.sql
-- Seed the DB capability registry from features/entitlements/registry.ts.
-- We meter AI GENERATION only, never saved content (Arman, 2026-07-07):
-- storage + studying + keeping decks are free forever. Every capability ships
-- enforced=false (permissive) until the aidream-side spend re-check lands and
-- the free-tier numbers are activated. Idempotent (upsert).

insert into billing.capability (capability, enforced, period, min_tier) values
  ('education.generate_cards',        false, 'month',    'free'),
  ('education.card_enrichment',       false, 'month',    'free'),  -- per-card AI, high volume
  ('education.tutor_message',         false, 'day',      'free'),
  ('education.audio_generate',        false, 'month',    'free'),
  ('education.quiz_generate',         false, 'month',    'free'),
  ('education.practice_test_generate',false, 'month',    'free'),
  ('education.mindmap_generate',      false, 'month',    'free'),
  ('education.notes_generate',        false, 'month',    'free'),
  ('education.ingest_document',       false, 'month',    'free'),
  ('education.live_grade',            false, 'day',      'free'),  -- most compute-heavy path
  ('education.game_room_size',        false, null,       'free')   -- a gate, not a meter
on conflict (capability) do update
  set period = excluded.period, min_tier = excluded.min_tier, updated_at = now();
