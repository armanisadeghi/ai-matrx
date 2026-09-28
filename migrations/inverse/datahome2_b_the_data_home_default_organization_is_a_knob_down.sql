-- Inverse of migrations/campaign/datahome2_b_the_data_home_default_organization_is_a_knob.sql.
-- Removes the knob's overrides (it takes none), then the knob row. Idempotent.
delete from platform.knob_override where feature = 'custom' and key = 'data_home_default_organization';
delete from platform.feature_knob where feature = 'custom' and key = 'data_home_default_organization';
