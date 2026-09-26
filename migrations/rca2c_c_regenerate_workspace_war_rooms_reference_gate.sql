-- rca2c_c_regenerate_workspace_war_rooms_reference_gate
--
-- RC-A2c's generator now emits the restrictive ref_target_gate for declared reference-gated
-- tokens. Regenerate workspace.war_rooms only. This remains separate from rca2c_a's function
-- replacements and from workspace.threads: one iam.apply_rls target per transaction keeps the
-- policy-lock footprint bounded.

set local lock_timeout = '2s';

select iam.apply_rls('workspace', 'war_rooms', 'war_room', 'entity');
