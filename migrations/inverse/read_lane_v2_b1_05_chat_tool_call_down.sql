-- chair-step: inverse of read_lane_v2_b1_05_chat_tool_call — un-enrolls chat.tool_call from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active);
select iam.apply_rls('chat', 'tool_call', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active));
