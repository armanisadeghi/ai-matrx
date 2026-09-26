-- chair-step: inverse of read_lane_v2_b3_48_seo_keyword — un-enrolls seo.keyword from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'seo' and table_name = 'keyword' and is_active);
select iam.apply_rls('seo', 'keyword', (select token from platform.entity_types where schema_name = 'seo' and table_name = 'keyword' and is_active), (select rls_variant from platform.entity_types where schema_name = 'seo' and table_name = 'keyword' and is_active));
