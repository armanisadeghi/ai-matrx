-- =============================================================================
-- billing_prelaunch_complimentary_pro.sql
-- Pre-launch complimentary Pro for everyone (Arman, 2026-08-16):
-- "put every current user at the pro plan even though no one's paying".
--
-- THE NO-REGRESSION RULE: every change here is purely additive.
--   * billing.user_plan is a NEW user-side grant table mirroring billing.org_plan.
--   * billing.resolve_tier becomes tier_max(subscription-derived tier, user grant)
--     — it can only ever return MORE than before, never less.
--   * No Stripe objects are created or touched. source='complimentary' rows can
--     never charge anyone; billing.subscription (the Stripe mirror) is untouched.
--   * Existing org_plan rows (internal/grandfathered/subscription) are untouched;
--     backfill uses ON CONFLICT DO NOTHING.
--
-- 🚨 UN-FLIP AT LAUNCH — one greppable change: search the codebase and DB for
--    PRELAUNCH_COMPLIMENTARY (this file + the seed function below). To end the
--    program: drop trigger zzz_on_auth_user_created_prelaunch_plan on auth.users,
--    drop function billing.seed_prelaunch_complimentary(), and (if desired)
--    set expires_at on source='complimentary' rows. Nothing else references it.
-- =============================================================================

begin;

-- 1) 'complimentary' becomes a legal grant source on the org ladder.
alter table billing.org_plan drop constraint org_plan_source_check;
alter table billing.org_plan add constraint org_plan_source_check
  check (source = any (array['subscription','grant','internal','grandfathered','complimentary']));

-- 2) The user-side counterpart of billing.org_plan. Absence = "no grant",
--    never a downgrade — exactly like org_plan.
create table if not exists billing.user_plan (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  tier           billing.tier not null default 'free',
  source         text not null default 'grant'
    constraint user_plan_source_check
    check (source = any (array['subscription','grant','internal','grandfathered','complimentary'])),
  note           text,
  granted_by     uuid,
  effective_from timestamptz not null default now(),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        integer not null default 1,
  plan_id        text references billing.plan(id)
);

-- Deny-by-default like billing.org_plan: no client read/write path.
alter table billing.user_plan enable row level security;

-- 3) resolve_tier: tier_max(what Stripe says, what a grant says). Monotonic —
--    the subscription branch is byte-identical to the previous body.
create or replace function billing.resolve_tier(p_user uuid)
returns billing.tier
language sql stable
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

-- 4) Pre-launch signup seed. PRELAUNCH_COMPLIMENTARY_* are the CAPS constants —
--    THE one greppable switch for the whole program (see header for un-flip).
create or replace function billing.seed_prelaunch_complimentary()
returns trigger
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare
  PRELAUNCH_COMPLIMENTARY_TIER      constant billing.tier := 'premium';
  PRELAUNCH_COMPLIMENTARY_USER_PLAN constant text := 'personal-pro';
  PRELAUNCH_COMPLIMENTARY_ORG_PLAN  constant text := 'company-pro';
  PRELAUNCH_COMPLIMENTARY_NOTE      constant text :=
    'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.';
begin
  insert into billing.user_plan (user_id, tier, source, note, plan_id)
  values (new.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
          PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_USER_PLAN)
  on conflict (user_id) do nothing;

  -- The personal org created earlier in this same insert (trigger
  -- on_auth_user_created fires before this one alphabetically).
  insert into billing.org_plan (organization_id, tier, source, note, plan_id)
  select o.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
         PRELAUNCH_COMPLIMENTARY_NOTE,
         case when o.is_personal then PRELAUNCH_COMPLIMENTARY_USER_PLAN
              else PRELAUNCH_COMPLIMENTARY_ORG_PLAN end
  from iam.organizations o
  where o.created_by = new.id
  on conflict (organization_id) do nothing;

  return new;
exception when others then
  -- Loud but never signup-blocking: a missed grant is recoverable, a failed
  -- signup is not.
  raise warning 'seed_prelaunch_complimentary failed for user %: % (%)',
    new.id, sqlerrm, sqlstate;
  return new;
end;
$function$;

drop trigger if exists zzz_on_auth_user_created_prelaunch_plan on auth.users;
create trigger zzz_on_auth_user_created_prelaunch_plan
  after insert on auth.users
  for each row execute function billing.seed_prelaunch_complimentary();

-- 5) Backfill: EVERY existing user and EVERY existing org. Additive only.
insert into billing.user_plan (user_id, tier, source, note, plan_id)
select u.id, 'premium', 'complimentary',
       'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.',
       'personal-pro'
from auth.users u
on conflict (user_id) do nothing;

insert into billing.org_plan (organization_id, tier, source, note, plan_id)
select o.id, 'premium', 'complimentary',
       'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.',
       case when o.is_personal then 'personal-pro' else 'company-pro' end
from iam.organizations o
on conflict (organization_id) do nothing;

commit;
