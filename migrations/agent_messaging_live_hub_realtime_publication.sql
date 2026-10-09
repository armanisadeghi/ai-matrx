-- agent_messaging_live_hub_realtime_publication.sql
--
-- The /work Live hub (agent messaging Phase 2) shows every coding session's
-- presence (chat.coding_session.status busy/idle/ended + last_seen_at) and each
-- room member's delivery lag (communication.dm_session_members offered vs
-- delivered cursors) live, through @ai-matrx/realtime postgres_changes. Neither
-- table was in the supabase_realtime publication, so a binding would reach
-- SUBSCRIBED and deliver nothing (realtime skill, Rule 5 / the publication rule).
--
-- Same shape as meet_realtime_publication.sql: idempotent via
-- pg_publication_tables. REPLICA IDENTITY stays DEFAULT: the hub's handlers read
-- only the NEW record and refetch on any change.

do $$
declare
  t record;
begin
  for t in
    select * from (values ('chat', 'coding_session'), ('communication', 'dm_session_members')) as v(s, n)
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = t.s and tablename = t.n
    ) then
      execute format('alter publication supabase_realtime add table %I.%I', t.s, t.n);
    end if;
  end loop;
end $$;
