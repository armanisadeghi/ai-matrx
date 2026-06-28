-- Retention/maintenance for high-volume telemetry logs.
-- Context: on 2026-06-28 an unbounded backfill UPDATE on api_request_log (6M rows)
-- exhausted disk and crash-restarted Postgres. api_request_log was pruned to a
-- 30-day window (4.29M old rows deleted in batches + VACUUM ANALYZE). This adds a
-- bounded, scheduled prune so the high-volume logs never grow unbounded again.
-- Bounded per call (LIMIT) so each cron run is a small, disk-safe transaction.

create or replace function public.prune_high_volume_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.api_request_log
  where ctid in (
    select ctid from public.api_request_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: api_request_log removed=%', removed;

  delete from public.app_log
  where ctid in (
    select ctid from public.app_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: app_log removed=%', removed;
end;
$$;

do $$
begin
  perform cron.unschedule('prune-high-volume-logs')
  where exists (select 1 from cron.job where jobname = 'prune-high-volume-logs');
end$$;

select cron.schedule('prune-high-volume-logs', '7 * * * *', 'select public.prune_high_volume_logs();');
