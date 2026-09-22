-- target: branch,production
-- additive: yes
-- guard: custom/signup_provisioning_guard
-- based-on: billing.resolve_tier(uuid) 6273ab59c0a27eec94d4e69e288567bedeb2a8b6ac61a80355caace12e33379d
--
-- W1-ORG — REC-47 and REC-62 (the resolver half): BILLING ATTACHES TO ORGANIZATIONS ONLY,
-- AND TIER RESOLVES THROUGH THE DEFAULT ORGANIZATION'S PLAN.
--
-- THE LAW
-- -------
-- REC-47: "Billing attaches to organizations only, and tier resolves through the default
-- organization's plan."  COMPANY: Vercel bills team seats to the team itself; a member added
-- by invite, SSO or auto-approval is billed under that team's Pro seat pricing — never under
-- a second, personal subscription that happens to share the human being.
-- REC-62 (this file's half): "`billing.user_plan` is deprecated … `resolve_tier` reads the
-- person's default organization's `org_plan`, and the plan rows migrate with a proof that no
-- person's tier is lowered by the move."
--
-- WHAT IS LIVE TODAY, MEASURED (2026-09-18, both databases)
-- ---------------------------------------------------------
--   billing.resolve_tier(uuid)  — sha256 of pg_get_functiondef identical on branch and
--     production: 6273ab59…379d (the `-- based-on:` line above). Its body reads
--     `billing.subscription.user_id` and `billing.user_plan.user_id`: BOTH per-person.
--   billing.resolve_org_tier(uuid) — already the organization-shaped resolver, reading
--     `billing.org_plan.organization_id` and `billing.subscription.org_id`. Nothing calls it
--     from `resolve_tier`.
--   rows: production `billing.user_plan` 586, `billing.org_plan` 460, and
--     `billing.customer` / `billing.subscription` / `billing.connect_account` are ALL EMPTY
--     (0 rows each, production and branch). The register's "383 plan rows" was measured on
--     2026-09-10; the live number today is 586 user plans, and the no-downgrade proof below
--     is written as a query over whatever is actually there rather than over a remembered
--     count (rule: counts mean nothing, the query is the proof).
--
-- THE THREE OBJECTS
-- -----------------
--  1. `billing._resolve_tier_legacy(uuid)` — TODAY'S BODY, VERBATIM, given its own name.
--     This is what makes the OFF path answer-identical rather than merely similar: the OFF
--     arm does not re-implement the old answer, it CALLS it. It also means the column moves
--     in the sibling file have exactly one body to re-point, and `resolve_tier` itself is
--     replaced ONCE in this campaign (rule 4).
--  2. `billing.resolve_tier(uuid)` — REPLACED. Behind `custom/signup_provisioning_guard`:
--     OFF (its live value on both databases today) → `billing._resolve_tier_legacy(p_user)`,
--     byte-for-byte the old answer. ON → the person's default organization, resolved through
--     `iam.default_organization_id(p_user)` (the ONE resolver W1-ORG's preference file
--     built), then that organization's plan through `billing.resolve_org_tier`.
--  3. `billing.tier_no_downgrade()` — THE PROOF REC-62 NAMES, as a query rather than a
--     sentence: one row per person whose organization-resolved tier would be LOWER than the
--     tier they hold today. Zero rows is the proof. It is `STABLE` and `SECURITY INVOKER`.
--
-- ORDER DEPENDENCY, SAID OUT LOUD
-- --------------------------------
-- `iam.default_organization_id(uuid)` is created by
-- `migrations/campaign/w1_org_the_default_organization_is_a_preference.sql`, which is judged
-- `accept` at both targets and is applied on the branch. On PRODUCTION both files are held
-- for the attended step and must be applied IN THAT ORDER — this file's bodies name that
-- function and PostgreSQL resolves the name at creation time.
--
-- WHY `billing.user_plan` IS NOT RETIRED HERE
-- --------------------------------------------
-- It carries 586 live production rows and the OFF path still reads it, so retiring it now
-- would break the OFF answer this file exists to preserve. It is MARKED deprecated (the
-- comment below carries the remedy, so nothing about it is silent) and its retirement into
-- schema `deprecated` through `platform.retire_to_deprecated()` belongs to the switch step
-- that turns `custom/signup_provisioning_guard` ON. Stated, not left as a gap.
--
-- REVERSIBLE: `migrations/inverse/w1_org_billing_attaches_to_organizations_down.sql`.

set lock_timeout = '5s';

-- 1. TODAY'S ANSWER, KEPT UNDER ITS OWN NAME -----------------------------------------------
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

comment on function billing._resolve_tier_legacy(uuid) is
  'REC-47/REC-62: the per-person tier resolution that was billing.resolve_tier''s whole body until this campaign, kept verbatim under its own name so the OFF path CALLS the old answer instead of re-implementing it. Retired with billing.user_plan at the switch step.';

-- 2. THE ONE REPLACEMENT ---------------------------------------------------------------------
create or replace function billing.resolve_tier(p_user uuid)
returns billing.tier
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select case
    when coalesce(
           (platform.knob_resolve('custom', 'signup_provisioning_guard', null) #>> '{}')::boolean,
           false)
    then
      -- REC-47: billing attaches to organizations only. The person's tier IS their default
      -- organization's tier; a person who belongs to no organization is `free`, which is the
      -- same answer the legacy path gives someone with no plan and no subscription.
      coalesce(billing.resolve_org_tier(iam.default_organization_id(p_user)), 'free'::billing.tier)
    else
      billing._resolve_tier_legacy(p_user)
  end;
$function$;

comment on function billing.resolve_tier(uuid) is
  'REC-47: tier resolves through the default organization''s plan. Behind custom/signup_provisioning_guard: OFF calls billing._resolve_tier_legacy (today''s per-person answer, verbatim); ON resolves iam.default_organization_id(person) -> billing.resolve_org_tier(organization). The no-downgrade proof the move is allowed on is billing.tier_no_downgrade().';

-- 3. THE PROOF, AS A QUERY -------------------------------------------------------------------
create or replace function billing.tier_no_downgrade()
returns table(user_id uuid, legacy_tier billing.tier, organization_tier billing.tier)
language sql
stable
set search_path to 'billing', 'public'
as $function$
  select u.id,
         billing._resolve_tier_legacy(u.id),
         coalesce(billing.resolve_org_tier(iam.default_organization_id(u.id)), 'free'::billing.tier)
    from auth.users u
   where billing.tier_rank(
           coalesce(billing.resolve_org_tier(iam.default_organization_id(u.id)), 'free'::billing.tier))
       < billing.tier_rank(billing._resolve_tier_legacy(u.id));
$function$;

comment on function billing.tier_no_downgrade() is
  'REC-62''s proof, as a query rather than a sentence: one row per person whose organization-resolved tier would be LOWER than the tier they hold today. ZERO ROWS is the proof that the move lowers nobody. Run it before the switch step turns custom/signup_provisioning_guard ON, and again after the plan rows migrate.';

comment on table billing.user_plan is
  'DEPRECATED (REC-62). Billing attaches to organizations only: the live plan is billing.org_plan, keyed by organization_id, and tier resolves through iam.default_organization_id(person). This table is still read by billing._resolve_tier_legacy while custom/signup_provisioning_guard is OFF, which is the only reason it is still here. Remedy: migrate each row to billing.org_plan on the person''s default organization, prove billing.tier_no_downgrade() returns zero rows, then retire this table with platform.retire_to_deprecated(''billing'',''user_plan''). Do not add a row to it.';
