-- chair-step: the inverse of migrations/campaign/drillserver2_the_first_touch_lookups_are_indexed.sql (lane DRILL-SERVER-2) — drops the two partial indexes it added, CONCURRENTLY. No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- AUTOCOMMIT FILE: DROP INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.

drop index concurrently if exists users.guest_executions_acquisition_user_idx;
drop index concurrently if exists users.guest_executions_guest_fingerprint_idx;
