-- target: branch
--
-- LANE S6 — THE BRANCH'S DDL-GUARD LOG COULD NOT WRITE A ROW.
--
-- Applying S6's up file to the rehearsal branch (2026-09-24 06:51Z) printed ten
-- `announcement FAILED (duplicate key value violates unique constraint "ddl_guard_log_pkey")`
-- warnings: the guard's revokes happened, but its log rows were refused. Measured on the branch:
-- `platform.ddl_guard_log_id_seq` last_value 228 against max(id) 20153 — the branch refresh copied
-- the log's rows without advancing the identity behind them, so every guard announcement on the
-- branch collides until the sequence passes 20153.
--
-- This moves the branch's identity past the rows it already holds. Nothing else. Branch only.

select setval('platform.ddl_guard_log_id_seq',
              greatest((select coalesce(max(id), 0) from platform.ddl_guard_log),
                       (select last_value from platform.ddl_guard_log_id_seq)),
              true);
