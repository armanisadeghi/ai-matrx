-- chair-step: lane DRILL-USAGE-PAGE — fills the derived usage rollup runtime._ai_usage_hourly from the ledger for every hour since the ledger began (2026-03), one calendar month per statement, through runtime.ai_usage_hourly_refresh (created by drillusage_usage_is_counted_from_an_hourly_rollup.sql, applied first). It WRITES only that derived table; it READS runtime.global_execution, chat.user_request, chat.request and ai.model_definition (ACCESS SHARE only). Re-runnable: each month is deleted and rebuilt.
-- lane: DRILL-USAGE-PAGE
-- lock: platform
--
-- Measured on the dev clone 2026-09-30: 30 days in 4.9 s (3,606 rows), 48 hours in 1.7 s.
-- INVERSE: migrations/inverse/drillusage_the_rollup_is_filled_from_the_ledger_down.sql

select runtime.ai_usage_hourly_refresh(m, m + interval '1 month')
  from generate_series(date_trunc('month', (select min(created_at) from runtime.global_execution), 'UTC'),
                       date_trunc('month', now(), 'UTC'), interval '1 month') m;

do $check$
declare v_roll numeric; v_led numeric;
begin
  select coalesce(sum(cost), 0) into v_roll from runtime._ai_usage_hourly where bucket < date_trunc('hour', now(), 'UTC');
  select coalesce(sum(cost), 0) into v_led from runtime.global_execution where created_at < date_trunc('hour', now(), 'UTC');
  if v_roll <> v_led then
    raise exception 'drillusage fill: the rollup holds % and the ledger % before this hour', v_roll, v_led;
  end if;
end
$check$;
