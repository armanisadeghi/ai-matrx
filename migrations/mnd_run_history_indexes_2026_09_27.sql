-- mnd_run_history_indexes_2026_09_27.sql
--
-- MANDATE RUN HISTORY — the two lookups `public.mnd_run_history`
-- (mnd_run_history_2026_09_27.sql) makes, indexed.
--
-- A mandate's runs are already recorded where every funnel writes them; this
-- adds no log. It indexes the key each record already carries:
--   · chat.user_request — an agent/chat start or a held code call stamps
--     `metadata.mandate_key`; `run_mandate`'s agent lane runs with
--     `source_feature = 'mandate:<key>'`. The run's OWN mandate is the
--     source_feature one when present (a parent chat's key may be inherited
--     through the context), else the metadata one — the same expression the
--     reader uses, so the index answers it.
--   · workflow.run — every workflow-Holder run stamps `metadata._mandate.chain`
--     ending in the mandate that started it.
--
-- Measured before (production, 2026-09-27): one mandate's newest 25 runs
-- walked all 19,5xx user_request rows through the created_at index, 1.37 s.
--
-- CONCURRENTLY: applied through aidream's runner (autocommit), never inside a
-- transaction. Small tables (~19k and ~1.5k rows); no long lock. A
-- CONCURRENTLY build waits for every open transaction on the table (live chat
-- turns); the runner retries its short lock wait with backoff. A build that
-- fails part-way leaves an INVALID index behind: drop it
-- (`DROP INDEX CONCURRENTLY chat.user_request_mandate_run_idx`) before re-running.

CREATE INDEX CONCURRENTLY IF NOT EXISTS user_request_mandate_run_idx
  ON chat.user_request (
    (coalesce(substring(source_feature from '^mandate:(.+)$'), metadata ->> 'mandate_key')),
    created_at DESC
  )
  WHERE (source_feature LIKE 'mandate:%' OR metadata ? 'mandate_key');

CREATE INDEX CONCURRENTLY IF NOT EXISTS wf_run_mandate_run_idx
  ON workflow.run ((metadata -> '_mandate' -> 'chain' ->> -1), created_at DESC)
  WHERE (metadata ? '_mandate');
