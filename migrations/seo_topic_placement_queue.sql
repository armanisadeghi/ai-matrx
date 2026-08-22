-- Topic placement backfill — the durable, demand-ordered ledger that carries the
-- EXISTING Topic Assigner across a site's real traffic, plus the human-confirmation
-- surface for what it proposes.
--
-- WHY THIS EXISTS (measured live 2026-08-22 on Data Destruction, Inc.,
-- 38eff4c9-b021-451a-b995-7d9b3d17db5e): 4,524 of 4,543 windowed keywords have no
-- primary topic, so 70% of that site's clicks are honestly "not placed" and can never
-- resolve a value through the tree — the tree is the resolver's BASE (P8), and a
-- keyword that never reaches it is Unvalued by construction. The Topic Assigner agent
-- (`seo.topic_assigner`, aidream `POST /seo/keywords/assign-topics`) already existed;
-- what did not exist was a flow that FINISHES. The only path was a human typing an
-- industry into the unplaced queue and pressing a button, one page of keywords at a
-- time, with nothing remembering what had been done.
--
-- This is the same shape as `seo.keyword_classification_queue` (aidream migration
-- 0435), for the same reasons, and deliberately so — a second mechanism for "work the
-- corpus in demand order" would be a second thing to get wrong:
--   • a durable ledger, not a script's memory: a dead worker loses one lease window;
--   • demand order (clicks, then impressions), because the entire click-earning
--     universe is a rounding error next to the impression tail;
--   • every ceiling a `platform.feature_knob` row (feature `seo.topic_placement`,
--     seeded by aidream migration 0437) and a missing row RAISES — no constants;
--   • poison-row discipline: a keyword that keeps failing is QUARANTINED with its
--     error, never retried forever and never deleted;
--   • ONE status read the screen renders, so a closed tab returns to the true number.
--
-- WHAT IS DIFFERENT FROM THE FACET QUEUE, and why:
--   1. The ledger is PER SITE. Facets are a universal fact about a phrase; a topic
--      placement is read through a site's demand, its business guidelines and its
--      tree lineage, so the priority — and the work — is per site.
--   2. P12 — AGENTS APPLY, HUMANS WIN. A keyword whose primary link was placed by a
--      human (`seo.keyword_topic.assigned_by = 'human'`, what `gsc_set_keyword_topic`
--      writes) is DONE for this ledger and is never handed to the agent, at refresh
--      time and again at claim time. The agent can never overwrite an expert ruling.
--   3. Low-confidence placements are PROPOSALS, not rulings. They land (the tree is
--      better off with a candidate than with nothing) carrying
--      `metadata.placement = {origin:'agent', confirmed:false, confidence, …}` —
--      exactly the shape the auto-applied class rules already use
--      (`site_keyword_value.metadata.classification`) — and the topics screen shows
--      them in their own queue until a human confirms or replaces them.
--
-- THE WINDOW, deliberately: the rollup sums `seo.search_performance_daily` the same
-- plain way every other topic read does (`gsc_topic_stats`,
-- `gsc_topic_offering_split`, `gsc_topic_unassigned_keywords`) rather than resolving
-- one winning collection run per (site, date) the way the facet queue does. The strip
-- sits directly above those numbers on the same screen, and a strip that disagrees
-- with the headline under it reads as a lie. Unifying every seo topic read on
-- winner-run dedupe is a real follow-up — recorded in FOUND_DEFECTS.md, not smuggled
-- in here where it would silently change two shipped screens.
--
-- 🚨 THE 8s LAW (see seo_keyword_value_map_windowed.sql): every read here is SECURITY
-- DEFINER + `seo.gsc_assert_site_access`, and every call into `keyword_value_map`
-- hands it exactly the keyword ids it is about to report on — never the corpus.
--
-- Idempotent. Applied via Supabase MCP; ledgered in public._schema_migrations.

-- ─────────────────────────────────────────────────────────── THE LEDGER ──

create table if not exists seo.topic_placement_queue (
    site_id              uuid        not null
                         references web.site (id) on delete cascade,
    keyword_id           uuid        not null
                         references seo.keyword (id) on delete cascade,
    status               text        not null default 'pending'
                         check (status in ('pending', 'running', 'done', 'failed')),
    -- Who placed it, once it is done: 'human' (an expert ruling, untouchable) or
    -- 'agent'. NULL while the work is still owed.
    placement_source     text,
    -- Demand, as measured over the rollup window. This is the priority.
    priority_clicks      bigint      not null default 0,
    priority_impressions bigint      not null default 0,
    demand_window_days   integer     not null,
    demand_as_of         date        not null,
    attempts             integer     not null default 0,
    last_error           text,
    claimed_at           timestamptz,
    completed_at         timestamptz,
    enqueued_at          timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    primary key (site_id, keyword_id)
);

comment on table seo.topic_placement_queue is
  'Durable per-site work ledger for topic placement: one row per keyword with Search '
  'Console demand, carrying that demand as its priority and its placement state. '
  'Internal — no client reaches this table; the one sanctioned read is '
  'seo.topic_placement_status(). See migrations/seo_topic_placement_queue.sql.';

-- The claim order, partial so the hot path never sorts the whole ledger.
create index if not exists idx_seo_topicq_claim
    on seo.topic_placement_queue (site_id, priority_clicks desc, priority_impressions desc)
    where status = 'pending';

-- Stale-claim reclaim + the status counts.
create index if not exists idx_seo_topicq_status
    on seo.topic_placement_queue (status, claimed_at);

alter table seo.topic_placement_queue enable row level security;
-- Deliberately NO policies: nothing that authenticates through PostgREST may read or
-- write this ledger.
revoke all on seo.topic_placement_queue from anon, authenticated;

-- ───────────────────────────────────── REFRESH: measure demand, enqueue ──

create or replace function seo.fn_refresh_topic_placement_queue(
    p_site_id uuid,
    p_window_days integer
)
returns table (
    scanned bigint,
    now_pending bigint,
    now_done bigint
)
language plpgsql
volatile
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
declare
    v_as_of date := current_date;
begin
    if p_site_id is null then
        raise exception 'topicq_bad_site: p_site_id is required';
    end if;
    if p_window_days is null or p_window_days < 1 then
        raise exception 'topicq_bad_window: p_window_days must be >= 1';
    end if;

    return query
    with roll as (
        select spd.keyword_id                 as kw_id,
               sum(spd.clicks)::bigint        as clicks,
               sum(spd.impressions)::bigint   as impressions
          from seo.search_performance_daily spd
         where spd.site_id = p_site_id
           and spd.keyword_id is not null
           and spd.date >= v_as_of - p_window_days
         group by 1
    ),
    -- Every keyword with demand gets a row, placed or not: the ledger IS the
    -- coverage rollup the strip reads, so "70% of clicks are not placed" costs
    -- no second scan.
    scored as (
        select r.kw_id,
               r.clicks,
               r.impressions,
               kt.topic_id is not null                       as placed,
               case when kt.topic_id is null then null
                    when kt.assigned_by = 'human' then 'human'
                    else 'agent' end                         as source
          from roll r
          join seo.keyword k on k.id = r.kw_id and k.deleted_at is null
          left join lateral (
              select kt.topic_id, kt.assigned_by
                from seo.keyword_topic kt
               where kt.keyword_id = r.kw_id
                 and kt.is_primary
                 and kt.deleted_at is null
               limit 1
          ) kt on true
    ),
    upserted as (
        insert into seo.topic_placement_queue as q (
            site_id, keyword_id, status, placement_source,
            priority_clicks, priority_impressions,
            demand_window_days, demand_as_of, completed_at
        )
        select p_site_id,
               s.kw_id,
               case when s.placed then 'done' else 'pending' end,
               s.source,
               s.clicks, s.impressions,
               p_window_days, v_as_of,
               case when s.placed then now() end
          from scored s
        on conflict (site_id, keyword_id) do update set
            -- Demand is always refreshed; it is a measurement, not a decision.
            priority_clicks      = excluded.priority_clicks,
            priority_impressions = excluded.priority_impressions,
            demand_window_days   = excluded.demand_window_days,
            demand_as_of         = excluded.demand_as_of,
            placement_source     = excluded.placement_source,
            -- The transitions a refresh may make:
            --   • anything → done, when the keyword now has a primary topic
            --     (this is how a human ruling takes a keyword off the agent's
            --      list the moment it is made);
            --   • done → pending, when the placement was removed (unpinned).
            -- A 'failed' row stays quarantined and a 'running' row is never
            -- yanked out from under its worker.
            status = case
                       when excluded.status = 'done' then 'done'
                       when q.status = 'done' then 'pending'
                       else q.status
                     end,
            attempts = case
                         when q.status = 'done' and excluded.status <> 'done' then 0
                         else q.attempts
                       end,
            completed_at = case when excluded.status = 'done' then now() else null end,
            updated_at   = now()
        returning q.status
    )
    select (select count(*) from scored)::bigint,
           (select count(*) from upserted u where u.status = 'pending')::bigint,
           (select count(*) from upserted u where u.status = 'done')::bigint;
end;
$$;

-- ──────────────────────── CLAIM: the atomic, priority-ordered hand-off ──

-- The demand floor is a CLAIM-time policy, never a rollup filter: the ledger always
-- measures every keyword with demand so coverage percentages stay honest, and the
-- floor decides only what we are willing to SPEND on. What it defers is reported by
-- the status function as `queue_deferred`, never folded into "placed".
create or replace function seo.fn_claim_topic_placement_batch(
    p_site_id uuid,
    p_limit integer,
    p_max_attempts integer,
    p_stale_claim_minutes integer,
    p_min_impressions integer
)
returns table (
    keyword_id uuid,
    phrase text,
    priority_clicks bigint,
    priority_impressions bigint
)
language plpgsql
volatile
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
begin
    if p_site_id is null then
        raise exception 'topicq_bad_site: p_site_id is required';
    end if;
    if p_limit is null or p_limit < 1 then
        raise exception 'topicq_bad_limit: p_limit must be >= 1';
    end if;

    -- A worker that died mid-batch left its rows 'running' forever. Reclaim before
    -- claiming, so a crash costs one stale window and not the whole backfill.
    update seo.topic_placement_queue q
       set status = 'pending', claimed_at = null, updated_at = now()
     where q.site_id = p_site_id
       and q.status = 'running'
       and q.claimed_at < now() - make_interval(mins => greatest(p_stale_claim_minutes, 1));

    return query
    with picked as (
        select q.keyword_id as kw_id
          from seo.topic_placement_queue q
         where q.site_id = p_site_id
           and q.status = 'pending'
           and q.attempts < greatest(p_max_attempts, 1)
           -- A keyword that earned a click is never below the floor.
           and (q.priority_clicks > 0
                or q.priority_impressions >= coalesce(p_min_impressions, 0))
           -- P12, enforced a second time at the last possible moment: a keyword
           -- placed since the last refresh — above all, one a human placed — is
           -- never handed to the agent. The refresh already marks these done; this
           -- is the guard that holds when a ruling lands mid-pass.
           and not exists (
               select 1 from seo.keyword_topic kt
                where kt.keyword_id = q.keyword_id
                  and kt.is_primary
                  and kt.deleted_at is null
           )
         order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
         limit p_limit
         for update skip locked
    ),
    claimed as (
        update seo.topic_placement_queue q
           set status = 'running', claimed_at = now(), updated_at = now()
          from picked p
         where q.site_id = p_site_id and q.keyword_id = p.kw_id
        returning q.keyword_id as kw_id, q.priority_clicks as clicks, q.priority_impressions as imps
    )
    select c.kw_id, k.phrase, c.clicks, c.imps
      from claimed c
      join seo.keyword k on k.id = c.kw_id
     order by c.clicks desc, c.imps desc;
end;
$$;

-- ───────────────── COMPLETE: settle a claim against what actually landed ──

create or replace function seo.fn_complete_topic_placement_batch(
    p_site_id uuid,
    p_keyword_ids uuid[],
    p_error text,
    p_max_attempts integer
)
returns table (marked_done bigint, marked_pending bigint, quarantined bigint)
language plpgsql
volatile
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
begin
    -- Truth comes from the placement, never from the caller's optimism: a row is
    -- done only if the keyword actually has a primary topic now.
    return query
    with settled as (
        update seo.topic_placement_queue q
           set status = case
                          when kt.topic_id is not null then 'done'
                          when q.attempts + 1 >= greatest(p_max_attempts, 1) then 'failed'
                          else 'pending'
                        end,
               placement_source = case
                                    when kt.topic_id is null then null
                                    when kt.assigned_by = 'human' then 'human'
                                    else 'agent'
                                  end,
               attempts     = q.attempts + 1,
               last_error   = case
                                when kt.topic_id is not null then null
                                else coalesce(p_error,
                                     'the assigner returned no placement for this keyword')
                              end,
               claimed_at   = null,
               completed_at = case when kt.topic_id is not null then now() end,
               updated_at   = now()
          from (select unnest(p_keyword_ids) as kw_id) ids
          left join lateral (
              select kt.topic_id, kt.assigned_by
                from seo.keyword_topic kt
               where kt.keyword_id = ids.kw_id
                 and kt.is_primary
                 and kt.deleted_at is null
               limit 1
          ) kt on true
         where q.site_id = p_site_id
           and q.keyword_id = ids.kw_id
        returning q.status
    )
    select count(*) filter (where s.status = 'done')::bigint,
           count(*) filter (where s.status = 'pending')::bigint,
           count(*) filter (where s.status = 'failed')::bigint
      from settled s;
end;
$$;

-- The three counters the aidream driver reports back on a pass, in ONE scan.
-- Server-only, like the three functions above: the browser reads the status
-- function instead.
create or replace function seo.fn_topic_placement_counts(
    p_site_id uuid,
    p_min_impressions integer
)
returns table (queue_pending bigint, queue_deferred bigint, pending_clicks bigint)
language sql
stable
security definer
set search_path = seo, public, pg_temp
as $$
    select count(*) filter (where q.status = 'pending')::bigint,
           count(*) filter (where q.status = 'pending'
                              and q.priority_clicks = 0
                              and q.priority_impressions < coalesce(p_min_impressions, 0)
                           )::bigint,
           coalesce(sum(q.priority_clicks)
                    filter (where q.status in ('pending', 'running')), 0)::bigint
      from seo.topic_placement_queue q
     where q.site_id = p_site_id;
$$;

-- ─────────────────────────────── STATUS: the ONE read the screen renders ──

drop function if exists seo.topic_placement_status(uuid, integer);

create function seo.topic_placement_status(
    p_site_id uuid,
    p_min_impressions integer default 0
)
returns table (
    -- Coverage, straight out of the ledger (no second scan). Clicks first: the
    -- headline is what the business feels, not a row count.
    demand_keywords          bigint,
    demand_keywords_placed   bigint,
    demand_clicks            bigint,
    demand_clicks_placed     bigint,
    demand_impressions       bigint,
    demand_impressions_placed bigint,
    -- Who placed what (P12 made visible).
    placed_by_human          bigint,
    placed_by_agent          bigint,
    -- Agent placements below the confidence floor, waiting for a human.
    proposals_pending        bigint,
    proposal_clicks          bigint,
    -- The work still owed.
    queue_pending            bigint,
    queue_running            bigint,
    queue_failed             bigint,
    queue_deferred           bigint,
    pending_clicks           bigint,
    next_phrase              text,
    last_error               text,
    demand_window_days       integer,
    demand_as_of             date,
    queue_refreshed_at       timestamptz,
    last_placed_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
begin
    perform seo.gsc_assert_site_access(p_site_id);

    return query
    with ledger as (
        select count(*)::bigint as kws,
               count(*) filter (where q.status = 'done')::bigint as kws_done,
               coalesce(sum(q.priority_clicks), 0)::bigint as clicks,
               coalesce(sum(q.priority_clicks) filter (where q.status = 'done'), 0)::bigint
                 as clicks_done,
               coalesce(sum(q.priority_impressions), 0)::bigint as imps,
               coalesce(sum(q.priority_impressions) filter (where q.status = 'done'), 0)::bigint
                 as imps_done,
               count(*) filter (where q.placement_source = 'human')::bigint as by_human,
               count(*) filter (where q.placement_source = 'agent')::bigint as by_agent,
               count(*) filter (where q.status = 'pending')::bigint as pending,
               count(*) filter (where q.status = 'running')::bigint as running,
               count(*) filter (where q.status = 'failed')::bigint as failed,
               count(*) filter (where q.status = 'pending'
                                  and q.priority_clicks = 0
                                  and q.priority_impressions < coalesce(p_min_impressions, 0)
                               )::bigint as deferred,
               coalesce(sum(q.priority_clicks)
                        filter (where q.status in ('pending', 'running')), 0)::bigint
                 as pend_clicks,
               max(q.demand_window_days) as window_days,
               max(q.demand_as_of) as as_of,
               max(q.updated_at) as refreshed_at,
               max(q.completed_at) as placed_at
          from seo.topic_placement_queue q
         where q.site_id = p_site_id
    ),
    -- A proposal is an agent placement the confidence floor left unconfirmed. It
    -- is counted here and nowhere else: it IS placed, so folding it into "owed"
    -- would double-count the work, and hiding it would make an unreviewed
    -- machine ruling look like an expert one.
    proposals as (
        select count(*)::bigint as n,
               coalesce(sum(q.priority_clicks), 0)::bigint as clicks
          from seo.topic_placement_queue q
          join seo.keyword_topic kt
            on kt.keyword_id = q.keyword_id and kt.is_primary and kt.deleted_at is null
         where q.site_id = p_site_id
           and kt.metadata #>> '{placement,confirmed}' = 'false'
    ),
    up_next as (
        select k.phrase
          from seo.topic_placement_queue q
          join seo.keyword k on k.id = q.keyword_id
         where q.site_id = p_site_id
           and q.status = 'pending'
           and (q.priority_clicks > 0
                or q.priority_impressions >= coalesce(p_min_impressions, 0))
         order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
         limit 1
    ),
    -- Aliased away from the OUT parameter of the same name: an unqualified
    -- `last_error` in this body resolves to the PL/pgSQL variable, not the column.
    newest_error as (
        select q.last_error as err_text
          from seo.topic_placement_queue q
         where q.site_id = p_site_id and q.status = 'failed' and q.last_error is not null
         order by q.updated_at desc
         limit 1
    )
    select l.kws, l.kws_done, l.clicks, l.clicks_done, l.imps, l.imps_done,
           l.by_human, l.by_agent,
           pr.n, pr.clicks,
           l.pending, l.running, l.failed, l.deferred, l.pend_clicks,
           (select phrase from up_next),
           (select ne.err_text from newest_error ne),
           l.window_days, l.as_of, l.refreshed_at, l.placed_at
      from ledger l cross join proposals pr;
end;
$$;

-- ──────────────────────────── PROPOSALS: read them, then confirm or replace ──

-- Everything the proposed queue renders: the agent's placement, what it landed on,
-- how sure it was, and what the keyword is worth once the tree carries it.
drop function if exists seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer);

create function seo.gsc_topic_proposed_keywords(
    p_site_id uuid,
    p_start date,
    p_end date,
    p_search text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    keyword_id uuid,
    phrase text,
    topic_id uuid,
    topic_name text,
    confidence smallint,
    clicks bigint,
    impressions bigint,
    value_band text,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
begin
    perform seo.gsc_assert_site_access(p_site_id);

    return query
    with win as materialized (
        select spd.keyword_id as kw_id,
               sum(spd.clicks)::bigint as clicks,
               sum(spd.impressions)::bigint as impressions
          from seo.search_performance_daily spd
         where spd.site_id = p_site_id and spd.keyword_id is not null
           and spd.date between p_start and p_end
         group by 1
    ),
    proposed as materialized (
        select w.kw_id, k.normalized_phrase as phrase, w.clicks, w.impressions,
               kt.topic_id as tid, t.name as tname, kt.confidence as conf
          from win w
          join seo.keyword k on k.id = w.kw_id and k.deleted_at is null
          join seo.keyword_topic kt
            on kt.keyword_id = w.kw_id and kt.is_primary and kt.deleted_at is null
          join seo.topic t on t.id = kt.topic_id and t.deleted_at is null
         where kt.metadata #>> '{placement,confirmed}' = 'false'
           and (p_search is null or btrim(p_search) = ''
                or k.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
    ),
    page as materialized (
        select p.* from proposed p
        order by p.clicks desc, p.impressions desc, p.phrase
        limit greatest(1, least(coalesce(p_limit, 50), 200))
        offset greatest(0, coalesce(p_offset, 0))
    ),
    -- THE SCOPE RULE: only the page being rendered.
    vm as materialized (
        select m.keyword_id as kw_id, m.value_band as band
          from seo.keyword_value_map(p_site_id, (select array_agg(pg.kw_id) from page pg)) m
    )
    select p.kw_id, p.phrase, p.tid, p.tname, p.conf, p.clicks, p.impressions,
           coalesce(vm.band, 'unvalued'),
           (select count(*) from proposed)::bigint
      from page p
      left join vm on vm.kw_id = p.kw_id
     order by p.clicks desc, p.impressions desc, p.phrase;
end;
$$;

-- Confirm agent placements. This is the human half of P12: the ruling stops being a
-- proposal and becomes the site's own. Replacing one instead is the EXISTING write
-- (`gsc_set_keyword_topic`), which stamps assigned_by='human' and thereby takes the
-- keyword off the agent's list forever.
drop function if exists seo.gsc_confirm_keyword_topic(uuid, uuid[]);

create function seo.gsc_confirm_keyword_topic(
    p_site_id uuid,
    p_keyword_ids uuid[]
)
returns table (
    keyword_id uuid,
    value_band text,
    value_source text,
    value_score numeric
)
language plpgsql
volatile
security definer
set search_path = seo, web, iam, platform, public, pg_temp
as $$
begin
    perform seo.gsc_assert_site_editor(p_site_id);

    if p_keyword_ids is null or array_length(p_keyword_ids, 1) is null then
        raise exception 'gsc_no_keywords';
    end if;

    update seo.keyword_topic kt
       set metadata = jsonb_set(
                        jsonb_set(coalesce(kt.metadata, '{}'::jsonb),
                                  '{placement,confirmed}', 'true'::jsonb, true),
                        '{placement,confirmed_at}', to_jsonb(now()), true),
           updated_at = now(),
           updated_by = (select auth.uid())
     where kt.keyword_id = any (p_keyword_ids)
       and kt.is_primary
       and kt.deleted_at is null
       and kt.metadata #>> '{placement,confirmed}' = 'false';

    return query
    select m.keyword_id, m.value_band, m.value_source, m.value_score
      from seo.keyword_value_map(p_site_id, p_keyword_ids) m;
end;
$$;

-- ────────────────────────────────────────────────────────────── GRANTS ──
-- The four mutating/driver functions are SERVER-ONLY: aidream's driver connects as
-- the table owner, and the browser drives a pass through the admin-gated aidream
-- endpoint. Leaving them EXECUTE-able by `authenticated` would be a second,
-- unguarded authority over the ledger.

revoke all on function seo.fn_refresh_topic_placement_queue(uuid, integer)
    from public, anon, authenticated;
revoke all on function seo.fn_claim_topic_placement_batch(uuid, integer, integer, integer, integer)
    from public, anon, authenticated;
revoke all on function seo.fn_complete_topic_placement_batch(uuid, uuid[], text, integer)
    from public, anon, authenticated;
revoke all on function seo.fn_topic_placement_counts(uuid, integer)
    from public, anon, authenticated;

revoke all on function seo.topic_placement_status(uuid, integer) from public;
grant execute on function seo.topic_placement_status(uuid, integer) to authenticated;

revoke all on function seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer)
    from public;
grant execute on function seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer)
    to authenticated;

revoke all on function seo.gsc_confirm_keyword_topic(uuid, uuid[]) from public;
grant execute on function seo.gsc_confirm_keyword_topic(uuid, uuid[]) to authenticated;
