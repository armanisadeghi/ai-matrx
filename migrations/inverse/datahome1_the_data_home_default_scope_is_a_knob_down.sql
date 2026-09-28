-- Inverse of migrations/campaign/datahome1_the_data_home_default_scope_is_a_knob.sql.
-- Removes the knob's overrides, then the knob row. Idempotent.
delete from platform.knob_override where feature = 'custom' and key = 'data_home_default_scope';
delete from platform.feature_knob where feature = 'custom' and key = 'data_home_default_scope';
