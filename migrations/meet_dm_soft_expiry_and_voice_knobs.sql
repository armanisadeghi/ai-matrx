-- draft: deep-lane(dm-pairing) — applied to the clone only; production waits for dm_soft_expiry_and_dm_pairs_with_email.sql (Arman's OK on the dm_messages ALTER)
--
-- TWO KNOBS the server-side DM primitive and its channels read (aidream, 2026-10-02). Rows only —
-- no DDL, no function replaced, so no `-- based-on:` lines. Idempotent: an admin's value is never
-- overwritten.
--
-- 1. meet / dm_soft_expiry_minutes (integer, organization-overridable, 60)
--    How long after a meeting STARTS its DMs (invitation, update, cancellation, reminder, RSVP)
--    stop counting as unread. The message stays; it lapses (dm_messages.soft_expires_at). 0 =
--    lapse at the start. Read by aidream/services/meet/knobs.py::dm_soft_expiry_minutes.
--
-- 2. communication.notifications / voice_open (boolean, PLATFORM-LOCKED, false)
--    Whether the `voice` notification channel may phone anyone beyond the loopback test handsets
--    (aidream/designated_test_recipients.py). A call is the most interruptive thing the platform
--    can do to a person; it opens only on a deliberate platform decision.
--    Read by aidream/services/notifications/channels/voice.py::voice_open.

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction, ui,
   taxonomy_node_id, propagation, public_read)
SELECT 'meet', 'dm_soft_expiry_minutes',
       '60'::jsonb, '60'::jsonb, 'integer', 'minutes', 0, 10080, NULL,
       'Meeting messages stop counting as unread',
       'Minutes after a meeting starts when its invitation, reminder and reply messages stop counting as unread. They stay in the inbox.',
       'agent',
       'Agent-set default (blind approval). Set by the DM-pairing lane (Claude) on 2026-10-02. Basis: Arman, 2026-10-02 — a meeting DM should no longer count as unread an hour after the meeting starts. Arman approved this class of decision in advance (2026-08-20). Review due 2026-12-15.',
       '2026-12-15', ARRAY['organization'], 'any', '{}'::jsonb,
       k.taxonomy_node_id, 'next_load', false
  FROM platform.feature_knob k
 WHERE k.feature = 'meet' AND k.key = 'reminder_minutes_before'
ON CONFLICT (feature, key) DO NOTHING;

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values,
   label, description, set_by, basis, review_due, overridable_by, override_direction, ui,
   taxonomy_node_id, propagation, public_read)
SELECT 'communication.notifications', 'voice_open',
       'false'::jsonb, 'false'::jsonb, 'boolean', NULL, NULL, NULL, NULL,
       'Phone-call notifications reach real people',
       'When off, notification phone calls reach only the platform''s own test handsets. Platform-wide.',
       'agent',
       'Agent-set default (blind approval). Set by the DM-pairing lane (Claude) on 2026-10-02. Basis: a call is the most interruptive channel and has no consent program of its own yet; closed until the platform decides to open it. Review due 2026-12-15.',
       '2026-12-15', ARRAY[]::text[], 'any', '{}'::jsonb,
       k.taxonomy_node_id, 'next_load', false
  FROM platform.feature_knob k
 WHERE k.feature = 'communication.notifications' AND k.key = 'default_timezone'
ON CONFLICT (feature, key) DO NOTHING;
