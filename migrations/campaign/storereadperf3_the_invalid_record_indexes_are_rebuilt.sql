-- target: branch,production
-- additive: yes
--   Rebuilds five partition-local indexes of custom.record that are INVALID (pg_index.indisvalid =
--   false) — each left behind by a CREATE INDEX CONCURRENTLY that did not finish, and never retried
--   because its file said `if not exists`, which is true of an invalid index. No definition changes;
--   no function, table, column, policy, grant or row is touched. REINDEX INDEX CONCURRENTLY takes
--   SHARE UPDATE EXCLUSIVE on the one partition — writers and readers keep going — and never ACCESS
--   EXCLUSIVE. It cannot run inside a transaction block: apply with autocommit (psql -f, no begin).
-- guard: custom/system_enabled
-- lane: STORE-READ-PERF-3
-- lock: custom
--
-- WHY (measured 2026-09-25, production and the dev clone alike). `record_id_rp_00`, the index on
-- `id` of partition record_p00, is invalid, so the planner cannot use it: EVERY lookup of a record by
-- id alone — custom.where_id_opens, custom.levels_of, custom.assert_client_may_open,
-- platform.entity_row_access_attrs (every node of every ladder walk) — reads record_p00 through its
-- primary key `(organization_id, id)` or `(organization_id, table_id, created_at)` from end to end
-- instead of one probe: 25 and 59 buffers a probe against 2 for every other partition (EXPLAIN
-- ANALYZE of custom._where_ids_open_with's lookup: 425 + 1,007 of its 2,520 buffers were p00). It
-- grows with the partition. An invalid index is still MAINTAINED on every write (indisready), so
-- the four others cost every insert and update into record_p00/p01/p02/p06 and give nothing back.
--
-- Invalid at the time of writing (source: readperf_the_page_scan_has_its_indexes.sql and
-- readperf_the_class_finds_its_row_without_a_scan.sql, both 2026-09-20):
--   custom.record_id_rp_00                 on custom.record_p00 (id)
--   custom.record_org_table_vis_rp_06      on custom.record_p06 (organization_id, table_id, visibility) where deleted_at is null
--   custom.record_org_table_vis_creator_rp_00 / _01 / _02  on record_p00/p01/p02
--                                          (organization_id, table_id, visibility, created_by) where deleted_at is null
--
-- Inverse: none needed and none possible in kind — a rebuilt index has the same definition; the
-- inverse file is a no-op that says so.

-- No `set lock_timeout` here: this file runs in autocommit through the transaction-mode pooler,
-- where a session SET would stay behind on a backend another client gets next. Each REINDEX runs
-- under the role's own lock_timeout (5 s on production); one that times out is simply run again.

reindex index concurrently custom.record_id_rp_00;
reindex index concurrently custom.record_org_table_vis_rp_06;
reindex index concurrently custom.record_org_table_vis_creator_rp_00;
reindex index concurrently custom.record_org_table_vis_creator_rp_01;
reindex index concurrently custom.record_org_table_vis_creator_rp_02;

-- A REINDEX CONCURRENTLY that times out after its swap leaves the OLD copy behind as
-- `<name>_ccold`, and one that times out before it leaves the new one as `<name>_ccnew` — both
-- invalid, both still maintained on every write: the very class this file closes. So it clears
-- them, whichever step a lock wait stopped. (Measured on the clone 2026-09-25: a second run's drop
-- phase hit the 5 s lock_timeout and left record_id_rp_00_ccold.) After a `_ccnew` is dropped the
-- index it was rebuilding is still invalid: run this file again.
drop index concurrently if exists custom.record_id_rp_00_ccold;
drop index concurrently if exists custom.record_id_rp_00_ccnew;
drop index concurrently if exists custom.record_org_table_vis_rp_06_ccold;
drop index concurrently if exists custom.record_org_table_vis_rp_06_ccnew;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_00_ccold;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_00_ccnew;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_01_ccold;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_01_ccnew;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_02_ccold;
drop index concurrently if exists custom.record_org_table_vis_creator_rp_02_ccnew;

-- The proof, printed: no index of custom.record is invalid or unready.
select count(*) as invalid_record_indexes
  from pg_index i join pg_inherits h on h.inhrelid = i.indrelid
 where h.inhparent = 'custom.record'::regclass and not (i.indisvalid and i.indisready);
