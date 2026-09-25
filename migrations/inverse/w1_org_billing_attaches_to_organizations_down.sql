-- target: branch
--
-- INVERSE of `migrations/campaign/w1_org_billing_attaches_to_organizations.sql`.
--
-- Restores the prior state exactly. Before that file: `billing.resolve_tier(uuid)` carried
-- the per-person body whose `pg_get_functiondef` hashes to
-- 6273ab59c0a27eec94d4e69e288567bedeb2a8b6ac61a80355caace12e33379d (identical on branch and
-- production, measured 2026-09-18), and neither `billing._resolve_tier_legacy(uuid)` nor
-- `billing.tier_no_downgrade()` existed in the catalogue. The two comments this restores are
-- the live ones: `billing.user_plan` carried NO table comment.
--
-- The restore is proven by hash, not by eye: after this file runs,
--   select encode(sha256(convert_to(pg_get_functiondef('billing.resolve_tier(uuid)'::regprocedure),'UTF8')),'hex')
-- must equal 6273ab59c0a27eec94d4e69e288567bedeb2a8b6ac61a80355caace12e33379d again.
--
-- It is a `-- target: branch` file and can never reach production.

set lock_timeout = '2s';

create or replace function billing.resolve_tier(p_user uuid)
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

comment on function billing.resolve_tier(uuid) is null;
comment on table billing.user_plan is null;

drop function if exists billing.tier_no_downgrade();
drop function if exists billing._resolve_tier_legacy(uuid);
