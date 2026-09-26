-- chair-step: inverse of read_lane_v2_b3_41_web_link_edge — un-enrolls web.link_edge from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'web' and table_name = 'link_edge' and is_active);
select iam.apply_rls('web', 'link_edge', (select token from platform.entity_types where schema_name = 'web' and table_name = 'link_edge' and is_active), (select rls_variant from platform.entity_types where schema_name = 'web' and table_name = 'link_edge' and is_active));
