-- `features/code/hooks/useTabRealtimeWatcher.ts` (the /code Library workspace's
-- live-conflict watcher) subscribes to `tool.ui` and `app.definition` postgres_changes
-- so open tabs detect remote edits. Neither table was ever added to the
-- `supabase_realtime` publication, so the subscription always silently received
-- zero events. Idempotent via pg_publication_tables guard.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'tool' and tablename = 'ui'
  ) then
    alter publication supabase_realtime add table tool.ui;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'app' and tablename = 'definition'
  ) then
    alter publication supabase_realtime add table app.definition;
  end if;
end $$;
