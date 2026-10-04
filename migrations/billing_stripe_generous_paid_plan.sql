-- based-on: billing.user_effective_plan(uuid) c7bc88a68a710a88f5c57b9e5c0758bd78843fbdd2196c2edefc5508b8baac7f
-- Preserve the latest generosity policy while including paid Stripe contracts.
CREATE OR REPLACE FUNCTION billing.user_effective_plan(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- The plan a PERSON's allowance comes from (per user first — Arman 2026-10-03).
  -- A guest always gets the guest plan. Anyone else gets the MOST GENEROUS of
  -- (Arman 2026-10-04, "the more generous plan wins"):
  --   • an admin's per-person grant (billing.user_plan; never an enterprise plan);
  --   • the plan of every organization they belong to (billing.org_plan) — a
  --     Business or Personal organization plan flows to each member as their own
  --     per-person allowance; an ENTERPRISE organization counts only when its
  --     custom values are entered (billing.account_addon) and is measured by them;
  --   • the plan marked default.
  -- Generosity = the monthly AI-points allowance (week × 4 when a plan has no
  -- month window), ties broken by plan rank. Enterprise is never unlimited and
  -- never granted to one person.
  with guest as (
    select 'guest'::text as plan_key from auth.users u
     where u.id = p_user and u.is_anonymous
       and exists (select 1 from billing.plan p where p.plan_key = 'guest' and p.active and p.deleted_at is null)
  ),
  plan_size as (
    select p.plan_key, p.rank, p.audience,
           coalesce(max(pl.limit_value) filter (where pl.period = 'month'),
                    max(pl.limit_value) filter (where pl.period = 'week') * 4, 0) as size
      from billing.plan p
      left join billing.plan_limit pl on pl.plan_id = p.plan_key and pl.capability = 'platform.points' and pl.deleted_at is null
     where p.active and p.deleted_at is null
     group by p.plan_key, p.rank, p.audience
  ),
  candidates as (
    -- per-person grant
    select ps.plan_key, ps.size, ps.rank from billing.user_plan up
      join plan_size ps on ps.plan_key = up.plan_id and ps.audience not in ('enterprise', 'guest')
     where up.user_id = p_user and up.plan_id is not null
       and up.effective_from <= now() and (up.expires_at is null or up.expires_at > now())
    union all
    -- every organization's plan (non-enterprise)
    select ps.plan_key, ps.size, ps.rank from iam.organization_member m
      join billing.org_plan op on op.organization_id = m.organization_id and op.deleted_at is null
       and op.effective_from <= now() and (op.expires_at is null or op.expires_at > now())
      join plan_size ps on ps.plan_key = op.plan_id and ps.audience not in ('enterprise', 'guest')
     where m.user_id = p_user
    union all
    -- enterprise organizations, measured by their custom values
    select op.plan_id, coalesce(max(a.limit_value) filter (where a.period = 'month'),
                                max(a.limit_value) filter (where a.period = 'week') * 4, 0), ps.rank
      from iam.organization_member m
      join billing.org_plan op on op.organization_id = m.organization_id and op.deleted_at is null
       and op.effective_from <= now() and (op.expires_at is null or op.expires_at > now())
      join plan_size ps on ps.plan_key = op.plan_id and ps.audience = 'enterprise'
      join billing.account_addon a on a.organization_id = m.organization_id and a.capability = 'platform.points'
       and a.deleted_at is null and a.limit_value is not null and a.effective_from <= now()
       and (a.expires_at is null or a.expires_at > now())
     where m.user_id = p_user
     group by op.plan_id, ps.rank
    union all
    -- Paid contracts compete with grants; sandbox purchases never grant access.
    select ps.plan_key, ps.size, ps.rank from billing.subscription s
      join plan_size ps on ps.plan_key = s.plan_key and ps.audience = 'personal'
     where s.beneficiary_user_id = p_user and s.livemode
       and s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()
    union all
    select ps.plan_key, ps.size, ps.rank from billing.subscription s
      join plan_size ps on ps.plan_key = s.plan_key and ps.audience = 'company'
      join iam.organization_member m on m.organization_id = s.organization_id and m.user_id = p_user
     where s.beneficiary_user_id is null and s.livemode
       and s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now()
    union all
    -- the default plan
    select ps.plan_key, ps.size, ps.rank from plan_size ps
      join billing.plan p on p.plan_key = ps.plan_key and p.is_default
  )
  select coalesce(
    (select plan_key from guest),
    (select plan_key from candidates order by size desc, rank desc limit 1)
  );
$function$
;

