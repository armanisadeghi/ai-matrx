-- based-on: billing.resolve_effective_tier(uuid,uuid) 80639bd9af015449a01c31c2f49f9d69c04a2bfbd8bb9142819d324abd40ca02
-- based-on: billing.resolve_capability(uuid,text,uuid) 98bff19b3af950886f30724e180e10348b925ad024934003c6632343530ad593
-- A personal allowance only changes this caller's budget, not the record owner's
-- organization plan. Keep the organization/add-on allowance when it is better.
create function billing.resolve_person_limit(p_user uuid, p_org uuid, p_capability text, p_period billing.meter_period)
returns table(limit_value bigint, unlimited boolean, plan_id text, from_addon boolean, personal_scope boolean)
language plpgsql stable set search_path = '' as $$
declare v_org record; v_person text; v_limit bigint; v_found boolean;
begin
  select * into v_org from billing.resolve_limit(p_org, p_capability, p_period);
  v_person := billing.user_effective_plan(p_user);
  select true, pl.limit_value into v_found, v_limit from billing.plan_limit pl
    where pl.plan_id = v_person and pl.capability = p_capability
      and pl.period is not distinct from p_period and pl.deleted_at is null;
  if coalesce(v_found, false) and not v_org.unlimited and
    (v_org.limit_value is null or v_limit is null or
      case when p_capability = 'print.markup_percent' then v_limit < v_org.limit_value
           else v_limit > v_org.limit_value end) then
    return query select v_limit, v_limit is null, v_person, false, true;
  else
    return query select v_org.limit_value, v_org.unlimited, v_org.plan_id, v_org.from_addon, false;
  end if;
end; $$;
grant execute on function billing.resolve_person_limit(uuid,uuid,text,billing.meter_period) to authenticated, service_role;

CREATE OR REPLACE FUNCTION billing.resolve_effective_tier(p_user uuid, p_org uuid)
 RETURNS billing.tier
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
begin
  if p_org is null then
    raise exception using errcode = '23502',
      message = 'A tier belongs to an organization, and this call named none.',
      hint = 'Pass the organization the request is in (billing.resolve_effective_tier(p_user, p_org), billing.entitlement_check(p_capability, p_org), billing.entitlement_snapshot(p_org)). With no organization, hold the request until the person sets one -- never fall back to a personal plan (billing.user_plan retired 2026-09-29, DD-047).';
  end if;
  -- Row ownership remains organizational; an allowance can benefit a person.
  return billing.tier_max(coalesce(billing.resolve_org_tier(p_org), 'free'::billing.tier),
    coalesce((select tier from billing.plan where plan_key = billing.user_effective_plan(p_user)), 'free'::billing.tier));
end;
$function$
;
CREATE OR REPLACE FUNCTION billing.resolve_capability(p_user uuid, p_capability text, p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'billing', 'public'
AS $function$
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
  v_personal_scope  boolean := false;
begin
  perform iam.asks_about_caller(p_user, 'billing.resolve_capability');
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_effective_tier(p_user, p_org);
  v_plan := case when p_org is not null then billing.resolve_plan(p_org) else null end;
  select name into v_plan_name from billing.plan where plan_key = v_plan;

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
    select rl.limit_value, rl.unlimited, rl.from_addon, rl.plan_id, rl.personal_scope
      into v_plan_limit, v_plan_unlimited, v_plan_from_addon, v_plan, v_personal_scope
    from billing.resolve_person_limit(
      p_user,
      p_org,
      p_capability,
      coalesce(v_cap.period, 'lifetime'::billing.meter_period)
    ) rl;
    select name into v_plan_name from billing.plan where plan_key = v_plan;

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
        and ((v_personal_scope and created_by = p_user) or (not v_personal_scope and organization_id = p_org))
        and deleted_at is null
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
       where created_by = p_user and capability = p_capability and deleted_at is null
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
$function$
;
notify pgrst, 'reload schema';

