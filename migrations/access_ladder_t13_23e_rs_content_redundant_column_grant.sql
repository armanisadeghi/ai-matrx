-- access_ladder_t13_23e_rs_content_redundant_column_grant.sql
-- chair-step: one table, grant only. REVOKEs a redundant column-level SELECT grant that excludes nothing (authenticated already holds table-level SELECT on every column); no policy is touched and no access changes.
--
-- T-13 2.3c, the sibling of 23d. aidream migration 1296 (2026-09-26) ended with
-- GRANT SELECT (capture_version) ON research.rs_content TO authenticated beside the table-level grant
-- authenticated already held. iam.apply_table_grants reads any partial column ACL as an undeclared
-- column design (db-rules 6d-2) and would refuse this child's next regeneration exactly as it refused
-- rs_document and rs_synthesis. There is no design to declare (nothing is excluded), so the stray
-- grant goes. Census 2026-09-28: the only tables holding table-level SELECT plus an undeclared
-- partial column grant are research.rs_content, rs_document, rs_synthesis and
-- users.integration_connection_resources (left for its own review: its parent regenerates in read-lane v2).

set local lock_timeout = '2s';

revoke select (capture_version) on research.rs_content from authenticated;
