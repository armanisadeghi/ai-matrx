-- lane: access-ladder T-11 leak fixes, part p: files.files's policy is regenerated so its read lanes
-- carry the trash rule part m declared (`file` in platform.trash_is_owner_only): a trashed file is
-- read by its owner only. Generated through the one generator; a rolled-back dry run on
-- 2026-09-28 before part m showed the regeneration otherwise identical to the live policies.
-- One table locked: files.files (policy replace).
set local lock_timeout = '2s';

select iam.apply_rls('files', 'files', 'file', 'entity');
