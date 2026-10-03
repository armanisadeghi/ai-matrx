-- chair-step: lane DRILL-SUITES — platform.ai_usage_recount (the usage page's Recount door) no longer queues behind another rebuild of the rollup.
-- lane: DRILL-SUITES
-- lock: platform
-- based-on: platform.ai_usage_recount(uuid, timestamp with time zone, timestamp with time zone) ace3eb8ee50d1be00681929bd188158e0941200a53170389148a8e5dd3f0c9b9
--
-- THE DEFECT (usage screen walk step 02, ai_usage_recount 500): the door runs as `authenticated`, whose
-- statement_timeout and lock_timeout are 8 s. The rebuild takes ~3.5-5 s and holds the one-rebuild-at-a-time
-- advisory lock (drillusage_one_rollup_rebuild_at_a_time.sql); a recount that arrives while the 10-minute
-- job, the nightly 35-day rebuild or a page's earlier recount holds it WAITS, and wait + own run passes 8 s
-- -> the request is cancelled and PostgREST answers 500. The pg_cron jobs set 5 min / 2 min for this reason;
-- a client door cannot.
-- THE CLASS: any client door that takes the rollup's rebuild lock. THE FIX at the door: try the lock; when
-- another rebuild already holds it the rollup is being counted right now, so answer {busy: true} with the
-- instant it was last counted through, never a 500 and never a second queued rebuild.
-- Guard: scripts/campaign-tests/drillledger_records_green.sql R-section (a recount while the lock is held
-- answers busy, plant=queue restores the waiting door and goes RED).
-- INVERSE: migrations/inverse/drillledger_a_recount_never_queues_behind_a_rebuild_down.sql

CREATE OR REPLACE FUNCTION platform.ai_usage_recount(p_organization_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n  bigint;
  v_t0 timestamptz := clock_timestamp();
  v_through timestamptz;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'platform.ai_usage_recount');
  if not public.is_platform_admin() then
    raise exception 'AI usage is recounted only inside the admin apps, by a platform admin.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'A recount needs a window: from before to.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '100 days' then
    raise exception 'A recount covers at most 100 days at a time (asked for %).', p_to - p_from
      using errcode = '22023', hint = 'Recount a shorter window; the rollup keeps every hour it has already counted.';
  end if;
  -- Another rebuild holds the rollup's lock: it is being counted right now. Say so; never queue behind it
  -- (a client door has 8 s, a rebuild up to 20 minutes) and never run a second one after it.
  if not pg_try_advisory_xact_lock(hashtextextended('runtime._ai_usage_hourly', 0)) then
    select covered_to into v_through from runtime._ai_usage_hourly_watermark where singleton;
    return jsonb_build_object('rows', 0, 'busy', true, 'from', date_trunc('hour', p_from, 'UTC'), 'to', p_to,
                              'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
                              'counted_through', coalesce(v_through, now()));
  end if;
  v_n := runtime.ai_usage_hourly_refresh(p_from, least(p_to, now() + interval '1 hour'));
  return jsonb_build_object('rows', v_n, 'busy', false, 'from', date_trunc('hour', p_from, 'UTC'), 'to', p_to,
                            'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
                            'counted_through', now());
end
$function$;
