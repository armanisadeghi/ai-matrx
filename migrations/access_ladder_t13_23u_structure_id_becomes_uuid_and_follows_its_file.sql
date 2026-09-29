-- access_ladder_t13_23u_structure_id_becomes_uuid_and_follows_its_file.sql
-- chair-step: one table with ZERO rows. Its integer id becomes a uuid id (default gen_random_uuid()) and its now-unused serial sequence is dropped; regenerates this child from its parent file and drops its hand-written read through iam.supersede_bespoke_policies.
--
-- T-13 2.3d (common-docs/policies/access-ladder.md: children inherit their parent only; owner-session ruling 2026-09-28).
-- files.structure had an integer id (serial), which the generator's uuid id arms cannot compare. The table is empty
-- (measured 0 rows 2026-09-28), so the id is converted in place; the aidream ORM model (matrx_files Structure.id)
-- moves to UUIDField in the same change.

set local lock_timeout = '2s';

alter table files.structure alter column id drop default;
alter table files.structure alter column id type uuid using gen_random_uuid();
alter table files.structure alter column id set default gen_random_uuid();
drop sequence if exists files.file_structure_id_seq;

select iam.apply_rls('files', 'structure', 'structure', 'component');

select iam.supersede_bespoke_policies('files', 'structure', array['file_structure_grant_read'],
  'T-13 2.3d: hand-written child policies replaced by the generated parent-derived set (owner ruling 2026-09-28: children inherit their parent); proved per person live before and after.');
