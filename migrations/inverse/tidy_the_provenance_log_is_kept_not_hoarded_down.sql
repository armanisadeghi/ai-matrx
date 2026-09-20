-- INVERSE of migrations/campaign/tidy_the_provenance_log_is_kept_not_hoarded.sql
--
-- Puts `public.prune_high_volume_logs()` back to the two-block body it had before TIDY (the
-- bytes the `based-on` line in the forward file hashes), drops the two new functions and
-- removes the knob row. Nothing it undoes destroys data: the forward file only ever deletes
-- provenance rows past an organization's own retention, and this file stops that happening
-- again — it cannot bring back a row a prune already took, which is what retention means.

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function public.prune_high_volume_logs()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed integer;
begin
  delete from ops.api_request_log
  where ctid in (
    select ctid from ops.api_request_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.api_request_log removed=%', removed;

  delete from ops.app_log
  where ctid in (
    select ctid from ops.app_log
    where created_at < now() - interval '30 days'
    limit 200000
  );
  get diagnostics removed = row_count;
  raise log 'prune_high_volume_logs: ops.app_log removed=%', removed;
end;
$function$;

drop function if exists custom.provenance_prune(uuid, boolean, integer);
drop function if exists custom.provenance_retention_days(uuid);
delete from platform.feature_knob where feature = 'custom' and key = 'provenance_retention_days';
