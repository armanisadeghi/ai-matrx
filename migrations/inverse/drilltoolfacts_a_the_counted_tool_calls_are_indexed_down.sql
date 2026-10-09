-- chair-step: the inverse of migrations/campaign/drilltoolfacts_a_the_counted_tool_calls_are_indexed.sql (lane DRILL-TOOLFACTS) — drops the two partial indexes on chat.tool_call CONCURRENTLY, so no write waits. Apply AFTER the inverses of files 3 and 2. No row is touched.
-- lane: DRILL-TOOLFACTS
-- lock: platform
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement (aidream db/apply_migrations.py --source inverse).

drop index concurrently if exists chat.idx_tool_call_counted_created;
drop index concurrently if exists chat.idx_tool_call_counted_conv;
