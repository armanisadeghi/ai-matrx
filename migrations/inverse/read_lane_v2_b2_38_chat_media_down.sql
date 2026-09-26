-- chair-step: inverse of read_lane_v2_b2_38_chat_media — un-enrolls chat.media from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'media' and is_active);
select iam.apply_rls('chat', 'media', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'media' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'media' and is_active));
