-- chair-step: unschedules perf-watch-vital-rate-plan, drops ops.perf_vital_rate_plan() and its door row, and archives nothing: the two knobs are deleted (no reader exists once the client change is reverted). Vital watches already declared stay.
select cron.unschedule('perf-watch-vital-rate-plan');
drop function if exists ops.perf_vital_rate_plan();
delete from platform.client_callable_door where schema_name = 'ops' and function_name = 'perf_vital_rate_plan';
delete from platform.feature_knob where feature = 'perf' and key in ('client_sample_rate_low_traffic', 'client_sample_rate_by_route');
