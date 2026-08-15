-- Regression coverage for billing_resolve_capability_optional_plan_guard.sql.
-- Run against Matrx Main; the metering fixture is rolled back.

begin;

create temporary table billing_resolver_fixture on commit drop as
select id as user_id
from auth.users
order by created_at
limit 1;

do $preflight$
begin
  if not exists (select 1 from billing_resolver_fixture) then
    raise exception 'billing resolver test requires one auth.users row';
  end if;
end;
$preflight$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id from billing_resolver_fixture),
    'role', 'authenticated'
  )::text,
  true
);

do $regression$
declare
  v_user uuid := (select user_id from billing_resolver_fixture);
  v_org uuid := gen_random_uuid();
  v_check_id uuid := gen_random_uuid();
  v_user_verdict jsonb;
  v_org_fallback jsonb;
  v_plan_verdict jsonb;
  v_snapshot jsonb;
  v_consume jsonb;
begin
  -- Exact captured branch: the two-argument delegate supplies p_org = NULL.
  v_user_verdict := billing.resolve_capability(
    v_user, 'education.generate_cards', null::uuid
  );
  if v_user_verdict is null
     or v_user_verdict->>'organization_id' is not null
     or jsonb_typeof(v_user_verdict->'windows') is distinct from 'array' then
    raise exception 'user-only resolver returned an invalid verdict: %', v_user_verdict;
  end if;

  -- An org plan that does not mention education must fall through to tier
  -- windows, not collapse to unlimited and not touch unassigned plan state.
  v_org_fallback := billing.resolve_capability(
    v_user, 'education.generate_cards', v_org
  );
  if v_org_fallback->>'plan' <> 'free'
     or jsonb_typeof(v_org_fallback->'windows') is distinct from 'array' then
    raise exception 'org plan fallback returned an invalid verdict: %', v_org_fallback;
  end if;

  -- The real numeric plan branch still resolves through billing.plan_limit.
  v_plan_verdict := billing.resolve_capability(
    v_user, 'platform.points', v_org
  );
  if (v_plan_verdict->>'limit')::bigint <> 25000
     or v_plan_verdict->>'usage_source' <> 'ledger' then
    raise exception 'numeric plan resolver returned an invalid verdict: %', v_plan_verdict;
  end if;

  -- Authenticated boot hydration exercises entitlement_snapshot -> the
  -- two-argument resolver delegate across every registered capability.
  v_snapshot := billing.entitlement_snapshot();
  if jsonb_typeof(v_snapshot->'usage') is distinct from 'object' then
    raise exception 'entitlement snapshot returned an invalid payload: %', v_snapshot;
  end if;

  -- A successful metered action must retain its ledger insert after the
  -- resolver builds the returned windows. Before the fix, SQLSTATE 55000
  -- aborted this function and rolled the insert back.
  v_consume := billing.entitlement_consume(
    'education.generate_cards', 1, v_check_id
  );
  if coalesce((v_consume->>'consumed')::boolean, false) is not true
     or not exists (
       select 1 from billing.usage_ledger where check_id = v_check_id
     ) then
    raise exception 'entitlement consume did not retain its ledger row: %', v_consume;
  end if;
end;
$regression$;

rollback;
