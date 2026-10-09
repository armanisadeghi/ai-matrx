-- chair-step: resumes the job watch job:perf-watch-probe (learning again) that the up-file paused.
update ops.proof_check
   set is_active = true, perf_state = 'learning', perf_state_since = now(),
       metadata = (metadata - 'perf_paused_from') || '{"perf_last_reason": "resumed: judged again from the next sample"}'::jsonb
 where kind = 'perf' and slug = 'job:perf-watch-probe' and not is_active
   and metadata->>'perf_last_reason' like 'paused: the cron job perf-watch-probe was replaced%';
