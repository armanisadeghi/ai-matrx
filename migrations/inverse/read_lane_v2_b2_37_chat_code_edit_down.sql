-- chair-step: inverse of read_lane_v2_b2_37_chat_code_edit — un-enrolls chat.code_edit from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'chat' and table_name = 'code_edit' and is_active);
select iam.apply_rls('chat', 'code_edit', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'code_edit' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'code_edit' and is_active));
