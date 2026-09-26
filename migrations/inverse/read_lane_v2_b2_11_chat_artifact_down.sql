-- chair-step: inverse of read_lane_v2_b2_11_chat_artifact — un-enrolls chat.artifact from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'artifact' and is_active);
select iam.apply_rls('chat', 'artifact', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'artifact' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'artifact' and is_active));
