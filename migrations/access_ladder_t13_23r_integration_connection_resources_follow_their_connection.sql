-- access_ladder_t13_23r_integration_connection_resources_follow_their_connection.sql
-- chair-step: one table. REVOKEs 11 redundant column-level SELECT grants that exclude nothing (authenticated holds table-level SELECT), regenerates this child from its parent connection, and drops its hand-written read through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- users.integration_connection_resources: the 2026-08-21 column-grant guard recorded its column grants as full
-- coverage (11/11), not a design; custom_fields was added later without one, so the rail now reads 11 of 12 as an
-- undeclared design. Nothing is excluded (table-level SELECT), so the stray grants go, as on research.rs_* (23d).
-- The hand-written read asked the connection's owner/organization directly; the child now reads through its
-- Confidential parent connection (ruled).

set local lock_timeout = '2s';

revoke select (id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, created_at, updated_at, deleted_at, metadata) on users.integration_connection_resources from authenticated;

select iam.apply_rls('users', 'integration_connection_resources', 'integration_connection_resource', 'component');

select iam.supersede_bespoke_policies('users', 'integration_connection_resources', array['integration_connection_resources_read_owner_or_org'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
