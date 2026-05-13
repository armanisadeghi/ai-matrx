-- migrations/sch_realtime_publication.sql
--
-- Add sch_task and sch_run to the supabase_realtime publication so the
-- matrx-frontend FE's useTaskListStream / useRunStream hooks (and the
-- planned @matrx/scheduler-client TS client) receive postgres_changes
-- events for inserts / updates / deletes.
--
-- Subscribers:
--   - features/scheduling/hooks/useTaskListStream.ts (sch_task: I/U/D)
--   - features/scheduling/hooks/useRunStream.ts (sch_run + sch_task)
--   - components/detail/RunHistoryCard.tsx via useRunStream
--
-- Without these tables in the publication, the postgres_changes
-- subscriptions silently no-op: Supabase Realtime accepts the channel,
-- but no row changes are ever broadcast. The FE never sees task or run
-- updates without a manual refresh — including the "Run now" → queued
-- → claimed → running → succeeded lifecycle that's the whole point of
-- the detail view.
--
-- Idempotency: the DO block guards each ADD TABLE with a NOT EXISTS
-- check against pg_publication_tables, so re-running this migration on
-- a DB that already has the tables in the publication is a no-op (no
-- "table is already member of publication" error).
--
-- 2026-05-12 status check showed these tables were NOT yet in the
-- publication on the live DB — this migration adds them as part of
-- the same backfill PR. Once applied, FE realtime subscriptions begin
-- receiving events immediately; no client redeploy needed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sch_task'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sch_task;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sch_run'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sch_run;
  END IF;
END
$$;
