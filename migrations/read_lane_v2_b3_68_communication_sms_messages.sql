-- draft: deep-lane read-lane-v2 batch b3; lock measured on the clone, applied only inside its batch
-- read_lane_v2_b3_68_communication_sms_messages — enroll communication.sms_messages in read-lane v2 and regenerate its policies (one table, one transaction).
-- Design + chair approval: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
-- Needs read_lane_v2_a_generator.sql. The enroll row is written BEFORE the regeneration, never inside
-- the freeze: iam._apply_rls_unchecked issues its policy statements last (POLICY-LOCK).
insert into iam.read_lane_v2_rollout (token, batch) select token, 'b3' from platform.entity_types where schema_name = 'communication' and table_name = 'sms_messages' and is_active on conflict do nothing;
select iam.apply_rls('communication', 'sms_messages', (select token from platform.entity_types where schema_name = 'communication' and table_name = 'sms_messages' and is_active), (select rls_variant from platform.entity_types where schema_name = 'communication' and table_name = 'sms_messages' and is_active));
