-- lane: ENTITY-IDS-3 (Unified Data program)
-- window-class: iam.apply_rls on files.files (policy DDL; ACCESS EXCLUSIVE on files.files and the sign-in tables for ~1 s)
-- ENTITY-IDS-3 (2026-10-09), policy-only companion of entityids3a_file_reads_ask_the_person_once.sql (apply that first).
-- Regenerates the files.files read policy from iam.entity_read_expr as entityids3a left it: the record child lane reads
-- the person's kernel yes-set once per statement with no per-row kernel call, and the two global-readable
-- system-organization lanes skip a file under a store row. Window-class (ACCESS EXCLUSIVE on files.files, ~1 s).
-- REVERT: migrations/inverse/entityids3b_files_read_policy_regenerated_down.sql, after the entityids3a inverse.
select iam.apply_rls('files', 'files', 'file', 'entity');
