-- studio_session_metrics — per-session aggregate metrics for the /transcripts
-- hub list (recording count + transcript character count).
--
-- SECURITY INVOKER so RLS on the underlying studio_* tables applies to the
-- caller: a user only ever gets metrics for sessions/segments they can read.
--
-- Batched, not N+1: the hub fetches a page of sessions via PostgREST (which keeps
-- count + pagination cheap), then calls this ONCE with the page's session ids to
-- enrich each card with "N recordings · M chars". recording_count excludes
-- detached recordings (they've moved to the Unsorted pool). char_count prefers
-- the active cleaned transcript, falling back to raw when nothing is cleaned yet.
--
-- Idempotent: CREATE OR REPLACE — safe to re-apply.

create or replace function public.studio_session_metrics(p_session_ids uuid[])
returns table (
  session_id uuid,
  recording_count integer,
  char_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ids.sid as session_id,
    (
      select count(*)::integer
      from studio_recording_segments r
      where r.session_id = ids.sid
        and r.detached_at is null
    ) as recording_count,
    coalesce(
      nullif(
        (
          select sum(length(c.text))
          from studio_cleaned_segments c
          where c.session_id = ids.sid
            and c.superseded_at is null
        ),
        0
      ),
      (
        select sum(length(rw.text))
        from studio_raw_segments rw
        where rw.session_id = ids.sid
      ),
      0
    )::bigint as char_count
  from unnest(p_session_ids) as ids(sid);
$$;

grant execute on function public.studio_session_metrics(uuid[]) to authenticated;
