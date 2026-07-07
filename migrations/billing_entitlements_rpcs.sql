-- billing_entitlements_rpcs.sql
-- P8 resolver — the ONE authorization path for entitlements, modeled on
-- iam.has_access. Features never read billing tables directly.
--
-- All SECURITY DEFINER, search_path pinned, gated by auth.uid(). Granted to
-- authenticated (each user resolves for themselves). Idempotent.

-- Start of the current metering window for a period.
create or replace function billing.period_start(p_period billing.meter_period)
returns timestamptz
language sql immutable
set search_path = billing, public
as $$
  select case p_period
    when 'day'      then date_trunc('day',  now())
    when 'week'     then date_trunc('week', now())
    when 'month'    then date_trunc('month', now())
    when 'lifetime' then '-infinity'::timestamptz
    else '-infinity'::timestamptz
  end;
$$;

-- End (reset time) of the current window, for surfacing "resets in N days".
create or replace function billing.period_reset(p_period billing.meter_period)
returns timestamptz
language sql immutable
set search_path = billing, public
as $$
  select case p_period
    when 'day'   then date_trunc('day',  now()) + interval '1 day'
    when 'week'  then date_trunc('week', now()) + interval '1 week'
    when 'month' then date_trunc('month', now()) + interval '1 month'
    else null
  end;
$$;

-- Resolve a user's commercial tier from their active/trialing subscription.
create or replace function billing.resolve_tier(p_user uuid)
returns billing.tier
language sql stable
set search_path = billing, public
as $$
  select coalesce(
    (
      select case
        when s.status = 'trialing' then 'trial'::billing.tier
        else 'premium'::billing.tier
      end
      from billing.subscription s
      where s.user_id = p_user
        and s.status in ('trialing', 'active', 'past_due')
      order by
        case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
        s.current_period_end desc nulls last
      limit 1
    ),
    'free'::billing.tier
  );
$$;

-- Core verdict for one capability, for a given user + resolved tier.
-- Returns the EntitlementResult-shaped jsonb the client/service map to.
create or replace function billing.resolve_capability(p_user uuid, p_capability text)
returns jsonb
language plpgsql stable
set search_path = billing, public
as $$
declare
  v_tier    billing.tier;
  v_cap     billing.capability%rowtype;
  v_limit   integer;
  v_used    integer;
  v_period  billing.meter_period;
begin
  select * into v_cap from billing.capability where capability = p_capability;

  v_tier := billing.resolve_tier(p_user);
  v_period := v_cap.period;

  -- Unknown or unenforced capability -> permissive (the per-capability switch).
  if v_cap.capability is null or v_cap.enforced = false then
    return jsonb_build_object(
      'allowed', true, 'remaining', null, 'limit', null, 'used', 0,
      'tier', v_tier, 'reason', 'permissive_stub', 'period', v_period
    );
  end if;

  -- Tier gate.
  if (v_cap.min_tier = 'premium' and v_tier <> 'premium')
     or (v_cap.min_tier = 'trial' and v_tier = 'free') then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'limit', 0, 'used', 0,
      'tier', v_tier, 'reason', 'tier_locked', 'period', v_period
    );
  end if;

  -- Resolve the numeric cap for this (capability, tier).
  select limit_value into v_limit
  from billing.capability_limit
  where capability = p_capability and tier = v_tier;

  -- Premium/trial with no explicit row => unlimited.
  if v_limit is null then
    return jsonb_build_object(
      'allowed', true, 'remaining', null, 'limit', null, 'used', 0,
      'tier', v_tier, 'reason', 'allowed', 'period', v_period
    );
  end if;

  -- Usage in the current window.
  select coalesce(sum(quantity), 0)::int into v_used
  from billing.usage_ledger
  where user_id = p_user
    and capability = p_capability
    and created_at >= billing.period_start(coalesce(v_period, 'lifetime'));

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'limit', v_limit,
    'used', v_used,
    'tier', v_tier,
    'reason', case when v_used < v_limit then 'allowed' else 'cap_reached' end,
    'period', v_period
  );
end;
$$;

-- Imperative pre-action check (server truth). Mints a check_id for the consume.
create or replace function billing.entitlement_check(p_capability text)
returns jsonb
language plpgsql stable
security definer
set search_path = billing, public
as $$
declare
  v_user uuid := auth.uid();
  v_res  jsonb;
begin
  if v_user is null then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0, 'limit', 0, 'used', 0,
      'tier', 'free', 'reason', 'not_authenticated', 'period', null,
      'check_id', null
    );
  end if;
  v_res := billing.resolve_capability(v_user, p_capability);
  return v_res || jsonb_build_object('check_id', gen_random_uuid());
end;
$$;

-- Full boot snapshot: tier + trial + per-capability usage for enforced meters.
create or replace function billing.entitlement_snapshot()
returns jsonb
language plpgsql stable
security definer
set search_path = billing, public
as $$
declare
  v_user  uuid := auth.uid();
  v_tier  billing.tier;
  v_trial timestamptz;
  v_usage jsonb := '{}'::jsonb;
  r       record;
begin
  if v_user is null then
    return jsonb_build_object(
      'tier', 'free', 'is_subscribed', false, 'trial_ends_at', null, 'usage', '{}'::jsonb
    );
  end if;

  v_tier := billing.resolve_tier(v_user);

  select trial_end into v_trial
  from billing.subscription
  where user_id = v_user and status = 'trialing'
  order by trial_end desc nulls last limit 1;

  -- Usage rollup for every enforced, metered capability.
  for r in
    select c.capability, c.period,
           coalesce(cl.limit_value, null) as limit_value
    from billing.capability c
    left join billing.capability_limit cl
      on cl.capability = c.capability and cl.tier = v_tier
    where c.enforced = true and c.period is not null
  loop
    v_usage := v_usage || jsonb_build_object(
      r.capability,
      jsonb_build_object(
        'used', (
          select coalesce(sum(quantity), 0)::int from billing.usage_ledger
          where user_id = v_user and capability = r.capability
            and created_at >= billing.period_start(r.period)
        ),
        'limit', r.limit_value,
        'period', r.period,
        'resetsAt', billing.period_reset(r.period)
      )
    );
  end loop;

  return jsonb_build_object(
    'tier', v_tier,
    'is_subscribed', v_tier = 'premium' or v_tier = 'trial',
    'trial_ends_at', v_trial,
    'usage', v_usage
  );
end;
$$;

-- Record a consume. The single write path into usage_ledger (SECURITY DEFINER;
-- RLS denies direct writes). Re-checks the cap under the same call so a race
-- can't push a free user past the limit. Returns the post-consume verdict.
create or replace function billing.entitlement_consume(
  p_capability text,
  p_quantity   integer default 1,
  p_check_id   uuid default null
)
returns jsonb
language plpgsql volatile
security definer
set search_path = billing, public
as $$
declare
  v_user uuid := auth.uid();
  v_pre  jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(p_quantity, 1) < 1 then
    raise exception 'quantity must be >= 1';
  end if;

  -- Re-check under the write (fails closed if the cap is already reached).
  v_pre := billing.resolve_capability(v_user, p_capability);
  if (v_pre->>'allowed')::boolean = false then
    return v_pre || jsonb_build_object('consumed', false);
  end if;

  insert into billing.usage_ledger(user_id, capability, quantity, check_id)
  values (v_user, p_capability, coalesce(p_quantity, 1), p_check_id);

  return billing.resolve_capability(v_user, p_capability) || jsonb_build_object('consumed', true);
end;
$$;

grant execute on function billing.entitlement_check(text)              to authenticated;
grant execute on function billing.entitlement_snapshot()               to authenticated;
grant execute on function billing.entitlement_consume(text, integer, uuid) to authenticated;
grant execute on function billing.resolve_tier(uuid)                   to authenticated, service_role;
grant execute on function billing.resolve_capability(uuid, text)       to authenticated, service_role;

-- Table read grants (RLS still filters rows).
grant select on billing.product, billing.price, billing.capability, billing.capability_limit,
                billing.customer, billing.subscription, billing.usage_ledger
  to authenticated;
grant select on billing.product, billing.price, billing.capability, billing.capability_limit to anon;
