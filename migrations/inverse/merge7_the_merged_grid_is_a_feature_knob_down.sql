-- Inverse of migrations/campaign/merge7_the_merged_grid_is_a_feature_knob.sql.
-- Removes the knob's overrides, then the knob row. Idempotent.
set lock_timeout = '3s';
delete from platform.knob_override where feature = 'data_tables' and key = 'merged_grid';
delete from platform.feature_knob where feature = 'data_tables' and key = 'merged_grid';
