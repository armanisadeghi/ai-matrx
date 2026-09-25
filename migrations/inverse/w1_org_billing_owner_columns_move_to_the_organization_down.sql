-- target: branch
-- based-on: billing._resolve_tier_legacy(uuid) 8968d5076d8c744f9d7e337613de7e7c08855a2369bd0c81c861b453b9425bf6
-- based-on: billing.resolve_org_tier(uuid) 2a56f477240d2e7a3b53ccb6ebe05251c80a10be5bc1e086efe629b0e7b3cdc4
-- based-on: billing.entitlement_snapshot() 9947e9e4d784f01a2b79cad567628fb84547ec6e45dfffe8ad655a5c8c3bef6e
-- based-on: public.creator_connect_status() 34f2df0f6873c894cea17907828259242952eb568e2a11179ccf432215f02f35
--
-- (An INVERSE declares the bodies it is about to overwrite, which are the bodies its OWN up
-- file left behind — so these four hashes are read off the branch AFTER the up file applied,
-- never before it. DD-220 binds the undo exactly as it binds the do.)
--
-- INVERSE of `migrations/campaign/w1_org_billing_owner_columns_move_to_the_organization.sql`.
--
-- Restores the prior state exactly, measured off the branch on 2026-09-18 before the move:
--   billing.customer         (user_id uuid) PK customer_pkey(user_id), FK customer_user_id_fkey
--                            -> auth.users(id) ON DELETE CASCADE, policies std_select /
--                            std_update / std_delete each `user_id = (select auth.uid())`
--   billing.connect_account  the same shape, connect_account_pkey / connect_account_user_id_fkey
--   billing.subscription     user_id uuid + org_id uuid, FK subscription_user_id_fkey ->
--                            auth.users(id) ON DELETE CASCADE, index subscription_user_idx
--                            (user_id), index subscription_org_idx (org_id), CHECK
--                            subscription_user_or_org (user_id IS NOT NULL OR org_id IS NOT NULL),
--                            the same three policies on user_id
--   the four bodies as they were: billing._resolve_tier_legacy (the copy this lane created),
--   billing.resolve_org_tier, billing.entitlement_snapshot, public.creator_connect_status
--
-- The restored `billing.subscription.user_id` is nullable with no default, exactly as it was,
-- and the tables are empty so nothing is lost by dropping and re-adding it.
--
-- It is a `-- target: branch` file and can never reach production.

set lock_timeout = '2s';

-- 3'. billing.subscription ------------------------------------------------------------------
-- ORDER MATTERS AND THE BRANCH PROVED IT: the four std_* policies read `user_id`, so creating
-- them before the column is back fails 42703 `column "user_id" does not exist`. Policies come
-- off first, the column comes back, the policies go on last.
drop policy std_select on billing.subscription;
drop policy std_insert on billing.subscription;
drop policy std_update on billing.subscription;
drop policy std_delete on billing.subscription;

alter table billing.subscription alter column organization_id drop not null;
alter table billing.subscription drop constraint subscription_organization_id_fkey;
alter index billing.subscription_organization_idx rename to subscription_org_idx;
alter table billing.subscription rename column organization_id to org_id;

alter table billing.subscription add column user_id uuid;
alter table billing.subscription
  add constraint subscription_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
create index subscription_user_idx on billing.subscription using btree (user_id);
alter table billing.subscription
  add constraint subscription_user_or_org check (user_id is not null or org_id is not null);
comment on column billing.subscription.org_id is null;

create policy std_select on billing.subscription for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.subscription for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.subscription for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.subscription for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2'. billing.connect_account ----------------------------------------------------------------
drop policy std_select on billing.connect_account;
drop policy std_insert on billing.connect_account;
drop policy std_update on billing.connect_account;
drop policy std_delete on billing.connect_account;
alter table billing.connect_account drop constraint connect_account_organization_id_fkey;
alter index billing.connect_account_organization_pkey rename to connect_account_pkey;
alter table billing.connect_account rename column organization_id to user_id;
alter table billing.connect_account
  add constraint connect_account_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
create policy std_select on billing.connect_account for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.connect_account for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.connect_account for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.connect_account for delete to authenticated
  using (user_id = (select auth.uid()));
comment on column billing.connect_account.user_id is null;

-- 1'. billing.customer -----------------------------------------------------------------------
drop policy std_select on billing.customer;
drop policy std_insert on billing.customer;
drop policy std_update on billing.customer;
drop policy std_delete on billing.customer;
alter table billing.customer drop constraint customer_organization_id_fkey;
alter index billing.customer_organization_pkey rename to customer_pkey;
alter table billing.customer rename column organization_id to user_id;
alter table billing.customer
  add constraint customer_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
create policy std_select on billing.customer for select to authenticated
  using (user_id = (select auth.uid()));
create policy std_insert on billing.customer for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy std_update on billing.customer for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy std_delete on billing.customer for delete to authenticated
  using (user_id = (select auth.uid()));
comment on column billing.customer.user_id is null;

-- 4'. THE FOUR BODIES, AS THEY WERE -----------------------------------------------------------
create or replace function billing._resolve_tier_legacy(p_user uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select billing.tier_max(
    coalesce((
      select case when s.status = 'trialing' then 'trial'::billing.tier else 'premium'::billing.tier end
      from billing.subscription s
      where s.user_id = p_user and s.status in ('trialing','active','past_due')
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
    where user_id = v_user and status = 'trialing' order by trial_end desc nulls last limit 1;

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

create or replace function public.creator_connect_status()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := (select auth.uid()); r billing.connect_account;
begin
  if v_uid is null then return null; end if;
  select * into r from billing.connect_account where user_id = v_uid;
  if r.user_id is null then return jsonb_build_object('connected', false); end if;
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
