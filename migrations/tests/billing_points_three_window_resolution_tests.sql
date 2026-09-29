-- Draft regression specification for billing_points_three_window_resolution.sql.
-- Run only in a rollback transaction after the migration has been completed.
begin;

do $test$
declare
  v_user uuid := (select id from auth.users order by created_at limit 1);
  v_org uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'requires one auth.users fixture'; end if;

  -- The production seed currently has monthly points limits only. This test
  -- fixture adds weekly and rolling limits for free, then removes all effects
  -- with ROLLBACK. It intentionally does not change capability.enforced.
  insert into billing.plan_limit (plan_id, capability, period, limit_value)
  values ('free', 'platform.points', 'week', 7000),
         ('free', 'platform.points', 'rolling_5h', 900)
  on conflict (plan_id, capability, period) do update set limit_value = excluded.limit_value;

  v_result := billing.resolve_model_spend_windows(v_user, 'platform.points', v_org);
  if jsonb_array_length(v_result->'windows') <> 3
     or not (v_result->'windows' @> '[{"period":"month"},{"period":"week"},{"period":"rolling_5h"}]'::jsonb) then
    raise exception 'expected month, week, and rolling_5h windows: %', v_result;
  end if;

  -- NULL means unlimited only for the affected period. A numeric month and
  -- week must remain in the result when rolling_5h is unlimited.
  update billing.plan_limit set limit_value = null
   where plan_id = 'free' and capability = 'platform.points' and period = 'rolling_5h';
  v_result := billing.resolve_model_spend_windows(v_user, 'platform.points', v_org);
  if jsonb_array_length(v_result->'windows') <> 3
     or v_result->'windows' @> '[{"period":"rolling_5h","limit":0}]'::jsonb
     or not (v_result->'windows' @> '[{"period":"rolling_5h","limit":null,"allowed":true,"would_block":false}]'::jsonb) then
    raise exception 'period-specific unlimited did not remain visible for a 5h guardrail: %', v_result;
  end if;

  -- Tracking-only behavior remains compatible with resolve_capability: the
  -- raw exhausted state is exposed per window, but the top-level verdict does
  -- not deny while capability.enforced is false.
  if v_result->>'allowed' <> 'true' or v_result->>'reason' <> 'permissive_stub' then
    raise exception 'tracking-only points verdict regressed: %', v_result;
  end if;
end;
$test$;

-- Effective-door checks:
-- 1. Set the Enterprise plan's monthly row NULL and call the effective door:
--    all three windows must remain present with entitlement limit NULL. Add a
--    finite org and user guardrail for each period; each corresponding window
--    must bind to the smaller guardrail and the top-level envelope must select
--    the least effective_remaining window.
-- 2. With free month finite and rolling_5h NULL above, add a finite 5h org or
--    user guardrail. The 5h window must become finite and may bind even though
--    its entitlement is unlimited.
-- 3. Insert ledger rows at now()-4h59m and now()-5h01m; assert rolling_5h
--    counts only the former, leaves resetsAt NULL, and labels the former's
--    expiry as nextUsageDropAt rather than promising capacity recovery.
-- 4. Set session TimeZone to America/Los_Angeles and assert period_start('week')
--    equals date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'.
rollback;
