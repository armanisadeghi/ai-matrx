-- seo.keyword_classification_status — a STALE claim is not a running pass.
--
-- THE DEFECT (found 2026-08-25, live): 200 rows sat `status='running'` with
-- `claimed_at` 16 hours old — a pass whose worker died mid-batch. The claim
-- function `fn_claim_keyword_classification_batch` already self-heals those
-- ("Reclaim before claiming, so a crash costs one stale window and not the
-- whole backfill"), but the STATUS function counted every `running` row
-- regardless of age. The coverage card disables "Classify next" while
-- `queue_running > 0`, so one dead worker permanently locked the product's
-- only manual door to classification, showing a spinner that would never stop.
--
-- THE FIX: one definition of "running", shared. A claim older than the
-- `stale_claim_minutes` knob (platform.feature_knob, seo.keyword_classification
-- — the SAME value the claim function is handed) counts as PENDING here,
-- because that is exactly what the next claim will make it. "Next up" names
-- such a keyword too, for the same reason.
--
-- Idempotent: CREATE OR REPLACE, no signature change.

create or replace function seo.keyword_classification_status(
    p_site_id uuid default null::uuid,
    p_min_impressions integer default 0
)
returns table(
    keywords_total bigint, keywords_classified bigint,
    demand_keywords bigint, demand_keywords_classified bigint,
    demand_clicks bigint, demand_clicks_classified bigint,
    demand_impressions bigint, demand_impressions_classified bigint,
    queue_pending bigint, queue_running bigint, queue_failed bigint,
    queue_deferred bigint, pending_clicks bigint, pending_impressions bigint,
    next_phrase text, last_error text, demand_window_days integer,
    demand_as_of date, queue_refreshed_at timestamp with time zone,
    last_classified_at timestamp with time zone,
    site_keywords bigint, site_keywords_classified bigint,
    site_clicks bigint, site_clicks_classified bigint
)
language plpgsql
stable security definer
set search_path to 'seo', 'pg_temp'
as $function$
declare
    v_window integer;
    v_stale_minutes integer;
    v_stale_before timestamptz;
begin
    if not public.is_admin() then
        raise exception 'kwclass_status_forbidden: admin only';
    end if;
    if p_site_id is not null then
        perform seo.gsc_assert_site_access(p_site_id);
    end if;

    select max(q.demand_window_days) into v_window from seo.keyword_classification_queue q;

    -- The SAME knob the claim function is handed. One value, one meaning of stale.
    select greatest(coalesce((k.value #>> '{}')::integer, 45), 1)
      into v_stale_minutes
      from platform.feature_knob k
     where k.feature = 'seo.keyword_classification'
       and k.key = 'stale_claim_minutes';
    v_stale_before := now() - make_interval(mins => coalesce(v_stale_minutes, 45));

    return query
    with universal as (
        select count(*)::bigint as total,
               count(*) filter (where k.classifier_version is not null)::bigint as classified,
               max(k.classified_at) as last_at
          from seo.keyword k
         where k.deleted_at is null
    ),
    -- COVERAGE asks the keyword, WORK asks the queue. `live_running` is the
    -- honest half of `status='running'`: a claim the next batch will NOT take
    -- back. Everything older is already pending in all but name.
    q_state as (
        select q.*,
               (q.status = 'running' and q.claimed_at >= v_stale_before) as live_running,
               (q.status = 'pending'
                or (q.status = 'running' and q.claimed_at < v_stale_before)) as effectively_pending
          from seo.keyword_classification_queue q
    ),
    ledger as (
        select count(*)::bigint as kws,
               count(*) filter (where k.classifier_version is not null)::bigint as kws_done,
               coalesce(sum(q.priority_clicks), 0)::bigint as clicks,
               coalesce(sum(q.priority_clicks) filter (where k.classifier_version is not null), 0)::bigint as clicks_done,
               coalesce(sum(q.priority_impressions), 0)::bigint as imps,
               coalesce(sum(q.priority_impressions) filter (where k.classifier_version is not null), 0)::bigint as imps_done,
               count(*) filter (where q.effectively_pending)::bigint as pending,
               count(*) filter (where q.live_running)::bigint as running,
               count(*) filter (where q.status = 'failed')::bigint as failed,
               count(*) filter (where q.effectively_pending
                                  and q.priority_clicks = 0
                                  and q.priority_impressions < coalesce(p_min_impressions, 0)
                                )::bigint as deferred,
               coalesce(sum(q.priority_clicks) filter (where q.status in ('pending','running')), 0)::bigint as pend_clicks,
               coalesce(sum(q.priority_impressions) filter (where q.status in ('pending','running')), 0)::bigint as pend_imps,
               max(q.demand_as_of) as as_of,
               max(q.updated_at) as refreshed_at
          from q_state q
          join seo.keyword k on k.id = q.keyword_id
    ),
    -- Up-next skips a keyword that is already classified: the queue may not have
    -- walked it yet, but naming it as the next thing the classifier will work on
    -- would be a promise the claim function will not keep. A stale claim IS
    -- claimable, so it belongs here.
    up_next as (
        select k.phrase
          from q_state q
          join seo.keyword k on k.id = q.keyword_id
         where q.effectively_pending
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
