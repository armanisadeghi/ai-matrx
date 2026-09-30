-- chair-step: the only non-additive statements are REVOKEs of EXECUTE from PUBLIC, anon and authenticated on the five functions this same file creates, so they are born server-only exactly like the two functions they supersede (ACL {postgres, service_role}); nothing that exists before this file loses a privilege.
-- The keyword-classification demand rollup reads ONE site and ONE bounded date span per statement.
--
-- WHY (2026-09-30). The approved nightly "SEO — universal facet backfill" died every night from
-- 2026-09-20 in ~55 s with `QueryCanceledError: canceling statement due to statement timeout`,
-- and the repeat guard suspended it on 2026-09-22. The statement that died was
-- `seo.fn_enqueue_keyword_click_tail(int, text)`: it re-rolled ALL Search Console history for ALL
-- sites (seo.search_performance_daily — 17.8M rows / 15 GB) every night, measured 128 s on the
-- 2026-09-29 clone, to find ZERO new keywords. It had always been that slow relative to the
-- table; what changed on 2026-09-19 07:21 was aidream 0919, which bounded the `postgres` role at
-- `statement_timeout = 30s` — and a client-side asyncpg `timeout=300` never lifts a server
-- ceiling. The in-window refresh (`fn_refresh_keyword_classification_queue`) is the same shape
-- over 90 days and measured 18.7 s — inside 30 s only for now.
--
-- THE FIX IS SCOPE, NOT HEAD-ROOM. Every read here is refused unless it names one site and a
-- span of at most 62 days (~1 s cold for the largest site, measured). The caller
-- (aidream/services/seo/keyword_classification_backfill.py) walks sites × spans, sums each
-- keyword across them in memory (exact: a winning run is resolved per (site, date), and spans
-- partition dates), and writes the ledger through bounded array upserts. The click tail stops
-- being a nightly whole-history scan: it sweeps only the HISTORY dates (older than the demand
-- window) of Search Console runs that completed since the last demand refresh — which on an
-- ordinary night is nothing at all, and on a new site's history import is that site's history,
-- once.
--
-- Additive: four new functions, no body replaced. The two whole-corpus functions stay until the
-- server that calls them is deployed with the new caller; their DROP is a separate file.
-- ACL mirrors the functions they supersede: server-only (postgres owner + service_role).

-- 1. The sites that hold Search Console query rows — a loose index scan over
--    idx_seo_sperf_gsc_read (site_id leading, partial on provider = 'gsc'), one probe per site.
CREATE OR REPLACE FUNCTION seo.fn_gsc_query_sites()
RETURNS TABLE(site_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'seo', 'pg_temp'
AS $function$
    with recursive s as (
        select (select spd.site_id
                  from seo.search_performance_daily spd
                 where spd.provider = 'gsc'
                 order by spd.site_id
                 limit 1) as sid
        union all
        select (select spd.site_id
                  from seo.search_performance_daily spd
                 where spd.provider = 'gsc'
                   and spd.site_id > s.sid
                 order by spd.site_id
                 limit 1)
          from s
         where s.sid is not null
    )
    select s.sid from s where s.sid is not null;
$function$;

-- 2. One site's per-keyword Search Console demand over one bounded span.
--    Winning run per (site, date) exactly as the whole-corpus refresh resolved it, so a
--    re-collected day is never double-counted. p_unqueued_clicked_only = the click-tail predicate
--    (earned a click in the span AND not already in the ledger).
CREATE OR REPLACE FUNCTION seo.fn_gsc_keyword_demand_span(
    p_site_id uuid,
    p_from date,
    p_to date,
    p_unqueued_clicked_only boolean
)
RETURNS TABLE(keyword_id uuid, clicks bigint, impressions bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'seo', 'pg_temp'
AS $function$
begin
    -- 🚨 THE SCOPE RULE, enforced where it cannot be forgotten: one site, one bounded span.
    if p_site_id is null then
        raise exception 'gsc_demand_span_needs_site: p_site_id is required — a rollup never spans every site';
    end if;
    if p_from is null or p_to is null or p_to < p_from then
        raise exception 'gsc_demand_span_bad_span: p_from/p_to must be a non-empty date span';
    end if;
    if p_to - p_from > 62 then
        raise exception 'gsc_demand_span_too_wide: % days requested, at most 63 per statement — walk the span in chunks',
            p_to - p_from + 1;
    end if;

    return query
    with winner as (
        select distinct on (spd.date) spd.date, spd.run_id
          from seo.search_performance_daily spd
         where spd.site_id = p_site_id
           and spd.provider = 'gsc'
           and spd.dimension_profile = 'query'
           and spd.date between p_from and p_to
         order by spd.date, spd.created_at desc, spd.run_id desc
    ),
    roll as (
        select spd.keyword_id,
               sum(spd.clicks)::bigint      as clicks,
               sum(spd.impressions)::bigint as impressions
          from seo.search_performance_daily spd
          join winner w on w.date = spd.date and w.run_id = spd.run_id
         where spd.site_id = p_site_id
           and spd.provider = 'gsc'
           and spd.dimension_profile = 'query'
           and spd.date between p_from and p_to
           and spd.keyword_id is not null
         group by spd.keyword_id
    )
    select r.keyword_id, r.clicks, r.impressions
      from roll r
     where not coalesce(p_unqueued_clicked_only, false)
        or (r.clicks > 0
            and not exists (select 1 from seo.keyword_classification_queue q
                             where q.keyword_id = r.keyword_id));
end;
$function$;

-- 3. The tier-0 ledger write for one bounded batch of already-summed keywords. The state
--    machine is byte-for-byte the one fn_refresh_keyword_classification_queue carried.
CREATE OR REPLACE FUNCTION seo.fn_upsert_keyword_classification_demand(
    p_target_version text,
    p_window_days integer,
    p_keyword_ids uuid[],
    p_clicks bigint[],
    p_impressions bigint[],
    p_site_counts integer[]
)
RETURNS TABLE(scanned bigint, now_pending bigint, now_done bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'seo', 'pg_temp'
AS $function$
declare
    v_as_of date := current_date;
    v_n integer := coalesce(cardinality(p_keyword_ids), 0);
begin
    if coalesce(p_target_version, '') = '' then
        raise exception 'kwclassq_bad_version: p_target_version is required';
    end if;
    if p_window_days is null or p_window_days < 1 then
        raise exception 'kwclassq_bad_window: p_window_days must be >= 1';
    end if;
    if v_n <> coalesce(cardinality(p_clicks), 0)
       or v_n <> coalesce(cardinality(p_impressions), 0)
       or v_n <> coalesce(cardinality(p_site_counts), 0) then
        raise exception 'kwclassq_ragged_batch: the four arrays must be the same length';
    end if;
    if v_n > 10000 then
        raise exception 'kwclassq_batch_too_large: % keywords, at most 10000 per statement', v_n;
    end if;

    return query
    with incoming as (
        select * from unnest(p_keyword_ids, p_clicks, p_impressions, p_site_counts)
                   as t(keyword_id, clicks, impressions, site_count)
    ),
    scored as (
        select i.keyword_id, i.clicks, i.impressions, i.site_count,
               (k.classifier_version is not null
                and k.classifier_version >= p_target_version) as already_done
          from incoming i
          join seo.keyword k on k.id = i.keyword_id
         where k.deleted_at is null
    ),
    upserted as (
        insert into seo.keyword_classification_queue as q (
            keyword_id, target_version, status,
            priority_clicks, priority_impressions, site_count,
            demand_window_days, demand_as_of, demand_tier, completed_at
        )
        select s.keyword_id,
               p_target_version,
               case when s.already_done then 'done' else 'pending' end,
               s.clicks, s.impressions, s.site_count,
               p_window_days, v_as_of, 0,
               case when s.already_done then now() end
          from scored s
        on conflict (keyword_id) do update set
            priority_clicks      = excluded.priority_clicks,
            priority_impressions = excluded.priority_impressions,
            site_count           = excluded.site_count,
            demand_window_days   = excluded.demand_window_days,
            demand_as_of         = excluded.demand_as_of,
            target_version       = excluded.target_version,
            -- Live in-window demand is tier 0 by definition; also the promotion path out of
            -- the historical click tail.
            demand_tier          = 0,
            -- anything → done when classified at/after target; done → pending when the target
            -- moved; 'failed' stays quarantined; 'running' is never yanked from its worker.
            status = case
                       when excluded.status = 'done' then 'done'
                       when q.status = 'done' and q.target_version < excluded.target_version
                            then 'pending'
                       when q.status = 'done' then 'done'
                       else q.status
                     end,
            attempts = case
                         when q.status = 'done' and q.target_version < excluded.target_version
                              then 0
                         else q.attempts
                       end,
            completed_at = case when excluded.status = 'done' then now() else q.completed_at end,
            updated_at   = now()
        returning q.status
    )
    select (select count(*) from scored)::bigint,
           (select count(*) from upserted u where u.status = 'pending')::bigint,
           (select count(*) from upserted u where u.status = 'done')::bigint;
end;
$function$;

-- 4. Which history spans the click tail must sweep: the dates OLDER than the demand window,
--    collected by Search Console runs that completed since the last demand refresh (p_since;
--    NULL = every run, the bootstrap on an empty ledger). An ordinary nightly run collects the
--    last few days, all inside the window, so it contributes nothing.
CREATE OR REPLACE FUNCTION seo.fn_click_tail_history_spans(
    p_since date,
    p_history_before date
)
RETURNS TABLE(run_id uuid, site_id uuid, span_from date, span_to date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'seo', 'pg_temp'
AS $function$
    select d.id, d.site_id, d.start_date, least(d.end_date, p_history_before - 1)
      from (
        select r.id,
               r.site_id,
               -- The cast only ever sees a well-formed date: a CASE guard, because a WHERE
               -- clause does not promise the regex runs before the cast.
               case when (r.settings->>'start_date') ~ '^\d{4}-\d{2}-\d{2}$'
                    then (r.settings->>'start_date')::date end as start_date,
               case when (r.settings->>'end_date') ~ '^\d{4}-\d{2}-\d{2}$'
                    then (r.settings->>'end_date')::date end as end_date
          from seo.collection_run r
         where r.provider = 'gsc'
           and r.capability = 'search_performance'
           and r.status = 'completed'
           and r.site_id is not null
           and r.deleted_at is null
           and (p_since is null or r.completed_at >= p_since::timestamptz)
      ) d
     where d.start_date is not null
       and d.end_date is not null
       and d.start_date < p_history_before;
$function$;

-- 5. The click-tail ledger write for one bounded batch the caller already summed and capped.
--    Tier 1, ON CONFLICT DO NOTHING — it can never touch a row the queue already holds.
CREATE OR REPLACE FUNCTION seo.fn_enqueue_keyword_click_tail_batch(
    p_target_version text,
    p_keyword_ids uuid[],
    p_clicks bigint[],
    p_impressions bigint[],
    p_site_counts integer[],
    p_window_days integer[]
)
RETURNS TABLE(enqueued bigint, revived bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'seo', 'pg_temp'
AS $function$
declare
    v_as_of date := current_date;
    v_revived bigint := 0;
    v_n integer := coalesce(cardinality(p_keyword_ids), 0);
begin
    if coalesce(p_target_version, '') = '' then
        raise exception 'kwclassq_bad_version: p_target_version is required';
    end if;
    if v_n <> coalesce(cardinality(p_clicks), 0)
       or v_n <> coalesce(cardinality(p_impressions), 0)
       or v_n <> coalesce(cardinality(p_site_counts), 0)
       or v_n <> coalesce(cardinality(p_window_days), 0) then
        raise exception 'kwclassq_ragged_batch: the five arrays must be the same length';
    end if;
    if v_n > 10000 then
        raise exception 'kwclassq_batch_too_large: % keywords, at most 10000 per statement', v_n;
    end if;

    -- A tail row done for an older vocabulary comes back when the classifier version moves;
    -- `demand_tier = 1` makes it provably unable to touch a live in-window row. The ledger is
    -- ~80k rows, so this is a bounded read of the ledger, never of Search Console history.
    update seo.keyword_classification_queue q
       set status = 'pending',
           attempts = 0,
           target_version = p_target_version,
           completed_at = null,
           updated_at = now()
     where q.demand_tier = 1
       and q.status = 'done'
       and q.target_version < p_target_version;
    GET DIAGNOSTICS v_revived = ROW_COUNT;

    return query
    with incoming as (
        select * from unnest(p_keyword_ids, p_clicks, p_impressions, p_site_counts, p_window_days)
                   as t(keyword_id, clicks, impressions, site_count, window_days)
    ),
    ins as (
        insert into seo.keyword_classification_queue as q (
            keyword_id, target_version, status,
            priority_clicks, priority_impressions, site_count,
            demand_window_days, demand_as_of, demand_tier, completed_at
        )
        select i.keyword_id,
               p_target_version,
               case when k.classifier_version is not null
                         and k.classifier_version >= p_target_version then 'done' else 'pending' end,
               i.clicks, i.impressions, i.site_count,
               greatest(i.window_days, 1), v_as_of, 1,
               case when k.classifier_version is not null
                         and k.classifier_version >= p_target_version then now() end
          from incoming i
          join seo.keyword k on k.id = i.keyword_id
         where k.deleted_at is null
        on conflict (keyword_id) do nothing
        returning 1
    )
    select (select count(*) from ins)::bigint, v_revived;
end;
$function$;

REVOKE ALL ON FUNCTION seo.fn_gsc_query_sites() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo.fn_gsc_keyword_demand_span(uuid, date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo.fn_upsert_keyword_classification_demand(text, integer, uuid[], bigint[], bigint[], integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo.fn_click_tail_history_spans(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo.fn_enqueue_keyword_click_tail_batch(text, uuid[], bigint[], bigint[], integer[], integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.fn_gsc_query_sites() TO service_role;
GRANT EXECUTE ON FUNCTION seo.fn_gsc_keyword_demand_span(uuid, date, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION seo.fn_upsert_keyword_classification_demand(text, integer, uuid[], bigint[], bigint[], integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION seo.fn_click_tail_history_spans(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION seo.fn_enqueue_keyword_click_tail_batch(text, uuid[], bigint[], bigint[], integer[], integer[]) TO service_role;
