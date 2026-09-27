-- INVERSE of migrations/campaign/readinesscap_the_bag_census_row_ceiling_is_a_knob.sql

delete from platform.feature_knob where feature = 'census' and key = 'exact_count_max_rows';
