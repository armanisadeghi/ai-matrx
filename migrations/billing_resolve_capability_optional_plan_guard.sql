-- billing_resolve_capability_optional_plan_guard.sql
--
-- `billing.resolve_capability(user, capability, NULL)` is the compatibility
-- path used by every user-scoped entitlement snapshot/check/consume. The plan
-- resolver introduced an untyped `record` (`v_lim`) that was assigned only
-- when an org plan existed, then referenced in a later boolean expression.
-- PostgreSQL must determine the record field's tuple structure even when the
-- other side of the boolean is false, so the user-only path raised SQLSTATE
-- 55000 before it could fall through to the tier limits.
--
-- Keep the plan branch optional by construction: typed scalars are always
-- defined, and every plan-only read stays inside `v_plan IS NOT NULL`.

create or replace function billing.resolve_capability(
  p_user uuid,
  p_capability text,
  p_org uuid
)
returns jsonb
language plpgsql stable
set search_path to 'billing', 'public'
as $function$
declare
  v_tier            billing.tier;
  v_plan            text;
  v_plan_name       text;
  v_cap             billing.capability%rowtype;
  v_windows         jsonb;
  v_allowed         boolean;
  v_bind_period     billing.meter_period;
  v_bind_used       integer;
  v_bind_limit      integer;
  v_bind_remain     integer;
  v_plan_limit      bigint;
  v_plan_unlimited  boolean := false;
  v_plan_from_addon boolean := false;
  v_used            bigint;
begin
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_effective_tier(p_user, p_org);
  v_plan := case when p_org is not null then billing.resolve_plan(p_org) else null end;
  select name into v_plan_name from billing.plan where id = v_plan;

  if v_cap.capability is null then
    raise warning '[billing.resolve_capability] unknown capability id "%" — failing open (unlimited). Register it in billing.capability or fix the caller.', p_capability;
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'permissive_stub',
      'period', null, 'windows', '[]'::jsonb, 'enforced', false, 'unknown', true,
      'required_tier', null, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  if v_cap.enforced
     and ((v_cap.min_tier = 'premium' and v_tier <> 'premium')
       or (v_cap.min_tier = 'trial' and v_tier = 'free')) then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0,
      'used', 0, 'tier', v_tier, 'reason', 'tier_locked',
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', true,
      'required_tier', v_cap.min_tier, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  -- PLAN PATH — only when an org was supplied. `resolve_limit` always returns
  -- one typed row: explicit unlimited, a numeric plan/add-on limit, or the
  -- plan-has-no-opinion sentinel (NULL + unlimited=false).
  if v_plan is not null then
    select rl.limit_value, rl.unlimited, rl.from_addon
      into v_plan_limit, v_plan_unlimited, v_plan_from_addon
    from billing.resolve_limit(
      p_org,
      p_capability,
      coalesce(v_cap.period, 'lifetime'::billing.meter_period)
    ) rl;

    if coalesce(v_plan_unlimited, false) then
      return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
        'used', 0, 'tier', v_tier,
        'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
        'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name,
        'from_addon', coalesce(v_plan_from_addon, false));
    end if;

    if v_plan_limit is not null then
      -- External dimensions report the authoritative limit without inventing
      -- usage that belongs to another subsystem.
      if v_cap.usage_source = 'external' then
        return jsonb_build_object(
          'allowed', true, 'remaining', null,
          'limit', v_plan_limit, 'used', null, 'tier', v_tier,
          'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
          'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
          'required_tier', v_cap.min_tier, 'organization_id', p_org,
          'plan', v_plan, 'plan_name', v_plan_name,
          'from_addon', coalesce(v_plan_from_addon, false),
          'usage_source', 'external');
      end if;

      select coalesce(sum(quantity), 0)::bigint into v_used
      from billing.usage_ledger
      where capability = p_capability
        and organization_id = p_org
        and (v_cap.period is null or v_cap.period = 'lifetime'
             or created_at >= billing.period_start(v_cap.period));

      v_windows := jsonb_build_array(jsonb_build_object(
        'period', coalesce(v_cap.period::text, 'lifetime'),
        'used', v_used, 'limit', v_plan_limit,
        'remaining', greatest(v_plan_limit - v_used, 0),
        'resetsAt', case when v_cap.period is null or v_cap.period = 'lifetime' then null
                         else billing.period_reset(v_cap.period) end));
      v_allowed := v_used < v_plan_limit;

      return jsonb_build_object(
        'allowed', case when v_cap.enforced then v_allowed else true end,
        'remaining', greatest(v_plan_limit - v_used, 0),
        'limit', v_plan_limit, 'used', v_used, 'tier', v_tier,
        'reason', case when not v_cap.enforced then 'permissive_stub'
                       when v_allowed then 'allowed' else 'cap_reached' end,
        'period', v_cap.period, 'windows', v_windows, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name,
        'from_addon', coalesce(v_plan_from_addon, false),
        'usage_source', 'ledger');
    end if;
  end if;

  -- TIER PATH — user-only calls always land here. Org calls also land here
  -- when their plan has no opinion about this capability (education today).
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

  if v_windows = '[]'::jsonb then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier,
      'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
      'required_tier', v_cap.min_tier, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name);
  end if;

  v_bind_period := (v_windows->0->>'period')::billing.meter_period;
  v_bind_used   := (v_windows->0->>'used')::int;
  v_bind_limit  := (v_windows->0->>'limit')::int;
  v_bind_remain := (v_windows->0->>'remaining')::int;

  return jsonb_build_object(
    'allowed', case when v_cap.enforced then v_allowed else true end,
    'remaining', v_bind_remain, 'limit', v_bind_limit,
    'used', v_bind_used, 'tier', v_tier,
    'reason', case when not v_cap.enforced then 'permissive_stub'
                   when v_allowed then 'allowed' else 'cap_reached' end,
    'period', v_bind_period, 'windows', v_windows, 'enforced', v_cap.enforced,
    'required_tier', v_cap.min_tier, 'organization_id', p_org,
    'plan', v_plan, 'plan_name', v_plan_name);
end;
$function$;

comment on function billing.resolve_capability(uuid, text, uuid) is
  'THE capability authority. Org-aware form: resolves effective tier, then optional plan/add-on limits, then tier windows. The user-only delegate is a first-class path and never touches unassigned plan state.';

grant execute on function billing.resolve_capability(uuid, text, uuid)
  to authenticated, service_role;
