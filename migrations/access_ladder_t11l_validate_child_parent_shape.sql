-- lane: access-ladder T-11 leak fixes, part l: validate the widened shape check (part k).
-- VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE on files.files only: reads and writes go on.
set local lock_timeout = '2s';

alter table files.files validate constraint files_parent_record_shape;
