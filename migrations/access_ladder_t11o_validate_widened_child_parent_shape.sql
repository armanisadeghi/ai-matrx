-- lane: access-ladder T-11 leak fixes, part o: validate the widened shape check. Part l was applied
-- by a release sweep before part k landed, so it validated the old check; this validates the one
-- part k added. VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE on files.files only.
set local lock_timeout = '2s';

alter table files.files validate constraint files_parent_record_shape;
