-- access_ladder_t13_23f_analysis_result_reads_only_through_its_file.sql
-- chair-step: one table. Drops one hand-written read policy through iam.supersede_bespoke_policies; the generated std_select (parent file, viewer) already on the table gives the same rows.
--
-- T-13 2.3c (common-docs/policies/access-ladder.md: children inherit their parent only).
-- files.analysis_result already carries the generated child std_select (read through files.files).
-- The hand-written file_analysis_result_grant_read (platform admin OR iam.has_access('file', file_id,
-- 'viewer')) is the same question asked per row. Measured live 2026-09-28 before this file: 16 people
-- (file owners, members of the files' organizations, sharees, unrelated accounts) see the identical
-- row set with and without it; anon holds no grant. Removed from the guard's debt list in 23h.

set local lock_timeout = '2s';

select iam.supersede_bespoke_policies('files', 'analysis_result', array['file_analysis_result_grant_read'],
  'T-13 2.3c: hand-written read (platform admin or file viewer) duplicated the generated child std_select, which reads through files.files; measured identical rows for 16 people.');
