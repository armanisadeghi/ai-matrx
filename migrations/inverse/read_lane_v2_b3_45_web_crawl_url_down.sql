-- chair-step: inverse of read_lane_v2_b3_45_web_crawl_url — un-enrolls web.crawl_url from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'web' and table_name = 'crawl_url' and is_active);
select iam.apply_rls('web', 'crawl_url', (select token from platform.entity_types where schema_name = 'web' and table_name = 'crawl_url' and is_active), (select rls_variant from platform.entity_types where schema_name = 'web' and table_name = 'crawl_url' and is_active));
