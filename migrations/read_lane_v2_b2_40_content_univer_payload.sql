-- draft: deep-lane read-lane-v2 batch b2; lock measured on the clone, applied only inside its batch
-- read_lane_v2_b2_40_content_univer_payload — enroll content.univer_payload in read-lane v2 and regenerate its policies (one table, one transaction).
-- Design + chair approval: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
-- Needs read_lane_v2_a_generator.sql. The enroll row is written BEFORE the regeneration, never inside
-- the freeze: iam._apply_rls_unchecked issues its policy statements last (POLICY-LOCK).
insert into iam.read_lane_v2_rollout (token, batch) select token, 'b2' from platform.entity_types where schema_name = 'content' and table_name = 'univer_payload' and is_active on conflict do nothing;
select iam.apply_rls('content', 'univer_payload', (select token from platform.entity_types where schema_name = 'content' and table_name = 'univer_payload' and is_active), (select rls_variant from platform.entity_types where schema_name = 'content' and table_name = 'univer_payload' and is_active));
