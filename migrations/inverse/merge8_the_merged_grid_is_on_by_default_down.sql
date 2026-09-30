-- chair-step: returns the data_tables.merged_grid knob's declared default to Off (merge7's seed); a value a person set in the dashboard is left alone.
-- Inverse of migrations/campaign/merge8_the_merged_grid_is_on_by_default.sql. Idempotent.
set lock_timeout = '3s';
update platform.feature_knob
   set default_value = 'false'::jsonb,
       value = case when set_by = 'agent' and value = 'true'::jsonb then 'false'::jsonb else value end,
       description = replace(description, 'Off, the simpler grid draws; on is the default.',
                             'Off, the simpler grid draws.')
 where feature = 'data_tables' and key = 'merged_grid'
   and default_value is distinct from 'false'::jsonb;
