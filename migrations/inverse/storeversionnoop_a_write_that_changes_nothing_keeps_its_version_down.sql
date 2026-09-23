-- chair-step: THE INVERSE of migrations/campaign/storeversionnoop_a_write_that_changes_nothing_keeps_its_version.sql.
--   It takes the last before-row trigger back off `custom.record` and `platform.saved_view` and
--   drops `platform.no_change_keeps_its_version()`, which puts the defect back: a Save that
--   changes nothing moves the version and writes no history row (storeversionnoop_green.sql
--   clause 2 fails again). No row of anybody's data is touched.
-- window-class: DROP TRIGGER on the partitioned parent custom.record takes ACCESS EXCLUSIVE on the
--   parent and its 16 partitions and fires the supautils hook; at production 01:00–04:00 Pacific.
-- lock: custom,platform
-- lane: STORE-VERSION-NOOP

drop trigger if exists zzzzz_no_change_keeps_its_version on custom.record;
drop trigger if exists zzzzz_no_change_keeps_its_version on platform.saved_view;
drop function if exists platform.no_change_keeps_its_version();
