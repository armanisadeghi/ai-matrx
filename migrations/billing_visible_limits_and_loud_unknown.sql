-- billing_visible_limits_and_loud_unknown.sql
-- P8 gap-close (F1 + F3). Idempotent (CREATE OR REPLACE).
--
-- F1 — LIMITS VISIBLE BEFORE THE CAP, even while enforcement is permissive.
--   The design decision: billing.capability_limit is the SINGLE SOURCE for the
--   numbers. No duplicate in the client registry (registry.ts defaultFreeLimit
--   is descriptive-only and read by nobody). Both resolver RPCs now report a
--   capability's metering windows REGARDLESS of `enforced`, each carrying an
--   `enforced` flag. While a capability is un-enforced the verdict stays
--   `allowed = true` / `reason = permissive_stub` (nothing is silently capped),
--   but `limit`/`remaining`/`windows` are populated so every meter can render
--   "X of Y left today" ahead of the action (TRUST mandate, pledge claim #3).
--
--   Before: entitlement_snapshot() only looped `enforced = true` capabilities
--   (all 11 are false) → usage always empty → useEntitlement().limit always null
--   → every EntitlementMeter (guarded on limit != null) never rendered.
--
-- F3 — resolve_capability() no longer FAILS OPEN SILENTLY on an unknown
--   capability id. It still fails open (never break prod) but RAISES A WARNING
--   and stamps `unknown: true` so the client service can surface a loud dev
--   error (loud-recovery doctrine).

-- ── resolve_capability: visible-limit reporting + loud unknown recovery ───────
create or replace function billing.resolve_capability(p_user uuid, p_capability text)
returns jsonb
language plpgsql
stable
set search_path = billing, public
as $function$
declare
  v_tier        billing.tier;
  v_cap         billing.capability%rowtype;
  v_windows     jsonb;
  v_allowed     boolean;
  v_bind_period billing.meter_period;
  v_bind_used   integer;
  v_bind_limit  integer;
  v_bind_remain integer;
begin
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_tier(p_user);

  -- Unknown capability id: FAIL OPEN (never break prod) but SCREAM.
  if v_cap.capability is null then
    raise warning '[billing.resolve_capability] unknown capability id "%" — failing open (unlimited). Register it in billing.capability or fix the caller.', p_capability;
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'permissive_stub',
      'period', null, 'windows', '[]'::jsonb, 'enforced', false, 'unknown', true);
  end if;

  -- Tier gate blocks ONLY when the capability is enforced. An un-enforced gate
  -- must not block — but we still surface its limits below.
  if v_cap.enforced
     and ((v_cap.min_tier = 'premium' and v_tier <> 'premium')
       or (v_cap.min_tier = 'trial' and v_tier = 'free')) then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0,
      'used', 0, 'tier', v_tier, 'reason', 'tier_locked',
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', true);
  end if;

  -- Compute EVERY metering window for this capability at the user's tier. This
  -- runs regardless of enforcement so the limit is visible before the cap.
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

  -- No configured limits on this tier → genuinely unlimited.
  if v_windows = '[]'::jsonb then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier,
      'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced);
  end if;

  v_bind_period := (v_windows->0->>'period')::billing.meter_period;
  v_bind_used   := (v_windows->0->>'used')::int;
  v_bind_limit  := (v_windows->0->>'limit')::int;
  v_bind_remain := (v_windows->0->>'remaining')::int;

  -- Un-enforced capabilities are NEVER blocked (permissive rollout) — but their
  -- limits/usage are reported so the meter can render "X of Y left".
  return jsonb_build_object(
    'allowed', case when v_cap.enforced then v_allowed else true end,
    'remaining', v_bind_remain, 'limit', v_bind_limit,
    'used', v_bind_used, 'tier', v_tier,
    'reason', case
                when not v_cap.enforced then 'permissive_stub'
                when v_allowed then 'allowed'
                else 'cap_reached' end,
    'period', v_bind_period, 'windows', v_windows, 'enforced', v_cap.enforced);
end;
$function$;

-- ── entitlement_snapshot: report ALL registered capabilities with limits ──────
create or replace function billing.entitlement_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path = billing, public
as $function$
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

  -- Iterate ALL registered capabilities (not just enforced) so the client can
  -- render limits BEFORE the cap even while enforcement is permissive. Each
  -- entry carries its own `enforced` flag; the client keeps allowed = true for
  -- un-enforced caps but still shows the meter.
  for r in select capability, enforced from billing.capability loop
    v_res := billing.resolve_capability(v_user, r.capability);
    if v_res->'windows' <> '[]'::jsonb then
      v_usage := v_usage || jsonb_build_object(r.capability, jsonb_build_object(
        'used', v_res->'used', 'limit', v_res->'limit', 'period', v_res->'period',
        'resetsAt', v_res->'windows'->0->'resetsAt', 'windows', v_res->'windows',
        'enforced', to_jsonb(r.enforced)));
    end if;
  end loop;

  return jsonb_build_object('tier', v_tier,
    'is_subscribed', v_tier = 'premium' or v_tier = 'trial',
    'trial_ends_at', v_trial, 'usage', v_usage);
end;
$function$;
