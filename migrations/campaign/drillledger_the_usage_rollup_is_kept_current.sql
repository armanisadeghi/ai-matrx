-- chair-step: lane DRILL-LEDGER-RECORDS — registers TWO pg_cron jobs (a `select cron.schedule(...)`, which the additive allow-list refuses by name because it cannot read what a function call will do): runtime-ai-usage-recent every 10 minutes rebuilding the last 48 hours of the derived AI usage rollup, and runtime-ai-usage-nightly at 09:20 UTC (02:20 PDT / 01:20 PST, inside the 01–04 PT maintenance window) rebuilding the last 35 days. Both call runtime.ai_usage_hourly_refresh and nothing else, which writes only runtime._ai_usage_hourly and its watermark. On a database without pg_net (the quarantined nightly copy) both jobs are left inactive, so the copy stays told apart from production. Each job is anchored in the Feature Registry (platform-spend). No table, grant or row of anybody's data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform
--
-- APPROVAL: Arman, 2026-09-29 — "the daily summary table, updated incrementally and in the
-- maintenance window" (PROGRESS-DRILL-FINISH decision 4; recorded in
-- common-docs/operations/scheduled-tasks.md).
--
-- WHAT EACH RUN HOLDS. The refresh takes the one-rebuild-at-a-time advisory lock
-- (drillusage_one_rollup_rebuild_at_a_time.sql): the nightly 35-day rebuild holds it for its whole
-- run (timed on the clone: see PROGRESS-DRILL-LEDGER-RECORDS.md), and the 10-minute job and a
-- person's Recount QUEUE behind it (lock_timeout 2 min here; a Recount under the API role's own
-- lock ceiling can time out during the nightly and says so). The ledger is read under ACCESS SHARE
-- only; the rollup's own rows are rewritten. A plain SET (not SET LOCAL) as its own statement before
-- the job, because pg_cron sends the command as one simple query and a function cannot raise the
-- caller's statement ceiling (aidream db/migrations/0919).
--
-- INVERSE: migrations/inverse/drillledger_the_usage_rollup_is_kept_current_down.sql

select cron.schedule(
  'runtime-ai-usage-recent',
  '*/10 * * * *',
  $cron$SET statement_timeout = '5min'; SET lock_timeout = '2min'; SELECT runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now());$cron$);

select cron.schedule(
  'runtime-ai-usage-nightly',
  '20 9 * * *',
  $cron$SET statement_timeout = '20min'; SET lock_timeout = '2min'; SELECT runtime.ai_usage_hourly_refresh(now() - interval '35 days', now());$cron$);

-- THE DEV CLONE STAYS QUARANTINED. It is told apart from production partly by "pg_net absent and
-- no active pg_cron job" (common-docs/operations/clone/CURRENT.md), so on a database without pg_net
-- the jobs are scheduled but left inactive — exactly like the clone's copy of every other job.
select cron.alter_job(j.jobid, active := false)
  from cron.job j
 where j.jobname in ('runtime-ai-usage-recent', 'runtime-ai-usage-nightly')
   and not exists (select 1 from pg_extension where extname = 'pg_net');

-- The Feature Registry identity of each job (0567: every live pg_cron job is anchored once).
update platform.taxonomy_node
   set anchors = jsonb_set(coalesce(anchors, '{}'::jsonb), '{db_cron_jobs}',
                           coalesce(anchors -> 'db_cron_jobs', '[]'::jsonb)
                           || (select coalesce(jsonb_agg(j), '[]'::jsonb)
                                 from unnest(array['runtime-ai-usage-recent', 'runtime-ai-usage-nightly']) j
                                where not coalesce(anchors -> 'db_cron_jobs', '[]'::jsonb) ? j), true)
 where slug = 'platform-spend' and status in ('canonical', 'proposed');

do $check$
declare v_job text;
begin
  foreach v_job in array array['runtime-ai-usage-recent', 'runtime-ai-usage-nightly'] loop
    if (select count(*) from platform.taxonomy_node
         where status in ('canonical', 'proposed') and coalesce(anchors -> 'db_cron_jobs', '[]'::jsonb) ? v_job) <> 1 then
      raise exception 'drillledger: the pg_cron job % must have exactly one Feature Registry identity', v_job;
    end if;
    if not exists (select 1 from cron.job where jobname = v_job) then
      raise exception 'drillledger: the pg_cron job % was not scheduled', v_job;
    end if;
  end loop;
end
$check$;
