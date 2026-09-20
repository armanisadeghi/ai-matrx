-- w1_org_billing_is_organization_keyed.inverse.sql
--
-- Restores the three billing substitutions F2 removed.
--
-- ⚠️ RUNNING THIS PUTS BACK BEHAVIOUR THE 2026-09-19 RULING FORBIDS: the meter
-- silently billing a personal workspace, and the tier resolvers reading a
-- default organization. It exists because every non-additive step in this
-- campaign carries its inverse, not because running it is ever the right
-- answer. If a caller broke, the fix is to make that caller name its
-- organization.
--
-- Restores the exact bodies that were live before F2 (captured 2026-09-19).

begin;

-- ── 1. the three-argument overload, its door row, and the coalescing survivor ──

create or replace function billing.entitlement_consume(
  p_capability text,
  p_quantity   integer DEFAULT 1,
  p_check_id   uuid    DEFAULT NULL
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_cap billing.capability%rowtype;
  v_tier billing.tier;
  v_qty integer := coalesce(p_quantity, 1);
  v_pre jsonb;
  v_exceeds boolean;
  v_org uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_qty < 1 then raise exception 'quantity must be >= 1'; end if;
  v_org := public.ensure_personal_organization(v_user);
  if p_check_id is not null and exists (select 1 from billing.usage_ledger where check_id = p_check_id) then
    return billing.resolve_capability(v_user, p_capability) || jsonb_build_object('consumed', false, 'duplicate', true);
  end if;
  select * into v_cap from billing.capability where capability = p_capability;
  if v_cap.capability is null or v_cap.enforced = false then
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, v_org, p_capability, v_qty, p_check_id);
    return billing.resolve_capability(v_user, p_capability) || jsonb_build_object('consumed', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_capability, 0));
  v_pre := billing.resolve_capability(v_user, p_capability);
  if (v_pre->>'allowed')::boolean = false then
    return v_pre || jsonb_build_object('consumed', false);
  end if;
  v_tier := billing.resolve_tier(v_user);
  select bool_or((u.used + v_qty) > cl.limit_value) into v_exceeds
  from billing.capability_limit cl
  cross join lateral (
    select coalesce(sum(quantity), 0)::int as used from billing.usage_ledger
    where user_id = v_user and capability = p_capability and created_at >= billing.period_start(cl.period)
  ) u
  where cl.capability = p_capability and cl.tier = v_tier and cl.limit_value is not null;
  if coalesce(v_exceeds, false) then
    return billing.resolve_capability(v_user, p_capability) || jsonb_build_object('consumed', false, 'reason', 'cap_reached');
  end if;
  insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
  values (v_user, v_org, p_capability, v_qty, p_check_id);
  return billing.resolve_capability(v_user, p_capability) || jsonb_build_object('consumed', true);
end;
$fn$;

grant execute on function billing.entitlement_consume(text, integer, uuid) to authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('billing', 'entitlement_consume', 'p_capability text, p_quantity integer, p_check_id uuid',
   array[25, 23, 2950]::oid[],
   'Restored by w1_org_billing_is_organization_keyed.inverse.sql. Resolves the caller through auth.uid() inside the function; there is no entity id for a caller to forge.',
   'w1_org_billing_is_organization_keyed.inverse.sql', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function billing.entitlement_consume(
  p_capability text,
  p_quantity   integer,
  p_check_id   uuid,
  p_org        uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_cap  billing.capability%rowtype;
  v_res  jsonb;
  v_dup  boolean := false;
  v_ledger_org uuid;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'consumed', false, 'duplicate', false,
      'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'free',
      'reason', 'not_authenticated', 'period', null, 'windows', '[]'::jsonb,
      'enforced', false);
  end if;

  if p_org is not null and not iam.has_org_access_for(v_user, p_org) then
    raise exception 'You have no standing in that organization, so you cannot consume its entitlement.'
      using errcode = '42501';
  end if;

  select * into v_cap from billing.capability where capability = p_capability;

  v_ledger_org := coalesce(p_org, public.ensure_personal_organization(v_user));

  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    perform pg_advisory_xact_lock(
      hashtext(coalesce(p_org::text, v_user::text) || ':' || p_capability));
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, v_ledger_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$fn$;

grant execute on function billing.entitlement_consume(text, integer, uuid, uuid)
  to authenticated, service_role;

-- ── 2. resolve_tier reads the default organization again ───────────────────

create or replace function billing.resolve_tier(p_user uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $fn$
  select case
    when coalesce(
           (platform.knob_resolve('custom', 'signup_provisioning_guard', null) #>> '{}')::boolean,
           false)
    then
      coalesce(billing.resolve_org_tier(iam.default_organization_id(p_user)), 'free'::billing.tier)
    else
      billing._resolve_tier_legacy(p_user)
  end;
$fn$;

-- ── 3. tier_no_downgrade reads the default organization again ──────────────

create or replace function billing.tier_no_downgrade()
returns table(user_id uuid, legacy_tier billing.tier, organization_tier billing.tier)
language sql
stable
set search_path to 'billing', 'public'
as $fn$
  select u.id,
         billing._resolve_tier_legacy(u.id),
         coalesce(billing.resolve_org_tier(iam.default_organization_id(u.id)), 'free'::billing.tier)
    from auth.users u
   where billing.tier_rank(
           coalesce(billing.resolve_org_tier(iam.default_organization_id(u.id)), 'free'::billing.tier))
       < billing.tier_rank(billing._resolve_tier_legacy(u.id));
$fn$;

commit;
