-- chair-step: drops platform.comments.visibility — the stray second access authority a detail never reads (verify-RC-A2 F5, STORE-DESIGN §3.8 item 2); one catalog-only DROP COLUMN holding ACCESS EXCLUSIVE on a table of under 100 rows for milliseconds.
--
-- RC-A2f (register row RC-A2). platform.comments is a `detail`: its access is its record's
-- (iam.has_access_for_base's detail branch, platform.detail_parent_columns) and nothing reads the
-- row's own `visibility` — iam.verify_canonical WARNs it as "a second competing access authority,
-- file the removal". Every row holds the default 'internal', which is exactly the value that
-- made the kernel hand comments to the organization before RC-A2b. Census 2026-09-26: no policy,
-- view or function reads platform.comments.visibility; the only dependent object is the column's
-- own default; no writer sets it (the doors never name it); the aidream ORM model regenerates.
-- Forcing suite: aidream db/tests/test_rca2f_comment_visibility_is_gone.py.
-- Inverse (rehearsal only): migrations/inverse/rca2f_comments_drop_the_stray_visibility_column_down.sql

set local lock_timeout = '2s';

alter table platform.comments drop column visibility;
