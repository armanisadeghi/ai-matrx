-- based-on: billing.entitlement_consume(text, integer, uuid, uuid) 3ba822c9d8e10166b19dcc9f95dd038233f32d520457001b20a2295008e398ec
-- based-on: billing.resolve_tier(uuid) c61b0bb329af65da4d52f855f410f448a05f46375cf145e20f4896a33a6cf0a7
-- based-on: billing.tier_no_downgrade() 2f40294b1c799b977a9c9efce79ba1149ff8edc5748a48080a972dc3aa1672d3
-- chair-step: this migration EXISTS to be non-additive. It DROPS the
--   three-argument `billing.entitlement_consume(text,integer,uuid)`, which has
--   no organization parameter at all and therefore cannot be fixed in place:
--   its whole defect is that a caller has no way to name an organization, so
--   the function fills `organization_id` with
--   `public.ensure_personal_organization(auth.uid())` itself. Leaving it beside
--   a corrected four-argument overload is the forbidden safe-path-next-to-the-
--   unsafe-path: every existing caller keeps reaching the substituting one and
--   nothing ever moves. Verified live first: the ONLY caller in either repo is
--   matrx-frontend `features/entitlements/service.ts` (repointed to the
--   four-argument form in this same commit); no Python caller exists in aidream
--   (censused 2026-09-19). Its `platform.client_callable_door` row is removed
--   with it so the registry does not describe a door that is gone.
-- w1_org_billing_is_organization_keyed.sql
--
-- F2 of the default-organization annihilation: BILLING STOPS PICKING A TENANT.
--
-- RULING (Arman, 2026-09-19). A "default organization" is at most a per-client
-- DISPLAY preference. Nothing but the org picker and pure UI display may read
-- it. No data read, write, API route, boot ladder, trigger or BILLING QUERY may
-- pick or substitute one -- not a cookie, not a preference, not the personal
-- organization, not the system organization. The caller names the organization.
--
--   "one missed org check that should have just failed turns into 50 in a
--    month and 5,000 in a year, and suddenly we don't have orgs any more, we
--    have a user and a default org, which means we just have user now."
--
-- Billing is the worst place in the system for this class to survive, because a
-- billing substitution is not merely misfiled: it decides what a person is
-- ALLOWED TO DO and whose meter pays for it. Both failures are silent to
-- everyone involved.
--
--
-- THE THREE SUBSTITUTIONS THIS REMOVES (all verified live, 2026-09-19)
-- ====================================================================
--
-- (1) `billing.entitlement_consume(text,integer,uuid)` -- THE ONE NOBODY HAD
--     FOUND. Not in the campaign census, not in the handoff, not reachable by
--     the TypeScript guard, because the substitution is in SQL:
--
--         v_org := public.ensure_personal_organization(v_user);
--         ...
--         insert into billing.usage_ledger(user_id, organization_id, ...)
--         values (v_user, v_org, ...);
--
--     Every metered action taken from the browser -- by a person working inside
--     a team organization they had explicitly selected -- wrote its usage row
--     against a PERSONAL workspace nobody chose. The four-argument overload
--     `coalesce(p_org, public.ensure_personal_organization(v_user))` does the
--     same thing whenever the caller omits the organization.
--
--     This file drops the three-argument overload outright and makes the
--     four-argument one REFUSE rather than substitute. The refusal is not
--     cosmetic: the whole reason `ensure_personal_organization` was reached for
--     is `db-rules §2 NO NULL ORG`, and the honest way to satisfy a NOT NULL
--     column is to make the caller supply the value, not to invent one.
--
-- (2) `billing.resolve_tier(p_user)` -- under
--     `custom/signup_provisioning_guard` it answered
--     `resolve_org_tier(iam.default_organization_id(p_user))`: the tier of "the
--     oldest organization the person is an active member of", a pick nobody
--     made. The knob resolves FALSE on this database today (verified live), so
--     that branch is not what runs -- which is precisely why it had to be
--     removed rather than watched. A dormant substitution behind a knob is a
--     substitution that ships the day someone flips the knob for an unrelated
--     reason.
--
--     The brief's rule is followed exactly: an entitlement check with no
--     organization in scope RETURNS THE FREE TIER EXPLICITLY AND SAYS WHY. It
--     never reaches for the default organization's tier.
--
--     The legacy lane is untouched and is NOT a substitution: it reads
--     `billing.subscription.user_id` and `billing.user_plan.user_id`, which are
--     genuinely the person's own rows, not an organization chosen for them.
--
--     No new overload is added. `billing.resolve_effective_tier(p_user, p_org)`
--     ALREADY is the organization-keyed door, it is what aidream's
--     `aidream/services/entitlements/service.py:117` actually calls, and it is
--     what `billing.org_capability_status(p_org)` uses. Adding a second
--     org-keyed tier resolver would be a second place deciding a tier, which
--     aidream's own doctrine names as the failure ("A second place that decides
--     a tier is a second tier").
--
-- (3) `billing.tier_no_downgrade()` -- a reporting function that compared each
--     user's legacy tier against "their default organization's" tier. Re-keyed
--     to compare against the BEST tier across the organizations the person is
--     actually an active member of, which is the question the report was trying
--     to ask. It stops calling `iam.default_organization_id` entirely.
--
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ==================================
-- * It does not drop `iam.default_organization_id(uuid)`. After this file and
--   F1 its only remaining caller is
--   `iam._default_organization_is_a_membership`, which CONSTRAINS the column
--   (it refuses a default that is not one of the person's memberships) rather
--   than substituting for a choice. The function also remains the legitimate
--   read for the picker and Settings, which is what the ruling explicitly
--   allows. Its comment is updated to say so, so the next reader does not have
--   to re-derive it.
-- * It does not touch `public._stamp_org_default` or its 328 triggers. That is
--   the aidream lane's drop in this same campaign; checked live before writing
--   (the function and all 328 triggers are still present, so it has not
--   landed), and double-dropping it from here is exactly the collision the
--   campaign coordination exists to avoid. All 328 carrying tables already
--   declare `organization_id NOT NULL` (verified live), so the refusing
--   constraint the ruling asks to be "left behind" is already in place on every
--   one of them.
--
-- Law: docs/handoffs/default-org-annihilation.md.

-- ── 0. THE CENSUS THIS FILE WAS WRITTEN AGAINST, RE-ASSERTED ────────────────
-- A migration written against a body that has since changed must stop, not
-- clobber. Each of the three is checked for the shape it is here to remove.
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'billing' and p.proname = 'entitlement_consume';
  if v_n <> 2 then
    raise exception 'F2: expected exactly 2 billing.entitlement_consume overloads (3-arg and 4-arg); found %. Census is stale — re-take it before applying.', v_n;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'billing' and p.proname = 'resolve_tier'
       and pg_get_functiondef(p.oid) ilike '%iam.default_organization_id%') then
    raise exception 'F2: billing.resolve_tier no longer reads iam.default_organization_id. Another lane changed it — stop and reconcile.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'billing' and p.proname = 'tier_no_downgrade'
       and pg_get_functiondef(p.oid) ilike '%iam.default_organization_id%') then
    raise exception 'F2: billing.tier_no_downgrade no longer reads iam.default_organization_id. Another lane changed it — stop and reconcile.';
  end if;
end $$;

-- ── 1. THE METER NAMES ITS TENANT, OR IT REFUSES ────────────────────────────

-- The three-argument overload cannot be corrected: it has nowhere to put the
-- answer. It goes, and its door row goes with it.
drop function if exists billing.entitlement_consume(text, integer, uuid);

delete from platform.client_callable_door
 where schema_name = 'billing'
   and function_name = 'entitlement_consume'
   and identity_argtypes = array[25, 23, 2950]::oid[];

-- The surviving overload keeps its signature and its DD-208 claim check, and
-- gains defaults so it is a drop-in for the callers the dropped overload had
-- (`p_check_id` omitted is the ordinary case). `p_org` defaults to NULL only so
-- that a caller which forgets it gets the LOUD refusal below rather than a
-- function-not-found 404 that reads like an outage.
create or replace function billing.entitlement_consume(
  p_capability text,
  p_quantity   integer DEFAULT 1,
  p_check_id   uuid    DEFAULT NULL,
  p_org        uuid    DEFAULT NULL
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public'
as $fn$
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

  -- 🚨 DD-208: `p_org` is a CLAIM, checked BEFORE the write. Without this, any
  -- signed-in caller charged any organization's meter and read back its plan.
  if p_org is not null and not iam.has_org_access_for(v_user, p_org) then
    raise exception 'You have no standing in that organization, so you cannot consume its entitlement.'
      using errcode = '42501';
  end if;

  -- 🚨 NOTHING IS SUBSTITUTED HERE ANY MORE (2026-09-19 ruling, F2).
  --
  -- This used to be:
  --
  --   v_ledger_org := coalesce(p_org, public.ensure_personal_organization(v_user));
  --
  -- justified by db-rules §2 "NO NULL ORG" -- the ledger column is NOT NULL, so
  -- something had to fill it. But "something had to fill it" is an argument for
  -- making the CALLER fill it, never for the database choosing a tenant on the
  -- person's behalf. The old line billed a person's metered work to a personal
  -- workspace they had not selected and could not see, every time a caller
  -- omitted the organization -- which the dropped three-argument overload did
  -- unconditionally, for every metered action taken in the browser.
  --
  -- The refusal announces itself with the remedy, and it is raised BEFORE any
  -- row is written, so a refusal can never follow a partial write.
  if p_org is null then
    raise exception 'A metered action must name the organization whose meter it charges; this call named none.'
      using errcode = '23502',
            hint = 'Pass p_org. Nothing is substituted: filling organization_id with the caller''s personal workspace bills a tenant nobody chose (2026-09-19 ruling). If no organization is selected, hold the action and let the person choose one, then call again.';
  end if;

  select * into v_cap from billing.capability where capability = p_capability;

  -- Idempotency: a check + its consume are ONE accounted unit.
  if p_check_id is not null then
    select exists(select 1 from billing.usage_ledger where check_id = p_check_id)
      into v_dup;
  end if;

  if not v_dup then
    -- Serialize this (org, capability) so two concurrent spends cannot both
    -- read "one left" and both write.
    perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_capability));
    insert into billing.usage_ledger(user_id, organization_id, capability, quantity, check_id)
    values (v_user, p_org, p_capability, greatest(coalesce(p_quantity, 1), 0), p_check_id);
  end if;

  v_res := billing.resolve_capability(v_user, p_capability, p_org);
  return v_res || jsonb_build_object(
    'consumed', not v_dup, 'duplicate', v_dup,
    'enforced', coalesce(v_cap.enforced, false));
end;
$fn$;

comment on function billing.entitlement_consume(text, integer, uuid, uuid) is
  'Record real usage against an organization''s meter. `p_org` is REQUIRED in effect and is a CLAIM checked through iam.has_org_access_for (DD-208). It is never defaulted: the 2026-09-19 ruling (Arman) forbids billing picking a tenant, and the three-argument overload that filled organization_id with public.ensure_personal_organization(auth.uid()) was dropped rather than kept beside this one. A call with no organization is refused (23502) before anything is written. See migrations/w1_org_billing_is_organization_keyed.sql.';

grant execute on function billing.entitlement_consume(text, integer, uuid, uuid)
  to authenticated, service_role;

-- ── 2. THE TIER RESOLVER STOPS READING A DEFAULT ORGANIZATION ───────────────

create or replace function billing.resolve_tier(p_user uuid)
returns billing.tier
language plpgsql
stable
set search_path to 'billing', 'public'
as $fn$
declare
  v_on boolean;
begin
  v_on := coalesce(
    (platform.knob_resolve('custom', 'signup_provisioning_guard', null) #>> '{}')::boolean,
    false);

  if not v_on then
    -- The legacy lane, unchanged. It reads the PERSON's own subscription and
    -- plan rows (billing.subscription.user_id, billing.user_plan.user_id).
    -- That is not an organization substitution — it is the person's own
    -- billing relationship — so the ruling does not touch it.
    return billing._resolve_tier_legacy(p_user);
  end if;

  -- 🚨 THE DEFAULT-ORGANIZATION BRANCH IS GONE (2026-09-19 ruling, F2).
  --
  -- It used to be:
  --
  --   coalesce(billing.resolve_org_tier(iam.default_organization_id(p_user)),
  --            'free'::billing.tier)
  --
  -- citing REC-47 "the person's tier IS their default organization's tier".
  -- The ruling supersedes that: `iam.default_organization_id` answers with a
  -- stored preference or, failing that, "the oldest organization the person is
  -- an active member of" — a pick nobody made. Entitlements decided from a pick
  -- nobody made are the most expensive form of this defect, because they
  -- silently change what a person is ALLOWED to do.
  --
  -- This function is the USER-keyed door and has no organization in scope, so
  -- it answers 'free' EXPLICITLY and says why. It does not guess, and it does
  -- not fail: a caller that needs the organization-keyed answer already has
  -- one, `billing.resolve_effective_tier(p_user, p_org)`, which is what both
  -- aidream's entitlements service and billing.org_capability_status call.
  raise notice 'billing.resolve_tier(%) was asked for a tier with no organization in scope, and answers free. Nothing is substituted — the person''s default organization is a display preference, not an entitlement source (2026-09-19 ruling). Remedy: call billing.resolve_effective_tier(p_user, p_org) with the organization the caller is acting in.',
    p_user;
  return 'free'::billing.tier;
end;
$fn$;

comment on function billing.resolve_tier(uuid) is
  'The tier a PERSON carries on their own account. Under custom/signup_provisioning_guard it answers free explicitly, with a notice, because it has no organization in scope and the 2026-09-19 ruling (Arman) forbids reaching for the person''s default organization to invent one. The organization-keyed answer is billing.resolve_effective_tier(p_user, p_org). See migrations/w1_org_billing_is_organization_keyed.sql.';

-- ── 3. THE NO-DOWNGRADE REPORT ASKS ABOUT REAL MEMBERSHIPS ──────────────────

create or replace function billing.tier_no_downgrade()
returns table(user_id uuid, legacy_tier billing.tier, organization_tier billing.tier)
language sql
stable
set search_path to 'billing', 'public'
as $fn$
  -- The question this report is really asking is "would moving billing onto
  -- organizations take anything away from anyone?". Answering it through
  -- `iam.default_organization_id(u.id)` answered a narrower and wrong question
  -- — "…take anything away relative to ONE organization the platform picked for
  -- them" — and read a default organization to do it (2026-09-19 ruling, F2).
  --
  -- The honest comparison is against the BEST tier among the organizations the
  -- person is actually an active member of: that is what they would carry once
  -- billing attaches to organizations. Someone who belongs to nothing compares
  -- against 'free', which is a real state and not a substitution.
  -- `billing.tier_from_rank` does not exist (checked live), so the best tier is
  -- chosen by ORDERING on the rank rather than by inverting it.
  select u.id,
         billing._resolve_tier_legacy(u.id),
         b.tier
    from auth.users u
    cross join lateral (
      select coalesce(
        (select coalesce(billing.resolve_org_tier(m.organization_id), 'free'::billing.tier)
           from iam.memberships m
          where m.user_id = u.id
            and m.container_type = 'organization'
            and m.status = 'active'
            and m.deleted_at is null
          order by billing.tier_rank(
                     coalesce(billing.resolve_org_tier(m.organization_id),
                              'free'::billing.tier)) desc
          limit 1),
        'free'::billing.tier) as tier
    ) b
   where billing.tier_rank(b.tier)
       < billing.tier_rank(billing._resolve_tier_legacy(u.id));
$fn$;

comment on function billing.tier_no_downgrade() is
  'Users whose legacy user-keyed tier is HIGHER than the best tier across the organizations they are an active member of — i.e. who would lose something if billing moved onto organizations. It reads iam.memberships, never a default organization (2026-09-19 ruling). See migrations/w1_org_billing_is_organization_keyed.sql.';

-- ── 4. THE SURVIVING FUNCTION SAYS WHAT IT IS NOW FOR ───────────────────────

comment on function iam.default_organization_id(uuid) is
  'The organization a person has STATED as their display default (users.user_preferences.default_organization_id, then the legacy preferences JSON key, then the oldest active membership). 🚨 DISPLAY ONLY (Arman, 2026-09-19): nothing but the organization picker and pure UI display may read this. No data read, write, API route, boot ladder, trigger or billing query may call it to decide where work lands or what a person is entitled to — every such caller was removed in w1_org_signup_stops_writing_a_default_organization.sql and w1_org_billing_is_organization_keyed.sql. The only remaining caller is iam._default_organization_is_a_membership, which CONSTRAINS the stated preference rather than substituting for a choice.';

-- ── 5. PROOF, IN THE SAME TRANSACTION ───────────────────────────────────────
do $$
declare v_n int; v_def text; v_tier billing.tier;
begin
  -- (1) the substituting overload is gone, and the survivor refuses.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'billing' and p.proname = 'entitlement_consume';
  if v_n <> 1 then
    raise exception 'F2 FAILED: expected exactly 1 billing.entitlement_consume overload after the drop; found %.', v_n;
  end if;

  -- Read the EXECUTABLE body only: `pg_get_functiondef` returns the comments
  -- too, and this file deliberately quotes the removed statement in a comment
  -- so the next reader can see what went. Strip `--` comment tails, or the
  -- proof reads the prose and fails on its own explanation.
  v_def := (select string_agg(regexp_replace(line, '--.*$', ''), E'\n')
              from (
                select unnest(string_to_array(
                         (select pg_get_functiondef(p.oid) from pg_proc p
                            join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'billing'
                             and p.proname = 'entitlement_consume'),
                         E'\n')) as line
              ) t);
  if v_def ilike '%ensure_personal_organization%' then
    raise exception 'F2 FAILED: billing.entitlement_consume still calls ensure_personal_organization.';
  end if;
  if v_def !~* 'p_org is null' then
    raise exception 'F2 FAILED: billing.entitlement_consume does not refuse an unnamed organization.';
  end if;

  if exists (select 1 from platform.client_callable_door
              where schema_name='billing' and function_name='entitlement_consume'
                and identity_argtypes = array[25,23,2950]::oid[]) then
    raise exception 'F2 FAILED: the dropped 3-argument overload still has a client_callable_door row.';
  end if;

  -- (2) + (3) no billing object reads a default organization any more.
  for v_def in
    select n.nspname||'.'||p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'billing'
       and (select string_agg(regexp_replace(l, '--.*$', ''), E'\n')
              from unnest(string_to_array(pg_get_functiondef(p.oid), E'\n')) as l)
           ilike '%default_organization_id%'
  loop
    raise exception 'F2 FAILED: billing object % still reads a default organization.', v_def;
  end loop;

  -- The free answer is REAL, not merely absent: prove the knob-on path returns
  -- a tier rather than NULL or an error for a user with no organization named.
  select billing.resolve_tier('00000000-0000-0000-0000-000000000000'::uuid) into v_tier;
  if v_tier is null then
    raise exception 'F2 FAILED: billing.resolve_tier returned NULL rather than an explicit tier.';
  end if;

  -- The whole point: exactly ONE live object may still name a default
  -- organization, and it is the CONSTRAINT, not a substitution.
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f'
     and (select string_agg(regexp_replace(l, '--.*$', ''), E'\n')
            from unnest(string_to_array(pg_get_functiondef(p.oid), E'\n')) as l)
         ilike '%default_organization_id%'
     and not (n.nspname = 'iam' and p.proname in
              ('default_organization_id', '_default_organization_is_a_membership'));
  if v_n <> 0 then
    raise exception 'F2 FAILED: % function(s) outside the picker/constraint pair still read a default organization.', v_n;
  end if;

  raise notice 'F2 OK: the meter names its tenant or refuses; no billing object reads a default organization; the only remaining reader is the membership constraint.';
end $$;
