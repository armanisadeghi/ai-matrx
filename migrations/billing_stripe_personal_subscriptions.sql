-- chair-step: Replace organization-only Stripe customer identity with mode-separated beneficiary identity; preserve organization ownership and all grants.
-- based-on: billing.user_effective_plan(uuid) 53eb64cf1c7f641cd685e41a6eaa02e86cf9746b99a1e6bcde1ec7b75c1d8054
-- based-on: billing.resolve_plan(uuid) 0123fa646fb0eb299fc76933dd313a3a3da577ea7046ff20f63fa125e3fb5955
-- based-on: billing.resolve_org_tier(uuid) 89bfaeaefb88981581968414e675f60497ddc8b76d8aa70d996ac10736bf8997
-- Personal contracts are merchant-owned billing plumbing. The beneficiary is
-- the person receiving allowances, never a second row-ownership type.
alter table billing.customer add column beneficiary_user_id uuid references iam.users(id);
alter table billing.customer add column livemode boolean not null default true;
alter table billing.customer drop constraint customer_organization_pkey;
alter table billing.customer add primary key (id);
create unique index customer_person_mode on billing.customer (beneficiary_user_id, livemode);
create unique index customer_organization_mode on billing.customer (organization_id, livemode) where beneficiary_user_id is null;
create index customer_organization_fk on billing.customer (organization_id);
alter table billing.customer add unique (stripe_customer_id, livemode);
alter table billing.customer alter column livemode drop default;
alter table billing.customer drop constraint customer_stripe_customer_id_key;

-- A price can also represent a non-plan purchase. Its optional catalog hint
-- stays in metadata; the fulfilled subscription requires a real plan FK,
-- exactly like billing.org_plan and billing.user_plan.
alter table billing.price add column livemode boolean not null default false;
update billing.price set livemode = coalesce(metadata->>'stripe_mode', 'test') = 'live';
alter table billing.price alter column livemode drop default;
alter table billing.subscription add column beneficiary_user_id uuid references iam.users(id);
alter table billing.subscription add column plan_key text not null references billing.plan(plan_key);
create index subscription_beneficiary_fk on billing.subscription (beneficiary_user_id);
create index subscription_plan_key_fk on billing.subscription (plan_key);
alter table billing.subscription add column livemode boolean not null default true;
alter table billing.subscription add unique (stripe_subscription_id, livemode);
alter table billing.subscription alter column livemode drop default;
alter table billing.subscription drop constraint subscription_stripe_subscription_id_key;

-- Merchant ownership must not expose an individual's invoice or payment IDs.
alter policy std_select on billing.customer using (
  beneficiary_user_id = auth.uid() or (beneficiary_user_id is null and
    organization_id in (select iam.my_orgs())));
alter policy std_select on billing.subscription using (
  beneficiary_user_id = auth.uid() or (beneficiary_user_id is null and
    organization_id in (select iam.my_orgs())));

create or replace function billing.validate_subscription_plan() returns trigger
language plpgsql set search_path = '' as $$
declare v_audience text; v_merchant uuid;
begin
  if new.plan_key is null then raise exception 'Subscription requires its registered plan'; end if;
  select audience, organization_id into v_audience, v_merchant
    from billing.plan where plan_key = new.plan_key;
  if v_audience = 'personal' then
    if new.beneficiary_user_id is null or new.organization_id is distinct from v_merchant then
      raise exception 'Personal subscription requires its purchaser and merchant';
    end if;
  elsif v_audience = 'company' then
    if new.beneficiary_user_id is not null then raise exception 'Company subscription cannot have a personal beneficiary'; end if;
  else raise exception 'This plan is not self-service'; end if;
  return new;
end; $$;
create trigger validate_subscription_plan before insert or update on billing.subscription
for each row execute function billing.validate_subscription_plan();

-- Existing explicit grants are never overwritten by payment events. Ending a
-- subscription simply removes that candidate from the resolver.
create or replace function billing.user_effective_plan(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'guest' from auth.users u where u.id = p_user and u.is_anonymous
      and exists (select 1 from billing.plan p where p.plan_key = 'guest' and p.active and p.deleted_at is null)),
    (select op.plan_id from iam.organization_member m
      join billing.org_plan op on op.organization_id = m.organization_id and op.deleted_at is null
        and op.effective_from <= now() and (op.expires_at is null or op.expires_at > now())
      join billing.plan p on p.plan_key = op.plan_id and p.audience = 'enterprise' and p.active and p.deleted_at is null
      where m.user_id = p_user and exists (select 1 from billing.account_addon a
        where a.organization_id = m.organization_id and a.capability = 'platform.points'
          and a.deleted_at is null and a.effective_from <= now() and (a.expires_at is null or a.expires_at > now()))
      order by op.plan_id limit 1),
    (select candidate.plan_key from (
      select p.plan_key, p.rank from billing.user_plan up
        join billing.plan p on p.plan_key = up.plan_id and p.active and p.deleted_at is null and p.audience <> 'enterprise'
        where up.user_id = p_user and up.effective_from <= now() and (up.expires_at is null or up.expires_at > now())
      union all
      select p.plan_key, p.rank from billing.subscription s
        join billing.plan p on p.plan_key = s.plan_key and p.active and p.deleted_at is null and p.audience = 'personal'
        where s.beneficiary_user_id = p_user and s.livemode
          and s.status in ('active', 'trialing', 'past_due')
          and s.current_period_end > now()
    ) candidate order by candidate.rank desc, candidate.plan_key limit 1),
    (select p.plan_key from billing.plan p where p.is_default and p.active and p.deleted_at is null order by p.rank limit 1)
  );
$$;

create or replace function billing.resolve_plan(p_org uuid)
returns text language sql stable set search_path = 'billing', 'public' as $$
  select coalesce((select candidate.plan_key from (
    select p.plan_key, p.rank from billing.org_plan op
      join billing.plan p on p.plan_key = op.plan_id and p.active and p.deleted_at is null
      where op.organization_id = p_org and op.deleted_at is null
        and op.effective_from <= now() and (op.expires_at is null or op.expires_at > now())
    union all
    select p.plan_key, p.rank from billing.subscription s
      join billing.plan p on p.plan_key = s.plan_key and p.active and p.deleted_at is null and p.audience = 'company'
      where s.organization_id = p_org and s.beneficiary_user_id is null and s.livemode
        and s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()
    ) candidate order by candidate.rank desc, candidate.plan_key limit 1),
    (select p.plan_key from billing.plan p where p.is_default and p.active and p.deleted_at is null order by p.rank limit 1), 'free');
$$;
-- Sandbox payments and merchant-owned personal purchases never promote an
-- organization's capabilities. Preserve the existing complimentary tier.
create or replace function billing.resolve_org_tier(p_org uuid)
returns billing.tier language sql stable set search_path = 'billing', 'public' as $$
  select coalesce(billing.tier_max(
    (select p.tier from billing.org_plan p where p.organization_id = p_org
      and p.deleted_at is null and p.effective_from <= now()
      and (p.expires_at is null or p.expires_at > now())),
    (select case when s.status = 'trialing' then 'trial'::billing.tier else s.tier end
      from billing.subscription s where s.organization_id = p_org
        and s.beneficiary_user_id is null and s.livemode
        and s.status in ('trialing','active','past_due') and s.current_period_end > now()
      order by case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
        s.current_period_end desc nulls last limit 1)
    ), 'free'::billing.tier) where p_org is not null;
$$;
notify pgrst, 'reload schema';
