-- KI-022 — the facet coverage meter tells the truth about what is classified.
--
-- THE BUG (found 2026-08-24 rebuilding the meter after KI-036 deleted its only
-- surface): `seo.keyword_classification_status` used TWO different definitions
-- of "classified" inside one function. The universal totals and the per-site
-- slice both asked the fact — `seo.keyword.classifier_version is not null` —
-- while the DEMAND ledger asked the BOOKKEEPING — `queue.status = 'done'`.
-- The queue only marks 'done' for rows IT processed, so every keyword
-- classified by any other path (the admin batch classifier
-- `POST /seo/keywords/classify`, an earlier import, a re-classification) stayed
-- 'pending' forever and its clicks counted as UNCOVERED.
--
-- Measured live before this migration: 25 queue rows 'done' vs 364 demand
-- keywords actually classified; 1,990 of 4,667 demand clicks reported covered
-- (42.6%) against 2,802 truly covered (60.0%). The headline meter — the one
-- number the whole strip exists to make trustworthy — understated coverage by
-- 17 points and would have kept understating it as the batch classifier ran.
--
-- THE FIX: the three COVERAGE columns measure the fact; the four WORK columns
-- keep measuring the queue. That split is the point — "how much of the plane is
-- classified" and "what does the backfill still owe" are different questions
-- and only one of them is about the ledger. `queue_pending` therefore still
-- counts rows the queue has not walked even when the keyword is already
-- classified; the next `refresh_queue()` moves those pending → done on its own
-- (it is idempotent and only ever moves a row forward), so the two numbers
-- converge without a backfill of their own.
--
-- Nothing else changes: same signature, same admin gate, same site-access
-- assert, same 24 columns in the same order.

CREATE OR REPLACE FUNCTION seo.keyword_classification_status(
    p_site_id uuid DEFAULT NULL::uuid,
    p_min_impressions integer DEFAULT 0
)
 RETURNS TABLE(keywords_total bigint, keywords_classified bigint, demand_keywords bigint, demand_keywords_classified bigint, demand_clicks bigint, demand_clicks_classified bigint, demand_impressions bigint, demand_impressions_classified bigint, queue_pending bigint, queue_running bigint, queue_failed bigint, queue_deferred bigint, pending_clicks bigint, pending_impressions bigint, next_phrase text, last_error text, demand_window_days integer, demand_as_of date, queue_refreshed_at timestamp with time zone, last_classified_at timestamp with time zone, site_keywords bigint, site_keywords_classified bigint, site_clicks bigint, site_clicks_classified bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
declare
    v_window integer;
begin
    if not public.is_admin() then
        raise exception 'kwclass_status_forbidden: admin only';
    end if;
    if p_site_id is not null then
        perform seo.gsc_assert_site_access(p_site_id);
    end if;

    select max(q.demand_window_days) into v_window from seo.keyword_classification_queue q;

    return query
    with universal as (
        select count(*)::bigint as total,
               count(*) filter (where k.classifier_version is not null)::bigint as classified,
               max(k.classified_at) as last_at
          from seo.keyword k
         where k.deleted_at is null
    ),
    -- COVERAGE asks the keyword, WORK asks the queue. `kq` is the join that
    -- lets one CTE answer both without pretending the ledger is the truth.
    ledger as (
        select count(*)::bigint as kws,
               count(*) filter (where k.classifier_version is not null)::bigint as kws_done,
               coalesce(sum(q.priority_clicks), 0)::bigint as clicks,
               coalesce(sum(q.priority_clicks) filter (where k.classifier_version is not null), 0)::bigint as clicks_done,
               coalesce(sum(q.priority_impressions), 0)::bigint as imps,
               coalesce(sum(q.priority_impressions) filter (where k.classifier_version is not null), 0)::bigint as imps_done,
               count(*) filter (where q.status = 'pending')::bigint as pending,
               count(*) filter (where q.status = 'running')::bigint as running,
               count(*) filter (where q.status = 'failed')::bigint as failed,
               count(*) filter (where q.status = 'pending'
                                  and q.priority_clicks = 0
                                  and q.priority_impressions < coalesce(p_min_impressions, 0)
                                )::bigint as deferred,
               coalesce(sum(q.priority_clicks) filter (where q.status in ('pending','running')), 0)::bigint as pend_clicks,
               coalesce(sum(q.priority_impressions) filter (where q.status in ('pending','running')), 0)::bigint as pend_imps,
               max(q.demand_as_of) as as_of,
               max(q.updated_at) as refreshed_at
          from seo.keyword_classification_queue q
          join seo.keyword k on k.id = q.keyword_id
    ),
    -- Up-next skips a keyword that is already classified: the queue may not have
    -- walked it yet, but naming it as the next thing the classifier will work on
    -- would be a promise the claim function will not keep.
    up_next as (
        select k.phrase
          from seo.keyword_classification_queue q
          join seo.keyword k on k.id = q.keyword_id
         where q.status = 'pending'
           and k.classifier_version is null
           and (q.priority_clicks > 0
                or q.priority_impressions >= coalesce(p_min_impressions, 0))
         order by q.priority_clicks desc, q.priority_impressions desc, q.keyword_id
         limit 1
    ),
    -- Aliased away from the OUT parameter of the same name: an unqualified
    -- `last_error` inside this body resolves to the PL/pgSQL variable, not the column.
    newest_error as (
        select q.last_error as err_text
          from seo.keyword_classification_queue q
         where q.status = 'failed' and q.last_error is not null
         order by q.updated_at desc
         limit 1
    ),
    site_winner as (
        select distinct on (spd.date) spd.date, spd.run_id
          from seo.search_performance_daily spd
         where p_site_id is not null
           and spd.provider = 'gsc'
           and spd.site_id = p_site_id
           and spd.dimension_profile = 'query'
           and spd.date >= current_date - coalesce(v_window, 90)
         order by spd.date, spd.created_at desc, spd.run_id desc
    ),
    site_roll as (
        select spd.keyword_id,
               sum(spd.clicks)::bigint as clicks,
               bool_or(k.classifier_version is not null) as classified
          from seo.search_performance_daily spd
          join site_winner w on w.date = spd.date and w.run_id = spd.run_id
          join seo.keyword k on k.id = spd.keyword_id
         where p_site_id is not null
           and spd.provider = 'gsc'
           and spd.site_id = p_site_id
           and spd.dimension_profile = 'query'
           and spd.date >= current_date - coalesce(v_window, 90)
         group by spd.keyword_id
    ),
    site_agg as (
        select count(*)::bigint as kws,
               count(*) filter (where sr.classified)::bigint as kws_done,
               coalesce(sum(sr.clicks), 0)::bigint as clicks,
               coalesce(sum(sr.clicks) filter (where sr.classified), 0)::bigint as clicks_done
          from site_roll sr
    )
    select u.total, u.classified,
           l.kws, l.kws_done, l.clicks, l.clicks_done, l.imps, l.imps_done,
           l.pending, l.running, l.failed, l.deferred, l.pend_clicks, l.pend_imps,
           (select phrase from up_next),
           (select ne.err_text from newest_error ne),
           v_window, l.as_of, l.refreshed_at, u.last_at,
           case when p_site_id is null then null else s.kws end,
           case when p_site_id is null then null else s.kws_done end,
           case when p_site_id is null then null else s.clicks end,
           case when p_site_id is null then null else s.clicks_done end
      from universal u cross join ledger l cross join site_agg s;
end;
$function$;
