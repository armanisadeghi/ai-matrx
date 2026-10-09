-- lane: ENTITY-IDS-4 (Unified Data program)
-- window-class: iam.apply_rls on files.files (policy DDL; ACCESS EXCLUSIVE on files.files and the sign-in tables for ~1 s)
-- ENTITY-IDS-4 (2026-10-09), policy-only companion of entityids4a_fresh_rows_links_and_archived_files.sql (apply that
-- first). Regenerates the files.files read policy from iam.entity_read_expr as entityids4a left it: the record child
-- lane also asks the kernel about a parent id no file names yet (iam.child_parent_fresh_allows), so a file can be moved
-- or attached to a fresh row the person can open. Window-class (ACCESS EXCLUSIVE on files.files, ~1 s).
-- REVERT: migrations/inverse/entityids4b_files_read_policy_regenerated_down.sql, after the entityids4a inverse.
-- the signed-in door for iam.child_parent_fresh_allows was declared by entityids4a; the policy runs as the caller
grant execute on function iam.child_parent_fresh_allows(text, text, uuid) to authenticated;
select iam.apply_rls('files', 'files', 'file', 'entity');
