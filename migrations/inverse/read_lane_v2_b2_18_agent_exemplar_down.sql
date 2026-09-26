-- chair-step: inverse of read_lane_v2_b2_18_agent_exemplar — un-enrolls agent.exemplar from read-lane v2 and regenerates it back to the set-form read lane.
delete from iam.read_lane_v2_rollout where token = (select token from platform.entity_types where schema_name = 'agent' and table_name = 'exemplar' and is_active);
select iam.apply_rls('agent', 'exemplar', (select token from platform.entity_types where schema_name = 'agent' and table_name = 'exemplar' and is_active), (select rls_variant from platform.entity_types where schema_name = 'agent' and table_name = 'exemplar' and is_active));
