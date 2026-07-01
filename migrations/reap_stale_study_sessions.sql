-- reap_stale_study_sessions
--
-- Backstop for leaked 'active' study_session rows. The FE closes sessions on a
-- clean finish or abort, but a hard tab-kill mid-drill can't. This reaper marks
-- any session still 'active' after p_max_age as 'abandoned', and an hourly
-- pg_cron job runs it. Loud-recovery spirit: the FE close is the proactive path;
-- this only mops up what escapes it.
--
-- SECURITY DEFINER (updates across users) but NOT granted to authenticated —
-- only the cron job / an admin calls it. Idempotent (CREATE OR REPLACE + named
-- cron job that upserts by name).

create or replace function education.reap_stale_study_sessions(
  p_max_age interval default interval '6 hours'
)
returns integer
language plpgsql
security definer
set search_path = education, public
as $$
declare
  n integer;
begin
  update education.study_session
  set status = 'abandoned',
      ended_at = coalesce(ended_at, now())
  where status = 'active'
    and created_at < now() - p_max_age;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function education.reap_stale_study_sessions(interval) from public;

-- Hourly at :15. cron.schedule upserts by job name, so re-applying is safe.
select cron.schedule(
  'reap-stale-study-sessions',
  '15 * * * *',
  $$select education.reap_stale_study_sessions()$$
);
