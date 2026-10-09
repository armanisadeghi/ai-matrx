-- chair-step: it regenerates the files.files read policy from iam.entity_read_expr after the entityids3a inverse put the generator back (the record child lane confirms each row with the kernel again; the system-organization lanes no longer skip files under store rows)
-- lane: ENTITY-IDS-3
-- window-class: iam.apply_rls on files.files (policy DDL)
-- Inverse of migrations/campaign/entityids3b_files_read_policy_regenerated.sql. Apply AFTER
-- migrations/inverse/entityids3a_file_reads_ask_the_person_once_down.sql. Window-class.
select iam.apply_rls('files', 'files', 'file', 'entity');
