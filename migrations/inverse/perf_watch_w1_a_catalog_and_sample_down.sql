-- chair-step: inverse of perf_watch_w1_a_catalog_and_sample.sql — drops ops.perf_sample (its samples are lost; they are re-measured by the probe) and its registry row, removes every kind='perf' watch row, the perf columns and the perf constraints, and restores the two CHECK constraints to their pre-wave-1 bodies. Apply _d_down, _c_down and _b_down first.
--
-- WHAT IT DOES NOT UNDO: nothing structural is left behind. Sample history is not recoverable.
set local lock_timeout = '3s';

delete from ops.proof_check where kind = 'perf';

drop table if exists ops.perf_sample cascade;
delete from platform.entity_types where token = 'ops_perf_sample';

alter table ops.proof_check
  drop constraint if exists proof_check_perf_identity,
  drop constraint if exists proof_check_budget_ms_check,
  drop constraint if exists proof_check_perf_state_check,
  drop constraint if exists proof_check_budget_stat_check,
  drop constraint if exists proof_check_perf_kind_check,
  drop constraint proof_check_static_identity,
  add constraint proof_check_static_identity check (kind = 'scenario' or (stable_id is not null and repo is not null)),
  drop constraint proof_check_kind_check,
  add constraint proof_check_kind_check check (kind in ('scenario', 'static'));

alter table ops.proof_check
  drop column if exists perf_kind,
  drop column if exists perf_subject,
  drop column if exists budget_ms,
  drop column if exists budget_stat,
  drop column if exists owner,
  drop column if exists perf_state,
  drop column if exists perf_state_since,
  drop column if exists perf_baseline_ms,
  drop column if exists perf_baseline_pinned,
  drop column if exists perf_last_alert_at;
