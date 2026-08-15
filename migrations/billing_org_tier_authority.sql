-- billing_org_tier_authority.sql
--
-- THE ORG TIER. One authority every surface asks: "is this org allowed to do X?"
--
-- Why this migration exists (Arman, 2026-08-14): the platform had a real
-- entitlement resolver already (billing.resolve_capability, shipped 2026-07-07
-- for education) but the TIER it resolved was a property of a USER — a Stripe
-- subscription row keyed on user_id. Outreach is the first capability that is
-- genuinely a property of an ORGANIZATION (a sending identity belongs to an org,
-- a domain belongs to an org, an abuse blast radius is an org), and it is the
-- first capability that must NOT be free (free accounts are what get sending
-- infrastructure blocklisted). So the tier concept becomes org-carried here.
--
-- WHAT THIS IS NOT: a second entitlement system. Everything below extends
-- `billing` — the same resolver, the same capability registry, the same usage
-- ledger, the same tier enum. There is no parallel plan table, no feature-local
-- check, no second source of numbers.
--
-- ============================================================================
-- 🚨 THE NO-REGRESSION RULE — the load-bearing property of this migration.
-- ============================================================================
-- Introducing tiers must TAKE NOTHING AWAY FROM ANYONE. That is not a review
-- convention here; it is enforced structurally by ONE property:
--
--     billing.resolve_effective_tier(user, org) >= billing.resolve_tier(user)
--
-- The effective tier is the MOST PERMISSIVE of (the user's own tier, the org's
-- tier). It is monotonic by construction — adding an org can only ever raise a
-- verdict, never lower one. Every capability that resolved `allowed` for a user
-- before this migration resolves `allowed` after it, for every org, forever.
-- A future edit that makes this function able to return LESS than the user tier
-- is a regression, no matter how reasonable it looks. Do not make it.
--
-- The second half of the rule: a capability is restricted only when the
-- restriction is 100% confirmed and written down. Exactly ONE capability is
-- enforced by this migration (`outreach.send`), it is documented in
-- docs/handoffs/outreach-system.md §5.6, and it gates an action that NOBODY can
-- perform today (Phase 4 has not shipped; there is no send path and there are
-- zero sending identities in the database). Restricting it costs nobody
-- anything. Every other capability stays exactly as permissive as it was.
--
-- Guest accounts are REAL accounts (Arman) — they resolve a tier through the
-- same path as everyone else. Nothing here treats them as a lesser class.
--
-- Idempotent: safe to re-apply.

create schema if not exists billing;

-- ---------------------------------------------------------------------------
-- 1. Tier ordering. The enum has no ordering we can rely on for MAX(), so rank
--    it explicitly — free < trial < premium.
-- ---------------------------------------------------------------------------
create or replace function billing.tier_rank(p_tier billing.tier)
returns int language sql immutable as $$
  select case p_tier when 'premium' then 3 when 'trial' then 2 else 1 end;
$$;

comment on function billing.tier_rank(billing.tier) is
  'Orders billing.tier so the resolver can take the MOST PERMISSIVE of two tiers. free(1) < trial(2) < premium(3).';

create or replace function billing.tier_max(a billing.tier, b billing.tier)
returns billing.tier language sql immutable as $$
  select case when billing.tier_rank(coalesce(a,'free')) >= billing.tier_rank(coalesce(b,'free'))
              then coalesce(a,'free') else coalesce(b,'free') end;
$$;

comment on function billing.tier_max(billing.tier, billing.tier) is
  'The more permissive of two tiers. THE NO-REGRESSION RULE is expressed through this function: effective tier = tier_max(user, org), so adding an org can only ever raise a verdict.';

-- ---------------------------------------------------------------------------
-- 2. billing.org_plan — the tier an ORGANIZATION carries.
--
--    A Stripe subscription is ONE source of an org's tier, not the only one:
--    an internal org, a comped partner, a grandfathered account and a pilot are
--    all real and none of them has a Stripe row. `source` records WHY the org
--    has this tier, which is what makes a grant auditable instead of magic.
--
--    Absence of a row is not a downgrade — it simply means "no org grant", and
--    the effective tier falls back to the user's own tier (§1's monotonicity).
-- ---------------------------------------------------------------------------
create table if not exists billing.org_plan (
  organization_id uuid primary key,
  tier            billing.tier not null default 'free',
  -- WHY this org has this tier. Never inferred; always recorded.
  --   subscription — mirrors a live billing.subscription for this org
  --   grant        — a human granted it (sales, pilot, comp)
  --   internal     — AI Matrx's own orgs; we are our own customer
  --   grandfathered— the org was already using the capability before it was gated
  source          text not null default 'grant'
                    check (source in ('subscription','grant','internal','grandfathered')),
  note            text,
  granted_by      uuid,
  effective_from  timestamptz not null default now(),
  -- NULL = does not expire. An expired row resolves as if it were absent, which
  -- (per monotonicity) can never drop a user below their own tier.
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  version         int not null default 1
);

comment on table billing.org_plan is
  'The tier an organization carries. ONE row per org; absence means "no org grant" (never a downgrade). Read only through billing.resolve_org_tier / resolve_effective_tier — never queried directly by a feature.';

create index if not exists org_plan_tier_idx on billing.org_plan(tier);

-- Protected resource: deny-by-default, no policies. Every read goes through a
-- SECURITY DEFINER resolver; every write goes through the admin RPC below.
alter table billing.org_plan enable row level security;

-- ---------------------------------------------------------------------------
-- 3. billing.resolve_org_tier(org) — the org's own tier, from every source.
-- ---------------------------------------------------------------------------
create or replace function billing.resolve_org_tier(p_org uuid)
returns billing.tier
language sql stable
set search_path to 'billing', 'public'
as $$
  select coalesce(
    billing.tier_max(
      -- (a) an explicit, unexpired org plan
      (select p.tier from billing.org_plan p
        where p.organization_id = p_org
          and p.effective_from <= now()
          and (p.expires_at is null or p.expires_at > now())),
      -- (b) a live Stripe subscription attached to the org (org_id has been on
      --     billing.subscription since the schema shipped; nothing read it)
      (select case when s.status = 'trialing' then 'trial'::billing.tier
                   else 'premium'::billing.tier end
         from billing.subscription s
        where s.org_id = p_org and s.status in ('trialing','active','past_due')
        order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
                 s.current_period_end desc nulls last
        limit 1)
    ),
    'free'::billing.tier)
  where p_org is not null;
$$;

comment on function billing.resolve_org_tier(uuid) is
  'The tier an organization carries: the more permissive of its billing.org_plan grant and any live subscription on billing.subscription.org_id. Returns NULL for a NULL org (no org = no org tier), never an error.';

-- ---------------------------------------------------------------------------
-- 4. billing.resolve_effective_tier(user, org) — THE authority.
--
--    🚨 MONOTONIC BY CONSTRUCTION. Always >= billing.resolve_tier(p_user).
--    Read the NO-REGRESSION RULE at the top of this file before editing.
-- ---------------------------------------------------------------------------
create or replace function billing.resolve_effective_tier(p_user uuid, p_org uuid)
returns billing.tier
language sql stable
set search_path to 'billing', 'public'
as $$
  select billing.tier_max(
    billing.resolve_tier(p_user),                       -- never less than today
    coalesce(billing.resolve_org_tier(p_org), 'free')   -- an org can only add
  );
$$;

comment on function billing.resolve_effective_tier(uuid, uuid) is
  'THE tier authority. The MOST PERMISSIVE of the user tier and the org tier — monotonic, so introducing org tiers can never take a capability away from anyone (THE NO-REGRESSION RULE).';

-- ---------------------------------------------------------------------------
-- 5. resolve_capability gains an org. The existing 2-arg function is UNTOUCHED
--    in behaviour: it now delegates to the 3-arg form with p_org => null, which
--    resolves the identical tier it always did.
--
--    No DEFAULT on p_org — a default would make the 2-arg call ambiguous.
-- ---------------------------------------------------------------------------
create or replace function billing.resolve_capability(p_user uuid, p_capability text, p_org uuid)
returns jsonb
language plpgsql stable
set search_path to 'billing', 'public'
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
  v_tier := billing.resolve_effective_tier(p_user, p_org);

  if v_cap.capability is null then
    raise warning '[billing.resolve_capability] unknown capability id "%" — failing open (unlimited). Register it in billing.capability or fix the caller.', p_capability;
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
      'used', 0, 'tier', v_tier, 'reason', 'permissive_stub',
      'period', null, 'windows', '[]'::jsonb, 'enforced', false, 'unknown', true,
      'required_tier', null, 'organization_id', p_org);
  end if;

  -- The tier gate. Unchanged semantics: it only bites when the capability is
  -- ENFORCED, which is why an un-enforced capability can never be taken away.
  if v_cap.enforced
     and ((v_cap.min_tier = 'premium' and v_tier <> 'premium')
       or (v_cap.min_tier = 'trial' and v_tier = 'free')) then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0,
      'used', 0, 'tier', v_tier, 'reason', 'tier_locked',
      'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', true,
      -- The surface needs to say WHICH tier unlocks it, or the refusal is a
      -- dead end (no-dead-ends doctrine: every problem ships with its fix).
      'required_tier', v_cap.min_tier, 'organization_id', p_org);
  end if;

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
      'required_tier', v_cap.min_tier, 'organization_id', p_org);
  end if;

  v_bind_period := (v_windows->0->>'period')::billing.meter_period;
  v_bind_used   := (v_windows->0->>'used')::int;
  v_bind_limit  := (v_windows->0->>'limit')::int;
  v_bind_remain := (v_windows->0->>'remaining')::int;

  return jsonb_build_object(
    'allowed', case when v_cap.enforced then v_allowed else true end,
    'remaining', v_bind_remain, 'limit', v_bind_limit,
    'used', v_bind_used, 'tier', v_tier,
    'reason', case
                when not v_cap.enforced then 'permissive_stub'
                when v_allowed then 'allowed'
                else 'cap_reached' end,
    'period', v_bind_period, 'windows', v_windows, 'enforced', v_cap.enforced,
    'required_tier', v_cap.min_tier, 'organization_id', p_org);
end;
$function$;

comment on function billing.resolve_capability(uuid, text, uuid) is
  'THE capability authority. Org-aware form: resolves the effective tier from (user, org) then applies the capability gate + metering windows. The 2-arg form delegates here with p_org => null.';

-- The original 2-arg entry point, now a thin delegate. Every existing caller
-- (education surfaces, entitlement_check, entitlement_consume, the snapshot)
-- keeps working byte-identically because resolve_effective_tier(user, null)
-- is exactly resolve_tier(user).
create or replace function billing.resolve_capability(p_user uuid, p_capability text)
returns jsonb
language sql stable
set search_path to 'billing', 'public'
as $$
  select billing.resolve_capability(p_user, p_capability, null::uuid);
$$;

-- ---------------------------------------------------------------------------
-- 6. Client entry points. `entitlement_check(capability)` is untouched; the
--    org-aware overload is additive.
-- ---------------------------------------------------------------------------
create or replace function billing.entitlement_check(p_capability text, p_org uuid)
returns jsonb
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare v_user uuid := auth.uid(); v_res jsonb;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', 0, 'used', 0,
      'tier', 'free', 'reason', 'not_authenticated', 'period', null, 'check_id', null,
      'required_tier', null, 'organization_id', p_org);
  end if;
  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object('check_id', gen_random_uuid());
end;
$function$;

comment on function billing.entitlement_check(text, uuid) is
  'Org-aware server-truth pre-action check for the calling user. The 1-arg form (user-only) is unchanged and still the right call for a capability with no org dimension.';

-- "What can THIS org do, and what would unlock the rest?" — the read a surface
-- makes to render a gate honestly (tier held, tier required, and the reason)
-- instead of a bare 403. Deliberately readable by any authenticated member so a
-- gated surface can explain itself; it exposes no billing detail beyond the tier.
create or replace function billing.org_capability_status(p_org uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'billing', 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_caps jsonb := '{}'::jsonb;
  r      record;
begin
  if v_user is null then
    return jsonb_build_object('tier','free','org_tier','free','user_tier','free',
      'organization_id', p_org, 'capabilities','{}'::jsonb);
  end if;
  for r in select capability from billing.capability loop
    v_caps := v_caps || jsonb_build_object(
      r.capability, billing.resolve_capability(v_user, r.capability, p_org));
  end loop;
  return jsonb_build_object(
    'organization_id', p_org,
    'tier',      billing.resolve_effective_tier(v_user, p_org),
    'user_tier', billing.resolve_tier(v_user),
    'org_tier',  coalesce(billing.resolve_org_tier(p_org), 'free'),
    'capabilities', v_caps);
end;
$function$;

comment on function billing.org_capability_status(uuid) is
  'Every capability verdict for (calling user, org) in one round trip, plus the tier held vs the tier required. What a gated surface renders so a refusal is never a dead end.';

-- ---------------------------------------------------------------------------
-- 7. Granting an org tier — super-admin only, audited by the row itself.
--    There is no client-callable "grant myself premium" path, exactly as the
--    Stripe class-purchase gate is webhook-only.
-- ---------------------------------------------------------------------------
create or replace function billing.org_plan_set(
  p_org uuid, p_tier billing.tier, p_source text, p_note text, p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare v_row billing.org_plan%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_set: super-admin only'
      using errcode = '42501';
  end if;
  insert into billing.org_plan as p
    (organization_id, tier, source, note, granted_by, expires_at, updated_by)
  values (p_org, p_tier, coalesce(p_source,'grant'), p_note, auth.uid(), p_expires_at, auth.uid())
  on conflict (organization_id) do update
    set tier = excluded.tier, source = excluded.source, note = excluded.note,
        expires_at = excluded.expires_at, updated_at = now(),
        updated_by = auth.uid(), version = p.version + 1
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function billing.org_plan_list()
returns setof billing.org_plan
language plpgsql stable security definer
set search_path to 'billing', 'public'
as $function$
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_list: super-admin only' using errcode = '42501';
  end if;
  return query select * from billing.org_plan order by updated_at desc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. THE FIRST GATED CAPABILITY — outreach.send.
--
--    min_tier = 'trial' (NOT 'premium'): a trialing account is an identified,
--    card-on-file account, which is what the abuse filter actually needs. Free
--    is the tier that gets sending infrastructure blocklisted; trial is not.
--    Erring toward permitting, per the no-regression rule.
--
--    enforced = true on day one, and it is the ONLY enforced capability. This
--    takes nothing from anyone: there is no send path in production (outreach
--    Phase 4 is unbuilt), and there are zero rows in crm.sending_identity.
--    Documented: docs/handoffs/outreach-system.md §5.6.
--
--    period = null — a GATE, not a meter. Volume is already governed by the
--    sending identity's own per-day/per-hour caps and the warmup ramp; a second
--    number here would be a second source of truth for the same limit.
-- ---------------------------------------------------------------------------
insert into billing.capability (capability, enforced, period, min_tier)
values ('outreach.send', true, null, 'trial')
on conflict (capability) do update
  set enforced = excluded.enforced, period = excluded.period, min_tier = excluded.min_tier,
      updated_at = now();

-- Connecting a mailbox, proving a domain, checking DNS and warming up all stay
-- FREE and ungated on purpose: the setup work is where our non-technical user
-- needs the most help, and gating it would teach them nothing (§5.3b). Only the
-- act of reaching a stranger's inbox is gated.

-- ---------------------------------------------------------------------------
-- 9. Mapping what exists onto tiers.
--
--    Deliberately conservative and additive — every statement here can only
--    RAISE an org's tier. Nothing is downgraded, nothing is deleted.
-- ---------------------------------------------------------------------------

-- (a) We are our own customer: AI Matrx operates in its own normal org, and the
--     platform-global system org backs ownerless platform rows. Both need every
--     capability we sell, through the same code path a customer gets.
insert into billing.org_plan (organization_id, tier, source, note)
select o.id, 'premium'::billing.tier, 'internal',
       'AI Matrx internal org — we are our own customer (common-docs/policies/we-are-our-own-customer.md).'
from iam.organizations o
where o.id = '5dc930e9-bd65-44a1-8369-af773f6e1a5b'::uuid or o.is_system
on conflict (organization_id) do nothing;

-- (b) Mirror every live Stripe subscription that already names an org.
insert into billing.org_plan (organization_id, tier, source, note)
select distinct on (s.org_id) s.org_id,
       case when s.status = 'trialing' then 'trial'::billing.tier else 'premium'::billing.tier end,
       'subscription',
       'Mirrored from billing.subscription at the org-tier migration.'
from billing.subscription s
where s.org_id is not null and s.status in ('trialing','active','past_due')
order by s.org_id, case s.status when 'active' then 0 when 'trialing' then 1 else 2 end
on conflict (organization_id) do nothing;

-- (c) GRANDFATHER: any org that had already begun setting up outreach before
--     the gate existed keeps it. This is THE NO-REGRESSION RULE applied to real
--     rows rather than asserted. Zero rows match today (crm.sending_identity is
--     empty) — the statement exists so re-applying this migration after Phase 3
--     onboarding still cannot strand anyone mid-setup.
insert into billing.org_plan (organization_id, tier, source, note)
select distinct si.organization_id, 'premium'::billing.tier, 'grandfathered',
       'Org had a sending identity before outreach.send was gated — kept, per THE NO-REGRESSION RULE.'
from crm.sending_identity si
where si.organization_id is not null and si.deleted_at is null
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. Grants. Same shape as the rest of billing: the schema is reachable, the
--     tables are not, the resolvers are.
-- ---------------------------------------------------------------------------
grant usage on schema billing to authenticated, service_role;

grant execute on function billing.tier_rank(billing.tier)                      to authenticated, service_role;
grant execute on function billing.tier_max(billing.tier, billing.tier)         to authenticated, service_role;
grant execute on function billing.resolve_org_tier(uuid)                       to authenticated, service_role;
grant execute on function billing.resolve_effective_tier(uuid, uuid)           to authenticated, service_role;
grant execute on function billing.resolve_capability(uuid, text, uuid)         to authenticated, service_role;
grant execute on function billing.entitlement_check(text, uuid)                to authenticated, service_role;
grant execute on function billing.org_capability_status(uuid)                  to authenticated, service_role;
grant execute on function billing.org_plan_set(uuid, billing.tier, text, text, timestamptz) to authenticated, service_role;
grant execute on function billing.org_plan_list()                              to authenticated, service_role;

-- The table itself stays unreachable from PostgREST — resolver + RPC only.
revoke all on table billing.org_plan from anon, authenticated;
grant select, insert, update on table billing.org_plan to service_role;

notify pgrst, 'reload schema';
