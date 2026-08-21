-- billing_plan_system.sql
--
-- THE PLAN SYSTEM. One plan per account; each dimension upgradable on its own.
--
-- Arman's ruling, 2026-08-14 (canon: common-docs/systems/platform/entitlements-knobs/PLAN_MODEL.md):
--
--   "A user has ONE overall plan. Some individual aspects of a plan — outreach
--    emails, storage space, and possibly a few other things — are the types of
--    things where we could charge users to increase just that aspect."
--
-- And the constraint that shapes every choice below:
--
--   "The chances of these numbers becoming the final thing is pretty low… build
--    it in a way where adding tiers, changing tiers, modifying what's included
--    is significantly easier than trying to redo the entire thing."
--
-- ============================================================================
-- SO: EVERYTHING IS DATA. Nothing about a plan lives in code.
-- ============================================================================
--   Add a plan .............. 1 INSERT into billing.plan  + N into billing.plan_limit
--   Change what's included .. 1 UPDATE  billing.plan_limit.limit_value
--   Rename / reprice ........ 1 UPDATE  billing.plan
--   Add a new dimension ..... 1 INSERT into billing.capability + rows in plan_limit
--   Retire a plan ........... billing.plan.active = false (existing accounts keep it)
--   Give one account more ... 1 INSERT into billing.account_addon
--
-- NONE of those is a deploy. No plan name, price, or limit may ever be hardcoded
-- in TypeScript or Python again — the marketing page, the meters, the gates and
-- the admin screen all read these tables. `features/pricing/data.ts` was the
-- old hardcoded ladder; it is superseded by the `billing.plan` rows seeded here.
--
-- ============================================================================
-- THE NO-REGRESSION RULE still governs (FEATURE.md).
-- ============================================================================
-- Resolution is MOST-PERMISSIVE at every step: plan limit, raised by any add-on,
-- and the effective tier is still max(user, org). A capability blocks ONLY when
-- `billing.capability.enforced` is true — so every dimension seeded here starts
-- VISIBLE (users can see where they are) and only the ones that can hurt nobody
-- start ENFORCED. Turning one on later is a one-row UPDATE, which is exactly the
-- point of the design.
--
-- Idempotent: safe to re-apply.

create schema if not exists billing;

-- ---------------------------------------------------------------------------
-- 1. billing.plan — the packages. Seeded from the ladder Arman designed.
-- ---------------------------------------------------------------------------
create table if not exists billing.plan (
  id            text primary key,          -- stable key: 'personal-pro', 'company-pro'
  name          text not null,             -- what the customer sees: 'Pro'
  audience      text not null default 'personal'
                  check (audience in ('free','personal','company','enterprise')),
  tagline       text,
  -- Ordering AND comparison. "at least Pro" is rank >= (select rank ...). Gaps
  -- of 10 are deliberate: a new plan slots between two without renumbering.
  rank          int  not null,
  -- COMPAT BRIDGE. Everything shipped before plans (education gates, the
  -- outreach gate, resolve_effective_tier) speaks billing.tier. Each plan
  -- declares which tier it maps to, so the old world keeps working unchanged
  -- while the new world reads plan ids. Do not delete this column.
  tier          billing.tier not null default 'free',
  monthly_cents int,
  annual_cents  int,                        -- per month, billed annually
  per_seat      boolean not null default false,
  min_seats     int,
  badge         text,
  is_public     boolean not null default true,   -- shows on /pricing
  is_default    boolean not null default false,  -- what a brand-new account gets
  active        boolean not null default true,
  metadata      jsonb   not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table billing.plan is
  'The packages we sell. ONE row per plan. Adding or repricing a plan is an INSERT/UPDATE here — never a code change. `tier` is the compat bridge to the pre-plan billing.tier enum.';

create unique index if not exists plan_one_default_idx on billing.plan(is_default) where is_default;
create index if not exists plan_rank_idx on billing.plan(rank);

-- ---------------------------------------------------------------------------
-- 2. billing.plan_limit — what each plan includes, per dimension.
--
--    THIS is "what's included". One row per (plan, capability, window).
--    limit_value NULL = unlimited. No row = fall through to the tier-keyed
--    billing.capability_limit (which is what education still uses), and if that
--    is also absent, unlimited.
-- ---------------------------------------------------------------------------
create table if not exists billing.plan_limit (
  plan_id     text not null references billing.plan(id) on delete cascade,
  capability  text not null,
  -- NULL period = a standing quota (max agents, GB of storage), not a per-window
  -- meter. A metered dimension names its window ('month', 'day', 'rolling_5h').
  period      billing.meter_period,
  limit_value bigint,                       -- NULL = unlimited
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (plan_id, capability, period)
);

comment on table billing.plan_limit is
  'What each plan includes, per dimension. Changing what a plan gives = one UPDATE of limit_value. NULL limit_value = unlimited.';

-- Postgres treats NULLs as distinct in a PK, so a standing quota (period NULL)
-- needs its own uniqueness guard or it can be inserted twice.
create unique index if not exists plan_limit_standing_idx
  on billing.plan_limit(plan_id, capability) where period is null;

-- ---------------------------------------------------------------------------
-- 3. billing.account_addon — "upgrade just that one aspect".
--
--    The second half of Arman's model. An add-on RAISES one dimension above
--    what the plan includes, for one org, without changing their plan.
--
--    🚨 An add-on is a RAISE, never a cut. The resolver takes the MAX of the
--    plan limit and the add-on, so a mistaken add-on can never take capability
--    away — the worst it can do is give someone too much, which is recoverable.
-- ---------------------------------------------------------------------------
create table if not exists billing.account_addon (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capability      text not null,
  period          billing.meter_period,
  -- NULL = unlimited on this dimension (the strongest add-on there is).
  limit_value     bigint,
  source          text not null default 'grant'
                    check (source in ('purchase','grant','internal','grandfathered')),
  note            text,
  granted_by      uuid,
  effective_from  timestamptz not null default now(),
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table billing.account_addon is
  'Per-org raise on ONE dimension, on top of the plan (Arman: "charge users to increase just that aspect"). Always a RAISE — the resolver takes MAX(plan, addon), so an add-on can never remove capability.';

create index if not exists account_addon_lookup_idx
  on billing.account_addon(organization_id, capability);

-- All three are protected resources: deny-by-default, read through resolvers,
-- write through the super-admin RPCs below.
alter table billing.plan          enable row level security;
alter table billing.plan_limit    enable row level security;
alter table billing.account_addon enable row level security;

-- billing.plan and billing.plan_limit are PUBLIC PRODUCT INFORMATION — the
-- pricing page has to render them to a signed-out visitor. Read is open; write
-- is not (no insert/update/delete policy exists, so writes are DEFINER-only).
drop policy if exists plan_public_read on billing.plan;
create policy plan_public_read on billing.plan
  for select to anon, authenticated using (active);

drop policy if exists plan_limit_public_read on billing.plan_limit;
create policy plan_limit_public_read on billing.plan_limit
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4. The org's plan. Extends billing.org_plan (the tier authority) rather than
--    creating a second assignment table — the org already carries a tier there.
-- ---------------------------------------------------------------------------
alter table billing.org_plan
  add column if not exists plan_id text references billing.plan(id);

comment on column billing.org_plan.plan_id is
  'The specific package this org is on. billing.org_plan.tier stays as the coarse rank the pre-plan gates read; plan_id is the precise answer.';

-- ---------------------------------------------------------------------------
-- 5. THE PLANS. Arman''s designed ladder, encoded.
--
--    Keys are explicit about audience because "Pro" exists twice: `personal-pro`
--    ($49/mo, one person) and `company-pro` ($79/seat). Both display as "Pro".
-- ---------------------------------------------------------------------------
insert into billing.plan (id, name, audience, tagline, rank, tier, monthly_cents, annual_cents, per_seat, min_seats, badge, is_public, is_default, active) values
  ('free',             'Free',       'free',       'Kick the tires. No credit card.',            10, 'free',     0,     0,     false, null, null,             true,  true,  true),
  ('personal-entry',   'Entry',      'personal',   'Step into the harness.',                     20, 'premium',  1900,  1520,  false, null, null,             true,  false, true),
  ('personal-pro',     'Pro',        'personal',   'What most builders pick.',                   30, 'premium',  4900,  3920,  false, null, 'Most popular',   true,  false, true),
  ('personal-plus',    'Plus',       'personal',   'When one Pro seat isn''t enough.',           40, 'premium',  9900,  7920,  false, null, null,             true,  false, true),
  ('personal-max',     'Max',        'personal',   'Maxed out, single seat.',                    50, 'premium', 19900, 15920,  false, null, null,             true,  false, true),
  ('team',             'Team',       'company',    'Ship together.',                             60, 'premium',  3900,  3120,  true,  3,    null,             true,  false, true),
  ('company-pro',      'Pro',        'company',    'For teams running production agents.',       70, 'premium',  7900,  6320,  true,  3,    'Best for teams', true,  false, true),
  ('company-premium',  'Premium',    'company',    'Production scale, every safeguard on.',      80, 'premium', 14900, 11920,  true,  3,    null,             true,  false, true),
  ('enterprise',       'Enterprise', 'enterprise', '20+ seats, custom controls, signed agreements.', 90, 'premium', null, null, true,  20,   null,             true,  false, true)
on conflict (id) do update
  set name = excluded.name, audience = excluded.audience, tagline = excluded.tagline,
      rank = excluded.rank, tier = excluded.tier,
      monthly_cents = excluded.monthly_cents, annual_cents = excluded.annual_cents,
      per_seat = excluded.per_seat, min_seats = excluded.min_seats, badge = excluded.badge,
      is_public = excluded.is_public, active = excluded.active, updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. THE DIMENSIONS. What a plan can meter or gate.
--
--    `enforced` is the safety switch and it is set deliberately per dimension:
--
--    ENFORCED now — nothing can be taken away, because nothing uses them yet:
--      outreach.send            (already live; the first gate)
--      outreach.send_volume     (no send path exists yet — Phase 4 unbuilt)
--      marketing.automation_run (expensive automations; not yet metered anywhere)
--
--    VISIBLE now, enforced later — users can SEE where they are, but nobody is
--    cut off mid-work. Real users are actively spending these today, and the
--    no-regression rule says a live capability is not taken away on an agent's
--    authority. Turning each on is ONE UPDATE:
--        update billing.capability set enforced = true where capability = '…';
--      platform.points          (the universal AI currency)
--      platform.messages
--      platform.active_agents
--      platform.storage_bytes
-- ---------------------------------------------------------------------------
-- WHERE a dimension's usage is measured. Most dimensions are counted by the
-- usage ledger ('ledger'). Two are NOT: storage bytes and active agents are
-- standing facts the platform already knows from its own tables, and
-- double-counting them into a ledger would immediately drift from the truth.
-- Those are 'external': the resolver reports the LIMIT and returns `used: null`
-- rather than a confident zero, and the surface joins the real number.
-- Inventing a number here would be worse than admitting we don't measure it here.
alter table billing.capability
  add column if not exists usage_source text not null default 'ledger'
    check (usage_source in ('ledger','external'));

insert into billing.capability (capability, enforced, period, min_tier, usage_source) values
  ('platform.points',          false, 'month',    'free',  'ledger'),
  ('platform.messages',        false, 'month',    'free',  'ledger'),
  ('platform.active_agents',   false, 'lifetime', 'free',  'external'),
  ('platform.storage_bytes',   false, 'lifetime', 'free',  'external'),
  ('outreach.send_volume',     true,  'month',    'trial', 'ledger'),
  ('marketing.automation_run', true,  'month',    'free',  'ledger')
on conflict (capability) do update
  set period = excluded.period, min_tier = excluded.min_tier,
      usage_source = excluded.usage_source, updated_at = now();
  -- NOTE: `enforced` is deliberately NOT updated on conflict. Re-applying this
  -- migration must never silently switch enforcement back on (or off) for a
  -- capability an operator has since changed by hand. Enforcement is an
  -- operational decision, not a migration artifact.

-- ---------------------------------------------------------------------------
-- 7. WHAT EACH PLAN INCLUDES.
--
--    POINTS are the platform's real unit of cost. The conversion already exists
--    on every model: points = price_per_million_tokens x 20,000, i.e.
--    20,000 points = $1 of model spend (ai.model_offering). So a points budget
--    is a dollar budget the user can actually understand, and it is model-
--    agnostic — switching a user to a cheaper model stretches their budget
--    instead of needing a second ladder.
--
--    Budgets below target roughly a third of revenue as model spend. They are
--    first numbers, chosen to be sane and round, and they are EXPECTED to move —
--    which costs one UPDATE each. Message counts are the friendly headline;
--    points are the real guard.
-- ---------------------------------------------------------------------------
insert into billing.plan_limit (plan_id, capability, period, limit_value, note) values
  -- Free — a real taste, roughly $1.25/mo of model spend.
  ('free',            'platform.points',          'month', 25000,      '~$1.25 of model spend'),
  ('free',            'platform.messages',        'month', 100,        null),
  ('free',            'platform.active_agents',   'lifetime', 1,          null),
  ('free',            'platform.storage_bytes',   'lifetime', 536870912,  '512 MB'),
  ('free',            'outreach.send_volume',     'month', 0,          'Outreach is not in the free plan'),
  ('free',            'marketing.automation_run', 'month', 5,          null),

  ('personal-entry',  'platform.points',          'month', 120000,     '~$6 of model spend'),
  ('personal-entry',  'platform.messages',        'month', 5000,       null),
  ('personal-entry',  'platform.active_agents',   'lifetime', 5,          null),
  ('personal-entry',  'platform.storage_bytes',   'lifetime', 1073741824, '1 GB'),
  ('personal-entry',  'outreach.send_volume',     'month', 250,        null),
  ('personal-entry',  'marketing.automation_run', 'month', 50,         null),

  ('personal-pro',    'platform.points',          'month', 320000,     '~$16 of model spend'),
  ('personal-pro',    'platform.messages',        'month', 25000,      null),
  ('personal-pro',    'platform.active_agents',   'lifetime', 20,         null),
  ('personal-pro',    'platform.storage_bytes',   'lifetime', 10737418240,'10 GB'),
  ('personal-pro',    'outreach.send_volume',     'month', 1500,       null),
  ('personal-pro',    'marketing.automation_run', 'month', 300,        null),

  ('personal-plus',   'platform.points',          'month', 660000,     '~$33 of model spend'),
  ('personal-plus',   'platform.messages',        'month', 75000,      null),
  ('personal-plus',   'platform.active_agents',   'lifetime', 50,         null),
  ('personal-plus',   'platform.storage_bytes',   'lifetime', 53687091200,'50 GB'),
  ('personal-plus',   'outreach.send_volume',     'month', 5000,       null),
  ('personal-plus',   'marketing.automation_run', 'month', 1000,       null),

  ('personal-max',    'platform.points',          'month', 1400000,    '~$70 of model spend'),
  ('personal-max',    'platform.messages',        'month', 250000,     null),
  ('personal-max',    'platform.active_agents',   'lifetime', null,       'unlimited'),
  ('personal-max',    'platform.storage_bytes',   'lifetime', 268435456000,'250 GB'),
  ('personal-max',    'outreach.send_volume',     'month', 15000,      null),
  ('personal-max',    'marketing.automation_run', 'month', 3000,       null),

  ('team',            'platform.points',          'month', 260000,     'per seat · ~$13 of model spend'),
  ('team',            'platform.messages',        'month', 10000,      'per seat'),
  ('team',            'platform.active_agents',   'lifetime', 25,         null),
  ('team',            'platform.storage_bytes',   'lifetime', 21474836480,'20 GB'),
  ('team',            'outreach.send_volume',     'month', 2000,       null),
  ('team',            'marketing.automation_run', 'month', 500,        null),

  ('company-pro',     'platform.points',          'month', 520000,     'per seat · ~$26 of model spend'),
  ('company-pro',     'platform.messages',        'month', 30000,      'per seat'),
  ('company-pro',     'platform.active_agents',   'lifetime', 100,        null),
  ('company-pro',     'platform.storage_bytes',   'lifetime', 107374182400,'100 GB'),
  ('company-pro',     'outreach.send_volume',     'month', 10000,      null),
  ('company-pro',     'marketing.automation_run', 'month', 2000,       null),

  ('company-premium', 'platform.points',          'month', 1000000,    'per seat · ~$50 of model spend'),
  ('company-premium', 'platform.messages',        'month', null,       'unlimited'),
  ('company-premium', 'platform.active_agents',   'lifetime', null,       'unlimited'),
  ('company-premium', 'platform.storage_bytes',   'lifetime', 536870912000,'500 GB'),
  ('company-premium', 'outreach.send_volume',     'month', 30000,      null),
  ('company-premium', 'marketing.automation_run', 'month', null,       'unlimited'),

  ('enterprise',      'platform.points',          'month', null,       'custom'),
  ('enterprise',      'platform.messages',        'month', null,       'custom'),
  ('enterprise',      'platform.active_agents',   'lifetime', null,       'custom'),
  ('enterprise',      'platform.storage_bytes',   'lifetime', null,       'custom'),
  ('enterprise',      'outreach.send_volume',     'month', null,       'custom'),
  ('enterprise',      'marketing.automation_run', 'month', null,       'custom')
on conflict (plan_id, capability, period) do update
  set limit_value = excluded.limit_value, note = excluded.note, updated_at = now();

-- ---------------------------------------------------------------------------
-- 7b. Usage becomes org-aware.
--
--     A plan dimension belongs to the ACCOUNT, so its usage has to be counted
--     per org: a team's 30,000 messages are the team's, not 30,000 each. The
--     column is nullable and the tier path still counts by user, so every
--     existing education ledger row keeps meaning exactly what it meant.
-- ---------------------------------------------------------------------------
alter table billing.usage_ledger
  add column if not exists organization_id uuid;

create index if not exists usage_ledger_org_cap_idx
  on billing.usage_ledger(organization_id, capability, created_at desc)
  where organization_id is not null;

-- The consume RPC learns to record which org spent it. `p_org` is appended, so
-- every existing 3-arg caller keeps working untouched.
create or replace function billing.entitlement_consume(
  p_capability text, p_quantity integer, p_check_id uuid, p_org uuid
)
returns jsonb
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_cap  billing.capability%rowtype;
  v_res  jsonb;
  v_dup  boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('allowed', false, 'consumed', false, 'duplicate', false,
      'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'free',
      'reason', 'not_authenticated', 'period', null, 'windows', '[]'::jsonb,
      'enforced', false);
  end if;
  select * into v_cap from billing.capability where capability = p_capability;

  -- Idempotency: a check + its consume are ONE accounted unit.
  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    -- Serialize this (org|user, capability) so two concurrent spends cannot both
    -- read "one left" and both write.
    perform pg_advisory_xact_lock(
      hashtext(coalesce(p_org::text, v_user::text) || ':' || p_capability));
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, p_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$function$;

grant execute on function billing.entitlement_consume(text, integer, uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RESOLUTION. Plan -> limit -> add-on, most-permissive throughout.
-- ---------------------------------------------------------------------------

-- The plan an org is on. Falls back to the default plan, so EVERY account has a
-- plan from the moment it exists — there is no "no plan" state to handle
-- anywhere, which is what stops a null check turning into an accidental gate.
create or replace function billing.resolve_plan(p_org uuid)
returns text
language sql stable
set search_path to 'billing', 'public'
as $$
  select coalesce(
    (select op.plan_id from billing.org_plan op
      where op.organization_id = p_org
        and op.plan_id is not null
        and op.effective_from <= now()
        and (op.expires_at is null or op.expires_at > now())),
    (select p.id from billing.plan p where p.is_default and p.active limit 1),
    'free');
$$;

comment on function billing.resolve_plan(uuid) is
  'The plan an org is on, falling back to the default plan. Never returns NULL — every account always has a plan, so no caller needs a "no plan" branch.';

-- What this org may use of one dimension: the plan's limit, RAISED by any
-- add-on. NULL = unlimited, and NULL always wins (unlimited beats any number).
create or replace function billing.resolve_limit(p_org uuid, p_capability text, p_period billing.meter_period)
returns table(limit_value bigint, unlimited boolean, plan_id text, from_addon boolean)
language plpgsql stable
set search_path to 'billing', 'public'
as $function$
declare
  v_plan     text := billing.resolve_plan(p_org);
  v_found    boolean := false;
  v_plan_lim bigint;
  v_plan_unl boolean := false;
  v_add_lim  bigint;
  v_add_unl  boolean := false;
  v_has_add  boolean := false;
begin
  select true, pl.limit_value, pl.limit_value is null
    into v_found, v_plan_lim, v_plan_unl
  from billing.plan_limit pl
  where pl.plan_id = v_plan and pl.capability = p_capability
    and pl.period is not distinct from p_period;

  select true, max(a.limit_value), bool_or(a.limit_value is null)
    into v_has_add, v_add_lim, v_add_unl
  from billing.account_addon a
  where a.organization_id = p_org and a.capability = p_capability
    and a.period is not distinct from p_period
    and a.effective_from <= now()
    and (a.expires_at is null or a.expires_at > now())
  having count(*) > 0;

  -- No plan row at all => this plan does not constrain this dimension.
  if not coalesce(v_found, false) and not coalesce(v_has_add, false) then
    return query select null::bigint, false, v_plan, false;
    return;
  end if;

  -- Unlimited anywhere wins.
  if coalesce(v_plan_unl, false) or coalesce(v_add_unl, false) then
    return query select null::bigint, true, v_plan, coalesce(v_add_unl, false);
    return;
  end if;

  -- Otherwise the MORE PERMISSIVE of plan and add-on. An add-on only ever raises.
  return query select
    greatest(coalesce(v_plan_lim, 0), coalesce(v_add_lim, 0))::bigint,
    false,
    v_plan,
    coalesce(v_add_lim, 0) > coalesce(v_plan_lim, 0);
end;
$function$;

comment on function billing.resolve_limit(uuid, text, billing.meter_period) is
  'What an org may use of one dimension: the plan limit RAISED by any add-on (Arman''s "upgrade just that aspect"). Unlimited wins over any number; an add-on can only ever raise.';

-- ---------------------------------------------------------------------------
-- 9. The capability resolver learns about plans.
--
--    Order: plan_limit (new, org-aware) -> capability_limit (tier-keyed, what
--    education uses) -> unlimited. Education is untouched: it has no plan_limit
--    rows, so it falls straight through to the path it has always taken.
-- ---------------------------------------------------------------------------
create or replace function billing.resolve_capability(p_user uuid, p_capability text, p_org uuid)
returns jsonb
language plpgsql stable
set search_path to 'billing', 'public'
as $function$
declare
  v_tier        billing.tier;
  v_plan        text;
  v_plan_name   text;
  v_cap         billing.capability%rowtype;
  v_windows     jsonb;
  v_allowed     boolean;
  v_bind_period billing.meter_period;
  v_bind_used   integer;
  v_bind_limit  integer;
  v_bind_remain integer;
  v_lim         record;
  v_used        bigint;
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

  -- PLAN PATH — only when we know which org is acting, AND the plan actually
  -- says something about this dimension.
  if v_plan is not null then
    -- A standing quota (max agents, GB) is stored under 'lifetime'.
    select * into v_lim from billing.resolve_limit(
      p_org, p_capability, coalesce(v_cap.period, 'lifetime'::billing.meter_period));

    -- 🚨 "The plan does not mention this dimension" is NOT "unlimited" — it means
    -- the plan has no opinion, so the tier rules below still apply. Collapsing
    -- the two silently deletes every education meter the moment a caller passes
    -- an org (caught in live verification, 2026-08-14): the verdict stayed
    -- `allowed`, but "12 of 30 left" became "unlimited" and the user lost the
    -- honest number. Only an EXPLICIT NULL limit_value row means unlimited.
    if v_lim.unlimited then
      return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null,
        'used', 0, 'tier', v_tier,
        'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
        'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name, 'from_addon', v_lim.from_addon);
    end if;

  end if;

  -- Still inside the plan path only when the plan named a real number.
  if v_plan is not null and v_lim.limit_value is not null then
    -- An 'external' dimension is measured by the system that owns it (storage
    -- bytes, agent count). Report the limit and say plainly that usage is not
    -- counted here — `used: null`, not a confident 0 that would be a lie on the
    -- "where am I at" screen.
    if v_cap.usage_source = 'external' then
      return jsonb_build_object(
        'allowed', true, 'remaining', null,
        'limit', v_lim.limit_value, 'used', null, 'tier', v_tier,
        'reason', case when v_cap.enforced then 'allowed' else 'permissive_stub' end,
        'period', v_cap.period, 'windows', '[]'::jsonb, 'enforced', v_cap.enforced,
        'required_tier', v_cap.min_tier, 'organization_id', p_org,
        'plan', v_plan, 'plan_name', v_plan_name, 'from_addon', v_lim.from_addon,
        'usage_source', 'external');
    end if;

    -- Usage is org-scoped for an org dimension: a team's budget is the team's,
    -- not each member's private allowance.
    select coalesce(sum(quantity), 0)::bigint into v_used
    from billing.usage_ledger
    where capability = p_capability
      and organization_id = p_org
      and (v_cap.period is null or v_cap.period = 'lifetime'
           or created_at >= billing.period_start(v_cap.period));

    v_windows := jsonb_build_array(jsonb_build_object(
      'period', coalesce(v_cap.period::text, 'lifetime'),
      'used', v_used, 'limit', v_lim.limit_value,
      'remaining', greatest(v_lim.limit_value - v_used, 0),
      'resetsAt', case when v_cap.period is null or v_cap.period = 'lifetime' then null
                       else billing.period_reset(v_cap.period) end));
    v_allowed := v_used < v_lim.limit_value;

    return jsonb_build_object(
      'allowed', case when v_cap.enforced then v_allowed else true end,
      'remaining', greatest(v_lim.limit_value - v_used, 0),
      'limit', v_lim.limit_value, 'used', v_used, 'tier', v_tier,
      'reason', case when not v_cap.enforced then 'permissive_stub'
                     when v_allowed then 'allowed' else 'cap_reached' end,
      'period', v_cap.period, 'windows', v_windows, 'enforced', v_cap.enforced,
      'required_tier', v_cap.min_tier, 'organization_id', p_org,
      'plan', v_plan, 'plan_name', v_plan_name, 'from_addon', v_lim.from_addon,
      'usage_source', 'ledger');
  end if;

  -- TIER PATH — unchanged from before plans existed. Education lives here.
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

-- ---------------------------------------------------------------------------
-- 10. "Where am I at?" — the whole picture in one call.
--
--     Arman: "where does it show you what you're at right now". This is the read
--     that surface makes: the plan, every dimension with used/limit/remaining,
--     and what the next plan up would give — so the answer to "I'm out" is
--     always on the same screen as the way forward.
-- ---------------------------------------------------------------------------
create or replace function billing.plan_status(p_org uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'billing', 'public'
as $function$
declare
  v_user  uuid := auth.uid();
  v_plan  text;
  v_row   billing.plan%rowtype;
  v_next  billing.plan%rowtype;
  v_dims  jsonb := '[]'::jsonb;
  r       record;
  v_res   jsonb;
begin
  if v_user is null then
    return jsonb_build_object('signed_in', false, 'plan', null, 'dimensions', '[]'::jsonb);
  end if;
  v_plan := billing.resolve_plan(p_org);
  select * into v_row from billing.plan where id = v_plan;
  -- The next plan up WITHIN THE SAME AUDIENCE — what "upgrade" means here.
  --
  -- Audience matters: ranking personal and company plans on one line makes the
  -- plan after Max ($199, 1.4M points) come out as Team ($39/seat, 260k) — an
  -- "upgrade" that gives less on every dimension. A personal account upgrades
  -- along the personal ladder; moving to a company plan is a different decision
  -- and belongs on the pricing page, not in an inline nudge. Free sits outside
  -- both ladders, so it points at the entry-level personal plan.
  -- NULL next_plan is a real answer: they are on the top plan, and the surface
  -- says so instead of inventing somewhere to send them.
  select * into v_next from billing.plan
    where active and is_public and rank > coalesce(v_row.rank, 0)
      and audience = case when coalesce(v_row.audience,'free') = 'free'
                          then 'personal' else v_row.audience end
    order by rank limit 1;

  for r in
    select c.capability, c.period, c.enforced
    from billing.capability c
    join billing.plan_limit pl on pl.capability = c.capability
    where pl.plan_id = v_plan
    order by c.capability
  loop
    v_res := billing.resolve_capability(v_user, r.capability, p_org);
    v_dims := v_dims || jsonb_build_array(jsonb_build_object(
      'capability', r.capability,
      'period',     r.period,
      'enforced',   r.enforced,
      'used',       v_res->'used',
      'limit',      v_res->'limit',
      'remaining',  v_res->'remaining',
      'unlimited',  (v_res->'limit') = 'null'::jsonb,
      'from_addon', coalesce(v_res->'from_addon', 'false'::jsonb),
      'resets_at',  v_res->'windows'->0->'resetsAt',
      'next_plan_limit', (
        select pl2.limit_value from billing.plan_limit pl2
        where pl2.plan_id = v_next.id and pl2.capability = r.capability
          and pl2.period is not distinct from r.period)
    ));
  end loop;

  return jsonb_build_object(
    'signed_in', true,
    'organization_id', p_org,
    'plan', to_jsonb(v_row),
    'next_plan', to_jsonb(v_next),
    'tier', billing.resolve_effective_tier(v_user, p_org),
    'dimensions', v_dims);
end;
$function$;

comment on function billing.plan_status(uuid) is
  'The "where am I at" read: the org''s plan, every dimension with used/limit/remaining/resets, and what the next plan up gives for each — so a cap and its fix are always on the same screen.';

-- The public pricing page, straight from the DB. No hardcoded ladder anywhere.
create or replace function billing.public_plans()
returns jsonb
language sql stable security definer
set search_path to 'billing', 'public'
as $$
  select coalesce(jsonb_agg(x order by x.rank), '[]'::jsonb) from (
    select p.id, p.name, p.audience, p.tagline, p.rank, p.monthly_cents,
           p.annual_cents, p.per_seat, p.min_seats, p.badge, p.is_default,
           (select coalesce(jsonb_agg(jsonb_build_object(
              'capability', pl.capability, 'period', pl.period,
              'limit', pl.limit_value, 'note', pl.note) order by pl.capability), '[]'::jsonb)
            from billing.plan_limit pl where pl.plan_id = p.id) as limits
    from billing.plan p
    where p.active and p.is_public
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- 11. Admin writes. Super-admin only, same shape as the rest of billing.
-- ---------------------------------------------------------------------------
create or replace function billing.org_plan_assign(p_org uuid, p_plan text, p_note text)
returns jsonb
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare v_row billing.org_plan%rowtype; v_tier billing.tier;
begin
  if not public.is_super_admin() then
    raise exception 'billing.org_plan_assign: super-admin only' using errcode = '42501';
  end if;
  select tier into v_tier from billing.plan where id = p_plan and active;
  if v_tier is null then
    raise exception 'billing.org_plan_assign: unknown or inactive plan "%"', p_plan;
  end if;
  insert into billing.org_plan as op
    (organization_id, plan_id, tier, source, note, granted_by, updated_by)
  values (p_org, p_plan, v_tier, 'grant', p_note, auth.uid(), auth.uid())
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id, tier = excluded.tier, note = excluded.note,
        updated_at = now(), updated_by = auth.uid(), version = op.version + 1
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function billing.addon_grant(
  p_org uuid, p_capability text, p_period billing.meter_period,
  p_limit bigint, p_source text, p_note text, p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare v_row billing.account_addon%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'billing.addon_grant: super-admin only' using errcode = '42501';
  end if;
  insert into billing.account_addon
    (organization_id, capability, period, limit_value, source, note, granted_by, expires_at)
  values (p_org, p_capability, p_period, p_limit, coalesce(p_source,'grant'), p_note, auth.uid(), p_expires_at)
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 12. Everyone gets a plan. Nobody is upgraded or downgraded by this.
--
--     Orgs with an existing tier grant keep exactly what they have — mapped onto
--     the matching plan, never below it. Everyone else resolves to the default
--     plan through resolve_plan(), so no backfill of 231 orgs is needed and no
--     account can be missing a plan.
-- ---------------------------------------------------------------------------
update billing.org_plan
   set plan_id = case
         when tier = 'premium' then 'personal-max'   -- an internal/comped org keeps everything
         when tier = 'trial'   then 'personal-pro'
         else 'free' end
 where plan_id is null;

-- ---------------------------------------------------------------------------
-- 13. Grants.
-- ---------------------------------------------------------------------------
grant usage on schema billing to anon, authenticated, service_role;
grant select on table billing.plan, billing.plan_limit to anon, authenticated;

grant execute on function billing.resolve_plan(uuid)                                    to authenticated, service_role;
grant execute on function billing.resolve_limit(uuid, text, billing.meter_period)       to authenticated, service_role;
grant execute on function billing.plan_status(uuid)                                     to authenticated, service_role;
grant execute on function billing.public_plans()                                        to anon, authenticated, service_role;
grant execute on function billing.org_plan_assign(uuid, text, text)                     to authenticated, service_role;
grant execute on function billing.addon_grant(uuid, text, billing.meter_period, bigint, text, text, timestamptz) to authenticated, service_role;

revoke all on table billing.account_addon from anon, authenticated;
grant select, insert, update on table billing.account_addon to service_role;

notify pgrst, 'reload schema';
