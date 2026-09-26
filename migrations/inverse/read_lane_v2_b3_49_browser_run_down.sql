-- chair-step: inverse of read_lane_v2_b3_49_browser_run — un-enrolls browser.run from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'browser' and table_name = 'run' and is_active);
select iam.apply_rls('browser', 'run', (select token from platform.entity_types where schema_name = 'browser' and table_name = 'run' and is_active), (select rls_variant from platform.entity_types where schema_name = 'browser' and table_name = 'run' and is_active));
