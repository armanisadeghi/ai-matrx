-- chair-step: inverse of read_lane_v2_b3_40_web_page — un-enrolls web.page from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'web' and table_name = 'page' and is_active);
select iam.apply_rls('web', 'page', (select token from platform.entity_types where schema_name = 'web' and table_name = 'page' and is_active), (select rls_variant from platform.entity_types where schema_name = 'web' and table_name = 'page' and is_active));
