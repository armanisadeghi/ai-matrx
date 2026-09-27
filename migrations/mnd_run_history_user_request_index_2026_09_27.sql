-- mnd_run_history_user_request_index_2026_09_27.sql
--
-- The index public.mnd_run_history (mnd_run_history_2026_09_27.sql) reads
-- chat.user_request through: one mandate's runs, newest first. It was built
-- CONCURRENTLY on the live database on 2026-09-27 through a direct connection
-- with no file behind it. This file is that exact index, so the repository holds
-- what the database holds. IF NOT EXISTS makes it a no-op where it already
-- stands; the definition below matches pg_get_indexdef of the live index:
--
--   CREATE INDEX user_request_mandate_run_idx ON chat.user_request USING btree
--     (COALESCE("substring"(source_feature, '^mandate:(.+)$'::text),
--               (metadata ->> 'mandate_key'::text)), created_at DESC)
--   WHERE ((source_feature ~~ 'mandate:%'::text) OR (metadata ? 'mandate_key'::text))
--
-- CONCURRENTLY needs autocommit, so this file is applied through aidream's
-- runner: python db/apply_migrations.py --source matrx-frontend --only <this file>.

CREATE INDEX CONCURRENTLY IF NOT EXISTS user_request_mandate_run_idx
  ON chat.user_request
  USING btree (
    (coalesce(substring(source_feature from '^mandate:(.+)$'), metadata ->> 'mandate_key')),
    created_at DESC
  )
  WHERE (source_feature LIKE 'mandate:%' OR metadata ? 'mandate_key');
