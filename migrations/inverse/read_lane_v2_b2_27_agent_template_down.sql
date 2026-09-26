-- chair-step: inverse of read_lane_v2_b2_27_agent_template — un-enrolls agent.template from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'agent' and table_name = 'template' and is_active);
select iam.apply_rls('agent', 'template', (select token from platform.entity_types where schema_name = 'agent' and table_name = 'template' and is_active), (select rls_variant from platform.entity_types where schema_name = 'agent' and table_name = 'template' and is_active));
