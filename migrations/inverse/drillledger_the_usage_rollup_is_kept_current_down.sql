-- chair-step: the inverse of migrations/campaign/drillledger_the_usage_rollup_is_kept_current.sql (lane DRILL-LEDGER-RECORDS) — unschedules the two pg_cron jobs runtime-ai-usage-recent and runtime-ai-usage-nightly and removes their Feature Registry anchors. The rollup keeps every hour it counted; the usage page's Recount is again the only refresh.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform

select cron.unschedule(j.jobid) from cron.job j where j.jobname in ('runtime-ai-usage-recent', 'runtime-ai-usage-nightly');

update platform.taxonomy_node
   set anchors = jsonb_set(anchors, '{db_cron_jobs}',
                           (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(anchors -> 'db_cron_jobs') x
                             where x #>> '{}' not in ('runtime-ai-usage-recent', 'runtime-ai-usage-nightly')))
 where anchors -> 'db_cron_jobs' ?| array['runtime-ai-usage-recent', 'runtime-ai-usage-nightly'];
