-- target: branch
-- additive: no
-- based-on: billing._resolve_tier_legacy(uuid) 76c38ced11ae0d9ce8322a508defb6767bc9c808f926a04ead592a337548a57c
-- based-on: billing.resolve_org_tier(uuid) 21794d3f89402248d2fa1855f26a3b7806239d1f493077e32fc7b1dbcc0ef81d
-- based-on: billing.entitlement_snapshot() 6c9a38f01ef831d8683448008a030573adc47a8f7e626d10c205da78bd93c231
-- based-on: public.creator_connect_status() 52deee25bcbf05c6cd4eeeff2ba0bdf9d8240a3d642deab273d097f15b5c49d7
--
-- (The four hashes above were read off the REHEARSAL BRANCH, which is the only database this
-- file can reach. `billing._resolve_tier_legacy` is this lane's own copy, created minutes
-- earlier by `w1_org_billing_attaches_to_organizations.sql`; the other three are live bodies
-- and are byte-identical on production today.)
--
-- W1-ORG — REC-62 (the column half) and REC-63 for these three tables: BILLING'S OWNER
-- COLUMNS MOVE TO THE ORGANIZATION.
--
-- THE LAW
-- -------
-- REC-62: "`billing.customer.user_id`, `billing.subscription.user_id` and
-- `billing.connect_account.user_id` become `organization_id`."
-- REC-63 reaches the same three tables from the other side: "`org_id` converge on …
-- `organization_id`" — `billing.subscription.org_id` is exactly that legacy name, so the
-- subscription table is converged ONCE here rather than twice.
--
-- WHY THIS FILE IS `-- target: branch` AND HELD FOR THE ATTENDED STEP
-- -------------------------------------------------------------------
-- It renames live columns, drops a live column, drops and re-points live foreign keys and
-- replaces five RLS policies. None of that is additive and the standing ruling of the night
-- is branch-only, so production gets the FILE and its `--judge-only` verdict, never an apply.
--
-- WHAT MADE THIS SAFE TO DO AT ALL, MEASURED RATHER THAN HOPED (2026-09-18, both databases)
-- ------------------------------------------------------------------------------------------
--   select count(*) from billing.customer;         -> 0 branch, 0 PRODUCTION
--   select count(*) from billing.subscription;     -> 0 branch, 0 PRODUCTION
--   select count(*) from billing.connect_account;  -> 0 branch, 0 PRODUCTION
-- All three Stripe-facing tables are EMPTY on the live database. There is no data to move,
-- no ownership to re-derive and no person whose row changes hands — which is why the move is
-- a rename and a re-pointed foreign key rather than an add-backfill-swap. If any of them
-- gains a row before the attended step, THIS FILE IS WRONG and the move becomes
-- add + backfill through `iam.default_organization_id(created_by)` + swap. The guard against
-- that is the first statement below: it refuses rather than renames.
--
-- A RENAME CARRIES ITS INDEXES AND ITS POLICIES; IT DOES NOT CARRY THEIR MEANING
-- ------------------------------------------------------------------------------
-- PostgreSQL rewrites `pg_policy` and `pg_index` expressions to follow a renamed column, so
-- after a bare rename `customer.organization_id = auth.uid()` would still be a POLICY and
-- `customer_user_id_fkey` would still point `organization_id` at `auth.users`. Both would be
-- silently, confidently wrong. Every one of them is re-pointed below, by name.
--
-- THE FOUR BODIES THAT READ THESE COLUMNS, CENSUSED OUT OF `pg_proc` NOT REMEMBERED
-- ---------------------------------------------------------------------------------
--   billing._resolve_tier_legacy(uuid)   — reads subscription.user_id
--   billing.resolve_org_tier(uuid)       — reads subscription.org_id
--   billing.entitlement_snapshot()       — reads subscription.user_id
--   public.creator_connect_status()      — reads connect_account.user_id
-- All four are re-pointed here. `iam.entity_read_expr`, `iam.has_access_for_base` and
-- `iam.verify_canonical` matched the census grep on the WORDS `user_id`/`org_id` in generic
-- SQL text, not on these tables; they are generic column-name machinery and are untouched —
-- and `iam.verify_canonical` is the certifier that will now score these three tables BETTER,
-- which is REC-63's own measure.
--
-- REVERSIBLE: `migrations/inverse/w1_org_billing_owner_columns_move_to_the_organization_down.sql`.

set lock_timeout = '5s';

-- 0. THE REFUSAL THAT MAKES THE RENAME HONEST ------------------------------------------------
do $$
begin
  if (select count(*) from billing.customer) > 0
     or (select count(*) from billing.subscription) > 0
     or (select count(*) from billing.connect_account) > 0 then
    raise exception 'REC-62: billing.customer / subscription / connect_account are no longer empty, so a rename would silently re-label a person as an organization'
      using errcode = 'check_violation',
            hint = 'This file is only correct while the three Stripe-facing tables hold zero rows, which is what was measured on 2026-09-18. With rows present the move is add organization_id + backfill through iam.default_organization_id(the row''s person) + swap + drop. Write that file instead of forcing this one.';
  end if;
end $$;

-- 1. billing.customer -------------------------------------------------------------------------
alter table billing.customer drop constraint customer_user_id_fkey;
alter table billing.customer rename column user_id to organization_id;
alter table billing.customer
  add constraint customer_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
alter index billing.customer_pkey rename to customer_organization_pkey;

drop policy std_select on billing.customer;
drop policy std_insert on billing.customer;
drop policy std_update on billing.customer;
drop policy std_delete on billing.customer;
create policy std_select on billing.customer for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.customer for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.customer for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.customer for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.customer.organization_id is
  'REC-47/REC-62: the Stripe customer belongs to the ORGANIZATION, never to a person. Renamed from user_id (0 rows at the time of the move) and re-pointed from auth.users to iam.organizations.';

-- 2. billing.connect_account ------------------------------------------------------------------
alter table billing.connect_account drop constraint connect_account_user_id_fkey;
alter table billing.connect_account rename column user_id to organization_id;
alter table billing.connect_account
  add constraint connect_account_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
alter index billing.connect_account_pkey rename to connect_account_organization_pkey;

drop policy std_select on billing.connect_account;
drop policy std_insert on billing.connect_account;
drop policy std_update on billing.connect_account;
drop policy std_delete on billing.connect_account;
create policy std_select on billing.connect_account for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.connect_account for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.connect_account for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.connect_account for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.connect_account.organization_id is
  'REC-47/REC-62: a Connect payout account belongs to the ORGANIZATION. Renamed from user_id and re-pointed from auth.users to iam.organizations.';

-- 3. billing.subscription ----------------------------------------------------------------------
-- Two legacy columns, one canonical one. `org_id` already carried the right MEANING under the
-- wrong NAME (REC-63); `user_id` carried the wrong meaning and goes. THE FOUR `std_*` POLICIES
-- ARE DROPPED FIRST: all four read `user_id`, so PostgreSQL refuses the column drop while any
-- of them stands (SQLSTATE 2BP01, measured on the branch 2026-09-18) — and `DROP … CASCADE`
-- would take them silently, which is precisely the wrong answer for a tenant boundary.
drop policy std_select on billing.subscription;
drop policy std_insert on billing.subscription;
drop policy std_update on billing.subscription;
drop policy std_delete on billing.subscription;

alter table billing.subscription drop constraint subscription_user_or_org;
alter table billing.subscription drop constraint subscription_user_id_fkey;
drop index billing.subscription_user_idx;
alter table billing.subscription drop column user_id;

alter table billing.subscription rename column org_id to organization_id;
alter index billing.subscription_org_idx rename to subscription_organization_idx;
alter table billing.subscription
  add constraint subscription_organization_id_fkey
  foreign key (organization_id) references iam.organizations(id) on delete cascade;
-- NOT NULL, not a CHECK: `ddl_guard[nullable_org]` reads the COLUMN's nullability and warned
-- `billing.subscription still allows a NULL organization_id` against the CHECK this file first
-- carried. NO NULL ORG (db-rules §2/§6e) is a column property, so it is written as one.
alter table billing.subscription alter column organization_id set not null;

create policy std_select on billing.subscription for select to authenticated
  using (organization_id in (select iam.my_orgs()));
create policy std_insert on billing.subscription for insert to authenticated
  with check (organization_id in (select iam.my_orgs()));
create policy std_update on billing.subscription for update to authenticated
  using (organization_id in (select iam.my_orgs()))
  with check (organization_id in (select iam.my_orgs()));
create policy std_delete on billing.subscription for delete to authenticated
  using (organization_id in (select iam.my_orgs()));

comment on column billing.subscription.organization_id is
  'REC-47/REC-62/REC-63: the subscription belongs to the ORGANIZATION. Renamed from the legacy name org_id; the per-person user_id column and the user_or_org CHECK that let a subscription belong to a human being are gone.';

-- 4. THE FOUR BODIES, RE-POINTED ----------------------------------------------------------------
create or replace function billing._resolve_tier_legacy(p_user uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  -- The subscription arm now reaches the person's subscription the only way a subscription
  -- can be reached once it belongs to an organization: through their default organization.
  -- It is the same ANSWER, because the table is empty on both databases; it is a different
  -- ROUTE, because there is no longer a per-person route to take.
  select billing.tier_max(
    coalesce((
      select case when s.status = 'trialing' then 'trial'::billing.tier else 'premium'::billing.tier end
      from billing.subscription s
      where s.organization_id = iam.default_organization_id(p_user)
        and s.status in ('trialing','active','past_due')
      order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
               s.current_period_end desc nulls last
      limit 1
    ), 'free'::billing.tier),
    coalesce((
      select up.tier from billing.user_plan up
      where up.user_id = p_user
        and up.effective_from <= now()
        and (up.expires_at is null or up.expires_at > now())
    ), 'free'::billing.tier)
  );
$function$;

create or replace function billing.resolve_org_tier(p_org uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select coalesce(
    billing.tier_max(
      (select p.tier from billing.org_plan p
        where p.organization_id = p_org
          and p.effective_from <= now()
          and (p.expires_at is null or p.expires_at > now())),
      (select case when s.status = 'trialing' then 'trial'::billing.tier
                   else 'premium'::billing.tier end
         from billing.subscription s
        where s.organization_id = p_org and s.status in ('trialing','active','past_due')
        order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
                 s.current_period_end desc nulls last
        limit 1)
    ),
    'free'::billing.tier)
  where p_org is not null;
$function$;

create or replace function billing.entitlement_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path to 'billing', 'public'
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
    where organization_id = iam.default_organization_id(v_user) and status = 'trialing'
    order by trial_end desc nulls last limit 1;

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

-- `public.creator_connect_status()` is SECURITY DEFINER and was UNDECLARED: it has been live
-- and client-callable with no `platform.client_callable_door` row, so the first replacement of
-- it in this campaign is refused by `provision_shape_guard` (23514, measured on the branch
-- 2026-09-18) until somebody says IN DATA who may call it. This is that declaration — found
-- outside the brief and fixed rather than routed around (rule 20). It takes no entity-id
-- argument at all: it reads `auth.uid()` itself and answers only about that caller, so there
-- is nothing for a caller to forge.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('public', 'creator_connect_status', '', array[]::oid[],
   'Takes NO arguments. It resolves the caller itself through auth.uid() inside the function and answers only about that caller''s own Connect account, reached through their default organization; a signed-out caller gets NULL. There is no entity id to check and nothing for a caller to substitute, which is why the door is signed-in-only with no gate predicate.',
   'w1_org_billing_owner_columns_move_to_the_organization.sql', true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function public.creator_connect_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := (select auth.uid()); r billing.connect_account;
begin
  if v_uid is null then return null; end if;
  select * into r from billing.connect_account
   where organization_id = iam.default_organization_id(v_uid);
  if r.organization_id is null then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object(
    'connected', true,
    'stripe_account_id', r.stripe_account_id,
    'charges_enabled', r.charges_enabled,
    'payouts_enabled', r.payouts_enabled,
    'details_submitted', r.details_submitted,
    'onboarded_at', r.onboarded_at,
    'country', r.country,
    'default_currency', r.default_currency
  );
end; $function$;

grant execute on function public.creator_connect_status() to authenticated;
