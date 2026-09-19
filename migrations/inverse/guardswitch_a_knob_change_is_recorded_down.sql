-- INVERSE of migrations/campaign/guardswitch_a_knob_change_is_recorded.sql
--
-- It stops the registry recording and removes what the backfill wrote. Running it makes
-- "who could see this on that day" go back to applying today's settings to a past date.
drop trigger if exists knob_history_capture_tg on platform.knob_override;
drop trigger if exists knob_history_capture_tg on platform.feature_knob;
drop function if exists platform.knob_value_as_of(text, text, uuid, timestamptz);
drop function if exists platform._knob_history_capture();
delete from history.row_versions where entity_type in ('platform.feature_knob', 'platform.knob_override');
delete from history.capture_window where entity_type in ('platform.feature_knob', 'platform.knob_override');
drop function if exists platform.knob_history_row_id(text, text, text, uuid);
