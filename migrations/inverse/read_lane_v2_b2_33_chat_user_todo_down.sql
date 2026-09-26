-- chair-step: inverse of read_lane_v2_b2_33_chat_user_todo — un-enrolls chat.user_todo from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'user_todo' and is_active);
select iam.apply_rls('chat', 'user_todo', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'user_todo' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'user_todo' and is_active));
