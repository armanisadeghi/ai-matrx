-- run_lists_realtime_publication.sql
--
-- Transport 1 (in-app Realtime kills polling): add agent_run to the
-- supabase_realtime publication so the FE can subscribe to owner-scoped
-- INSERT/UPDATE instead of polling every 15s. RLS already restricts it to its
-- owner (agent_run_self_select: user_id = auth.uid()), so a filtered
-- postgres_changes subscription only ever delivers the user's own rows.
--
-- sch_run is already in the publication (scheduling's useRunStream).
-- ai_runs is intentionally NOT here: it has been graveyarded (graveyard.ai_runs)
-- and the AI-runs list is mid-migration — convert it after that settles.
-- Idempotent.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='agent_run') then
    alter publication supabase_realtime add table public.agent_run;
  end if;
end $$;
