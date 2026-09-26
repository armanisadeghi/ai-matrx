-- draft: deep-lane read-lane-v2 batch b3; lock measured on the clone, applied only inside its batch
-- read_lane_v2_b3_35_runtime_global_request — enroll runtime.global_request in read-lane v2 and regenerate its policies (one table, one transaction).
-- Design + chair approval: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
-- Needs read_lane_v2_a_generator.sql. The enroll row is written BEFORE the regeneration, never inside
-- the freeze: iam._apply_rls_unchecked issues its policy statements last (POLICY-LOCK).
insert into iam.read_lane_v2_rollout (token, batch) select token, 'b3' from platform.entity_types where schema_name = 'runtime' and table_name = 'global_request' and is_active on conflict do nothing;
select iam.apply_rls('runtime', 'global_request', (select token from platform.entity_types where schema_name = 'runtime' and table_name = 'global_request' and is_active), (select rls_variant from platform.entity_types where schema_name = 'runtime' and table_name = 'global_request' and is_active));
