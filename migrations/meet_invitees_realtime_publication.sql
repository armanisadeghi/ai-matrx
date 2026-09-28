-- meet_invitees_realtime_publication.sql
--
-- An invitee's RSVP ("Going? Yes / No / Maybe") is a write to
-- communication.meet_invitees.rsvp_state — from the emailed link
-- (POST /v1/meet/rsvp), the in-app control (POST /v1/meet/meetings/{id}/rsvp),
-- or the pre-join "Going?" corner. The host's Guests tab on /meetings/[id]
-- read the table once on load, and the table was never in the realtime
-- publication (meet_realtime_publication.sql added the six room tables, not
-- this one), so an answer only appeared after a manual reload.
--
-- The Guests tab now subscribes with postgres_changes filtered on
-- meeting_id=eq.<id> (features/meet/hooks/useMeetingInviteesLive.ts) and
-- re-reads the invitee list through the repository on every change and on
-- every reconnect (backfill). REPLICA IDENTITY stays DEFAULT: the filter
-- column is on the NEW record and the handler re-reads rather than consuming
-- old-row data — same reasoning as meet_realtime_publication.sql.
--
-- Idempotent via pg_publication_tables.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'communication'
      and tablename = 'meet_invitees'
  ) then
    alter publication supabase_realtime add table communication.meet_invitees;
  end if;
end $$;
