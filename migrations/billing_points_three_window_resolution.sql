-- draft: billing-window lane — unapplied design for platform.points three-window resolution.
--
-- This file intentionally changes no entitlement, guardrail, or enforcement data.
-- It only replaces resolver bodies and adds a period-aware guardrail overload.
-- platform.points metadata was read live for this draft and is `{}`. Therefore
-- no near_threshold_ratio is emitted: configuring that editable metadata value
-- is required before the cache's near-threshold behavior can be activated.
-- based-on: billing.period_start(billing.meter_period) 8db5fd3bedbaabda2e55d094decb3e1d014455aba7dc0fa8f462834f1afb128a
-- based-on: billing.period_reset(billing.meter_period) 69170042e6dd1ac9fb81c16b57ed475efe1767bfc51a2f3f4f93c25b6dd54777
-- based-on: billing.resolve_capability(uuid, text, uuid) 5d80a026f106e8810cc5148daccc364e79b4242cf52b22f3fc2e6b5e0a43498a
-- based-on: billing.resolve_capability_effective(uuid, text, uuid) 5d780b81466e75b323fc674f7188de19a94d0000de462e53a7839fff60769f4d

-- Calendar boundaries must not depend on the connection's TimeZone. Rolling
-- windows are elapsed time and have no calendar boundary.
create or replace function billing.period_start(p_period billing.meter_period)
returns timestamptz language sql stable set search_path = billing, public as $$
  select case p_period
    when 'rolling_1h' then now() - interval '1 hour'
    when 'rolling_5h' then now() - interval '5 hours'
    when 'day' then date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    when 'week' then date_trunc('week', now() at time zone 'UTC') at time zone 'UTC'
    when 'month' then date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    when 'lifetime' then '-infinity'::timestamptz
    else '-infinity'::timestamptz
  end;
$$;

create or replace function billing.period_reset(p_period billing.meter_period)
returns timestamptz language sql stable set search_path = billing, public as $$
  select case p_period
    when 'day' then (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '1 day'
    when 'week' then (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC') + interval '1 week'
    when 'month' then (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') + interval '1 month'
    -- A rolling window has no single reset: its precise reset is calculated
    -- from the oldest included ledger row by the resolver below.
    else null
  end;
$$;

-- New overload: retain the three-argument function for existing callers, and
-- let the window resolver ask for the guardrails that apply to one period.
create or replace function billing.resolve_guardrail(
  p_org uuid, p_user uuid, p_capability text, p_period billing.meter_period
)
returns table(org_limit bigint, user_limit bigint, org_id uuid, user_guardrail_id uuid)
language sql stable security definer set search_path = billing, public as $$
  select
    (select g.limit_value from billing.spend_guardrail g
      where g.organization_id = p_org and g.capability = p_capability
        and g.period is not distinct from p_period
        and g.scope = 'org' and g.is_active and g.deleted_at is null
      order by g.limit_value asc limit 1),
    (select g.limit_value from billing.spend_guardrail g
      where g.organization_id = p_org and g.capability = p_capability
        and g.period is not distinct from p_period
        and g.scope = 'user' and g.scope_user_id = p_user
        and g.is_active and g.deleted_at is null
      order by g.limit_value asc limit 1),
    (select g.id from billing.spend_guardrail g
      where g.organization_id = p_org and g.capability = p_capability
        and g.period is not distinct from p_period
        and g.scope = 'org' and g.is_active and g.deleted_at is null
      order by g.limit_value asc limit 1),
    (select g.id from billing.spend_guardrail g
      where g.organization_id = p_org and g.capability = p_capability
        and g.period is not distinct from p_period
        and g.scope = 'user' and g.scope_user_id = p_user
        and g.is_active and g.deleted_at is null
      order by g.limit_value asc limit 1);
$$;

-- The model-spend resolver is deliberately isolated from other capabilities.
-- A plan/add-on may set each period independently. NULL is unlimited for that
-- period only; it must not erase numeric sibling windows.
create or replace function billing.resolve_model_spend_windows(
  p_user uuid, p_capability text, p_org uuid
)
returns jsonb language plpgsql stable set search_path = billing, public as $function$
declare
  v_tier billing.tier := billing.resolve_effective_tier(p_user, p_org);
  v_plan text := case when p_org is not null then billing.resolve_plan(p_org) end;
  v_plan_name text;
  v_enforced boolean := false;
  v_windows jsonb := '[]'::jsonb;
  v_allowed boolean := true;
  v_has_plan_opinion boolean := false;
  v_bind jsonb;
begin
  perform iam.asks_about_caller(p_user, 'billing.resolve_model_spend_windows');
  if auth.uid() is not null and p_org is not null
     and not iam.has_org_access_for(auth.uid(), p_org)
     and not public.is_platform_admin() then
    raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.'
      using errcode = '42501';
  end if;
  select name into v_plan_name from billing.plan where plan_key = v_plan;
  select enforced into v_enforced from billing.capability where capability = p_capability;

  if p_org is not null then
    with periods(period) as (
      values ('month'::billing.meter_period), ('week'::billing.meter_period),
             ('rolling_5h'::billing.meter_period)
    ), resolved as (
      select p.period, rl.limit_value, rl.unlimited, rl.from_addon
      from periods p cross join lateral billing.resolve_limit(p_org, p_capability, p.period) rl
    ), measured as (
      select r.*, coalesce(sum(ul.quantity), 0)::bigint as used,
        min(ul.created_at) as oldest
      from resolved r
      left join billing.usage_ledger ul on ul.organization_id = p_org
        and ul.capability = p_capability
        and ul.created_at >= billing.period_start(r.period)
      group by r.period, r.limit_value, r.unlimited, r.from_addon
    )
    select coalesce(bool_or(limit_value is not null or unlimited), false),
      coalesce(jsonb_agg(jsonb_build_object(
        'period', period, 'used', used, 'limit', limit_value,
        'remaining', case when limit_value is null then null else greatest(limit_value - used, 0) end,
        -- This is deliberately the next drop, not a claim that all capacity
        -- returns then. A later executable revision must calculate the first
        -- expiry whose cumulative quantity restores capacity.
        'nextUsageDropAt', case when period = 'rolling_5h' and oldest is not null
                                then oldest + interval '5 hours' end,
        'resetsAt', billing.period_reset(period),
        'from_addon', from_addon,
        'allowed', case when limit_value is null then true else used < limit_value end,
        'would_block', case when limit_value is null then false else not (used < limit_value) end,
        'effective_allowed', case when v_enforced then (limit_value is null or used < limit_value) else true end
      ) order by greatest(coalesce(limit_value - used, 9223372036854775807), 0), period), '[]'::jsonb),
      coalesce(bool_and(limit_value is null or used < limit_value), true)
    into v_has_plan_opinion, v_windows, v_allowed
    from measured;
  end if;

  -- A plan/add-on has priority once it has an opinion in any requested window.
  -- At that point every requested period is emitted: a missing sibling is
  -- unlimited for entitlement purposes but remains visible to a guardrail.
  if v_has_plan_opinion then
  else
    -- No plan/add-on opinion: preserve the tier fallback, including all its
    -- configured windows, so plans cannot silently remove a tier cap.
    with measured as (
      select cl.period, cl.limit_value, coalesce(sum(ul.quantity), 0)::bigint as used,
        min(ul.created_at) as oldest
      from billing.capability_limit cl
      left join billing.usage_ledger ul on ul.user_id = p_user
        and ul.capability = p_capability
        and ul.created_at >= billing.period_start(cl.period)
      where cl.capability = p_capability and cl.tier = v_tier and cl.limit_value is not null
      group by cl.period, cl.limit_value
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'period', period, 'used', used, 'limit', limit_value,
      'remaining', greatest(limit_value - used, 0),
      'nextUsageDropAt', case when period = 'rolling_5h' and oldest is not null
                              then oldest + interval '5 hours' end,
      'resetsAt', billing.period_reset(period),
      'allowed', used < limit_value,
      'would_block', not (used < limit_value),
      'effective_allowed', case when v_enforced then used < limit_value else true end
    ) order by greatest(limit_value - used, 0), period), '[]'::jsonb),
      coalesce(bool_and(used < limit_value), true)
    into v_windows, v_allowed from measured;
  end if;

  if v_windows = '[]'::jsonb then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'allowed', 'period', null,
      'windows', v_windows, 'enforced', v_enforced, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name, 'usage_source', 'ledger');
  end if;

  v_bind := v_windows->0;
  return jsonb_build_object(
    'allowed', case when v_enforced then v_allowed else true end, 'remaining', (v_bind->>'remaining')::bigint,
    'limit', (v_bind->>'limit')::bigint, 'used', (v_bind->>'used')::bigint,
    'tier', v_tier, 'reason', case when not v_enforced then 'permissive_stub' when v_allowed then 'allowed' else 'cap_reached' end,
    'period', v_bind->>'period', 'windows', v_windows, 'enforced', v_enforced,
    'organization_id', p_org, 'plan', v_plan, 'plan_name', v_plan_name,
    'from_addon', coalesce((v_bind->>'from_addon')::boolean, false), 'usage_source', 'ledger');
end;
$function$;

revoke all on function billing.resolve_model_spend_windows(uuid, text, uuid) from public;
grant execute on function billing.resolve_model_spend_windows(uuid, text, uuid) to authenticated, service_role;

create or replace function billing.resolve_capability_effective(p_user uuid, p_capability text, p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'billing', 'public' as $function$
declare
  v_caller uuid := auth.uid(); v_env jsonb; v_cap billing.capability%rowtype;
  v_windows jsonb := '[]'::jsonb; v_bind jsonb; r record;
  v_ent bigint; v_org_g bigint; v_user_g bigint; v_org_gid uuid; v_user_gid uuid;
  v_org_used bigint; v_user_used bigint; v_source text; v_limit bigint; v_rem bigint; v_would_block boolean;
  v_period billing.meter_period;
begin
  if p_user is null then p_user := v_caller; end if;
  if v_caller is not null and p_user <> v_caller and not public.is_platform_admin() then raise exception 'billing.resolve_capability_effective: you may only resolve your own account.' using errcode='42501'; end if;
  if v_caller is not null and p_org is not null and not iam.has_org_access_for(v_caller,p_org) and not public.is_platform_admin() then raise exception 'An organization''s plan and entitlements are that organization''s confidential business. You are not a member of that organization, so this door will not tell you what it is on.' using errcode='42501'; end if;
  -- Preserve the exact one-window effective semantics for every other
  -- capability. Only platform.points has the approved multi-window contract.
  if p_capability <> 'platform.points' then
    v_env := billing.resolve_capability(p_user,p_capability,p_org);
    select * into v_cap from billing.capability where capability=p_capability;
    v_period := coalesce(v_cap.period,'lifetime'::billing.meter_period);
    v_ent := nullif(v_env->>'limit','')::bigint;
    v_org_used := coalesce(nullif(v_env->>'used','')::bigint,0);
    v_org_g := null; v_user_g := null; v_org_gid := null; v_user_gid := null; v_user_used := 0;
    if p_org is not null then
      select org_limit,user_limit,org_id,user_guardrail_id into v_org_g,v_user_g,v_org_gid,v_user_gid from billing.resolve_guardrail(p_org,p_user,p_capability);
      select coalesce(sum(quantity),0)::bigint into v_user_used from billing.usage_ledger ul where ul.capability=p_capability and ul.user_id=p_user and ul.organization_id=p_org and (v_period='lifetime' or ul.created_at>=billing.period_start(v_period));
    end if;
    v_limit:=v_ent; v_source:=case when v_ent is null then 'unlimited' when coalesce((v_env->>'from_addon')::boolean,false) then 'addon' when v_env->>'plan' is not null then 'plan' else 'tier' end;
    if v_org_g is not null and (v_limit is null or v_org_g<v_limit) then v_limit:=v_org_g; v_source:='org_guardrail'; end if;
    if v_user_g is not null and (v_limit is null or v_user_g<v_limit) then v_limit:=v_user_g; v_source:='user_guardrail'; end if;
    if v_limit is null then v_rem:=null; v_would_block:=false; else v_rem:=greatest(least(case when v_source='user_guardrail' then v_limit-v_user_used else v_limit-v_org_used end,case when v_user_g is null then 9223372036854775807 else v_user_g-v_user_used end),0); v_would_block:=v_rem=0; end if;
    return v_env || jsonb_build_object('entitlement_limit',v_ent,'org_guardrail',v_org_g,'user_guardrail',v_user_g,'org_guardrail_id',v_org_gid,'user_guardrail_id',v_user_gid,'user_used',v_user_used,'org_used',v_org_used,'effective_limit',v_limit,'limit_source',v_source,'effective_remaining',v_rem,'effective_allowed',case when v_cap.enforced then not v_would_block else true end,'would_block',v_would_block,'enforced',coalesce(v_cap.enforced,false),'period',v_period,'subject_user_id',p_user);
  end if;
  v_env := billing.resolve_capability(p_user,p_capability,p_org);
  select * into v_cap from billing.capability where capability=p_capability;
  for r in select value as w from jsonb_array_elements(coalesce(v_env->'windows','[]'::jsonb)) loop
    v_ent := nullif(r.w->>'limit','')::bigint;
    v_org_g := null; v_user_g := null; v_org_gid := null; v_user_gid := null; v_user_used := 0;
    v_org_used := coalesce(nullif(r.w->>'used','')::bigint,0);
    if p_org is not null then
      select org_limit,user_limit,org_id,user_guardrail_id into v_org_g,v_user_g,v_org_gid,v_user_gid from billing.resolve_guardrail(p_org,p_user,p_capability,(r.w->>'period')::billing.meter_period);
      select coalesce(sum(quantity),0)::bigint into v_user_used from billing.usage_ledger ul where ul.capability=p_capability and ul.user_id=p_user and ul.organization_id=p_org and ul.created_at >= billing.period_start((r.w->>'period')::billing.meter_period);
    end if;
    v_limit := v_ent; v_source := case when v_ent is null then 'unlimited' when coalesce((r.w->>'from_addon')::boolean,false) then 'addon' when v_env->>'plan' is not null then 'plan' else 'tier' end;
    if v_org_g is not null and (v_limit is null or v_org_g < v_limit) then v_limit:=v_org_g; v_source:='org_guardrail'; end if;
    if v_user_g is not null and (v_limit is null or v_user_g < v_limit) then v_limit:=v_user_g; v_source:='user_guardrail'; end if;
    v_rem := greatest(least(case when v_ent is null then 9223372036854775807 else v_ent-v_org_used end,case when v_org_g is null then 9223372036854775807 else v_org_g-v_org_used end,case when v_user_g is null then 9223372036854775807 else v_user_g-v_user_used end),0);
    if v_limit is null then v_rem:=null; v_would_block:=false; else v_would_block:=v_rem=0; end if;
    v_windows:=v_windows || jsonb_build_array(r.w || jsonb_build_object('entitlement_limit',v_ent,'org_guardrail',v_org_g,'user_guardrail',v_user_g,'org_guardrail_id',v_org_gid,'user_guardrail_id',v_user_gid,'org_used',v_org_used,'user_used',v_user_used,'effective_limit',v_limit,'limit_source',v_source,'effective_remaining',v_rem,'would_block',v_would_block,'effective_allowed',case when coalesce(v_cap.enforced,false) then not v_would_block else true end));
  end loop;
  if v_windows='[]'::jsonb then return v_env || jsonb_build_object('entitlement_limit',null,'org_guardrail',null,'user_guardrail',null,'org_guardrail_id',null,'user_guardrail_id',null,'org_used',0,'user_used',0,'effective_limit',null,'limit_source','unlimited','effective_remaining',null,'effective_allowed',true,'would_block',false,'enforced',coalesce(v_cap.enforced,false),'subject_user_id',p_user); end if;
  select value into v_bind from jsonb_array_elements(v_windows) order by (value->>'effective_remaining')::bigint nulls last, value->>'period' limit 1;
  return v_env || jsonb_build_object('windows',v_windows,'entitlement_limit',v_bind->'entitlement_limit','org_guardrail',v_bind->'org_guardrail','user_guardrail',v_bind->'user_guardrail','org_guardrail_id',v_bind->'org_guardrail_id','user_guardrail_id',v_bind->'user_guardrail_id','org_used',v_bind->'org_used','user_used',v_bind->'user_used','effective_limit',v_bind->'effective_limit','limit_source',v_bind->'limit_source','effective_remaining',v_bind->'effective_remaining','effective_allowed',v_bind->'effective_allowed','would_block',v_bind->'would_block','period',v_bind->'period','enforced',coalesce(v_cap.enforced,false),'subject_user_id',p_user);
end;
$function$;

create or replace function billing.resolve_capability(p_user uuid, p_capability text, p_org uuid)
returns jsonb language plpgsql stable set search_path to 'billing', 'public' as $function$
declare
  v_tier billing.tier; v_plan text; v_plan_name text; v_cap billing.capability%rowtype;
  v_windows jsonb; v_allowed boolean; v_bind_period billing.meter_period;
  v_bind_used integer; v_bind_limit integer; v_bind_remain integer;
  v_plan_limit bigint; v_plan_unlimited boolean := false; v_plan_from_addon boolean := false; v_used bigint;
begin
  perform iam.asks_about_caller(p_user, 'billing.resolve_capability');
  select * into v_cap from billing.capability where capability = p_capability;
  v_tier := billing.resolve_effective_tier(p_user, p_org);
  v_plan := case when p_org is not null then billing.resolve_plan(p_org) else null end;
  select name into v_plan_name from billing.plan where plan_key = v_plan;
  if v_cap.capability is null then
    raise warning '[billing.resolve_capability] unknown capability id "%" — failing open (unlimited). Register it in billing.capability or fix the caller.', p_capability;
    return jsonb_build_object('allowed',true,'remaining',null,'limit',null,'used',0,'tier',v_tier,'reason','permissive_stub','period',null,'windows','[]'::jsonb,'enforced',false,'unknown',true,'required_tier',null,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name);
  end if;
  if v_cap.enforced and ((v_cap.min_tier='premium' and v_tier <> 'premium') or (v_cap.min_tier='trial' and v_tier='free')) then
    return jsonb_build_object('allowed',false,'remaining',0,'limit',0,'used',0,'tier',v_tier,'reason','tier_locked','period',v_cap.period,'windows','[]'::jsonb,'enforced',true,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name);
  end if;
  if p_capability = 'platform.points' then
    return billing.resolve_model_spend_windows(p_user, p_capability, p_org);
  end if;
  if v_plan is not null then
    select rl.limit_value, rl.unlimited, rl.from_addon into v_plan_limit, v_plan_unlimited, v_plan_from_addon
    from billing.resolve_limit(p_org,p_capability,coalesce(v_cap.period,'lifetime'::billing.meter_period)) rl;
    if coalesce(v_plan_unlimited,false) then
      return jsonb_build_object('allowed',true,'remaining',null,'limit',null,'used',0,'tier',v_tier,'reason',case when v_cap.enforced then 'allowed' else 'permissive_stub' end,'period',v_cap.period,'windows','[]'::jsonb,'enforced',v_cap.enforced,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name,'from_addon',coalesce(v_plan_from_addon,false));
    end if;
    if v_plan_limit is not null then
      if v_cap.usage_source = 'external' then
        return jsonb_build_object('allowed',true,'remaining',null,'limit',v_plan_limit,'used',null,'tier',v_tier,'reason',case when v_cap.enforced then 'allowed' else 'permissive_stub' end,'period',v_cap.period,'windows','[]'::jsonb,'enforced',v_cap.enforced,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name,'from_addon',coalesce(v_plan_from_addon,false),'usage_source','external');
      end if;
      select coalesce(sum(quantity),0)::bigint into v_used from billing.usage_ledger where capability=p_capability and organization_id=p_org and (v_cap.period is null or v_cap.period='lifetime' or created_at >= billing.period_start(v_cap.period));
      v_windows := jsonb_build_array(jsonb_build_object('period',coalesce(v_cap.period::text,'lifetime'),'used',v_used,'limit',v_plan_limit,'remaining',greatest(v_plan_limit-v_used,0),'resetsAt',case when v_cap.period is null or v_cap.period='lifetime' then null else billing.period_reset(v_cap.period) end));
      v_allowed := v_used < v_plan_limit;
      return jsonb_build_object('allowed',case when v_cap.enforced then v_allowed else true end,'remaining',greatest(v_plan_limit-v_used,0),'limit',v_plan_limit,'used',v_used,'tier',v_tier,'reason',case when not v_cap.enforced then 'permissive_stub' when v_allowed then 'allowed' else 'cap_reached' end,'period',v_cap.period,'windows',v_windows,'enforced',v_cap.enforced,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name,'from_addon',coalesce(v_plan_from_addon,false),'usage_source','ledger');
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('period',w.period,'used',w.used,'limit',w.limit_value,'remaining',greatest(w.limit_value-w.used,0),'resetsAt',billing.period_reset(w.period)) order by (w.limit_value-w.used) asc),'[]'::jsonb),coalesce(bool_and(w.used<w.limit_value),true) into v_windows,v_allowed from (select cl.period,cl.limit_value,(select coalesce(sum(quantity),0)::int from billing.usage_ledger where user_id=p_user and capability=p_capability and created_at >= billing.period_start(cl.period)) as used from billing.capability_limit cl where cl.capability=p_capability and cl.tier=v_tier and cl.limit_value is not null) w;
  if v_windows='[]'::jsonb then return jsonb_build_object('allowed',true,'remaining',null,'limit',null,'used',0,'tier',v_tier,'reason',case when v_cap.enforced then 'allowed' else 'permissive_stub' end,'period',v_cap.period,'windows','[]'::jsonb,'enforced',v_cap.enforced,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name); end if;
  v_bind_period := (v_windows->0->>'period')::billing.meter_period; v_bind_used := (v_windows->0->>'used')::int; v_bind_limit := (v_windows->0->>'limit')::int; v_bind_remain := (v_windows->0->>'remaining')::int;
  return jsonb_build_object('allowed',case when v_cap.enforced then v_allowed else true end,'remaining',v_bind_remain,'limit',v_bind_limit,'used',v_bind_used,'tier',v_tier,'reason',case when not v_cap.enforced then 'permissive_stub' when v_allowed then 'allowed' else 'cap_reached' end,'period',v_bind_period,'windows',v_windows,'enforced',v_cap.enforced,'required_tier',v_cap.min_tier,'organization_id',p_org,'plan',v_plan,'plan_name',v_plan_name);
end;
$function$;
--
