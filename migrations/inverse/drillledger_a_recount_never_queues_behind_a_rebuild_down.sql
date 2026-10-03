-- chair-step: the inverse of migrations/campaign/drillledger_a_recount_never_queues_behind_a_rebuild.sql (lane DRILL-SUITES) — puts back platform.ai_usage_recount as it was: it waits on the rebuild lock inside the refresh.
-- lane: DRILL-SUITES
-- lock: platform

CREATE OR REPLACE FUNCTION platform.ai_usage_recount(p_organization_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n  bigint;
  v_t0 timestamptz := clock_timestamp();
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
  v_n := runtime.ai_usage_hourly_refresh(p_from, least(p_to, now() + interval '1 hour'));
  return jsonb_build_object('rows', v_n, 'from', date_trunc('hour', p_from, 'UTC'), 'to', p_to,
                            'ms', round(extract(epoch from clock_timestamp() - v_t0) * 1000),
                            'counted_through', now());
end
$function$;
