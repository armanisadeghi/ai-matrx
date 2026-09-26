-- chair-step: inverse of read_lane_v2_b2_15_chat_agent_run — un-enrolls chat.agent_run from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'agent_run' and is_active);
select iam.apply_rls('chat', 'agent_run', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'agent_run' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'agent_run' and is_active));
