-- billing_free_tier_limits.sql
-- The APPROVED free-tier capability matrix (Arman, 2026-07-07): generous monthly
-- caps + a short rolling burst window per capability to guard against AI-cost
-- spikes. Premium/trial get NO rows here => unlimited. enforced stays FALSE on
-- every capability (see billing.capability); these numbers activate per-capability
-- once the aidream spend re-check exists. Idempotent.

insert into billing.capability_limit (capability, tier, period, limit_value) values
  ('education.generate_cards','free','month',30),       ('education.generate_cards','free','rolling_5h',10),
  ('education.card_enrichment','free','month',500),      ('education.card_enrichment','free','rolling_5h',150),
  ('education.tutor_message','free','day',30),           ('education.tutor_message','free','rolling_5h',15),
  ('education.audio_generate','free','month',3),         ('education.audio_generate','free','rolling_5h',1),
  ('education.quiz_generate','free','month',30),         ('education.quiz_generate','free','rolling_5h',10),
  ('education.practice_test_generate','free','month',5), ('education.practice_test_generate','free','rolling_5h',2),
  ('education.mindmap_generate','free','month',15),      ('education.mindmap_generate','free','rolling_5h',5),
  ('education.notes_generate','free','month',30),        ('education.notes_generate','free','rolling_5h',10),
  ('education.ingest_document','free','month',20),       ('education.ingest_document','free','rolling_5h',8),
  ('education.live_grade','free','day',30),              ('education.live_grade','free','rolling_1h',10)
on conflict (capability, tier, period) do update set limit_value = excluded.limit_value;
