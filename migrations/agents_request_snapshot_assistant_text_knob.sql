-- agents.request_snapshot — the AI's answer is recorded IN FULL; its size alarm is a KNOB.
--
-- KI-049 follow-up, 2026-09-14. Run history (the run console tab where a person
-- clicks through every AI call a run made) showed 78 of 415 recorded outputs in
-- the last 30 days as a 595-character fragment: the snapshot writer's
-- LargeBinaryStringRedactor shortened EVERY string over 64 KiB — built to stop
-- multi-MB base64 files — and a keyword-classifier answer is ~73 KB of JSON.
-- Decision (owning session, 2026-09-14): a platform that records AI calls keeps
-- what the AI said. matrx_ai.providers.snapshot_redactors now exempts assistant
-- `type="text"` blocks in the response payload (base64/data-URL strings are
-- still redacted, inside assistant content too). A text over this row's value
-- is STILL stored in full; the writer announces it with a warning so an
-- unexpectedly huge answer is visible instead of silently truncated.
--
-- Read by the host binding in aidream/package_integration.py
-- (configure_snapshot_knobs) through knob_raw_sync; primed via SYNC_READ_FEATURES.
-- Idempotent; aidream 0673's shape.
--
-- Agent-set value under blind approval (limits-are-knobs policy): set by
-- Claude Opus 5 (agent session) on 2026-09-14. Review due 2026-12-14.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction)
VALUES
  ('agents.request_snapshot', 'assistant_text_announce_bytes', '4194304', '4194304', 'integer', 'bytes', 65536, 104857600, null,
   'Size at which a recorded AI answer raises a warning',
   'Every AI answer is recorded in full so Run history and replay can show exactly what the model said. When a single answer is larger than this, it is still recorded in full, and the server logs a warning naming the call and its size so an unexpectedly huge answer is noticed. Lower it to hear about big answers sooner; raise it if the warning fires for answers that are normal for your work.',
   'agent', 'The largest structured answers seen live (keyword classifier, 2026-09) are ~73 KB; 4 MiB is roughly fifty times that, so it only fires for answers far outside anything observed.',
   date '2026-12-14', '{}', 'any')

ON CONFLICT (feature, key) DO UPDATE SET
  default_value  = EXCLUDED.default_value,
  value_type     = EXCLUDED.value_type,
  unit           = EXCLUDED.unit,
  min_value      = EXCLUDED.min_value,
  max_value      = EXCLUDED.max_value,
  allowed_values = EXCLUDED.allowed_values,
  label          = EXCLUDED.label,
  description    = EXCLUDED.description,
  basis          = EXCLUDED.basis,
  value      = CASE WHEN platform.feature_knob.set_by = 'human'
                    THEN platform.feature_knob.value ELSE EXCLUDED.value END,
  review_due = CASE WHEN platform.feature_knob.set_by = 'human'
                    THEN platform.feature_knob.review_due ELSE EXCLUDED.review_due END;
