-- chair-step: lane STORE-RESTORE-DOORS inverse. Drops the partial index record_trash_store_children_idx (parent and its sixteen partition indexes); Trash reads removed store things by the owner index again (slower, same rows).
-- AUTOCOMMIT FILE: statement by statement.
-- INVERSE of migrations/campaign/storerestoredoors_removed_store_things_are_found_in_trash_through_their_own_index.sql
-- lane: STORE-RESTORE-DOORS

-- Dropping the parent index drops every attached partition index with it.
drop index if exists custom.record_trash_store_children_idx;
drop index concurrently if exists custom.record_p00_trash_store_children_idx;
drop index concurrently if exists custom.record_p01_trash_store_children_idx;
drop index concurrently if exists custom.record_p02_trash_store_children_idx;
drop index concurrently if exists custom.record_p03_trash_store_children_idx;
drop index concurrently if exists custom.record_p04_trash_store_children_idx;
drop index concurrently if exists custom.record_p05_trash_store_children_idx;
drop index concurrently if exists custom.record_p06_trash_store_children_idx;
drop index concurrently if exists custom.record_p07_trash_store_children_idx;
drop index concurrently if exists custom.record_p08_trash_store_children_idx;
drop index concurrently if exists custom.record_p09_trash_store_children_idx;
drop index concurrently if exists custom.record_p10_trash_store_children_idx;
drop index concurrently if exists custom.record_p11_trash_store_children_idx;
drop index concurrently if exists custom.record_p12_trash_store_children_idx;
drop index concurrently if exists custom.record_p13_trash_store_children_idx;
drop index concurrently if exists custom.record_p14_trash_store_children_idx;
drop index concurrently if exists custom.record_p15_trash_store_children_idx;
