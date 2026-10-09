-- chair-step: inverse of perf_watch_w2_b_statement_snapshot.sql — drops ops.perf_statement_snapshot (raw counters only; the statement samples derived from it stay in ops.perf_sample) and its registry row. Apply _e_down, _d_down and _c_down first.
--
-- WHAT IT DOES NOT UNDO: nothing structural is left behind. Raw snapshots are not recoverable;
-- the next collector run starts a new chain.
set local lock_timeout = '3s';
drop table if exists ops.perf_statement_snapshot cascade;
delete from platform.entity_types where token = 'ops_perf_statement_snapshot';
