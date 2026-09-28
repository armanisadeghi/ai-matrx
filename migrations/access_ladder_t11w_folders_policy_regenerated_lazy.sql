-- lane: access-ladder T-11 leak fixes, part w (speed only): files.folders's read policy is
-- regenerated through the one generator so it carries part v's lazy arms. A rolled-back dry run on
-- 2026-09-28 changed std_select only (every other files.folders policy identical); the row sets it
-- admits were proved identical in part v's header.
-- One table locked: files.folders (policy replace, <1 s).
set local lock_timeout = '2s';

select iam.apply_rls('files', 'folders', 'folder', 'entity');
