-- billing_entitlements_schema.sql
-- P8 — Billing Integrity & Entitlements. Greenfield commercial layer.
--
-- Protected-resources posture (see .claude/skills/protected-resources): billing
-- tables are DENY-BY-DEFAULT for authenticated. Users may SELECT only their own
-- subscription/customer/usage rows (needed for the boot snapshot). ALL writes go
-- through Stripe webhooks (service_role in the API route) or SECURITY DEFINER
-- RPCs gated by auth.uid(). There is exactly ONE write path per table.
--
-- Resolver model: mirrors iam.has_access — features NEVER read these tables
-- directly; they call billing.entitlement_check / entitlement_snapshot.
--
-- Idempotent: safe to re-apply (IF NOT EXISTS / CREATE OR REPLACE).

create schema if not exists billing;
grant usage on schema billing to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type billing.tier as enum ('free', 'trial', 'premium');
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing.subscription_status as enum (
    'trialing', 'active', 'past_due', 'canceled', 'incomplete',
    'incomplete_expired', 'unpaid', 'paused'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type billing.meter_period as enum ('day', 'week', 'month', 'lifetime');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Stripe product/price mirror
-- ---------------------------------------------------------------------------
create table if not exists billing.product (
  id                uuid primary key default gen_random_uuid(),
  stripe_product_id text unique,
  name              text not null,
  description       text,
  tier              billing.tier not null default 'premium',
  active            boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists billing.price (
  id               uuid primary key default gen_random_uuid(),
  stripe_price_id  text unique,
  product_id       uuid not null references billing.product(id) on delete cascade,
  unit_amount      integer,                      -- cents; null for metered/custom
  currency         text not null default 'usd',
  interval         text,                         -- 'month' | 'year' | null (one-time)
  interval_count   integer not null default 1,
  trial_period_days integer,
  active           boolean not null default true,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customer mapping (user -> Stripe)
-- ---------------------------------------------------------------------------
create table if not exists billing.customer (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Subscriptions (user or org)
-- ---------------------------------------------------------------------------
create table if not exists billing.subscription (
  id                     uuid primary key default gen_random_uuid(),
  stripe_subscription_id text unique,
  user_id                uuid references auth.users(id) on delete cascade,
  org_id                 uuid,                    -- org subscriptions (Convergence C)
  price_id               uuid references billing.price(id),
  status                 billing.subscription_status not null,
  tier                   billing.tier not null default 'premium',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  trial_start            timestamptz,
  trial_end              timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscription_user_or_org check (user_id is not null or org_id is not null)
);
create index if not exists subscription_user_idx on billing.subscription(user_id);
create index if not exists subscription_org_idx  on billing.subscription(org_id);
create index if not exists subscription_status_idx on billing.subscription(status);

-- ---------------------------------------------------------------------------
-- Capability registry (DB-authoritative enforcement + limits)
--   billing.capability      : per-capability enforcement switch + metadata
--   billing.capability_limit: (capability, tier) -> numeric cap
-- The TS registry (features/entitlements/registry.ts) owns the capability set
-- + copy; the DB owns enforcement + numbers so we flip without a deploy.
-- ---------------------------------------------------------------------------
create table if not exists billing.capability (
  capability text primary key,
  enforced   boolean not null default false,
  period     billing.meter_period,              -- null = pure gate (no meter)
  min_tier   billing.tier not null default 'free',
  updated_at timestamptz not null default now()
);

create table if not exists billing.capability_limit (
  capability  text not null references billing.capability(capability) on delete cascade,
  tier        billing.tier not null,
  limit_value integer,                            -- null = unlimited
  primary key (capability, tier)
);

-- ---------------------------------------------------------------------------
-- Usage ledger (append-only; period aggregated by the resolver)
-- ---------------------------------------------------------------------------
create table if not exists billing.usage_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  capability   text not null,
  quantity     integer not null default 1,
  check_id     uuid,                              -- ties a consume to its pre-check
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists usage_ledger_user_cap_idx
  on billing.usage_ledger(user_id, capability, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — deny-by-default; self-select only where the snapshot needs it
-- ---------------------------------------------------------------------------
alter table billing.product          enable row level security;
alter table billing.price            enable row level security;
alter table billing.customer         enable row level security;
alter table billing.subscription     enable row level security;
alter table billing.capability       enable row level security;
alter table billing.capability_limit enable row level security;
alter table billing.usage_ledger     enable row level security;

-- product/price/capability/capability_limit: world-readable (public pricing);
-- writes denied for authenticated (service_role bypasses RLS for webhook sync).
do $$
declare t text;
begin
  foreach t in array array['product','price','capability','capability_limit'] loop
    execute format('drop policy if exists %I_read on billing.%I', t, t);
    execute format('create policy %I_read on billing.%I for select to anon, authenticated using (true)', t, t);
    execute format('drop policy if exists %I_no_write on billing.%I', t, t);
    execute format('create policy %I_no_write on billing.%I for all to authenticated using (false) with check (false)', t, t);
  end loop;
end $$;

-- customer / subscription / usage_ledger: self-select only, writes denied
drop policy if exists customer_self on billing.customer;
create policy customer_self on billing.customer for select to authenticated using (user_id = auth.uid());
drop policy if exists customer_no_write on billing.customer;
create policy customer_no_write on billing.customer for all to authenticated using (false) with check (false);

drop policy if exists subscription_self on billing.subscription;
create policy subscription_self on billing.subscription for select to authenticated
  using (user_id = auth.uid() or (org_id is not null and iam.has_org_access(org_id)));
drop policy if exists subscription_no_write on billing.subscription;
create policy subscription_no_write on billing.subscription for all to authenticated using (false) with check (false);

drop policy if exists usage_self on billing.usage_ledger;
create policy usage_self on billing.usage_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists usage_no_write on billing.usage_ledger;
create policy usage_no_write on billing.usage_ledger for all to authenticated using (false) with check (false);
