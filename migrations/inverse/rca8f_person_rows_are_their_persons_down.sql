-- chair-step: rehearsal inverse of rca8f — drops the three person-row read policies.
-- window-class: three DROP POLICY; the supautils set (auth/storage/realtime) frozen until commit, milliseconds
-- Inverse of migrations/rca8f_person_rows_are_their_persons.sql (rehearsal only).

set local lock_timeout = '2s';

drop policy ui_surface_agent_pref_person_rows_are_theirs on ui.ui_surface_agent_pref;
drop policy sms_notification_preferences_person_rows_are_theirs on communication.sms_notification_preferences;
drop policy sms_notification_preferences_person_reads_own on communication.sms_notification_preferences;
