-- billing_capability_seed.sql
-- Seed the DB capability registry from features/entitlements/registry.ts.
-- Every capability ships enforced=false (permissive) — nothing is capped until
-- Arman approves the free-tier matrix AND the aidream-side spend re-check exists
-- for that capability. Idempotent (upsert).

insert into billing.capability (capability, enforced, period, min_tier) values
  ('education.generate_cards',        false, 'month',    'free'),
  ('education.tutor_message',         false, 'day',      'free'),
  ('education.audio_generate',        false, 'month',    'free'),
  ('education.quiz_generate',         false, 'month',    'free'),
  ('education.practice_test_generate',false, 'month',    'free'),
  ('education.mindmap_generate',      false, 'month',    'free'),
  ('education.notes_generate',        false, 'month',    'free'),
  ('education.game_room_size',        false, null,       'free'),
  ('education.ingest_document',       false, 'month',    'free'),
  ('education.deck_count',            false, 'lifetime', 'free')
on conflict (capability) do update
  set period = excluded.period, min_tier = excluded.min_tier, updated_at = now();
