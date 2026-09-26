-- chair-step: inverse of read_lane_v2_b3_58_hr_employment — un-enrolls hr.employment from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'hr' and table_name = 'employment' and is_active);
select iam.apply_rls('hr', 'employment', (select token from platform.entity_types where schema_name = 'hr' and table_name = 'employment' and is_active), (select rls_variant from platform.entity_types where schema_name = 'hr' and table_name = 'employment' and is_active));
