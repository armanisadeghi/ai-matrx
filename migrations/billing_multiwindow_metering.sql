-- billing_multiwindow_metering.sql
-- Refines P8 metering to MULTI-WINDOW (Arman, 2026-07-07): keep generous monthly
-- caps but add short rolling burst windows (rolling_1h / rolling_5h, week) so a
-- single session can't torch the month's AI budget and the live grader is
-- protected. A capability may carry several limit windows at one tier; the
-- resolver denies if ANY window is exceeded and reports the most-restrictive
-- (binding) window plus the full window set.
--
-- Also: never meter saved content — capability set now covers AI GENERATION only
-- (added card_enrichment + live_grade, dropped deck_count).
--
-- Enum values rolling_1h / rolling_5h are added in a prior statement (can't add +
-- use an enum value in one txn). Idempotent.

-- capability_limit: many windows per (capability, tier). Tables are empty
-- (greenfield) so the PK change is safe.
alter table billing.capability_limit add column if not exists period billing.meter_period;
do $$ begin
  alter table billing.capability_limit drop constraint capability_limit_pkey;
exception when undefined_object then null; end $$;
update billing.capability_limit set period = 'month' where period is null;
alter table billing.capability_limit alter column period set not null;
do $$ begin
  alter table billing.capability_limit add primary key (capability, tier, period);
exception when invalid_table_definition then null; end $$;

-- Window start (inclusive lower bound of the current window).
create or replace function billing.period_start(p_period billing.meter_period)
returns timestamptz language sql stable set search_path = billing, public as $$
  select case p_period
    when 'rolling_1h' then now() - interval '1 hour'
    when 'rolling_5h' then now() - interval '5 hours'
    when 'day'        then date_trunc('day',  now())
    when 'week'       then date_trunc('week', now())
    when 'month'      then date_trunc('month', now())
    when 'lifetime'   then '-infinity'::timestamptz
    else '-infinity'::timestamptz end;
$$;

-- Approximate reset time for "frees up in N" copy.
create or replace function billing.period_reset(p_period billing.meter_period)
returns timestamptz language sql stable set search_path = billing, public as $$
  select case p_period
    when 'rolling_1h' then now() + interval '1 hour'
    when 'rolling_5h' then now() + interval '5 hours'
    when 'day'        then date_trunc('day',  now()) + interval '1 day'
    when 'week'       then date_trunc('week', now()) + interval '1 week'
    when 'month'      then date_trunc('month', now()) + interval '1 month'
    else null end;
$$;

-- Multi-window verdict for one capability.
create or replace function billing.resolve_capability(p_user uuid, p_capability text)
returns jsonb language plpgsql stable set search_path = billing, public as $$
declare
  v_tier    billing.tier;
  v_cap     billing.capability%rowtype;
  v_windows jsonb;
  v_allowed boolean;
  v_bind_period billing.meter_period;
  v_bind_used   integer;
  v_bind_limit  integer;
  v_bind_remain integer;
begin
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_tier(p_user);

  -- Unknown / unenforced -> permissive (the per-capability rollout switch).
  if v_cap.capability is null or v_cap.enforced = false then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'permissive_stub',
      'period', v_cap.period, 'windows', '[]'::jsonb);
  end if;

  -- Tier gate.
  if (v_cap.min_tier = 'premium' and v_tier <> 'premium')
     or (v_cap.min_tier = 'trial' and v_tier = 'free') then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0,
      'used', 0, 'tier', v_tier, 'reason', 'tier_locked',
      'period', v_cap.period, 'windows', '[]'::jsonb);
  end if;

  -- Build the window set for (capability, tier).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'period', w.period, 'used', w.used, 'limit', w.limit_value,
      'remaining', greatest(w.limit_value - w.used, 0),
      'resetsAt', billing.period_reset(w.period)
    ) order by (w.limit_value - w.used) asc), '[]'::jsonb),
    coalesce(bool_and(w.used < w.limit_value), true)
  into v_windows, v_allowed
  from (
    select cl.period, cl.limit_value,
      (select coalesce(sum(quantity),0)::int from billing.usage_ledger
       where user_id = p_user and capability = p_capability
         and created_at >= billing.period_start(cl.period)) as used
    from billing.capability_limit cl
    where cl.capability = p_capability and cl.tier = v_tier
      and cl.limit_value is not null
  ) w;

  -- No configured windows -> unlimited.
  if v_windows = '[]'::jsonb then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'allowed',
      'period', v_cap.period, 'windows', '[]'::jsonb);
  end if;

  -- Binding window = the one with the least remaining (first, we ordered asc).
  v_bind_period := (v_windows->0->>'period')::billing.meter_period;
  v_bind_used   := (v_windows->0->>'used')::int;
  v_bind_limit  := (v_windows->0->>'limit')::int;
  v_bind_remain := (v_windows->0->>'remaining')::int;

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_bind_remain,
    'limit', v_bind_limit,
    'used', v_bind_used,
    'tier', v_tier,
    'reason', case when v_allowed then 'allowed' else 'cap_reached' end,
    'period', v_bind_period,
    'windows', v_windows
  );
end;
$$;

-- Snapshot now packs per-capability windows (EntitlementUsage shape).
create or replace function billing.entitlement_snapshot()
returns jsonb language plpgsql stable security definer set search_path = billing, public as $$
declare
  v_user  uuid := auth.uid();
  v_tier  billing.tier;
  v_trial timestamptz;
  v_usage jsonb := '{}'::jsonb;
  v_res   jsonb;
  r       record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','is_subscribed',false,'trial_ends_at',null,'usage','{}'::jsonb);
  end if;
  v_tier := billing.resolve_tier(v_user);
  select trial_end into v_trial from billing.subscription
    where user_id = v_user and status = 'trialing' order by trial_end desc nulls last limit 1;

  for r in select capability from billing.capability where enforced = true loop
    v_res := billing.resolve_capability(v_user, r.capability);
    -- Only include capabilities that actually have windows (skip unlimited).
    if v_res->'windows' <> '[]'::jsonb then
      v_usage := v_usage || jsonb_build_object(r.capability, jsonb_build_object(
        'used',    v_res->'used',
        'limit',   v_res->'limit',
        'period',  v_res->'period',
        'resetsAt', v_res->'windows'->0->'resetsAt',
        'windows', v_res->'windows'
      ));
    end if;
  end loop;

  return jsonb_build_object('tier', v_tier,
    'is_subscribed', v_tier = 'premium' or v_tier = 'trial',
    'trial_ends_at', v_trial, 'usage', v_usage);
end;
$$;
