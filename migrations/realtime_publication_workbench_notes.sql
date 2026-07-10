-- Notes FE realtime (`features/notes/redux/realtimeMiddleware.ts`) subscribes
-- to `workbench.notes` postgres_changes. The table was never added to the
-- `supabase_realtime` publication after the public→workbench move, so the
-- subscription always silently received zero events — multi-tab / multi-device
-- edits overwrote each other (data loss). Idempotent via pg_publication_tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'workbench'
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table workbench.notes;
  end if;
end $$;
