-- Repair the bounded historical scheduler rows whose outer status was stored
-- as success even though the canonical agent completion said failed/error/
-- cancelled. The original completion payload remains intact as evidence.
-- Idempotent: repaired rows no longer satisfy status = 'success'.

update scheduler.sch_run
set
  status = 'failed',
  error_message = coalesce(
    nullif(error_message, ''),
    nullif(result_metadata #>> '{completion,result,metadata,error}', ''),
    nullif(result_metadata #>> '{completion,metadata,error}', ''),
    'Agent execution ended with a failed terminal result.'
  )
where status = 'success'
  and lower(
    coalesce(
      result_metadata #>> '{completion,status}',
      result_metadata #>> '{completion,result,status}',
      ''
    )
  ) in ('failed', 'error', 'cancelled', 'canceled');
