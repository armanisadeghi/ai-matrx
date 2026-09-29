-- access_ladder_t13_23i_rs_synthesis_reads_only_through_its_topic.sql
-- chair-step: one table. REVOKEs a redundant column-level SELECT grant that excludes nothing (authenticated already holds table-level SELECT on every column), then regenerates this child's policies so it reads only through its parent topic.
--
-- T-13 2.3c (common-docs/policies/access-ladder.md: children inherit their parent only).
--
-- WHY research.rs_synthesis was refused by iam.apply_table_grants ("UNDECLARED column-level grant design,
-- 1 of 29 columns granted"): aidream migration 1298/1299 (2026-09-26) added capture_version and
-- ended with GRANT SELECT (capture_version) ... TO authenticated, as a belt-and-braces beside the
-- table-level SELECT/INSERT/UPDATE/DELETE authenticated already held. A column grant under a
-- table-level grant excludes nothing, so there is no column design to declare: the canonical
-- declaration is client_excluded_columns = null (unchanged). The rail reads any partial column ACL
-- as a design (db-rules 6d-2), so the redundant grant is removed and the rail passes.
-- Access before/after this REVOKE: identical (has_column_privilege is true on every column through
-- the table-level grant either way).
--
-- Then the regeneration: std_select loses its own organization / system-organization arms and
-- reads only through research_topic (iam.entity_read_expr 'component'); the guard
-- iam.children_with_own_read_arms() stops reporting research_synthesis.

set local lock_timeout = '2s';

revoke select (capture_version) on research.rs_synthesis from authenticated;

select iam.apply_rls('research', 'rs_synthesis', 'research_synthesis', 'component');
