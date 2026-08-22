-- Topic placement backfill — the two driver-side reads.
--
-- Companion to `seo_topic_placement_queue.sql` (same feature, separate file because
-- an applied migration's bytes are never re-executed — see aidream
-- db/apply_migrations.py). Both are SERVER-ONLY, like the refresh/claim/complete
-- trio: the browser never reaches the ledger directly.
--
--   1. `fn_topic_placement_settled_since` — what the DAILY CEILING counts. It counts
--      what this ledger settled as an AGENT placement since a moment, not what a
--      refresh reconciled and not what a human placed: a refresh that marks
--      already-placed rows done must not consume a day's budget it never spent, and
--      an expert placing fifty keywords by hand must not shrink the agent's budget.
--
--   2. `fn_topic_placement_sites_owing` — which sites the scheduled pass visits,
--      most-owed-CLICKS first (the same demand order the queue itself uses). It
--      reads the ledger only, so a site that has never been refreshed is never
--      swept: enrolling a site is a human act (opening its topics screen and
--      pressing the button), not something a nightly job decides for them.
--
-- Idempotent. Applied via Supabase MCP / the aidream applier; ledgered in
-- public._schema_migrations.

create or replace function seo.fn_topic_placement_settled_since(
    p_site_id uuid,
    p_since timestamptz
)
returns table (placed bigint)
language sql
stable
security definer
set search_path = seo, public, pg_temp
as $$
    select count(*)::bigint
      from seo.topic_placement_queue q
     where q.site_id = p_site_id
       and q.status = 'done'
       and q.placement_source = 'agent'
       and q.completed_at >= p_since;
$$;

create or replace function seo.fn_topic_placement_sites_owing(
    p_limit integer
)
returns table (site_id uuid, pending bigint, pending_clicks bigint)
language sql
stable
security definer
set search_path = seo, public, pg_temp
as $$
    select q.site_id,
           count(*)::bigint,
           coalesce(sum(q.priority_clicks), 0)::bigint
      from seo.topic_placement_queue q
     where q.status = 'pending'
     group by q.site_id
     order by 3 desc, 2 desc, q.site_id
     limit greatest(1, least(coalesce(p_limit, 1), 100));
$$;

revoke all on function seo.fn_topic_placement_settled_since(uuid, timestamptz)
    from public, anon, authenticated;
revoke all on function seo.fn_topic_placement_sites_owing(integer)
    from public, anon, authenticated;
