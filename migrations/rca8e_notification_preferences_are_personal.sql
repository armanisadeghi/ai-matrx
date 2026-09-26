--
-- RC-A8 L3 (register row RC-A8). A PERSON'S NOTIFICATION PREFERENCES ARE THEIRS ALONE.
--
-- communication.notification_preference and communication.sms_notification_preferences — which
-- alerts a person gets, on which channel, at which phone number — were generated on the `entity`
-- variant, whose read admits every member of the row's organization once a row is saved `internal`
-- (and everybody once `public`). Measured on production, rolled back: admin@admin.com's preference
-- saved internal or public in organization 884d1ce8 was readable by test@test.com. Every live row is
-- `personal` today (6 / 3), so nothing leaked; nothing stops the next one.
-- Both tables are per-person by construction (user_id NOT NULL).
--   * notification_preference moves to the `personal` variant (registry rls_variant + data_class
--     private; the registry trigger regenerates through iam.apply_rls): owner-only (created_by),
--     platform_admin_read kept, no organization, public or grant lane.
--   * sms_notification_preferences cannot take the variant yet: the generator refuses because 2 rows
--     carry created_by NULL while user_id names the person (written before the enrollment door
--     stamped created_by) — reconciling them is a data change, recorded in RC-A8 for its owner. Until
--     then a CHECK holds every row `personal`, so the organization and public lanes can never match
--     (every live row is personal, so nothing is rewritten).
-- Census (same class): communication.sms_phone_numbers, sms_consent, sms_notifications carry a
-- NULLABLE user_id (rows that belong to a phone number or the organization, not a person) and every
-- live row is personal — not moved, recorded in RC-A8. ui.ui_surface_agent_pref mixes person rows
-- (user_id set) with organization defaults (user_id NULL) and holds 4 person rows saved `internal` —
-- recorded in RC-A8 (a mixed table cannot take one variant). Tables already owner-only:
-- users.user_preferences, users.user_analysis_preferences, communication.notification_channel_preference;
-- users.user_email_preferences and dictionary.dict_settings admit only their owner or an explicit grant.
-- Forcing suite: aidream db/tests/test_rca8_l3_notification_preferences_are_personal.py.
-- Inverse (rehearsal only): migrations/inverse/rca8e_notification_preferences_are_personal_down.sql

set local lock_timeout = '2s';

update platform.entity_types
   set rls_variant = 'personal', data_class = 'private'  -- a personal table is private (entity_types_personal_is_private_ck)
 where schema_name = 'communication'
   and table_name = 'notification_preference'
   and rls_variant = 'entity';

-- the registry trigger (platform._entity_types_class_regenerates) regenerated the policies; say so explicitly
select iam.apply_rls('communication', 'notification_preference', 'notification_preference', 'personal');

alter table communication.sms_notification_preferences
  add constraint sms_notification_preferences_is_personal_ck
  check (visibility = 'personal'::platform.visibility) not valid;
alter table communication.sms_notification_preferences
  validate constraint sms_notification_preferences_is_personal_ck;
comment on constraint sms_notification_preferences_is_personal_ck on communication.sms_notification_preferences is
  'RC-A8 L3: a person''s SMS preferences (their phone number) are personal. Holds the organization and public read lanes shut until the table can take the personal variant (2 rows need created_by reconciled — register row RC-A8).';
