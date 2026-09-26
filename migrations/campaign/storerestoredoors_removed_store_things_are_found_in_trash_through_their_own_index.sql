-- lane STORE-RESTORE-DOORS — Trash finds a removed Field, Rule, link, document template or dashboard through its own index.
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- custom.record is ONE table for every Table, Field, Rule, link and Record, hash-partitioned by
-- organization (16 partitions). Personal Trash lists the store things a person removed; without an
-- index it walks every row the person ever made (admin@admin.com: 327 ms on production for the five
-- classes together, the Trash ceiling is 300 ms per kind; pnpm check:trash-answers-fast). This partial
-- index holds only ARCHIVED rows of the five classes (about six thousand rows on production, nearly all
-- Fields), so a live write never touches it and a Trash read is a bounded index walk. Built partition
-- by partition CONCURRENTLY, then attached to one index on the parent, so no write waits.
--
-- INVERSE: migrations/inverse/storerestoredoors_removed_store_things_are_found_in_trash_through_their_own_index_down.sql
-- lane: STORE-RESTORE-DOORS

create index concurrently if not exists record_p00_trash_store_children_idx
  on custom.record_p00 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p01_trash_store_children_idx
  on custom.record_p01 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p02_trash_store_children_idx
  on custom.record_p02 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p03_trash_store_children_idx
  on custom.record_p03 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p04_trash_store_children_idx
  on custom.record_p04 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p05_trash_store_children_idx
  on custom.record_p05 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p06_trash_store_children_idx
  on custom.record_p06 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p07_trash_store_children_idx
  on custom.record_p07 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p08_trash_store_children_idx
  on custom.record_p08 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p09_trash_store_children_idx
  on custom.record_p09 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p10_trash_store_children_idx
  on custom.record_p10 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p11_trash_store_children_idx
  on custom.record_p11 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p12_trash_store_children_idx
  on custom.record_p12 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p13_trash_store_children_idx
  on custom.record_p13 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p14_trash_store_children_idx
  on custom.record_p14 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
create index concurrently if not exists record_p15_trash_store_children_idx
  on custom.record_p15 (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');

create index if not exists record_trash_store_children_idx
  on only custom.record (data_class, deleted_at desc, id)
  where deleted_at is not null and data_class in ('field', 'rule', 'relation', 'doc_template', 'dashboard');
alter index custom.record_trash_store_children_idx attach partition custom.record_p00_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p01_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p02_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p03_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p04_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p05_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p06_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p07_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p08_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p09_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p10_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p11_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p12_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p13_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p14_trash_store_children_idx;
alter index custom.record_trash_store_children_idx attach partition custom.record_p15_trash_store_children_idx;
