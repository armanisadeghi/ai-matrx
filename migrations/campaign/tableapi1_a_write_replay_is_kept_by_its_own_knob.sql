-- lane: TABLE-API-1
-- lock: platform
-- additive: yes
--
-- TABLE-API-1 — A WRITE REPLAY IS KEPT BY ITS OWN KNOB (VERIFIER-31 D7).
--
-- The table API keeps each Idempotency-Key's first answer so a retried write replays it instead of
-- writing twice. It read the workflow feature's `idempotency_retention_hours`, whose description is
-- about workflow runs and trigger fires; an admin turning that knob for workflows would silently
-- change how long a tracker's retries are safe. The table API gets its own row, at the same 24 hours.

set local lock_timeout = '3s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('table_api', 'idempotency_retention_hours', '24'::jsonb, '24'::jsonb, 'integer', 'hours', 1, 720,
   'How long a table API write can be safely retried',
   'A write sent with an Idempotency-Key keeps its first answer this long: sending it again with the same key and body returns that answer instead of writing twice. After this, the key starts fresh.',
   'agent', 'Agent-set limit (blind approval), lane TABLE-API-1 2026-09-29: Stripe keeps idempotency keys for 24 hours; a tracker or sync job retries within minutes.',
   '2026-12-29', array['organization'], 'any', 'next_load', 'c5d29fbf-fd62-40dd-afd0-9cd96d4cca93');
