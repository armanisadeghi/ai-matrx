-- chair-step: lane DRILL-LEDGER-RECORDS — rebuilds EVERY hour of the derived AI usage rollup runtime._ai_usage_hourly from the one rules source runtime._ai_usage_calls (created by drillledger_the_records_behind_a_usage_number_are_the_ledger.sql), in one call that reaches now, so runtime._ai_usage_hourly_watermark is written for the first time (covered_from = the ledger's first month, covered_to = the moment of this rebuild). It writes only that derived table and its watermark; the ledger is read under ACCESS SHARE. The rebuild holds the one-rebuild-at-a-time advisory lock, so a Recount from the usage page waits for it.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform
--
-- WHY A FULL REBUILD. The rollup's rows were built by the previous body of the refresh (the same
-- rules, now proven equal to the view row for row over 35 days on the clone — 4,887 groups, 0 differ
-- either way); rebuilding every hour from the view makes the rollup exactly the aggregate of the
-- relation its records are read from, and gives the watermark an honest start: every hour from the
-- first month of the ledger to this instant is counted.
-- INVERSE: migrations/inverse/drillledger_the_rollup_is_refilled_from_the_records_down.sql

select runtime.ai_usage_hourly_refresh(date_trunc('month', (select min(created_at) from runtime.global_execution), 'UTC'), now());

do $check$
declare v_roll numeric; v_led numeric; v_to timestamptz;
begin
  select covered_to into v_to from runtime._ai_usage_hourly_watermark where singleton;
  if v_to is null then
    raise exception 'drillledger refill: the watermark was not written';
  end if;
  -- every settled hour (ending two hours before the cut: the last two may still take a cost that
  -- lands after its row, which the next rebuild counts) equals the ledger to the cent
  select coalesce(sum(cost), 0) into v_roll from runtime._ai_usage_hourly
   where bucket < date_trunc('hour', v_to, 'UTC') - interval '2 hours';
  select coalesce(sum(cost), 0) into v_led from runtime.global_execution
   where created_at < date_trunc('hour', v_to, 'UTC') - interval '2 hours';
  if v_roll <> v_led then
    raise exception 'drillledger refill: the rollup holds % and the ledger % for the settled hours before %', v_roll, v_led, v_to;
  end if;
end
$check$;
