-- rcb11_comments_realtime_publication.sql
--
-- RC-B11: a comment added to a document appears live for everyone else who can read it. The
-- annotation sidecar (features/rich-document/annotations/useAnnotationRealtime.ts) binds
-- postgres_changes on platform.comments filtered `entity_id=eq.<record id>`; delivery is
-- RLS-authorized per subscriber by the table's own read rule (RC-A2's detail lane: viewer on the
-- parent record), so a person who cannot read the document receives nothing.
--
-- Same shape as meet_realtime_publication.sql (the realtime skill's PUBLICATION RULE). Idempotent
-- via pg_publication_tables. REPLICA IDENTITY stays DEFAULT: the binding filters on entity_id, a
-- column of the NEW row, and the handler re-reads the thread through cmt_list on every event,
-- never trusting old-row data.

set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'platform' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table platform.comments;
  end if;
end $$;
