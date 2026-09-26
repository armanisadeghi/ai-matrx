-- draft: deep-lane read-lane-v2 batch b1; lock measured on the clone, applied only inside its batch
-- read_lane_v2_b1_05_chat_tool_call — enroll chat.tool_call in read-lane v2 and regenerate its policies (one table, one transaction).
-- Design + chair approval: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
-- Needs read_lane_v2_a_generator.sql. The enroll row is written BEFORE the regeneration, never inside
-- the freeze: iam._apply_rls_unchecked issues its policy statements last (POLICY-LOCK).
insert into iam.read_lane_v2_rollout (token, batch) select token, 'b1' from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active on conflict do nothing;
select iam.apply_rls('chat', 'tool_call', (select token from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active), (select rls_variant from platform.entity_types where schema_name = 'chat' and table_name = 'tool_call' and is_active));
