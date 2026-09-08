-- meet_realtime_publication.sql
--
-- MRI-A10 / feedback 761359a4 (critical). `@ai-matrx/meet` 0.3.x opens
-- postgres_changes bindings on `communication.meet_*` from two places:
--   src/core/meetings.ts  watchMeeting()  -> meet_transcript_segments,
--                                            meet_notes, meet_meetings
--                                            (filter meeting_id/id = eq.<id>)
--   src/core/calls.ts     watchCalls()    -> meet_call_invites
--                                            (filter callee_ids=cs.{me})
-- None of the six meet tables was ever added to the `supabase_realtime`
-- publication, so every one of those subscriptions reached SUBSCRIBED and then
-- stayed silent forever. Only the join-time backfill (`requestBackfill`) worked,
-- which is exactly the "healthy-looking screen that is silently wrong" class
-- the realtime skill's Rule 5 names first.
--
-- Same fix, same shape as workbench.notes (realtime_publication_workbench_notes.sql),
-- tool.ui/app.definition, users.user_memory/iam.permissions. Idempotent via
-- pg_publication_tables (ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS).
--
-- All six meet tables are added, not just the four subscribed today:
-- meet_participants and meet_recordings are the roster and the recording row
-- that the meeting surface already renders, and leaving them out only buys a
-- second migration the next time a binding is added.
--
-- REPLICA IDENTITY stays DEFAULT on all six, deliberately. Every binding filters
-- on a column carried by the NEW record (meeting_id, id, callee_ids) and no
-- handler in the package reads `old_record` — each one is `if (row !== null)`
-- and ignores a DELETE. FULL would double WAL volume on
-- meet_transcript_segments (one row per finalized utterance, the highest-write
-- table in the family) to deliver a payload nothing consumes. The day a consumer
-- needs old-row data or RLS-gated DELETE delivery, FULL is the change to make
-- then — see the Meet FEATURE.md realtime section.

do $$
declare
  t text;
begin
  foreach t in array array[
    'meet_meetings',
    'meet_participants',
    'meet_transcript_segments',
    'meet_notes',
    'meet_recordings',
    'meet_call_invites'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'communication'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table communication.%I', t);
    end if;
  end loop;
end $$;
