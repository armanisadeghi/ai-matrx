-- chair-step: puts every job watch whose budget lane PERF-WATCH-TAIL set back to the 1,000 ms floor, removes the edit entries it wrote, drops ops.perf_job_rebudget and the two job_rebudget knobs.
update ops.proof_check c
   set budget_ms = (c.metadata->'perf_last_edit'->'changes'->'budget_ms'->>'from')::numeric,
       metadata = c.metadata - 'perf_edits' - 'perf_last_edit' - 'perf_budget_basis'
 where c.kind = 'perf' and c.perf_kind = 'job' and c.metadata ? 'perf_budget_basis'
   and c.metadata->>'perf_budget_basis' like '%set once by lane PERF-WATCH-TAIL';
drop function ops.perf_job_rebudget(boolean);
delete from platform.feature_knob where feature = 'perf' and key in ('job_rebudget_multiple', 'job_rebudget_floor_ms');
