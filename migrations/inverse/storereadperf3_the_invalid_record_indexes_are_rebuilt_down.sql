-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lane: STORE-READ-PERF-3
-- Inverse of migrations/campaign/storereadperf3_the_invalid_record_indexes_are_rebuilt.sql: nothing to
-- undo. The up file rebuilt five existing indexes with their own definitions (REINDEX INDEX
-- CONCURRENTLY); the only difference it makes is that they are now valid. Making an index invalid
-- again is not a thing to want, so this file does nothing on purpose.
select 1;
