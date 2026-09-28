-- lane: access-ladder T-11 leak fixes, part u (speed only): files.files's read policy is regenerated
-- through the one generator so it carries part t's lazy arms. A rolled-back dry run on 2026-09-28
-- changed std_select only (every other files.files policy identical); the row sets it admits were
-- proved identical in part t's header.
-- One table locked: files.files (policy replace, ~3 s).
set local lock_timeout = '2s';

select iam.apply_rls('files', 'files', 'file', 'entity');
