-- Inverse of migrations/campaign/datahome3_lane_a_the_data_home_shell_is_a_knob.sql.
-- Removes the two knobs' overrides, then the knob rows. Idempotent.
delete from platform.knob_override where feature = 'custom' and key in ('data_home_shell', 'data_home_default_view');
delete from platform.feature_knob where feature = 'custom' and key in ('data_home_shell', 'data_home_default_view');
